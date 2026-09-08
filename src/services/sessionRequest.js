import { captureAuthSession, isAuthSessionCurrent, invalidateAuthSession } from "./authStorage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";
import { getCurrentUserId, clearCurrentUserId } from "./userSecurityKeys";
import { clearBiometricToken, setBiometricEnabled } from "./biometricService";
import { navigate } from "../navigation/navigationRef";

export async function attachRequestSession(config) {
  const session = config.authSession ?? await captureAuthSession();
  if (config.authSession && !await isAuthSessionCurrent(session)) {
    throw Object.assign(new Error("Session changed"), { code: "ERR_CANCELED" });
  }
  config.authSession = session;
  if (session) config.headers.Authorization = `Bearer ${session.token}`;
  return config;
}

export async function handleUnauthorized(error) {
  if (error.response?.status !== 401 || error.config?.suppressAuthRedirect) return;
  await invalidateAuthSession(error.config?.authSession, async () => {
    const userId = await getCurrentUserId();
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER,
      STORAGE_KEYS.NOTIFICATION_INBOX,
      `${STORAGE_KEYS.PUSH_TOKEN}:user:${encodeURIComponent(userId ?? "")}`,
    ]);
    await clearCurrentUserId();
    if (userId) {
      await clearBiometricToken(userId);
      await setBiometricEnabled(userId, false);
    }
    navigate("Login");
  });
}
