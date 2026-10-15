import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { SECURE_KEYS, STORAGE_KEYS } from "../config";
import { isSameSessionSnapshot } from "../utils/sessionResourceState";

const LEGACY_AUTH_KEYS = [STORAGE_KEYS.TOKEN, STORAGE_KEYS.TOKEN_TYPE];
const webSession = {
  get(key) {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(key);
  },
  set(key, value) {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  },
  remove(key) {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  },
};

const removeLegacyAuth = () => AsyncStorage.multiRemove(LEGACY_AUTH_KEYS);
let generation = 0;
let sessionQueue = Promise.resolve();
const listeners = new Set();
const enqueue = (operation) => {
  const result = sessionQueue.then(operation);
  sessionQueue = result.catch(() => {});
  return result;
};
const changed = () => {
  generation += 1;
  listeners.forEach((listener) => listener());
};
export const subscribeAuthSession = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const readToken = () => Platform.OS === "web"
  ? Promise.resolve(webSession.get(SECURE_KEYS.AUTH_TOKEN))
  : SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN);

// Serialize session transitions and scoped cache writes. Never call another
// queued operation inside a runWithSession/cleanup callback.
export async function captureAuthSession() {
  await sessionQueue;
  const version = generation;
  const token = await getAuthToken();
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
  if (version !== generation) return captureAuthSession();
  return token ? { token, generation: version, userId } : null;
}
export async function isAuthSessionCurrent(session) {
  if (!session) return false;
  // A refresh swaps the access token without the session changing hands, so
  // identity is the generation counter, not the token string. Comparing the
  // token made every snapshot taken before a renewal look stale, and work
  // already in flight — the profile photo write among it — was dropped on
  // the floor. The counter still advances on sign-in and sign-out, which are
  // the transitions that genuinely end a session.
  if (session.generation !== generation) return false;
  return (await readToken()) != null;
}
export async function isResourceSessionCurrent(session) {
  return isSameSessionSnapshot(session, await captureAuthSession());
}
export const runWithSession = (session, operation) => enqueue(async () => {
  if (!await isAuthSessionCurrent(session)) return undefined;
  return operation();
});

export async function saveAuthSession(token, user, userId, refreshToken, options = {}) {
  const value = String(token || "");
  if (!value) throw new Error("Auth token is missing");
  const refreshValue = refreshToken === undefined ? undefined : String(refreshToken || "");
  // A renewal keeps the session's identity: callers holding a snapshot from
  // before it are still operating on the same account and must keep running.
  const { renewal = false } = options;

  return enqueue(async () => {
  // A renewal is deliberately silent. Subscribers to this event treat it as
  // "the account changed" and reset what they hold — currentUserStore
  // publishes an empty user, which blanked the avatar on every renewal — and
  // none of that applies when the same person keeps the same session. Only a
  // sign-in, sign-out or account switch notifies.
  if (!renewal) changed();
  if (Platform.OS === "web") {
    webSession.set(SECURE_KEYS.AUTH_TOKEN, value);
    if (refreshValue !== undefined) {
      if (refreshValue) webSession.set(SECURE_KEYS.REFRESH_TOKEN, refreshValue);
      else webSession.remove(SECURE_KEYS.REFRESH_TOKEN);
    }
  } else {
    await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    // undefined means the caller had nothing to say about the refresh token,
    // so the stored one stands. An empty string clears it. Writing the new
    // one before the old is discarded anywhere else keeps a crash from
    // leaving the device with an access token it cannot renew.
    if (refreshValue !== undefined) {
      if (refreshValue) {
        await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshValue, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } else {
        await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN).catch(() => {});
      }
    }
  }

  await removeLegacyAuth();
  if (user && userId) {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.USER, JSON.stringify(user)],
      [STORAGE_KEYS.CURRENT_USER_ID, String(userId)],
    ]);
  }
  });
}

export async function getRefreshToken() {
  if (Platform.OS === "web") return webSession.get(SECURE_KEYS.REFRESH_TOKEN) ?? null;
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
  } catch (_) {
    return null;
  }
}

export async function getAuthToken() {
  const stored =
    Platform.OS === "web"
      ? webSession.get(SECURE_KEYS.AUTH_TOKEN)
      : await SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN);
  if (stored) return stored;

  // One-time migration for users upgrading from the AsyncStorage version.
  const legacyToken = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
  if (!legacyToken) return null;
  try {
    await saveAuthSession(legacyToken);
    return legacyToken;
  } catch (_) {
    await removeLegacyAuth();
    return null;
  }
}

async function clearStoredSession() {
  changed();
  if (Platform.OS === "web") {
    webSession.remove(SECURE_KEYS.AUTH_TOKEN);
    webSession.remove(SECURE_KEYS.REFRESH_TOKEN);
  } else {
    await SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN).catch(() => {});
    await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN).catch(() => {});
  }
  await removeLegacyAuth();
}

export const clearAuthSession = () => enqueue(clearStoredSession);
export const invalidateAuthSession = (session, cleanup = async () => {}) => enqueue(async () => {
  if (!await isAuthSessionCurrent(session)) return false;
  await clearStoredSession();
  await cleanup();
  return true;
});
