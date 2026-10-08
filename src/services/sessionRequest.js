import { captureAuthSession, isAuthSessionCurrent, invalidateAuthSession } from "./authStorage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";
import { getCurrentUserId, clearCurrentUserId } from "./userSecurityKeys";
import { clearBiometricToken, setBiometricEnabled } from "./biometricService";
import { navigate } from "../navigation/navigationRef";
import { clearPushRegistrationForUser } from "./pushRegistrationStorage";

export async function attachRequestSession(config) {
  const hasSessionSnapshot = config.sessionSnapshot === true;
  const session = hasSessionSnapshot
    ? (config.authSession ?? null)
    : (config.authSession ?? await captureAuthSession());
  if ((config.authSession || hasSessionSnapshot) && session && !await isAuthSessionCurrent(session)) {
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
    ]);
    // Drops the push token together with its backend confirmation, so a later
    // login has to confirm POST /push-token again rather than trusting a
    // record left over from the invalidated session.
    await clearPushRegistrationForUser(userId);
    await clearCurrentUserId();
    if (userId) {
      await clearBiometricToken(userId);
      await setBiometricEnabled(userId, false);
    }
    navigate("Login");
  });
}
