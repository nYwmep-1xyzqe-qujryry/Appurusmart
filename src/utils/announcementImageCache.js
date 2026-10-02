import { Image } from "react-native";

const prefetchedUrls = new Set();
const pendingPrefetches = new Map();
const successfulSources = new Map();
const MAX_ENTRIES = 100;

const sourceKey = (uri, fallbackUri, version) => JSON.stringify([uri, fallbackUri, version]);

export const getSuccessfulAnnouncementSource = (uri, fallbackUri, version) => (
  successfulSources.get(sourceKey(uri, fallbackUri, version)) ?? uri ?? fallbackUri
);

// Remember a working fallback across carousel clones and screen remounts.
// This is source selection only; native HTTP caching still controls freshness.
export const rememberAnnouncementSource = (uri, fallbackUri, version, loadedUri) => {
  const key = sourceKey(uri, fallbackUri, version);
  successfulSources.delete(key);
  successfulSources.set(key, loadedUri);
  if (successfulSources.size > MAX_ENTRIES) {
    successfulSources.delete(successfulSources.keys().next().value);
  }
};

// Prefetch only the next likely card. These sets prevent duplicate requests
// when the same announcement appears as a loop clone or rerenders.
export const prefetchAnnouncementImage = (uri) => {
  if (typeof uri !== "string" || uri.trim() === "") return Promise.resolve(false);
  if (prefetchedUrls.has(uri)) return Promise.resolve(true);
  if (pendingPrefetches.has(uri)) return pendingPrefetches.get(uri);

  const request = Image.prefetch(uri)
    .then((loaded) => {
      if (loaded) {
        prefetchedUrls.add(uri);
        if (prefetchedUrls.size > MAX_ENTRIES) prefetchedUrls.delete(prefetchedUrls.values().next().value);
      }
      return loaded;
    })
    .catch(() => false)
    .finally(() => pendingPrefetches.delete(uri));

  pendingPrefetches.set(uri, request);
  return request;
};
