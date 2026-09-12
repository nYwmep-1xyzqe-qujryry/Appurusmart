import "./global.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./src/navigation/AppNavigator";
import {
  flushPendingNavigation,
  navigate,
  navigationRef,
} from "./src/navigation/navigationRef";
import {
  handleNotificationResponse,
  handlePushTokenChange,
  parseNotificationData,
  onLoginSuccess,
  saveNotificationToInbox,
  syncNotificationInboxFromBackend,
} from "./src/services/notificationService";
import { initI18n } from "./src/i18n/i18n";
import { isExpoGo } from "./src/utils/runtime";
import NotificationToast, {
  showToast,
} from "./src/components/NotificationToast";
import LockOverlay from "./src/components/LockOverlay";
import {
  getAuthToken,
  captureAuthSession,
  runWithSession,
  subscribeAuthSession,
} from "./src/services/authStorage";
import { startForegroundRefresh } from "./src/utils/foregroundRefresh";
import { isPinSet } from "./src/services/pinService";
import {
  clearBackgroundTime,
  recordBackgroundTime,
  shouldShowLock,
} from "./src/services/lockService";
import { getCurrentUserId } from "./src/services/userSecurityKeys";

const handleToastPress = (notification) => {
  const data = notification?.request?.content?.data ?? {};
  if (data.type === "announcement") {
    navigate("Announcements", { highlightId: data.announcement_id });
    return;
  }
  navigate("Notifications");
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const startupNotificationSetupStarted = useRef(false);
  const pendingNotificationResponse = useRef(null);

  useEffect(() => {
    (async () => {
      await initI18n();
      // Cold-start lock check — ต้องรู้ผลก่อน ready เป็น true เสมอ กัน Home/หน้า
      // protected แวบให้เห็นก่อน LockOverlay ทันเวลา — PIN เป็น per-account จึง
      // ต้อง resolve userId ก่อนเสมอ (isPinSet ไม่รับ device-level อีกต่อไป)
      try {
        const [token, userId] = await Promise.all([
          getAuthToken(),
          getCurrentUserId(),
        ]);
        const pinSet = token && userId ? await isPinSet(userId) : false;
        if (token && pinSet) setLocked(true);
      } catch (_) {}
      setReady(true);
    })();
  }, []);

  // อ่าน locked ล่าสุดใน AppState callback ได้โดยไม่ต้องผูก effect ใหม่ทุกครั้งที่ locked เปลี่ยน
  const lockedRef = useRef(locked);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const processPendingNotification = useCallback(async () => {
    const response = pendingNotificationResponse.current;
    if (!response || !ready || locked || !navigationRef.isReady()) return;
    const session = await captureAuthSession();
    const currentRoute = navigationRef.getCurrentRoute?.()?.name;
    if (!session || !currentRoute || currentRoute === "Login") return;
    pendingNotificationResponse.current = null;
    await handleNotificationResponse(response);
  }, [locked, ready]);

  useEffect(() => {
    if (!ready) return undefined;
    return subscribeAuthSession(() => {
      processPendingNotification().catch(() => {});
    });
  }, [processPendingNotification, ready]);

  useEffect(() => {
    // Do not present the notifications permission dialog while LockOverlay is
    // asking for biometric authentication. Native prompts compete with each
    // other on iOS and Android, so initialise Push after the app is unlocked.
    if (!ready || locked || startupNotificationSetupStarted.current) return;
    startupNotificationSetupStarted.current = true;
    // A native push token can change after installing a new build while the
    // authenticated session remains on the device. Re-register on startup so
    // push delivery does not depend on completing SSO again.
    onLoginSuccess().catch((error) => {
      if (__DEV__) {
        console.warn(
          "[Notifications] startup registration failed:",
          error?.message,
        );
      }
    });
  }, [ready, locked]);

  useEffect(() => {
    if (!ready) return;
    return startForegroundRefresh({
      refresh: syncNotificationInboxFromBackend,
      isActive: () => AppState.currentState === "active",
      subscribe: (refresh) => {
        const activity = AppState.addEventListener("change", refresh);
        const unsubscribe = subscribeAuthSession(refresh);
        return () => {
          activity.remove();
          unsubscribe();
        };
      },
    });
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // ถ้า overlay ล็อกอยู่แล้ว (เช่นกำลังรอ Face ID) ไม่ต้องเช็ค/ล็อกซ้ำ —
        // ป้องกัน race กับ LockOverlay ที่เพิ่ง unlock สำเร็จพอดีตอน AppState กลับมา active
        if (
          !lockedRef.current &&
          appState.current.match(/inactive|background/)
        ) {
          // อ่าน userId สดใหม่เสมอ (ไม่ใช้ currentUserIdRef ที่ตั้งไว้ตอน
          // cold-start เพราะอาจล้าสมัยถ้ามี login/logout เกิดขึ้นระหว่างนั้น)
          getCurrentUserId().then((userId) => {
            if (!userId) return;
            shouldShowLock(userId).then((show) => {
              if (show) setLocked(true);
            });
          });
        }
      } else if (state === "background" || state === "inactive") {
        // Face ID/Fingerprint prompt ทำให้ AppState เป็น inactive ชั่วคราวเช่นกัน —
        // ถ้าล็อกอยู่แล้วไม่ต้องบันทึกเวลาทับ กัน shouldShowLock() เข้าใจผิดว่า
        // เพิ่งพัก background ตอนที่จริงกำลังรอผล biometric อยู่
        if (!lockedRef.current) recordBackgroundTime();
      }
      appState.current = state;
    });
    return () => subscription.remove();
  }, [ready]);

  useEffect(() => {
    // expo-notifications ไม่รองรับบน web
    if (Platform.OS === "web") return;
    if (isExpoGo) return;

    let responseSubscription;
    let receivedSubscription;
    let tokenSubscription;

    try {
      const Notifications = require("expo-notifications");

      // ผู้ใช้แตะ notification ขณะ app ปิดอยู่ (killed state) — เก็บไว้จนกว่า
      // auth, navigation และ lock overlay จะพร้อม แทนการเดาด้วย timer คงที่
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (!response) return;
          pendingNotificationResponse.current = response;
          processPendingNotification().catch(() => {});
        })
        .catch((error) => {
          if (__DEV__) {
            console.warn(
              "[Notifications] get last response failed:",
              error?.message,
            );
          }
        });

      // ผู้ใช้แตะ notification ขณะ app อยู่ background
      responseSubscription =
        Notifications.addNotificationResponseReceivedListener((response) => {
          pendingNotificationResponse.current = response;
          processPendingNotification().catch(() => {});
        });

      receivedSubscription = Notifications.addNotificationReceivedListener(
        async (notification) => {
          const session = await captureAuthSession();
          if (!session) return;
          try {
            const items = await saveNotificationToInbox(notification);
            const id = parseNotificationData(
              notification?.request?.content?.data,
            ).notification_id;
            const verified = items.find(
              (item) => id != null && String(item.serverId) === String(id),
            );
            if (verified)
              await runWithSession(session, () =>
                showToast({
                  ...notification,
                  request: {
                    ...notification.request,
                    content: {
                      ...notification.request.content,
                      title: verified.title,
                      body: verified.body,
                      data: verified.data,
                    },
                  },
                }),
              );
          } catch {
            /* A push payload alone does not prove inbox ownership. */
          }
        },
      );

      tokenSubscription = Notifications.addPushTokenListener(
        handlePushTokenChange,
      );
    } catch (error) {
      if (__DEV__) {
        console.warn("[Notifications] listener setup skipped:", error?.message);
      }
    }

    return () => {
      responseSubscription?.remove?.();
      receivedSubscription?.remove?.();
      tokenSubscription?.remove?.();
    };
  }, [parseNotificationData, processPendingNotification]);

  const handleNavigationReady = useCallback(() => {
    flushPendingNavigation();
    processPendingNotification().catch(() => {});
  }, [processPendingNotification]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} onReady={handleNavigationReady}>
        <AppNavigator />
      </NavigationContainer>
      <LockOverlay
        locked={locked}
        onUnlock={() => {
          // อัปเดต lockedRef.current แบบ synchronous ทันที ไม่รอ useEffect ที่ sync
          // จาก state เพราะ effect นั้นรันหลัง re-render (async เท่ากับ setState) —
          // ถ้าปล่อยให้รอ effect จะมีหน้าต่างสั้นๆ ที่ AppState 'active' event ที่สอง
          // (เกิดจาก Face ID prompt ปิดแล้ว iOS ส่ง active ซ้ำระหว่าง transition)
          // ยังเห็น lockedRef.current เป็น true อยู่ ทำให้ auto biometric เด้งซ้ำ
          lockedRef.current = false;
          setLocked(false);
          // ล้าง timestamp ที่อาจค้างจากตอนล็อก (เช่น Face ID prompt ทำให้ inactive
          // ชั่วคราว) กัน AppState transition ถัดไปเข้าใจผิดว่า background นานเกิน
          // threshold ทั้งที่เพิ่ง unlock สำเร็จ — ไม่งั้นจะเด้งกลับมาล็อกซ้ำวนลูป
          clearBackgroundTime();
        }}
      />
      <NotificationToast onPress={handleToastPress} />
    </SafeAreaProvider>
  );
}
