import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PinKeypad from "./PinKeypad";
import { colors } from "../theme/tokens";
import { verifyPin } from "../services/pinService";
import { checkSupport, getBiometricPresentation, isBiometricEnabled, authenticateLocally } from "../services/biometricService";
import { recordFailedPinAttempt, resetPinAttempts, wipeForPinFailure, clearSessionOnly } from "../services/lockService";
import { getCurrentUserId } from "../services/userSecurityKeys";
import { navigationRef } from "../navigation/navigationRef";

const PIN_LENGTH = 6;

// reset ไป Login แบบปลอดภัย — cold start อาจเกิดก่อน NavigationContainer
// mount เสร็จ (navigationRef ยังไม่ ready) จึง retry สั้นๆ แทนที่จะ throw
const resetToLogin = (retriesLeft = 20) => {
  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name: "Login" }] });
    return;
  }
  if (retriesLeft <= 0) return;
  setTimeout(() => resetToLogin(retriesLeft - 1), 100);
};

// Overlay เต็มจอ ไม่ใช่ navigator route — mount อยู่นอก NavigationContainer
// เพื่อให้คลุมได้ทุกหน้าจอ/modal ที่กำลังเปิดอยู่ ไม่ว่าผู้ใช้จะอยู่หน้าไหนก็ตาม
export default function LockOverlay({ locked, onUnlock }) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();

  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const [checkingBiometric, setCheckingBiometric] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricIcon, setBiometricIcon] = useState("finger-print-outline");
  const [ssoButtonPressed, setSsoButtonPressed] = useState(false);

  // กัน authenticateAsync() ถูกเรียกซ้อนกัน (auto-trigger กับกดปุ่มเอง หรือ
  // effect/-timer ยิงซ้ำจาก re-render) — iOS Face ID ถ้าเรียกซ้อนกัน prompt
  // แรกจะค้างไม่ resolve เพราะถูกแทนที่ด้วย session ใหม่ ทำให้ onUnlock ไม่ทำงาน
  const biometricInFlightRef = useRef(false);
  // unlock ต้องเกิดครั้งเดียวต่อรอบ lock แม้ Face ID สำเร็จช้ากว่า PIN/SSO ที่ผู้ใช้เลือกไปแล้ว
  const unlockedRef = useRef(false);
  // ผู้ใช้กด "ยกเลิก" จาก dialog สแกนไม่ผ่านแล้ว — ห้าม auto-trigger ซ้ำเองอีก
  // จนกว่าจะกดปุ่ม Face ID เองหรือ lock รอบใหม่ (เปิดแอปใหม่/ล็อกใหม่)
  const autoCancelledRef = useRef(false);
  // userId ของบัญชีที่ล็อกอยู่ปัจจุบัน — resolve ครั้งเดียวตอน lock แต่ละรอบ แล้ว
  // ใช้ตลอด lifecycle ของรอบนั้น PIN/biometric ทั้งหมดต้อง scope ด้วยตัวนี้เสมอ
  const userIdRef = useRef(null);
  // เก็บ setTimeout id ของ auto-trigger biometric ไว้ยกเลิกได้ — LockOverlay
  // ไม่ unmount จริงตอน locked เปลี่ยนเป็น false (แค่ return null จาก render)
  // ทำให้ timer ที่ตั้งไว้ตอน locked=true ยังทำงานต่อได้แม้ผู้ใช้จะออกจากหน้า
  // PIN ไปแล้ว (เช่นกด "SSO แทน" ก่อนครบ 1200ms) — ต้อง clear ทุกครั้งที่ออก
  const autoTriggerTimerRef = useRef(null);
  // locked ล่าสุดแบบ synchronous — ให้ tryBiometric เช็คได้ทันทีก่อนเรียก
  // authenticate จริง กันกรณี timer หลุดรอดผ่าน cleanup มาได้จากเหตุผลอื่น
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    // ยกเลิก timer ของรอบก่อนหน้าเสมอเมื่อ locked เปลี่ยน (ทั้งตอนเข้าและออก
    // จากรอบ lock) — กัน timer เก่าที่ยังไม่ทันทำงานหลุดรอดมาเรียก biometric
    // หลังผู้ใช้ออกจากหน้า PIN ไปแล้ว (เช่นกด "SSO แทน" ก่อนครบ 1200ms)
    if (autoTriggerTimerRef.current) {
      clearTimeout(autoTriggerTimerRef.current);
      autoTriggerTimerRef.current = null;
    }

    if (!locked) return;
    setValue("");
    setError(null);
    unlockedRef.current = false;
    autoCancelledRef.current = false;

    (async () => {
      const userId = await getCurrentUserId();
      userIdRef.current = userId;

      if (!userId) {
        // ไม่มี userId แปลว่า resolve บัญชีปัจจุบันไม่ได้ (ผิดปกติ) — ต้องไม่
        // ถือว่ามี PIN/biometric ให้ใช้ fallback ไป SSO อย่างปลอดภัยแทนที่จะ
        // ค้างหน้า PIN ที่ verify กับใครไม่ได้เลย
        if (__DEV__) console.error("[LockOverlay] missing current userId — falling back to Login");
        resetToLogin();
        onUnlock();
        return;
      }

      const [enabled, support] = await Promise.all([isBiometricEnabled(userId), checkSupport()]);
      const available = enabled && support.supported;
      setBiometricAvailable(available);
      setBiometricIcon(getBiometricPresentation(support).icon);
      setCheckingBiometric(false);

      if (available) {
        // ดีเลย์ยาวพอให้ iOS app window/scene activate เต็มที่ก่อนเรียก Face ID —
        // ถ้าเรียกเร็วเกินไปหลัง cold start (โดยเฉพาะตอนที่ overlay นี้ขึ้นทันที
        // ตั้งแต่ ready=true ครั้งแรก) iOS อาจคืน system_cancel/app_cancel มาเงียบๆ
        // ซึ่งโค้ดตีความเป็น cancel ธรรมดาแล้ว silent return ไม่มีอะไรเกิดขึ้นให้เห็น
        autoTriggerTimerRef.current = setTimeout(() => {
          autoTriggerTimerRef.current = null;
          tryBiometric({ auto: true });
        }, 1200);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  if (!locked) return null;

  // จุดเดียวสำหรับ "unlock สำเร็จ" ไม่ว่าจะมาจาก Face ID อัตโนมัติ, กดปุ่ม
  // Biometric เอง, หรือ PIN ถูกต้อง — กันการ unlock ซ้ำ/หลังจากออกจากหน้านี้ไปแล้ว
  const completeUnlock = async () => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    await resetPinAttempts();

    // ถ้า route ปัจจุบันยังเป็น Login (cold start — RootStack เริ่มที่ Login เสมอ
    // ไม่รู้เรื่อง token/session เลย, overlay แค่บัง Login ไว้) ต้อง reset ไป
    // MainTabs เอง ไม่งั้นพอ overlay หาย (setLocked(false)) จะเห็น Login ที่ค้าง
    // mount อยู่ข้างใต้แทน ทั้งที่ session/token ยัง valid และเพิ่งปลดล็อกสำเร็จ
    // — แต่ถ้าแอปถูกล็อกตอนผู้ใช้อยู่หน้าอื่นอยู่แล้ว (เช่น background/foreground
    // ระหว่างใช้งาน MainTabs) ไม่ต้องแตะ navigation เลย ให้กลับไปหน้าเดิมตามปกติ
    if (navigationRef.isReady() && navigationRef.getCurrentRoute?.()?.name === "Login") {
      navigationRef.reset({ index: 0, routes: [{ name: "MainTabs" }] });
    }

    onUnlock();
  };

  // cancel (ผู้ใช้เอง/ระบบ) ต่างจาก "สแกนไม่ผ่านจริง" — cancel ไม่ต้องขึ้น dialog
  // ให้เลือกใหม่ ไม่ถือเป็นความล้มเหลวที่ต้องแจ้งเตือน แค่กลับไปหน้า PIN เงียบๆ
  const isCancelError = (errorCode) =>
    errorCode === "user_cancel" || errorCode === "system_cancel" || errorCode === "app_cancel";

  const tryBiometric = async ({ auto = false } = {}) => {
    if (biometricInFlightRef.current || unlockedRef.current) return;
    if (auto && autoCancelledRef.current) return;
    // เช็คซ้ำว่ายัง locked จริงก่อนเรียก authenticate — กัน auto-trigger timer
    // ที่ตั้งไว้ตอน lock รอบก่อนหลุดรอดผ่าน clearTimeout มาทำงานหลังผู้ใช้ออก
    // จากหน้า PIN ไปแล้ว (เช่นกด "SSO แทน" หรือ PIN ถูกต้องไปก่อนครบดีเลย์)
    if (auto && !lockedRef.current) return;
    biometricInFlightRef.current = true;
    try {
      const result = await authenticateLocally(t("security.pinEnterPrompt"));
      if (result.success) {
        await completeUnlock();
        return;
      }
      if (isCancelError(result.error)) return;

      // สแกนไม่ผ่านจริง (เช่นหน้าไม่ตรง, timeout, lockout) — ให้เลือกสแกนอีกครั้ง
      // หรือยกเลิกไปหน้า PIN กด "สแกนอีกครั้ง" แล้วเรียกซ้ำเป็นแบบกดเอง (auto: false)
      // เพื่อไม่ให้ autoCancelledRef ไปบล็อกการลองซ้ำที่ผู้ใช้ขอเอง
      Alert.alert(
        t("security.biometricFailedTitle"),
        t("security.biometricFailedMsg"),
        [
          {
            text: t("security.cancel"),
            style: "cancel",
            onPress: () => {
              if (auto) autoCancelledRef.current = true;
            },
          },
          { text: t("security.scanAgain"), onPress: () => tryBiometric({ auto: false }) },
        ],
      );
    } finally {
      biometricInFlightRef.current = false;
    }
  };

  const goToLoginKeepingPin = async () => {
    await clearSessionOnly();
    resetToLogin();
    onUnlock();
  };

  const handleDigit = async (digit) => {
    if (value.length >= PIN_LENGTH) return;
    const next = value + digit;
    setError(null);
    setValue(next);

    if (next.length !== PIN_LENGTH) return;

    const ok = await verifyPin(userIdRef.current, next);
    if (ok) {
      await completeUnlock();
      return;
    }

    const { remaining, locked: shouldWipe } = await recordFailedPinAttempt();
    setValue("");

    if (shouldWipe) {
      await wipeForPinFailure(userIdRef.current);
      Alert.alert(t("security.pinLockedTitle"), t("security.pinLockedMsg"), [
        {
          text: t("security.close"),
          onPress: () => {
            resetToLogin();
            onUnlock();
          },
        },
      ]);
      return;
    }

    setError(t("security.pinAttemptsRemaining", { count: remaining }));
  };

  const handleDelete = () => {
    setError(null);
    setValue((prev) => prev.slice(0, -1));
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#eaf5ef",
        zIndex: 999,
        elevation: 999,
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#eaf5ef" />

      <View
        style={{ flex: 1, alignItems: "center", paddingHorizontal: 24, paddingTop: top }}
      >
        {checkingBiometric ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <View style={{ flex: 1 }} />

            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text, marginBottom: 28 }}>
              {t("security.pinEnterPrompt")}
            </Text>

            <PinKeypad
              value={value}
              onDigit={handleDigit}
              onDelete={handleDelete}
              error={!!error}
              maxLength={PIN_LENGTH}
              onBiometric={biometricAvailable ? () => tryBiometric({ auto: false }) : undefined}
              biometricIcon={biometricIcon}
              scale={1.15}
              belowDots={
                !!error && (
                  <Text className="text-[14px] font-semibold text-[#dc2626] text-center">
                    {error}
                  </Text>
                )
              }
            />

            <TouchableOpacity
              onPress={goToLoginKeepingPin}
              onPressIn={() => setSsoButtonPressed(true)}
              onPressOut={() => setSsoButtonPressed(false)}
              activeOpacity={0.85}
              style={{
                marginTop: 32,
                width: "80%",
                height: 54,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: colors.primary,
                backgroundColor: ssoButtonPressed ? "#d5ecdf" : colors.primaryMuted,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
              }}
            >
              <Ionicons name="school-outline" size={19} color={colors.primaryDark} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.primaryDark }}>
                {t("security.useSsoInstead")}
              </Text>
            </TouchableOpacity>

            <View style={{ flex: 1.4 }} />
          </>
        )}
      </View>
    </View>
  );
}
