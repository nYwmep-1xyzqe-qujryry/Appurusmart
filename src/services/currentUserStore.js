import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "./api";
import infoApi from "./infoApi";
import { captureAuthSession, runWithSession, subscribeAuthSession } from "./authStorage";
import { INFO_API_BASE_URL, STORAGE_KEYS } from "../config";
import { fixPhotoUrl } from "../utils/image";
import { stripNamePrefix } from "../utils/name";

const empty = { name: "", faculty: "", photoUrl: "" };
let state = empty;
let pending = null;
let lastRefresh = 0;
let photoRevision = 0;
const listeners = new Set();
const publish = (next) => { state = next; listeners.forEach((listener) => listener()); };
export const getCurrentUserSnapshot = () => state;
export const subscribeCurrentUser = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
subscribeAuthSession(() => {
  photoRevision += 1;
  pending = null;
  lastRefresh = 0;
  publish(empty);
});

const photoKey = (session) => `expert_photo:user:${encodeURIComponent(session.userId)}`;
export function normalizeExpertPhoto(value) {
  if (value == null || value === "") return "";
  const url = fixPhotoUrl(value, INFO_API_BASE_URL);
  if (!/^https?:\/\//i.test(url)) throw new Error("Invalid profile photo URL");
  return url;
}
const accountFields = (data) => ({
  name: stripNamePrefix(data.full_name_th ?? data.full_name_en ?? data.name ?? data.full_name ?? data.username ?? ""),
  faculty: data.faculty_name_th ?? data.faculty_name ?? data.faculty ?? data.department ?? "",
});

export async function updateCurrentPhoto(session, value) {
  const url = normalizeExpertPhoto(value);
  return runWithSession(session, async () => {
    if (!session.userId) return false;
    photoRevision += 1;
    publish({ ...state, photoUrl: url });
    await AsyncStorage.setItem(photoKey(session), JSON.stringify(url));
    return true;
  });
}

export async function refreshCurrentUser({ force = false } = {}) {
  if (pending) return pending;
  if (!force && Date.now() - lastRefresh < 30000) return state;
  const work = (async () => {
    const session = await captureAuthSession();
    if (!session?.userId) return state;
    const revision = photoRevision;
    await runWithSession(session, async () => {
      const [raw, cachedPhoto] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER), AsyncStorage.getItem(photoKey(session)),
      ]);
      try {
        publish({ ...state, ...accountFields(raw ? JSON.parse(raw) : {}),
          ...(revision === photoRevision && cachedPhoto !== null
            ? { photoUrl: normalizeExpertPhoto(JSON.parse(cachedPhoto)) } : {}),
        });
      } catch { /* Ignore invalid local cache; obtain canonical data below. */ }
    });
    const results = await Promise.allSettled([
      api.get("/me", { authSession: session }),
      infoApi.get("/info/expert/profile", { authSession: session, suppressAuthRedirect: true }),
    ]);
    await runWithSession(session, async () => {
      const [account, expert] = results;
      if (account.status === "fulfilled") {
        const data = account.value.data?.data ?? account.value.data;
        if (data && typeof data === "object") {
          publish({ ...state, ...accountFields(data) });
          // Account cache remains account data. UI photos never read these fields.
          await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data));
        }
      }
      if (expert.status === "fulfilled" && revision === photoRevision) {
        const body = expert.value.data;
        const profile = Object.prototype.hasOwnProperty.call(body ?? {}, "data") ? body.data : body;
        if (profile === null || (typeof profile === "object" && ("picture" in profile || "photo_url" in profile))) {
          try {
            const url = normalizeExpertPhoto(profile?.picture ?? profile?.photo_url ?? null);
            publish({ ...state, photoUrl: url });
            await AsyncStorage.setItem(photoKey(session), JSON.stringify(url));
          } catch { /* Preserve the last canonical photo on malformed responses. */ }
        }
      }
      if (results.every((result) => result.status === "fulfilled")) lastRefresh = Date.now();
    });
    return state;
  })();
  pending = work;
  try { return await work; } finally { if (pending === work) pending = null; }
}
