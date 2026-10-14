import { captureAuthSession, isAuthSessionCurrent, invalidateAuthSession } from "./authStorage";
import { refreshAuthSession } from "./tokenRefresh";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";
import { getCurrentUserId, clearCurrentUserId } from "./userSecurityKeys";
import { clearBiometricToken, setBiometricEnabled } from "./biometricService";
import { navigate } from "../navigation/navigationRef";
import { clearPushRegistrationForUser } from "./pushRegistrationStorage";

// Testing aid: makes every authenticated request answer 401 so the expired
// session path can be exercised without waiting for a real token to lapse or
// asking the backend to revoke one. Double-gated — __DEV__ keeps it out of a
// release bundle, and the env flag keeps it off in ordinary development, so
// the only way to arm it is to ask for it explicitly:
//
//   EXPO_PUBLIC_FORCE_SESSION_EXPIRED=true npx expo start --dev-client --lan
//
// Restart without the variable to switch it back off.
const FORCE_SESSION_EXPIRED = __DEV__
  && process.env.EXPO_PUBLIC_FORCE_SESSION_EXPIRED === "true";

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
  if (FORCE_SESSION_EXPIRED && session) {
    // Failing here keeps the test offline and reproducible. A rejection from a
    // request interceptor skips the response interceptor, so handleUnauthorized
    // is invoked directly — otherwise the switch would abort the request
    // without ever exercising the path it exists to test.
    const error = new Error("Forced session expiry (test switch)");
    error.config = config;
    error.response = { status: 401, data: { message: "Unauthenticated." } };
    error.isAxiosError = true;
    await handleUnauthorized(error);
    throw error;
  }
  return config;
}

// Returns true when the request should be retried against a renewed session.
// A 401 is only final once the refresh token has also been refused.
export async function tryRefreshForRequest(error) {
  if (error.response?.status !== 401) return false;
  if (error.config?.skipAuthRefresh) return false;
  const session = error.config?.authSession ?? await captureAuthSession();
  if (!session) return false;
  return refreshAuthSession(session);
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
    // A session that ran out looks, on screen, exactly like a request that
    // returned nothing: the services grid empties and the counters read zero.
    // Saying so on the login screen is what tells the two apart — without it
    // the user has to discover by trial that force-quitting the app is the
    // way back in.
    navigate("Login", { reason: "sessionExpired" });
  });
}
