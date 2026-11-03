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

// A renewal's rotated pair, persisted so that the caller is told "stored" only
// when both tokens are durably in the keychain. SecureStore writes each key on
// its own — there is no transaction across the two — so the order decides
// what a failure leaves behind:
//
//   1. The refresh token first. Once the server has answered 200 the old one
//      is spent there; the new one is the only token that can renew this
//      session, so it is the one that must not be lost.
//   2. The access token only after the refresh token is confirmed.
//
// Each write is read back before it counts: a keystore that accepts a write
// and keeps nothing is a failure like any other.
//
// Each write gets a second attempt, since a keystore failure can be momentary.
// What a failure after that leaves:
//   refresh write fails  -> the old pair stands, untouched, and the error is
//                           marked refreshTokenLost. The old refresh token is
//                           already spent on the server, so the session cannot
//                           renew again and the caller ends it.
//   access write fails   -> the new refresh token beside the old access
//                           token. Not a pair the caller retries with — it is
//                           told the write failed — but the next 401 renews
//                           with the refresh token the server actually holds.
//                           Rolling the refresh token back would hand the
//                           next renewal a token the server has already spent,
//                           which it treats as theft.
// Crash window that no ordering removes: killed after the server rotated the
// pair but before step 1 lands, the device keeps only the spent refresh token,
// and the next renewal ends the session with a 401.
const PAIR_NOT_STORED = "TOKEN_PAIR_NOT_STORED";
const writeVerified = async (key, value) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      if ((await SecureStore.getItemAsync(key)) === value) return true;
    } catch (_) {}
  }
  return false;
};
const writeRotatedPair = async (accessToken, refreshToken) => {
  if (Platform.OS === "web") {
    webSession.set(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    webSession.set(SECURE_KEYS.AUTH_TOKEN, accessToken);
    return;
  }
  // The message names which write failed and nothing else — no value.
  if (!await writeVerified(SECURE_KEYS.REFRESH_TOKEN, refreshToken)) {
    throw Object.assign(new Error("Renewed refresh token could not be stored"), {
      code: PAIR_NOT_STORED,
      refreshTokenLost: true,
    });
  }
  if (!await writeVerified(SECURE_KEYS.AUTH_TOKEN, accessToken)) {
    throw Object.assign(new Error("Renewed access token could not be stored"), { code: PAIR_NOT_STORED });
  }
};

export async function saveAuthSession(token, user, userId, refreshToken, options = {}) {
  const value = String(token || "");
  if (!value) throw new Error("Auth token is missing");
  const refreshValue = refreshToken === undefined ? undefined : String(refreshToken || "");
  // A renewal keeps the session's identity: callers holding a snapshot from
  // before it are still operating on the same account and must keep running.
  // onlyIfCurrent names the session the write belongs to. It is checked
  // inside the queue, where no sign-out or sign-in can slip between the
  // check and the write: a refresh started by one account that finishes
  // after another has signed in must not touch the new account's tokens.
  // Resolves false when the write was skipped for that reason.
  //
  // requirePair is for a refresh's rotated tokens: both are written by
  // writeRotatedPair, and the save rejects unless both are confirmed stored.
  // Sign-in keeps its own, more forgiving path below.
  const { renewal = false, onlyIfCurrent = null, requirePair = false } = options;
  if (requirePair && !refreshValue) throw new Error("Refresh token is missing");

  return enqueue(async () => {
  if (onlyIfCurrent && !await isAuthSessionCurrent(onlyIfCurrent)) return false;
  // A renewal is deliberately silent. Subscribers to this event treat it as
  // "the account changed" and reset what they hold — currentUserStore
  // publishes an empty user, which blanked the avatar on every renewal — and
  // none of that applies when the same person keeps the same session. Only a
  // sign-in, sign-out or account switch notifies.
  if (!renewal) changed();
  if (requirePair) {
    await writeRotatedPair(value, refreshValue);
    return true;
  }
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
        // A keychain write can fail on its own — a locked device, a vendor
        // keystore that refuses the item — and letting that throw would take
        // the whole sign-in down with it even though the access token is
        // already stored. Losing the refresh token costs renewal, not the
        // session: the user stays signed in and is asked to sign in again
        // when the access token eventually lapses.
        try {
          await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshValue, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
        } catch (error) {
          // Swallowing this silently made a device that cannot keep a refresh
          // token look identical to one that never received it: the user
          // signs in, everything works, and the session ends at the access
          // token's expiry with nothing explaining why. The name only — a
          // keystore error carries no token, but the message can name the
          // item.
          if (__DEV__) {
            console.warn("[Auth] refresh token could not be stored:", error?.name ?? "unknown");
          }
          await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN).catch(() => {});
        }
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
  return true;
  });
}

const readRefreshToken = async () => {
  if (Platform.OS === "web") return webSession.get(SECURE_KEYS.REFRESH_TOKEN) ?? null;
  return (await SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN)) ?? null;
};

// The newest token pair of one session, read inside the queue so that no
// renewal, sign-out or sign-in can land between the check and the reads.
// Resolves null once that session has ended — a caller holding account A
// must never be handed account B's tokens. Rejects when the keychain cannot
// be read: a read that failed is not a session without a refresh token, and
// treating it as one would end a session over a storage hiccup. Neither value
// is ever logged.
export const readSessionCredentials = (session) => enqueue(async () => {
  if (!await isAuthSessionCurrent(session)) return null;
  const token = await readToken();
  if (!token) return null;
  return {
    session: { token, generation: session.generation, userId: session.userId },
    refreshToken: await readRefreshToken(),
  };
});

export async function getRefreshToken() {
  try {
    return await readRefreshToken();
  } catch (error) {
    // A read that throws is not the same as a session with no refresh token,
    // and the two were indistinguishable from the outside.
    if (__DEV__) {
      console.warn("[Auth] refresh token could not be read:", error?.name ?? "unknown");
    }
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
