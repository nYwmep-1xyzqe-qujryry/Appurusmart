import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { SECURE_KEYS, STORAGE_KEYS } from "../config";

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
  if (!session || session.generation !== generation) return false;
  const token = await readToken();
  return session.generation === generation && token === session.token;
}
export const runWithSession = (session, operation) => enqueue(async () => {
  if (!await isAuthSessionCurrent(session)) return undefined;
  return operation();
});

export async function saveAuthSession(token, user, userId) {
  const value = String(token || "");
  if (!value) throw new Error("Auth token is missing");

  return enqueue(async () => {
  changed();
  if (Platform.OS === "web") {
    webSession.set(SECURE_KEYS.AUTH_TOKEN, value);
  } else {
    await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
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
  } else {
    await SecureStore.deleteItemAsync(SECURE_KEYS.AUTH_TOKEN).catch(() => {});
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
