import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { STORAGE_KEYS, SECURE_KEYS } from "../config";
import { isExpoGo } from "../utils/runtime";
import { userScopedKey } from "./userSecurityKeys";

const requireUserId = (userId) => {
  if (!userId) {
    if (__DEV__) console.error("[biometricService] missing userId — refusing to proceed");
    return false;
  }
  return true;
};

export async function checkSupport() {
  if (Platform.OS === "ios" && isExpoGo) {
    return { supported: false, reasonCode: "developmentBuildRequired" };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return { supported: false, reasonCode: "noHardware" };

  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) return { supported: false, reasonCode: "notEnrolled" };

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const hasFaceId = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

  return {
    supported: true,
    hasFaceId,
    hasFingerprint,
  };
}

// เลือกข้อความ/ไอคอนตาม biometric ที่อุปกรณ์รายงานจริง
// ถ้า Android รองรับหลายแบบ ให้ใช้คำกลาง เพราะระบบปฏิบัติการเป็นผู้เลือกวิธี
export const getBiometricPresentation = (support, platform = Platform.OS) => {
  const hasFaceId = !!support?.hasFaceId;
  const hasFingerprint = !!support?.hasFingerprint;

  if (platform === "ios") {
    return hasFaceId
      ? { kind: "face", icon: "faceid" }
      : { kind: "fingerprint", icon: "fingerprint" };
  }
  if (hasFaceId && hasFingerprint) return { kind: "both", icon: "fingerprint" };
  if (hasFaceId) return { kind: "face", icon: "faceid" };
  if (hasFingerprint) return { kind: "fingerprint", icon: "fingerprint" };
  return { kind: "biometric", icon: "finger-print-outline" };
};

// Biometric preference เป็น per-account เสมอ — User A เปิด biometric ไว้ไม่ได้
// แปลว่า User B (login บนเครื่องเดียวกัน) เปิดด้วย ทุกฟังก์ชันด้านล่างต้องมี userId
export const setBiometricEnabled = (userId, val) => {
  if (!requireUserId(userId)) return Promise.resolve();
  return AsyncStorage.setItem(userScopedKey(STORAGE_KEYS.BIOMETRIC_PREFIX, userId), JSON.stringify(val));
};

export const isBiometricEnabled = async (userId) => {
  if (!requireUserId(userId)) return false;
  const raw = await AsyncStorage.getItem(userScopedKey(STORAGE_KEYS.BIOMETRIC_PREFIX, userId));
  return raw ? JSON.parse(raw) : false;
};

// เช็คว่าเคยบันทึก biometric token ไว้แล้วหรือยัง โดยไม่ต้อง authenticate —
// SecureStore เช็ค key existence ตรงๆ ไม่ได้เมื่อ entry เขียนด้วย
// requireAuthentication:true (ต้อง auth ก่อนถึงจะรู้ว่ามี/ไม่มี) จึงใช้ flag
// คู่กันใน AsyncStorage แทน
export const hasBiometricToken = async (userId) => {
  if (!requireUserId(userId)) return false;
  const raw = await AsyncStorage.getItem(userScopedKey(STORAGE_KEYS.BIOMETRIC_TOKEN_SAVED_PREFIX, userId));
  return raw ? JSON.parse(raw) : false;
};

const tokenFingerprintKey = (userId) => userScopedKey(`${STORAGE_KEYS.BIOMETRIC_TOKEN_SAVED_PREFIX}_session`, userId);
export const biometricTokenMatches = async (userId, token) => {
  if (!requireUserId(userId) || !token) return false;
  const fingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(token));
  return await AsyncStorage.getItem(tokenFingerprintKey(userId)) === fingerprint;
};

export const saveBiometricToken = async (userId, token, authenticationPrompt) => {
  if (!requireUserId(userId)) throw new Error("Missing userId for saveBiometricToken");
  await SecureStore.setItemAsync(userScopedKey(SECURE_KEYS.BIOMETRIC_TOKEN_PREFIX, userId), token, {
    requireAuthentication: true,
    authenticationPrompt,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await AsyncStorage.removeItem(userScopedKey(STORAGE_KEYS.BIOMETRIC_FALLBACK_PREFIX, userId));
  await AsyncStorage.setItem(userScopedKey(STORAGE_KEYS.BIOMETRIC_TOKEN_SAVED_PREFIX, userId), JSON.stringify(true));
  await AsyncStorage.setItem(tokenFingerprintKey(userId), await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(token)));
};

export const getBiometricToken = async (
  userId,
  promptMessage = "ยืนยันตัวตนเพื่อเข้าสู่ระบบ",
) => {
  if (!requireUserId(userId)) return null;
  return SecureStore.getItemAsync(userScopedKey(SECURE_KEYS.BIOMETRIC_TOKEN_PREFIX, userId), {
    requireAuthentication: true,
    authenticationPrompt: promptMessage,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

export const clearBiometricToken = async (userId) => {
  if (!requireUserId(userId)) return;
  try { await SecureStore.deleteItemAsync(userScopedKey(SECURE_KEYS.BIOMETRIC_TOKEN_PREFIX, userId)); } catch (_) {}
  try { await AsyncStorage.removeItem(userScopedKey(STORAGE_KEYS.BIOMETRIC_FALLBACK_PREFIX, userId)); } catch (_) {}
  try { await AsyncStorage.removeItem(userScopedKey(STORAGE_KEYS.BIOMETRIC_TOKEN_SAVED_PREFIX, userId)); } catch (_) {}
  try { await AsyncStorage.removeItem(tokenFingerprintKey(userId)); } catch (_) {}
};

// เช็คตัวตนแบบ local เฉยๆ (ไม่ดึง token ใดๆ) — ใช้สำหรับหน้าจอ lock screen
// เพื่อ "พิสูจน์ว่าเป็นเจ้าของเครื่อง" แยกจาก getBiometricToken ที่ดึง token สำหรับ relogin
export const authenticateLocally = async (promptMessage) => {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage });
    return { success: !!result?.success, error: result?.error };
  } catch (error) {
    return { success: false, error: error?.message };
  }
};
