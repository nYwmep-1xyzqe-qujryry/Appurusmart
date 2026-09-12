import * as Device from "expo-device";
import Constants from "expo-constants";
import { Alert, Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { navigate } from "../navigation/navigationRef";
import { API_BASE_URL, EXPO_PROJECT_ID, STORAGE_KEYS } from "../config";
import { isExpoGo } from "../utils/runtime";
import i18n from "../i18n/i18n";
import api from "./api";
import { getAuthToken, captureAuthSession, runWithSession, isAuthSessionCurrent, subscribeAuthSession } from "./authStorage";

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
    lightColor: "#0f7a55",
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
      return { icon: "megaphone-outline", iconColor: "#0f7a55", iconBg: "#e8f5ee" };
    case "beforeClass":
    case "before_class":
      return { icon: "alarm-outline", iconColor: "#2167b2", iconBg: "#e8f1fb" };
    case "holiday":
      return { icon: "calendar-clear-outline", iconColor: "#c95b05", iconBg: "#fff4e0" };
    case "gradeDeadline":
    case "grade_deadline":
      return { icon: "document-text-outline", iconColor: "#7c3aed", iconBg: "#f1eafe" };
    default:
      return { icon: "notifications-outline", iconColor: "#0f7a55", iconBg: "#e8f5ee" };
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
subscribeAuthSession(() => {
  backendInboxUnavailableUntil = 0;
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

const queuePendingRead = async (serverId, session) => {
  const ids = await readPendingIds(session);
  ids.add(String(serverId));
  await writePendingIds(session, ids);
};

const clearPendingRead = async (serverId, session) => {
  const ids = await readPendingIds(session);
  ids.delete(String(serverId));
  await writePendingIds(session, ids);
};

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
    const response = await api.get("/notifications", {
      authSession: session,
      params: { page: 1, per_page: NOTIFICATION_INBOX_LIMIT },
      timeout: 5000,
      suppressErrorLog: true,
      suppressAuthRedirect: true,
    });
    const serverItems = extractServerNotifications(response.data)
      .map(normalizeServerNotification)
      .filter(Boolean);
    const pendingIds = await readPendingIds(session);
    const serverUnreadCount = extractUnreadCount(response.data);
    const pendingUnreadCount = serverItems.filter(
      (item) => pendingIds.has(String(item.serverId)) && !item.read,
    ).length;
    const unreadCount = serverUnreadCount == null
      ? null
      : Math.max(0, serverUnreadCount - pendingUnreadCount);
    const metadata = unreadCount == null ? null : { unreadCount };
    if (metadata) inboxMetadata.set(getInboxSessionKey(session), metadata);

    const items = await updateNotificationInbox((current) => {
      const serverIds = new Set(serverItems.map((item) => item.id));
      const normalizedServerItems = serverItems.map((item) =>
        pendingIds.has(String(item.serverId)) ? { ...item, read: true } : item,
      );
      const localOnly = current.filter((item) => !serverIds.has(item.id));
      return [...normalizedServerItems, ...localOnly]
        .sort(
          (a, b) =>
            new Date(b.receivedAt).getTime() -
            new Date(a.receivedAt).getTime(),
        )
        .slice(0, NOTIFICATION_INBOX_LIMIT);
    }, session, metadata);
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
  let serverId = null;
  const currentItems = await readInbox(session);
  const currentItem = currentItems.find((item) => item.id === id);
  const wasUnread = Boolean(currentItem && !currentItem.read);
  serverId = currentItem?.serverId ?? null;
  const knownMetadata = inboxMetadata.get(getInboxSessionKey(session));
  const items = await updateNotificationInbox((current) => current.map((item) => {
    if (item.id !== id) return item;
    return { ...item, read: true };
  }), session, knownMetadata && wasUnread
    ? { unreadCount: Math.max(0, knownMetadata.unreadCount - 1) }
    : knownMetadata);
  if (serverId && await isAuthSessionCurrent(session)) {
    await queuePendingRead(serverId, session);
    await flushPendingReads(session);
  }
  return items;
}

export async function markAllNotificationsRead() {
  const session = await captureAuthSession();
  if (!session?.userId) return [];
  const items = await updateNotificationInbox(
    (current) => current.map((item) => ({ ...item, read: true })),
    session,
    { unreadCount: 0 },
  );
  const serverIds = items.map((item) => item.serverId).filter(Boolean);
  for (const serverId of serverIds) await queuePendingRead(serverId, session);
  if (!isBackendInboxUnavailable() && await isAuthSessionCurrent(session)) {
    try {
      await api.post("/notifications/read-all", null, {
        authSession: session,
        suppressAuthRedirect: true,
        suppressErrorLog: true,
      });
      await writePendingIds(session, new Set());
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

export async function ensurePushTokenRegistered(session = null, devicePushToken = null) {
  session ??= await captureAuthSession();
  if (!session?.userId) return false;
  const key = getInboxSessionKey(session);
  if (pushRegistrationInFlight?.key === key) {
    return pushRegistrationInFlight.promise;
  }

  const promise = (async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (!await isAuthSessionCurrent(session)) return false;
      try {
        const token = await registerForPushNotificationsAsync(devicePushToken);
        if (!token) return false;
        if (!await isAuthSessionCurrent(session)) return false;
        await sendTokenToBackend(token, session.token);
        return true;
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
    return false;
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
    await ensurePushTokenRegistered(session, devicePushToken);
  });
  rotationQueue = work.catch(() => {});
  try { await work; } catch {
    if (__DEV__) console.warn("[Notifications] Token registration failed; retry at next login");
  }
}

export async function removeTokenFromBackend(token, session = null) {
  if (!isExpoPushToken(token)) return false;
  session ??= await captureAuthSession();
  if (!session) return false;
  try {
    await api.delete("/push-token", {
      data: getDeletePushTokenPayload(token), authSession: session, suppressAuthRedirect: true,
    });
    return true;
  } catch { return false; }
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
export async function onLoginSuccess() {
  const session = await captureAuthSession();
  if (!session) return;
  if (Platform.OS === "web") {
    syncNotificationInboxFromBackend().catch(() => {});
    return;
  }

  const registerPushToken = async () => {
    const registered = await ensurePushTokenRegistered(session);
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
    if (await isAuthSessionCurrent(session)) {
      navigate("Announcements", { highlightId: data.announcement_id });
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
