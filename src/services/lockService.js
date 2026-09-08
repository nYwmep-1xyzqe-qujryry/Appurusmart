import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";
import { isPinSet, clearPin } from "./pinService";
import { captureAuthSession, invalidateAuthSession, clearAuthSession } from "./authStorage";
import { getStoredPushToken, removeTokenFromBackend } from "./notificationService";
import { clearBiometricToken, setBiometricEnabled } from "./biometricService";
import { clearCurrentUserId } from "./userSecurityKeys";

export const MAX_PIN_ATTEMPTS = 5;
const LOCK_THRESHOLD_MS = 30 * 1000;

export const recordFailedPinAttempt = async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PIN_ATTEMPTS);
  const count = (raw ? Number(raw) : 0) + 1;
  await AsyncStorage.setItem(STORAGE_KEYS.PIN_ATTEMPTS, String(count));
  return {
    count,
    remaining: Math.max(0, MAX_PIN_ATTEMPTS - count),
    locked: count >= MAX_PIN_ATTEMPTS,
  };
};

export const resetPinAttempts = () =>
  AsyncStorage.removeItem(STORAGE_KEYS.PIN_ATTEMPTS);

export const recordBackgroundTime = () =>
  AsyncStorage.setItem(STORAGE_KEYS.LAST_BACKGROUND_AT, String(Date.now()));

// ล้างเวลา background ที่บันทึกไว้ — ต้องเรียกทันทีที่ unlock สำเร็จ กัน timestamp
// เก่าที่ค้างจากรอบล็อกก่อนหน้า (เช่นตอน Face ID prompt ทำให้ inactive ชั่วคราว
// แล้วถูก guard ไม่ให้บันทึกทับ) ไปทำให้ AppState transition ถัดไปเข้าใจผิดว่า
// background นานเกิน threshold ทั้งที่เพิ่ง unlock เสร็จไปหมาดๆ
export const clearBackgroundTime = () =>
  AsyncStorage.removeItem(STORAGE_KEYS.LAST_BACKGROUND_AT);

// true เมื่อ user นี้มี PIN ตั้งไว้ และ background นานเกิน threshold (หรือยังไม่เคย
// record เวลาไว้เลย เช่น cold start — ให้ App.js เป็นคนเช็ค cold-start lock เองแยก)
export const shouldShowLock = async (userId) => {
  const pinSet = await isPinSet(userId);
  if (!pinSet) return false;

  const raw = await AsyncStorage.getItem(STORAGE_KEYS.LAST_BACKGROUND_AT);
  if (!raw) return false;

  const elapsed = Date.now() - Number(raw);
  return elapsed > LOCK_THRESHOLD_MS;
};

// wipe เฉพาะสำหรับ PIN lockout / reset ของ user ปัจจุบันเท่านั้น — จงใจแยกจาก
// useCurrentUser.logout() และ api.js เพื่อไม่แตะโค้ด logout เดิมที่ทำงานอยู่แล้ว
// ต้อง scope ด้วย userId เสมอ ห้ามลบ PIN/biometric ของบัญชีอื่นบนเครื่องเดียวกัน
export const wipeForPinFailure = async (userId) => {
  const session = await captureAuthSession();
  if (!session || (userId && session.userId !== String(userId))) return false;
  return invalidateAuthSession(session, async () => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER,
      `${STORAGE_KEYS.PUSH_TOKEN}:user:${encodeURIComponent(session.userId ?? "")}`,
      STORAGE_KEYS.NOTIFICATION_INBOX,
      STORAGE_KEYS.PIN_ATTEMPTS,
      STORAGE_KEYS.LAST_BACKGROUND_AT,
    ]);
    await clearCurrentUserId();
    if (userId) {
      await clearBiometricToken(userId);
      await setBiometricEnabled(userId, false);
      await clearPin(userId);
    }
    return true;
  });
};

// "Sign in with SSO instead" — ล้างแค่ session ปัจจุบัน ไม่แตะ PIN/biometric เลย
export const clearSessionOnly = async () => {
  const session = await captureAuthSession();
  if (session) {
    const pushToken = await getStoredPushToken(session);
    await removeTokenFromBackend(pushToken, session);
  }
  return clearAuthSession();
};
