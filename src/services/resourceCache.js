import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../config";

export const RESOURCE_CACHE_TTL_MS = 5 * 60 * 1000;

const CACHE_PREFIX = "@api_cache:v1";
const memoryCache = new Map();

const getScope = async (explicitScope) => {
  if (explicitScope !== undefined) {
    return explicitScope ? `user:${explicitScope}` : "public";
  }
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
  return userId ? `user:${userId}` : "public";
};

export async function getResourceCacheScope() {
  return AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
}

const getScopedKey = async (cacheKey, explicitScope) => {
  const scope = await getScope(explicitScope);
  return `${CACHE_PREFIX}:${encodeURIComponent(scope)}:${encodeURIComponent(cacheKey)}`;
};

const isValidEntry = (entry) => (
  entry && typeof entry === "object" &&
  typeof entry.updatedAt === "number" &&
  Object.prototype.hasOwnProperty.call(entry, "data")
);

export const isCacheFresh = (entry) => (
  isValidEntry(entry) && Date.now() - entry.updatedAt < RESOURCE_CACHE_TTL_MS
);

export async function readResourceCache(cacheKey, options = {}) {
  try {
    const storageKey = await getScopedKey(cacheKey, options.scope);
    const memoryEntry = memoryCache.get(storageKey);
    if (isValidEntry(memoryEntry)) {
      return { ...memoryEntry, fresh: isCacheFresh(memoryEntry) };
    }

    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (!isValidEntry(entry)) return null;
    memoryCache.set(storageKey, entry);
    return { ...entry, fresh: isCacheFresh(entry) };
  } catch (_) {
    // A cache failure must never block the API request.
    return null;
  }
}

export async function writeResourceCache(cacheKey, data, options = {}) {
  try {
    const storageKey = await getScopedKey(cacheKey, options.scope);
    const entry = { data, updatedAt: Date.now() };
    memoryCache.set(storageKey, entry);
    await AsyncStorage.setItem(storageKey, JSON.stringify(entry));
    return entry;
  } catch (_) {
    return null;
  }
}

// A mutation can invalidate several paginated/search variants of one resource.
// The caller passes the stable prefix, for example `lrd:/info/lrd/projects:`.
export async function invalidateResourceCache(cacheKeyPrefix, options = {}) {
  try {
    const scopedPrefix = await getScopedKey(cacheKeyPrefix, options.scope);
    const storedKeys = await AsyncStorage.getAllKeys();
    const matchingKeys = storedKeys.filter((key) => key.startsWith(scopedPrefix));

    for (const key of memoryCache.keys()) {
      if (key.startsWith(scopedPrefix)) memoryCache.delete(key);
    }

    if (matchingKeys.length > 0) {
      await AsyncStorage.multiRemove(matchingKeys);
    }
    return matchingKeys.length;
  } catch (_) {
    // Cache invalidation must not turn a successful mutation into a failure.
    return 0;
  }
}
