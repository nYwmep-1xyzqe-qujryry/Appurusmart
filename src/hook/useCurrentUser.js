import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Alert, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { STORAGE_KEYS } from "../config";
import { clearBiometricToken, setBiometricEnabled } from "../services/biometricService";
import { captureAuthSession, invalidateAuthSession } from "../services/authStorage";
import { clearCurrentUserId } from "../services/userSecurityKeys";
import { getStoredPushToken, removeTokenFromBackend } from "../services/notificationService";
import api from "../services/api";
import { getCurrentUserSnapshot, subscribeCurrentUser, refreshCurrentUser } from "../services/currentUserStore";

const getRootNavigation = (navigation) => {
  let current = navigation;
  while (current?.getParent?.()) current = current.getParent();
  return current ?? navigation;
};

export default function useCurrentUser(navigation) {
  const user = useSyncExternalStore(subscribeCurrentUser, getCurrentUserSnapshot, getCurrentUserSnapshot);
  const { t } = useTranslation();
  const appState = useRef(AppState.currentState);

  const refresh = useCallback(() => { refreshCurrentUser().catch(() => {}); }, []);

  useEffect(() => {
    refresh();
    // refresh เมื่อ app กลับมา foreground
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") refresh();
      appState.current = next;
    });
    return () => sub.remove();
  }, [refresh]);

  // refresh ทุกครั้งที่ navigate กลับมาหน้านี้ (เช่น กลับจาก ProfileForm หลังเปลี่ยนรูป)
  useEffect(() => {
    if (!navigation) return;
    const unsub = navigation.addListener("focus", refresh);
    return unsub;
  }, [navigation, refresh]);

  const logout = useCallback(() => {
    Alert.alert(t("settings.logoutTitle"), t("settings.logoutMsg"), [
      { text: t("settings.logoutCancel"), style: "cancel" },
      {
        text: t("settings.logoutConfirm"),
        style: "destructive",
        onPress: async () => {
          // อ่าน userId ก่อนล้างอะไรทั้งนั้น — ต้องใช้ scope การลบ biometric
          // token ให้ตรงบัญชีที่กำลัง logout เท่านั้น ไม่กระทบบัญชีอื่นบนเครื่อง
          const session = await captureAuthSession();
          if (!session) return;
          const userId = session.userId;

          const pushToken = await getStoredPushToken(session);
          await removeTokenFromBackend(pushToken, session);
          try { await api.post("/auth/logout", null, { authSession: session, suppressAuthRedirect: true }); } catch (_) {}
          await invalidateAuthSession(session, async () => {
          await AsyncStorage.multiRemove([
            STORAGE_KEYS.USER,
            STORAGE_KEYS.NOTIFICATION_INBOX,
          ]);
          // ลบ token และสถานะของบัญชีนี้ เพื่อให้การ login ครั้งถัดไปต้องบันทึก
          // biometric token ใหม่เสมอ ไม่ใช้ session ที่ logout แล้ว
          if (userId) await clearBiometricToken(userId);
          if (userId) await setBiometricEnabled(userId, false);
          // ไม่ลบ PIN ของบัญชีนี้ตอน logout — PIN เป็น per-account security
          // preference ที่ต้องคงอยู่ให้บัญชีเดิม login กลับมาแล้วเข้าแอปได้ทันที
          // โดยไม่ต้องตั้ง PIN ซ้ำ — ไม่กระทบบัญชีอื่นเพราะ key แยกตาม userId แล้ว
          await clearCurrentUserId();
          await AsyncStorage.multiRemove([STORAGE_KEYS.PIN_ATTEMPTS, STORAGE_KEYS.LAST_BACKGROUND_AT]);
          getRootNavigation(navigation).reset({ index: 0, routes: [{ name: "Login" }] });
          });
        },
      },
    ]);
  }, [navigation, t]);

  return { user, logout };
}
