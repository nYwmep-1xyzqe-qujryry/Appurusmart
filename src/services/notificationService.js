import * as Device from "expo-device";
import Constants from "expo-constants";
import { Alert, AppState, Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { navigate } from "../navigation/navigationRef";
import { API_BASE_URL, EXPO_PROJECT_ID, STORAGE_KEYS } from "../config";
import { isExpoGo } from "../utils/runtime";
import i18n from "../i18n/i18n";
import api from "./api";
import { getAuthToken, captureAuthSession, runWithSession, isAuthSessionCurrent, subscribeAuthSession } from "./authStorage";
import { colors } from "../theme/tokens";
import {
  getAnnouncementId,
  getCorrectedUnreadCount,
  mergeNotificationInbox,
} from "../utils/notificationInbox";
import { createSessionLock } from "../utils/sessionLock";
import { createPushRegistrationRecovery } from "./pushRegistrationRecovery";
import {
  clearPushRegistrationForUser,
  pushConfirmationKeyForUser,
} from "./pushRegistrationStorage";
import {
  applyPendingReads,
  isInboxResponseStale,
  mergeStaleInboxResponse,
  removeConfirmedPendingIds,
} from "../utils/inboxSync";

const NOTIFICATION_INBOX_LIMIT = 100;
const inboxListeners = new Set();
let inboxWriteQueue = Promise.resolve();
const inboxMetadata = new Map();
const pendingReadFlushes = new Map();
const notificationSettingsSyncQueues = new Map();
let pushRegistrationInFlight = null;
const BACKEND_INBOX_RETRY_AFTER_MS = 5 * 60 * 1000;
let backendInboxUnavailableUntil = 0;
const pendingPushInboxRetries = new Set();
const isBackendInboxUnavailable = () => Date.now() < backendInboxUnavailableUntil;
const markBackendInboxUnavailable = () => {
  backendInboxUnavailableUntil = Date.now() + BACKEND_INBOX_RETRY_AFTER_MS;
};
export const DEFAULT_NOTIFICATION_SETTINGS = {
  beforeClass: true,
  holiday: true,
  gradeDeadline: true,
  announcement: true,
};

const getNotifications = () => {
  if (Platform.OS === "web" || isExpoGo) return null;
  return require("expo-notifications");
};

// Expo documents separate iOS authorization states. Provisional and ephemeral
// authorization can receive notifications, so they must not be treated as a
// hard denial simply because the root `status` is not sufficient for iOS.
const hasNotificationPermission = (permission, Notifications) => {
  if (!permission) return false;
  if (Platform.OS !== "ios") return permission.status === "granted";
  const iosStatus = permission.ios?.status;
  if (iosStatus == null) return permission.status === "granted";
  const status = Notifications?.IosAuthorizationStatus ?? {};
  return [status.AUTHORIZED, status.PROVISIONAL, status.EPHEMERAL].includes(iosStatus);
};

const isMissingPushEntitlementError = (error) => {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return (
    Platform.OS === "ios" &&
    (message.includes("aps-environment") ||
      message.includes("valid 'aps-environment' entitlement"))
  );
};

const getExpoProjectId = () =>
  EXPO_PROJECT_ID ??
  Constants.expoConfig?.extra?.eas?.projectId ??
  Constants.easConfig?.projectId;

export const isExpoPushToken = (token) => typeof token === "string" && /^(ExponentPushToken|ExpoPushToken)\[[^\]\s]+\]$/.test(token);

const getPushTokenPayload = (token) => ({
  push_token: token,
  provider: "expo",
  platform: Platform.OS,
  app_version: Constants.expoConfig?.version ?? "1.0.0",
  expo_project_id: getExpoProjectId(),
});

const getDeletePushTokenPayload = (token) => ({
  push_token: token,
  provider: "expo",
  platform: Platform.OS,
});

const configureAndroidNotificationChannels = async (Notifications) => {
  if (Platform.OS !== "android") return;

  const common = {
    sound: "default",
    vibrationPattern: [0, 250, 200, 250],
    lightColor: colors.primary,
  };

  await Promise.all([
    Notifications.setNotificationChannelAsync("default", {
      name: i18n.t("notif.channelGeneral"),
      description: i18n.t("notif.channelGeneralDescription"),
      importance: Notifications.AndroidImportance.HIGH,
      ...common,
    }),
    Notifications.setNotificationChannelAsync("announcements", {
      name: i18n.t("notif.channelAnnouncements"),
      description: i18n.t("notif.channelAnnouncementsDescription"),
      importance: Notifications.AndroidImportance.HIGH,
      ...common,
    }),
    Notifications.setNotificationChannelAsync("reminders", {
      name: i18n.t("notif.channelReminders"),
      description: i18n.t("notif.channelRemindersDescription"),
      importance: Notifications.AndroidImportance.HIGH,
      ...common,
    }),
    Notifications.setNotificationChannelAsync("updates", {
      name: i18n.t("notif.channelUpdates"),
      description: i18n.t("notif.channelUpdatesDescription"),
      importance: Notifications.AndroidImportance.DEFAULT,
      ...common,
    }),
  ]);
};

const getNotificationSettingsPayload = (settings) => ({
  settings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...settings },
  platform: Platform.OS,
  app_version: Constants.expoConfig?.version ?? null,
  expo_project_id: getExpoProjectId(),
});

const getInboxIcon = (type) => {
  switch (type) {
    case "announcement":
      return { icon: "megaphone-outline", iconColor: colors.primary, iconBg: colors.primaryMuted };
    case "beforeClass":
    case "before_class":
      return { icon: "alarm-outline", iconColor: "#2167b2", iconBg: "#e8f1fb" };
    case "holiday":
      return { icon: "calendar-clear-outline", iconColor: "#c95b05", iconBg: "#fff4e0" };
    case "gradeDeadline":
    case "grade_deadline":
      return { icon: "document-text-outline", iconColor: "#7c3aed", iconBg: "#f1eafe" };
    default:
      return { icon: "notifications-outline", iconColor: colors.primary, iconBg: colors.primaryMuted };
  }
};

const getInboxSessionKey = (session) => `${session.generation}:${session.userId}`;
const emitInbox = (items, metadata = null) => {
  inboxListeners.forEach((listener) => listener(items, metadata));
};

export const parseNotificationData = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
};

const normalizeServerNotification = (row) => {
  const data = parseNotificationData(row.data ?? row.payload ?? row.meta);
  const serverId = row.id ?? row.notification_id ?? data.notification_id;
  if (serverId == null) return null;
  const type = row.type ?? data.type;
  const readFlag = row.read ?? row.is_read;
  const isRead =
    readFlag != null
      ? readFlag === true ||
        readFlag === 1 ||
        readFlag === "1" ||
        (typeof readFlag === "string" &&
          readFlag !== "" &&
          readFlag !== "0" &&
          readFlag !== "false")
      : Boolean(row.read_at);
  return {
    id: String(serverId),
    serverId: String(serverId),
    title:
      row.title ?? data.title ?? i18n.t("notifications.defaultTitle"),
    body: row.body ?? row.message ?? data.body ?? "",
    receivedAt:
      row.created_at ?? row.sent_at ?? row.received_at ?? Date.now(),
    read: isRead,
    data: { ...data, ...(type ? { type } : {}) },
    ...getInboxIcon(type),
  };
};

const extractServerNotifications = (responseData) => {
  const payload = responseData?.data ?? responseData;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.notifications)) return payload.notifications;
  return [];
};

const extractUnreadCount = (responseData) => {
  const candidates = [
    responseData?.unread_count,
    responseData?.meta?.unread_count,
    responseData?.pagination?.unread_count,
    responseData?.data?.unread_count,
    responseData?.data?.meta?.unread_count,
    responseData?.data?.pagination?.unread_count,
  ];
  const value = candidates.find((candidate) => candidate != null && candidate !== "");
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
};

const inboxKey = (session) => `${STORAGE_KEYS.NOTIFICATION_INBOX}:user:${encodeURIComponent(session.userId)}`;
const dismissedNotificationKey = (session) => `${inboxKey(session)}:dismissed`;
const pendingReadKey = (session) => `${inboxKey(session)}:pending-read`;
const pushTokenKey = (session) => `${STORAGE_KEYS.PUSH_TOKEN}:user:${encodeURIComponent(session.userId)}`;
const notificationSettingsKey = (session) => `${STORAGE_KEYS.NOTIF_SETTINGS}:user:${encodeURIComponent(session.userId)}`;
const readInbox = async (session) => {
  const raw = await AsyncStorage.getItem(inboxKey(session));
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

// Stores which notifications the user hid locally — nothing more. An earlier
// version also stored each row's unread state at dismissal time and subtracted
// it from the badge forever, which went wrong as soon as the server's own count
// changed for that row (read elsewhere, read-all, deleted). The badge
// correction is now derived from the live server rows instead, so only the ids
// need to persist. Both the id-array and the { id: wasUnread } map are read so
// an upgrade keeps the user's hidden rows hidden.
const readDismissedNotificationIds = async (session) => {
  try {
    const raw = await AsyncStorage.getItem(dismissedNotificationKey(session));
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return new Set(parsed.map(String));
    if (parsed && typeof parsed === "object") return new Set(Object.keys(parsed));
    return new Set();
  } catch (_) {
    return new Set();
  }
};

const writeDismissedNotificationIds = async (session, ids) => {
  await AsyncStorage.setItem(dismissedNotificationKey(session), JSON.stringify([...ids]));
};

// Sync, dismiss, mark-read and read-all all read-modify-write the same stored
// state, so they share one lock per session. Keyed by session so switching
// accounts never blocks the new one behind the old one's work.
const inboxLock = createSessionLock();
const withInboxLock = (session, task) => inboxLock(getInboxSessionKey(session), task);

// Monotonic per-session counter, bumped by every local mutation. A GET that
// started before a mutation and returns after it carries pre-mutation rows, so
// comparing the revision captured at request start against the one at commit
// tells us the response is stale. Clearing the pending id is not enough on its
// own: once the PATCH succeeds the id is gone, and the stale body would then
// look authoritative and resurrect the row as unread.
const inboxRevisions = new Map();
// Ids touched by local mutations since the last sync committed. A stale
// response may still carry rows this session has not mutated — notably a push
// that has just arrived — so only these ids are protected from it.
const mutatedInboxIds = new Map();

const getInboxRevision = (session) => inboxRevisions.get(getInboxSessionKey(session)) ?? 0;

const getMutatedInboxIds = (session) => mutatedInboxIds.get(getInboxSessionKey(session)) ?? new Set();

const bumpInboxRevision = (session, mutatedId = null) => {
  const key = getInboxSessionKey(session);
  const next = (inboxRevisions.get(key) ?? 0) + 1;
  inboxRevisions.set(key, next);
  if (mutatedId != null) {
    const ids = mutatedInboxIds.get(key) ?? new Set();
    ids.add(String(mutatedId));
    mutatedInboxIds.set(key, ids);
  }
  return next;
};

// Called once a sync has committed the server's view, which already reflects
// the mutations the server knows about.
const clearMutatedInboxIds = (session) => mutatedInboxIds.delete(getInboxSessionKey(session));
subscribeAuthSession(() => {
  backendInboxUnavailableUntil = 0;
  // Revisions are keyed per session, so a new account already starts fresh;
  // clearing here just stops the map growing across account switches.
  inboxRevisions.clear();
  emitInbox([]);
});

const readPendingIds = async (session) => {
  try {
    const raw = await AsyncStorage.getItem(pendingReadKey(session));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch (_) {
    return new Set();
  }
};

const writePendingIds = async (session, ids) => {
  await AsyncStorage.setItem(pendingReadKey(session), JSON.stringify([...ids]));
};

// Serialized for the same reason as the dismissal set: concurrent callers each
// reading the set, adding one id and writing it back would drop all but the
// last, losing pending reads that were never sent to the server.
// Every read-modify-write of the pending set goes through these. A caller that
// already holds the lock must use addPendingReadLocked directly, or it would
// deadlock waiting on a lock its own session already owns.
const addPendingReadLocked = async (serverId, session) => {
  const ids = await readPendingIds(session);
  ids.add(String(serverId));
  await writePendingIds(session, ids);
  return ids;
};

const queuePendingRead = (serverId, session) => withInboxLock(
  session,
  () => addPendingReadLocked(serverId, session),
);

const clearPendingRead = (serverId, session) => withInboxLock(session, async () => {
  const ids = await readPendingIds(session);
  ids.delete(String(serverId));
  await writePendingIds(session, ids);
  return ids;
});

// Removes only the ids this request actually confirmed. Clearing the whole set
// would discard reads queued while the request was in flight, losing them
// silently — they would never reach the server.
const clearConfirmedPendingReads = (confirmedIds, session) => withInboxLock(session, async () => {
  const ids = removeConfirmedPendingIds(await readPendingIds(session), confirmedIds);
  await writePendingIds(session, ids);
  return ids;
});

const flushPendingReads = async (session) => {
  const key = getInboxSessionKey(session);
  if (pendingReadFlushes.has(key)) return pendingReadFlushes.get(key);

  const request = (async () => {
    if (isBackendInboxUnavailable()) return;
    const ids = await readPendingIds(session);
    for (const serverId of ids) {
      if (!await isAuthSessionCurrent(session)) return;
      try {
        await api.patch(`/notifications/${encodeURIComponent(serverId)}/read`, null, {
          authSession: session,
          suppressAuthRedirect: true,
          suppressErrorLog: true,
        });
        await clearPendingRead(serverId, session);
      } catch (error) {
        if (__DEV__) {
          console.warn(
            "[Notifications] retry mark-read failed:",
            error.response?.status ?? error.message,
          );
        }
        return;
      }
    }
  })();

  pendingReadFlushes.set(key, request);
  try {
    await request;
  } finally {
    if (pendingReadFlushes.get(key) === request) pendingReadFlushes.delete(key);
  }
};

const updateNotificationInbox = async (updater, session = null, metadata = null) => {
  session ??= await captureAuthSession();
  if (!session?.userId) return [];
  const result = inboxWriteQueue.catch(() => {}).then(() =>
    runWithSession(session, async () => {
      const next = updater(await readInbox(session));
      await AsyncStorage.setItem(inboxKey(session), JSON.stringify(next));
      const nextMetadata = metadata ?? inboxMetadata.get(getInboxSessionKey(session)) ?? null;
      emitInbox(next, nextMetadata);
      return next;
    }),
  );
  inboxWriteQueue = result.catch(() => {});
  return (await result) ?? [];
};

export async function loadNotificationInbox() {
  const session = await captureAuthSession();
  if (!session?.userId) return [];
  return (await runWithSession(session, () => readInbox(session))) ?? [];
}

export function subscribeNotificationInbox(listener) {
  inboxListeners.add(listener);
  return () => inboxListeners.delete(listener);
}

const inboxRequests = new Map();
export async function syncNotificationInboxFromBackend() {
  if (isBackendInboxUnavailable()) return loadNotificationInbox();

  const session = await captureAuthSession();
  if (!session?.userId) return [];
  const key = `${session.generation}:${session.userId}`;
  if (inboxRequests.has(key)) return inboxRequests.get(key);
  const request = fetchNotificationInbox(session);
  inboxRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (inboxRequests.get(key) === request) inboxRequests.delete(key);
  }
}

async function fetchNotificationInbox(session) {
  try {
    // Captured before the request so a mutation that commits while it is in
    // flight can be detected at commit time.
    const revisionAtStart = getInboxRevision(session);
    const response = await api.get("/notifications", {
      authSession: session,
      params: { page: 1, per_page: NOTIFICATION_INBOX_LIMIT },
      timeout: 5000,
      suppressErrorLog: true,
      suppressAuthRedirect: true,
    });
    let serverItems = extractServerNotifications(response.data)
      .map(normalizeServerNotification)
      .filter(Boolean);
    // The notification record from the authenticated inbox is the source of
    // truth for whether a notification belongs to this user. Cross-checking it
    // against GET /announcements hid valid notifications, because that list is
    // paginated (Home requests limit=5) and an older announcement simply is not
    // in it — the detail endpoint still serves it. Deleted or unpublished
    // announcements are handled by the detail screen's 403/404/410 responses.
    const serverUnreadCount = extractUnreadCount(response.data);

    // Both the dismissal set and the pending reads are read inside the lock:
    // a mutation that lands while this request is in flight must not be
    // overwritten by the stale snapshot this response was built from.
    const items = await withInboxLock(session, async () => {
      // A mutation committed while this GET was in flight means the response
      // predates it. Applying it would undo that mutation — and the pending id
      // may already have been cleared by a successful PATCH, so the pending
      // set alone cannot protect the row. Keep the local state instead; the
      // next sync fetches rows that include the mutation.
      const stale = isInboxResponseStale(revisionAtStart, getInboxRevision(session));
      const mutatedIds = stale ? getMutatedInboxIds(session) : new Set();
      // A response that predates nothing already reflects every local mutation
      // the server knows about, so the protection set can be reset.
      if (!stale) clearMutatedInboxIds(session);
      const dismissedIds = await readDismissedNotificationIds(session);
      const pendingIds = await readPendingIds(session);
      // The correction uses every row in the page, dismissed rows included, so
      // a dismissed row is only subtracted while the server still reports it
      // unread. See getCorrectedUnreadCount for why a stored flag is not used.
      const unreadCount = getCorrectedUnreadCount({
        serverUnreadCount,
        serverRows: serverItems,
        dismissedIds,
        pendingReadIds: pendingIds,
      });
      const metadata = unreadCount == null ? null : { unreadCount };
      if (metadata) inboxMetadata.set(getInboxSessionKey(session), metadata);

      const visibleItems = serverItems.filter((item) => !dismissedIds.has(String(item.id)));
      return updateNotificationInbox(
        (current) => {
          const incoming = applyPendingReads(visibleItems, pendingIds);
          // A stale body must not undo rows this session just mutated, but it
          // may still carry rows the mutation never touched — including a push
          // that just arrived, which the tap handler needs to find.
          const reconciled = stale
            ? mergeStaleInboxResponse(current, incoming, mutatedIds)
            : incoming;
          return mergeNotificationInbox(current, reconciled, dismissedIds);
        },
        session,
        metadata,
      );
    });
    await flushPendingReads(session);
    return items;

  } catch (error) {
    if (await isAuthSessionCurrent(session) && (error.response?.status === 404 || error.response?.status === 405)) {
      markBackendInboxUnavailable();
    }
    if (
      __DEV__ &&
      error.response?.status !== 404 &&
      error.response?.status !== 405
    ) {
      console.warn(
        "[Notifications] sync inbox ไม่สำเร็จ ใช้ local cache แทน:",
        error.response?.status ?? error.message,
      );
    }
    // Do not replace an old account's failed request with the new account's
    // inbox when a logout/login happened while the request was in flight.
    return (await runWithSession(session, () => readInbox(session))) ?? [];
  }
}

// Remote payloads may arrive after an account switch. Only the authenticated
// inbox response can confirm ownership; never persist unverified push content.
export async function saveNotificationToInbox(notification) {
  if (!notification?.request?.content) return [];
  const items = await syncNotificationInboxFromBackend();
  const serverId = parseNotificationData(notification.request.content.data).notification_id;

  // Backend may send the push immediately after inserting the inbox row. If the
  // first GET races that transaction, retry only this notification a few times
  // so the header badge updates without turning inbox sync into polling.
  if (serverId != null && !items.some((item) => String(item.serverId) === String(serverId))) {
    schedulePushInboxRetry(String(serverId));
  }

  return items;
}

const schedulePushInboxRetry = (serverId) => {
  if (pendingPushInboxRetries.has(serverId)) return;
  pendingPushInboxRetries.add(serverId);

  (async () => {
    for (const delay of [1000, 3000]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const session = await captureAuthSession();
      if (!session) return;
      const items = await syncNotificationInboxFromBackend();
      if (items.some((item) => String(item.serverId) === serverId)) return;
    }
  })()
    .catch((error) => {
      if (__DEV__) {
        console.warn("[Notifications] delayed inbox sync failed:", error?.message);
      }
    })
    .finally(() => pendingPushInboxRetries.delete(serverId));
};

export async function markNotificationRead(id) {
  const session = await captureAuthSession();
  if (!session?.userId) return [];
  // Reading the row and committing the change share the lock, so an in-flight
  // sync cannot land between them and overwrite this read with stale state.
  const { items, serverId } = await withInboxLock(session, async () => {
    const currentItems = await readInbox(session);
    const currentItem = currentItems.find((item) => item.id === id);
    const wasUnread = Boolean(currentItem && !currentItem.read);
    const knownMetadata = inboxMetadata.get(getInboxSessionKey(session));
    const updated = await updateNotificationInbox((current) => current.map((item) => {
      if (item.id !== id) return item;
      return { ...item, read: true };
    }), session, knownMetadata && wasUnread
      ? { unreadCount: Math.max(0, knownMetadata.unreadCount - 1) }
      : knownMetadata);
    // Enqueued in the same critical section as the inbox write: releasing the
    // lock in between leaves a window where the row reads as read but nothing
    // is queued for the server, and a sync landing there would resurrect it as
    // unread. addPendingReadLocked is used because this already holds the lock.
    const pendingServerId = currentItem?.serverId ?? null;
    if (pendingServerId) await addPendingReadLocked(pendingServerId, session);
    bumpInboxRevision(session, id);
    return { items: updated, serverId: pendingServerId };
  });
  // The network call stays outside the lock so a slow request cannot block
  // other mutations for this session.
  if (serverId && await isAuthSessionCurrent(session)) {
    await flushPendingReads(session);
  }
  return items;
}

export async function dismissNotification(id) {
  const session = await captureAuthSession();
  if (!session?.userId) return [];
  // The read state is resolved inside the lock: a sync running concurrently
  // can flip the row to read, and deciding from a snapshot taken outside the
  // lock would decrement the badge for a row the server already stopped
  // counting.
  return withInboxLock(session, async () => {
    const currentItems = await readInbox(session);
    const currentItem = currentItems.find((item) => String(item.id) === String(id));
    const wasUnread = Boolean(currentItem && !currentItem.read);
    const dismissedIds = await readDismissedNotificationIds(session);
    const alreadyDismissed = dismissedIds.has(String(id));
    dismissedIds.add(String(id));
    await writeDismissedNotificationIds(session, dismissedIds);

    // This is an optimistic local adjustment so the badge reacts immediately.
    // The next sync recomputes it from the server rows, which is what keeps it
    // correct once the server's own count changes for this row.
    const knownMetadata = inboxMetadata.get(getInboxSessionKey(session));
    bumpInboxRevision(session, id);
    return updateNotificationInbox(
      (current) => current.filter((item) => String(item.id) !== String(id)),
      session,
      knownMetadata && wasUnread && !alreadyDismissed
        ? { unreadCount: Math.max(0, knownMetadata.unreadCount - 1) }
        : knownMetadata,
    );
  });
}

export async function markAllNotificationsRead() {
  const session = await captureAuthSession();
  if (!session?.userId) return [];
  // The inbox update and the pending-read queueing happen in one locked step,
  // so a sync cannot commit between them and resurrect an unread state for
  // rows this call already marked read.
  const { items, coveredIds } = await withInboxLock(session, async () => {
    const updated = await updateNotificationInbox(
      (current) => current.map((item) => ({ ...item, read: true })),
      session,
      { unreadCount: 0 },
    );
    const pendingIds = await readPendingIds(session);
    updated.forEach((item) => {
      if (item.serverId) pendingIds.add(String(item.serverId));
    });
    await writePendingIds(session, pendingIds);
    // Snapshot of exactly what this read-all covers. Anything queued after
    // this point belongs to a later mutation and must survive.
    // Always bump, even for an empty list, so an in-flight GET is still
    // recognised as predating this read-all.
    bumpInboxRevision(session);
    updated.forEach((item) => bumpInboxRevision(session, item.id));
    return { items: updated, coveredIds: [...pendingIds] };
  });
  if (!isBackendInboxUnavailable() && await isAuthSessionCurrent(session)) {
    try {
      await api.post("/notifications/read-all", null, {
        authSession: session,
        suppressAuthRedirect: true,
        suppressErrorLog: true,
      });
      // Clear only the snapshot the server confirmed. Wiping the whole set
      // would silently drop reads queued while this request was in flight.
      await clearConfirmedPendingReads(coveredIds, session);
    } catch {
      await flushPendingReads(session);
    }
  }
  return items;
}

const requestPermissionWithRationale = async (Notifications) => {
  const current = await Notifications.getPermissionsAsync();
  if (hasNotificationPermission(current, Notifications)) return "granted";

  const prompted = await AsyncStorage.getItem(
    STORAGE_KEYS.NOTIF_PERMISSION_PROMPTED,
  );
  if (prompted === "true") return current.status;

  if (current.status === "denied") {
    return new Promise((resolve) => {
      const finish = async (openSettings) => {
        try {
          await AsyncStorage.setItem(
            STORAGE_KEYS.NOTIF_PERMISSION_PROMPTED,
            "true",
          );
          if (openSettings) await Linking.openSettings();
        } catch (_) {}
        resolve(current.status);
      };

      Alert.alert(
        i18n.t("notif.permissionTitle"),
        i18n.t("notif.permissionMessage"),
        [
          {
            text: i18n.t("notif.notNow"),
            style: "cancel",
            onPress: () => finish(false),
          },
          {
            text: i18n.t("notif.openSettings"),
            onPress: () => finish(true),
          },
        ],
        { cancelable: false },
      );
    });
  }

  return new Promise((resolve) => {
    Alert.alert(
      i18n.t("notif.permissionTitle"),
      i18n.t("notif.permissionMessage"),
      [
        {
          text: i18n.t("notif.notNow"),
          style: "cancel",
          onPress: async () => {
            try {
              await AsyncStorage.setItem(
                STORAGE_KEYS.NOTIF_PERMISSION_PROMPTED,
                "true",
              );
            } catch (_) {}
            resolve(current.status);
          },
        },
        {
          text: i18n.t("notif.allow"),
          onPress: async () => {
            try {
              await AsyncStorage.setItem(
                STORAGE_KEYS.NOTIF_PERMISSION_PROMPTED,
                "true",
              );
              const result = await Notifications.requestPermissionsAsync();
              resolve(hasNotificationPermission(result, Notifications) ? "granted" : result.status);
            } catch (_) {
              resolve("denied");
            }
          },
        },
      ],
      { cancelable: false },
    );
  });
};

// แสดง notification ขณะ app เปิดอยู่ (foreground) — mobile only
if (Platform.OS !== "web" && !isExpoGo) {
  try {
    const Notifications = getNotifications();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (error) {
    if (__DEV__) {
      console.warn("[Notifications] handler setup skipped:", error?.message);
    }
  }
}

// ── ขอ permission + ดึง push token ───────────────────────────
export async function registerForPushNotificationsAsync(devicePushToken = null) {
  const session = await captureAuthSession();
  if (!session) return null;
  if (Platform.OS === "web") return null;
  if (isExpoGo) {
    if (__DEV__) {
      console.warn("[Notifications] Push notification ต้องทดสอบด้วย development build ไม่ใช่ Expo Go");
    }
    return null;
  }
  if (!Device.isDevice) {
    if (__DEV__) console.warn("[Notifications] ต้องใช้อุปกรณ์จริง ไม่รองรับ Simulator");
    return null;
  }

  try {
    const Notifications = getNotifications();
    if (!Notifications) return null;

    await configureAndroidNotificationChannels(Notifications);

    const finalStatus = await requestPermissionWithRationale(Notifications);
    if (__DEV__) console.log("NOTIFICATION PERMISSION:", finalStatus);
    if (finalStatus !== "granted") {
      if (__DEV__) console.warn("[Notifications] ผู้ใช้ปฏิเสธ permission");
      return null;
    }

    const projectId = getExpoProjectId();
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
      ...(devicePushToken ? { devicePushToken } : {}),
    });
    const token = tokenData.data;
    if (!isExpoPushToken(token)) throw new Error("Invalid Expo push token");
    return (await runWithSession(session, async () => {
      if (!session.userId) return null;
      await AsyncStorage.setItem(pushTokenKey(session), token);
      return token;
    })) ?? null;
  } catch (e) {
    // A free Apple Personal Team cannot sign an app with Push Notifications.
    // Keep local development usable; distribution builds retain this flow.
    if (isMissingPushEntitlementError(e)) {
      if (__DEV__) {
        console.warn(
          "[Notifications] iOS build นี้ไม่มี Push Notifications entitlement; ข้ามการลงทะเบียน push token",
        );
      }
      return null;
    }
    if (__DEV__) console.warn("EXPO PUSH TOKEN ERROR:", e);
    throw e;
  }
}

export async function getNotificationPermissionStatus() {
  const Notifications = getNotifications();
  if (!Notifications) return "unavailable";
  try {
    const permission = await Notifications.getPermissionsAsync();
    return hasNotificationPermission(permission, Notifications) ? "granted" : permission.status;
  } catch (_) {
    return "unavailable";
  }
}

export async function openNotificationSystemSettings() {
  if (Platform.OS === "web") return;
  await Linking.openSettings();
}

// ── ส่ง token ไปที่ backend ───────────────────────────────────
export async function sendTokenToBackend(token, sanctumToken) {
  if (!isExpoPushToken(token)) throw new Error("Expected an Expo push token");
  const authToken =
    sanctumToken ?? (await getAuthToken());
  const session = await captureAuthSession();
  if (!authToken || session?.token !== authToken) throw new Error("Session changed");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const endpoint = `${API_BASE_URL}/push-token`;
    if (__DEV__) console.log("PUSH TOKEN ENDPOINT:", endpoint);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(getPushTokenPayload(token)),
      signal: controller.signal,
    });
    const result = await response.text();
    if (__DEV__) console.log("PUSH TOKEN API:", response.status);

    if (!response.ok) {
      // Keep the server's diagnostic available during development without
      // logging the push token or Sanctum authorization header.
      if (__DEV__) {
        console.warn("[Notifications] push-token registration failed:", response.status, result || "<empty response>");
      }
      const error = new Error(result || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

const isRetryablePushError = (error) => {
  const status = error?.status ?? error?.response?.status;
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true;
  return error?.name === "AbortError" || !status;
};

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

// Resolves with the Expo push token the backend accepted, or null when
// registration did not complete. The token is the authoritative identity of a
// confirmed registration.
export async function ensurePushTokenRegistered(session = null, devicePushToken = null) {
  session ??= await captureAuthSession();
  if (!session?.userId) return null;
  // The dedupe key includes the device token being registered. Keying on the
  // session alone let a rotation join an in-flight registration for the OLD
  // token and resolve with it, so the new token was never sent.
  const key = `${getInboxSessionKey(session)}|${devicePushToken?.data ?? ""}`;
  if (pushRegistrationInFlight?.key === key) {
    return pushRegistrationInFlight.promise;
  }

  const promise = (async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (!await isAuthSessionCurrent(session)) return null;
      try {
        // registerForPushNotificationsAsync may mint or rotate the token, so
        // the value accepted by the backend is only known here. Callers build
        // their confirmation identity from the returned token rather than from
        // whatever was stored before this ran.
        const token = await registerForPushNotificationsAsync(devicePushToken);
        if (!token) return null;
        if (!await isAuthSessionCurrent(session)) return null;
        await sendTokenToBackend(token, session.token);
        // Re-check after the request: a logout or account switch while it was
        // in flight must not produce a confirmation for the new session.
        if (!await isAuthSessionCurrent(session)) return null;
        return token;
      } catch (error) {
        if (attempt === 3 || !isRetryablePushError(error)) throw error;
        if (__DEV__) {
          console.warn(
            `[Notifications] token registration retry ${attempt}/2:`,
            error?.status ?? error?.message,
          );
        }
        await wait(attempt * 1500);
      }
    }
    return null;
  })();

  pushRegistrationInFlight = { key, promise };
  try {
    return await promise;
  } finally {
    if (pushRegistrationInFlight?.promise === promise) pushRegistrationInFlight = null;
  }
}

let rotationQueue = Promise.resolve();
export async function handlePushTokenChange(devicePushToken) {
  const session = await captureAuthSession();
  if (!session || !devicePushToken?.data || !["android", "ios"].includes(devicePushToken.type)) return;
  const work = rotationQueue.catch(() => {}).then(async () => {
    if (!await isAuthSessionCurrent(session)) return;
    // Routed through the orchestrator so a rotation records confirmation for
    // the token the backend actually accepted, like every other entry point.
    await registerPushTokenConfirmed({ devicePushToken });
  });
  rotationQueue = work.catch(() => {});
  try { await work; } catch {
    if (__DEV__) console.warn("[Notifications] Token registration failed; retry at next login");
  }
}

// Removing the device token always invalidates its local confirmation, whether
// or not the backend DELETE succeeded. A failed DELETE leaves the server-side
// token registered; keeping a local confirmation on top of that would let the
// next login skip POST /push-token and never repair the mismatch. The return
// value still reports the backend outcome so callers can distinguish them.
export async function removeTokenFromBackend(token, session = null) {
  if (!isExpoPushToken(token)) return false;
  session ??= await captureAuthSession();
  if (!session) return false;
  try {
    await api.delete("/push-token", {
      data: getDeletePushTokenPayload(token), authSession: session, suppressAuthRedirect: true,
    });
    return true;
  } catch {
    return false;
  } finally {
    // Scoped to the account whose token was removed; another account's stored
    // confirmation is untouched.
    await clearPushRegistrationForUser(session.userId);
    // Only reset shared recovery state if this session is still the current
    // one. A DELETE for a signed-out account that completes after the next
    // login would otherwise wipe the new account's recovery state.
    if (await isAuthSessionCurrent(session)) pushRecovery.reset();
  }
}

export async function getStoredPushToken(session = null) {
  session ??= await captureAuthSession();
  if (!session?.userId) return null;
  return (await runWithSession(session, () => AsyncStorage.getItem(pushTokenKey(session)))) ?? null;
}

export async function loadNotificationSettings(session = null) {
  session ??= await captureAuthSession();
  if (!session?.userId) return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const raw = await runWithSession(session, () => AsyncStorage.getItem(notificationSettingsKey(session)));
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch (_) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function saveNotificationSettings(settings, session = null) {
  session ??= await captureAuthSession();
  if (!session?.userId) return DEFAULT_NOTIFICATION_SETTINGS;
  const next = { ...DEFAULT_NOTIFICATION_SETTINGS, ...settings };
  return (await runWithSession(session, async () => {
    await AsyncStorage.setItem(notificationSettingsKey(session), JSON.stringify(next));
    return next;
  })) ?? DEFAULT_NOTIFICATION_SETTINGS;
}

export async function syncNotificationSettingsToBackend(settings, session = null) {
  session ??= await captureAuthSession();
  if (!session) return false;
  const key = getInboxSessionKey(session);
  const previous = notificationSettingsSyncQueues.get(key) ?? Promise.resolve();
  const request = previous.catch(() => {}).then(async () => {
    if (!await isAuthSessionCurrent(session)) return false;
    try {
      await api.put(
        "/notification-settings",
        getNotificationSettingsPayload(settings),
        { authSession: session, suppressErrorLog: true, suppressAuthRedirect: true },
      );
      if (__DEV__) console.log("[Notifications] บันทึก settings สำเร็จ");
      return true;
    } catch (error) {
      if (__DEV__) {
        console.warn(
          "[Notifications] บันทึก settings ไม่สำเร็จ:",
          error.response?.status ?? error.message,
        );
      }
      return false;
    }
  });
  const tracked = request.finally(() => {
    if (notificationSettingsSyncQueues.get(key) === tracked) {
      notificationSettingsSyncQueues.delete(key);
    }
  });
  notificationSettingsSyncQueues.set(key, tracked);
  return request;
}

// ── เรียกตอน login สำเร็จ ────────────────────────────────────
let permissionReturnSubscription = null;

export { clearPushRegistrationForUser };

const pushConfirmationKey = (session) => pushConfirmationKeyForUser(session.userId);

// Backend confirmation is stored separately from the Expo token. The token is
// written as soon as it is minted, before POST /push-token runs, so its
// presence says nothing about whether the backend accepted it.
const readPushConfirmation = async (session) => {
  try {
    const raw = await AsyncStorage.getItem(pushConfirmationKey(session));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.identity ? parsed : null;
  } catch (_) {
    return null;
  }
};

// Serialized with auth invalidation through the shared session queue, so a
// write that started before a logout cannot land after cleanup and restore a
// confirmation for a session that no longer exists. runWithSession resolves
// undefined (without writing) when the session is already gone.
//
// This is the only auth lock taken on this path — the recovery orchestrator
// holds no lock of its own — so there is no nesting and no deadlock.
const writePushConfirmation = async (session, confirmation) => {
  try {
    await runWithSession(session, async () => {
      await AsyncStorage.setItem(pushConfirmationKey(session), JSON.stringify(confirmation));
    });
  } catch (_) {}
};

const pushRecovery = createPushRegistrationRecovery({
  getSession: () => captureAuthSession(),
  getPermissionStatus: async () => {
    const Notifications = getNotifications();
    if (!Notifications) return "unavailable";
    const current = await Notifications.getPermissionsAsync();
    return hasNotificationPermission(current, Notifications) ? "granted" : current.status;
  },
  // Reads the already-minted token without prompting. Registration itself
  // mints one when needed.
  getExpoToken: (session) => runWithSession(session, () => AsyncStorage.getItem(pushTokenKey(session))),
  // Resolves with the token the backend accepted so the confirmation identity
  // matches what POST /push-token actually received.
  registerWithBackend: async (session, _token, devicePushToken = null) => {
    const acceptedToken = await ensurePushTokenRegistered(session, devicePushToken);
    if (!acceptedToken) {
      throw Object.assign(new Error("Push registration did not complete"), { retryable: true });
    }
    return acceptedToken;
  },
  isRetryableError: (error) => (error?.retryable === true ? true : isRetryablePushError(error)),
  readConfirmation: readPushConfirmation,
  writeConfirmation: writePushConfirmation,
  getPlatform: () => Platform.OS,
  getProjectId: () => getExpoProjectId(),
  onError: (error, { retryable }) => {
    if (__DEV__) {
      console.warn(
        "[Notifications] push registration recovery failed:",
        retryable ? "retryable" : "permanent",
        error?.status ?? error?.message,
      );
    }
  },
});

subscribeAuthSession(() => pushRecovery.reset());

// The permission prompt can hand the user off to system Settings and resolves
// with the status read before that happened, so enabling notifications there
// leaves this install unregistered. Re-check on foreground and register when
// the status actually became granted — retrying while a previous attempt is
// still unconfirmed.
// Shared confirmed-registration entry point. Login, startup, permission
// recovery, token rotation and the Settings toggle all go through this so the
// accepted token is recorded as confirmation in exactly one place.
export async function registerPushTokenConfirmed({ devicePushToken = null } = {}) {
  const result = await pushRecovery.register({ devicePushToken });
  return result?.action === "confirmed";
}

export function startPushPermissionWatcher() {
  if (Platform.OS === "web" || isExpoGo) return () => {};
  if (permissionReturnSubscription) return () => {};
  if (!getNotifications()) return () => {};

  const handleForeground = (state) => {
    if (state !== "active") return;
    // Errors are handled inside run(); catch here so a rejection can never
    // escape the AppState callback.
    pushRecovery.run().catch(() => {});
  };

  permissionReturnSubscription = AppState.addEventListener("change", handleForeground);
  return () => {
    permissionReturnSubscription?.remove();
    permissionReturnSubscription = null;
  };
}

export async function onLoginSuccess() {
  const session = await captureAuthSession();
  if (!session) return;
  if (Platform.OS === "web") {
    syncNotificationInboxFromBackend().catch(() => {});
    return;
  }

  const registerPushToken = async () => {
    const registered = await registerPushTokenConfirmed();
    if (!registered && !isExpoGo && Device.isDevice) {
      console.warn(
        "PUSH TOKEN SKIPPED: permission, device หรือ build ยังไม่พร้อม",
      );
    }
  };

  const [pushResult, settingsResult] = await Promise.allSettled([
    registerPushToken(),
    loadNotificationSettings(session).then((settings) => syncNotificationSettingsToBackend(settings, session)),
  ]);
  if (pushResult.status === "rejected") {
    console.warn("PUSH NOTIFICATION SETUP ERROR:", pushResult.reason);
  }
  if (settingsResult.status === "rejected") {
    console.warn("NOTIFICATION SETTINGS ERROR:", settingsResult.reason);
  }

  syncNotificationInboxFromBackend().catch((error) => {
    if (__DEV__) console.warn("NOTIFICATION INBOX ERROR:", error?.message);
  });
}

// หน้าที่อนุญาตให้ push notification นำทางได้ — ป้องกัน navigation injection
const ALLOWED_NOTIFICATION_SCREENS = [
  "Notifications",
  "NotificationDetail",
  "Announcements",
  "MainTabs",
];

const getNotificationResponseKey = (response) => {
  const request = response?.notification?.request;
  const identifier = request?.identifier;
  const actionIdentifier = response?.actionIdentifier;
  if (!identifier && !actionIdentifier) return null;
  return `${identifier ?? "unknown"}:${actionIdentifier ?? "default"}`;
};

const shouldHandleNotificationResponse = async (response, session) => {
  if (!session || !await isAuthSessionCurrent(session)) return false;

  const key = getNotificationResponseKey(response);
  if (!key) return true;

  const responseKey = `${STORAGE_KEYS.LAST_NOTIFICATION_RESPONSE}:user:${encodeURIComponent(session.userId ?? "unknown")}`;
  const previousKey = await AsyncStorage.getItem(responseKey);
  if (previousKey === key) return false;

  return (await runWithSession(session, async () => {
    await AsyncStorage.setItem(responseKey, key);
    return true;
  })) ?? false;
};

// ── handle เมื่อผู้ใช้แตะ notification ──────────────────────
export async function handleNotificationResponse(response) {
  const session = await captureAuthSession();
  if (!session) return;
  let items = [];
  try {
    items = await saveNotificationToInbox(response?.notification);
  } catch (_) {}
  const shouldNavigate = await shouldHandleNotificationResponse(response, session);
  if (!shouldNavigate) return;

  const rawData = parseNotificationData(response?.notification?.request?.content?.data);
  const serverId = rawData.notification_id;
  const verified = serverId == null
    ? null
    : items.find((item) => String(item.serverId) === String(serverId));
  // Do not trust routing fields from a push until the matching authenticated
  // inbox row has been loaded. Missing IDs and delayed inbox writes both fall
  // back to the inbox screen; the retry scheduled above updates the badge.
  if (serverId == null || !verified) {
    if (await isAuthSessionCurrent(session)) navigate("Notifications");
    return;
  }
  const data = verified.data;

  if (data.type === "announcement") {
    if (data.announcement_id == null) {
      if (await isAuthSessionCurrent(session)) navigate("Notifications");
      return;
    }
    if (await isAuthSessionCurrent(session)) {
      navigate("AnnouncementDetail", {
        announcementId: data.announcement_id,
      });
    }
    return;
  }

  const hasExplicitScreen = ALLOWED_NOTIFICATION_SCREENS.includes(data.screen);
  const screen = hasExplicitScreen ? data.screen : "NotificationDetail";
  const params = hasExplicitScreen
    ? data.params ?? {}
    : { notification: verified };
  if (await isAuthSessionCurrent(session)) navigate(screen, params);
}
