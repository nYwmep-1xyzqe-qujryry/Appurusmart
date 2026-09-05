import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Image,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  Keyboard,
  Modal,
} from "react-native";
import { WebView } from "react-native-webview";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { onLoginSuccess } from "../services/notificationService";
import { API_BASE_URL, STORAGE_KEYS } from "../config";
import { saveAuthSession } from "../services/authStorage";
import { checkSupport, getBiometricPresentation, isBiometricEnabled, hasBiometricToken, saveBiometricToken, setBiometricEnabled, clearBiometricToken } from "../services/biometricService";
import { isPinSet } from "../services/pinService";
import { resolveUserId, setCurrentUserId } from "../services/userSecurityKeys";
import { ensureExpertProfile } from "../services/infoApi";

const API_URL = API_BASE_URL;
const SSO_BASE_URL =
  API_URL?.replace(/\/api\/?$/, "") || "https://urusmart.uru.ac.th";
const SSO_REDIRECT_URL = `${SSO_BASE_URL}/auth/redirect`;

// ถ้าเพิ่ม URL scheme ใน app.json ในอนาคต ต้อง validate origin ก่อนรับ token
const getSsoAccessTokenFromRoute = (route) =>
  route?.params?.access_token ??
  route?.params?.accessToken ??
  route?.params?.ssoToken ??
  route?.params?.passportToken ??
  "";

const parseSsoMessage = (message) => {
  try {
    const payload = JSON.parse(message);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
};

const parseUrl = (url = "") => {
  try {
    return new URL(String(url));
  } catch {
    return null;
  }
};

const getSsoBackendHost = () =>
  parseUrl(SSO_BASE_URL)?.hostname ?? "urusmart.uru.ac.th";

const isUniversityHost = (hostname = "") =>
  hostname === "uru.ac.th" || hostname.endsWith(".uru.ac.th");

const TRUSTED_EXTERNAL_SSO_HOSTS = [
  "login.live.com",
  "login.microsoftonline.com",
  "login.microsoft.com",
  "account.live.com",
  "outlook.live.com",
  "office.com",
  "microsoft.com",
  "microsoftonline.com",
  "msauth.net",
  "windows.net",
];

const isTrustedExternalSsoHost = (hostname = "") =>
  TRUSTED_EXTERNAL_SSO_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );

const sanitizeSsoUrlForLog = (url = "") => {
  const parsed = parseUrl(url);
  if (!parsed) return String(url || "");

  ["token", "access_token", "ssoToken", "passportToken", "code", "state"].forEach(
    (key) => {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "[hidden]");
      }
    },
  );
  return parsed.toString();
};

const debugSso = (label, url) => {
  if (__DEV__) console.log(`[SSO] ${label}:`, sanitizeSsoUrlForLog(url));
};

const isTrustedSsoNavigationUrl = (url = "") => {
  const value = String(url);
  if (!value || value === "about:blank") return true;

  const parsed = parseUrl(value);
  if (!parsed) return false;
  if (!["http:", "https:"].includes(parsed.protocol)) return false;

  return (
    parsed.hostname === getSsoBackendHost() ||
    isUniversityHost(parsed.hostname) ||
    isTrustedExternalSsoHost(parsed.hostname)
  );
};

const isTrustedSsoMessageUrl = (url = "") => {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  return parsed.hostname === getSsoBackendHost();
};

const isSsoCallbackUrl = (url = "") =>
  String(url).includes("/auth/callback") ||
  String(url).includes("token=") ||
  String(url).includes("access_token=");

const extractTokenFromUrl = (url = "") => {
  try {
    const parsed = new URL(String(url));
    return (
      parsed.searchParams.get("token") ||
      parsed.searchParams.get("access_token") ||
      parsed.searchParams.get("ssoToken") ||
      parsed.searchParams.get("passportToken") ||
      null
    );
  } catch {
    return null;
  }
};

const HIDE_SSO_CALLBACK_SCRIPT = `
  (function () {
    if (
      window.location.href.indexOf('/auth/callback') !== -1 ||
      window.location.href.indexOf('token=') !== -1 ||
      window.location.href.indexOf('access_token=') !== -1
    ) {
      document.documentElement.style.opacity = '0';
      if (document.body) document.body.style.opacity = '0';
    }
  })();
  true;
`;

const SSO_CAPTURE_SCRIPT = `
  (function () {
    function sendPayload(value) {
      if (!value || !window.ReactNativeWebView) return;
      window.ReactNativeWebView.postMessage(
        typeof value === 'string' ? value : JSON.stringify(value)
      );
    }

    var href = String(window.location.href || '');
    var isCallback =
      href.indexOf('/auth/callback') !== -1 ||
      href.indexOf('token=') !== -1 ||
      href.indexOf('access_token=') !== -1;

    try {
      var params = new URLSearchParams(window.location.search || '');
      var token =
        params.get('token') ||
        params.get('access_token') ||
        params.get('ssoToken') ||
        params.get('passportToken');
      if (token) {
        sendPayload({ token: token });
        return true;
      }
    } catch (error) {}

    try {
      var raw = (document.body && document.body.innerText || '').trim();
      if (raw && raw.charAt(0) === '{' && raw.indexOf('"token"') !== -1) {
        if (!isCallback) {
          document.documentElement.style.opacity = '0';
          if (document.body) document.body.style.opacity = '0';
        }
        sendPayload(raw);
      }
    } catch (error) {}

    return true;
  })();
  true;
`;

const Login = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const PT = top + 16;
  const PB = Platform.OS === "ios" ? 48 : 32;
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoPageLoading, setSsoPageLoading] = useState(false);
  const [hideSsoContent, setHideSsoContent] = useState(false);
  const [showSsoWebView, setShowSsoWebView] = useState(false);
  const scrollRef = useRef(null);
  const ssoWebViewRef = useRef(null);
  const ssoTimeoutRef = useRef(null);
  const ssoHandledRef = useRef(false);
  const ssoCurrentUrlRef = useRef(SSO_REDIRECT_URL);
  const ssoAccessToken = getSsoAccessTokenFromRoute(route);

  // ── Entrance animations ──
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const textY = useSharedValue(30);
  const textOpacity = useSharedValue(0);
  const cardY = useSharedValue(50);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    logoScale.value = withSpring(1, { damping: 12, stiffness: 120 });
    logoOpacity.value = withTiming(1, { duration: 400 });
    textY.value = withDelay(250, withSpring(0, { damping: 14 }));
    textOpacity.value = withDelay(250, withTiming(1, { duration: 400 }));
    cardY.value = withDelay(
      400,
      withSpring(0, { damping: 16, stiffness: 100 }),
    );
    cardOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
  }, []);

  useEffect(
    () => () => {
      if (ssoTimeoutRef.current) clearTimeout(ssoTimeoutRef.current);
    },
    [],
  );

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));
  const textStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: textY.value }],
    opacity: textOpacity.value,
  }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardY.value }],
    opacity: cardOpacity.value,
  }));
  const getBiometricLabel = (support) => {
    const { kind } = getBiometricPresentation(support);
    if (kind === "face") return Platform.OS === "ios" ? t("login.faceId") : t("login.faceUnlock");
    if (kind === "both") return t("login.biometric");
    return t("login.fingerprint");
  };

  const navigateToMain = () => {
    navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
  };

  const runPostLoginNotifications = () => {
    onLoginSuccess().catch((error) => {
      console.error("POST-LOGIN NOTIFICATION ERROR:", error);
    });
  };

  const promptEnableBiometric = (userId, token) =>
    new Promise((resolve) => {
      Promise.all([checkSupport(), isBiometricEnabled(userId), hasBiometricToken(userId)]).then(
        ([support, alreadyEnabled, tokenExists]) => {
        if (!support.supported) {
          resolve();
          return;
        }

        // เคยเปิด biometric ไว้แล้วสำหรับบัญชีนี้ (logout ไม่ได้ลบ flag/token นี้)
        // — token เดิมยังใช้ปลดล็อกได้ปกติ ไม่ต้องเขียนทับใหม่ทุกครั้งที่ login
        // เพราะ SecureStore เขียนด้วย requireAuthentication:true เสมอ ทำให้ Face ID
        // เด้งขึ้นมาเองโดยผู้ใช้ไม่ได้ขอ — ถือว่า alreadyEnabled=true หมายถึงมี
        // token อยู่แล้วเสมอ (setBiometricEnabled(true) ถูกเรียกหลัง
        // saveBiometricToken() สำเร็จเท่านั้น) แม้ tokenExists (flag ใหม่ที่เพิ่ง
        // เพิ่ม) จะเป็น false ก็ตาม — เพราะบัญชีที่เปิด biometric ไว้ตั้งแต่ก่อน
        // เพิ่ม flag นี้จะยังไม่มี flag ใหม่นี้เลย (migration gap) แต่ token จริง
        // ใน SecureStore มีอยู่แล้ว เขียนทับใหม่เฉพาะกรณี alreadyEnabled=false จริงๆ
        if (alreadyEnabled || tokenExists) {
          resolve();
          return;
        }

        const biometricLabelText = getBiometricLabel(support);

        Alert.alert(
          t("login.enableBiometricTitle", { label: biometricLabelText }),
          t("login.enableBiometricMsg", { label: biometricLabelText }),
          [
            {
              text: t("login.notNow"),
              style: "cancel",
              onPress: async () => {
                await setBiometricEnabled(userId, false);
                await clearBiometricToken(userId);
                resolve();
              },
            },
            {
              text: t("login.enable"),
              onPress: async () => {
                try {
                  await saveBiometricToken(
                    userId,
                    String(token),
                    t("login.enableBiometricPrompt", {
                      label: biometricLabelText,
                    }),
                  );
                  await setBiometricEnabled(userId, true);
                } catch (_) {
                  Alert.alert(
                    t("login.enableFailedTitle"),
                    t("login.enableFailedMsg"),
                  );
                } finally {
                  resolve();
                }
              },
            },
          ],
          { cancelable: false },
        );
      });
    });

  const promptEnableBiometricAfterNavigation = (userId, token) =>
    new Promise((resolve) => {
      setTimeout(() => {
        promptEnableBiometric(userId, token)
          .catch((error) => {
            console.error("BIOMETRIC PROMPT ERROR:", error);
          })
          .finally(resolve);
      }, 600);
    });

  const completeBackendLogin = async (data) => {
    if (!data?.token) {
      Alert.alert(t("login.signInFailedTitle"), t("login.missingToken"));
      return;
    }

    // resolve ตัวตนบัญชีจาก backend ก่อนเสมอ — PIN/biometric ทั้งหมดต้องผูกกับ
    // userId นี้ (per-account) ไม่ใช่ device-level เพื่อไม่ให้ User B ที่ login
    // ต่อจาก User A บนเครื่องเดียวกัน เห็น/ใช้ PIN ของ User A ได้
    const userId = resolveUserId(data.user);
    if (!userId) {
      if (__DEV__) console.error("[Login] resolveUserId failed — no id/email in data.user");
      Alert.alert(t("login.signInFailedTitle"), t("login.missingToken"));
      return;
    }

    await saveAuthSession(data.token);
    await setCurrentUserId(userId);
    await AsyncStorage.setItem(
      STORAGE_KEYS.USER,
      JSON.stringify(data.user || {}),
    );

    // สร้าง/ตรวจ Expert profile ก่อนเปิด session หลัก เพื่อให้หน้า Expert
    // และ profile-search มองเห็นผู้ใช้ได้ตั้งแต่ยังไม่เคยบันทึกผลงาน
    // หาก Info ชั่วคราวติดต่อไม่ได้ ให้ login ต่อได้ (POST Expert มี fallback)
    try {
      await ensureExpertProfile();
    } catch (error) {
      // 401 ถูกจัดการโดย Info API interceptor และต้องหยุด flow นี้ไว้ก่อน
      // เพื่อไม่ให้ navigation กลับเข้า MainTabs แข่งกับการพาไปหน้า Login
      if (error?.response?.status === 401) return;
      if (__DEV__) {
        console.warn(
          "[Login] ensure Expert profile failed:",
          error?.response?.status ?? error?.message,
        );
      }
    }
    runPostLoginNotifications();

    if (await isPinSet(userId)) {
      // บัญชีนี้เคยตั้ง PIN แล้ว (เช่นมาจาก "Sign in with SSO instead" ที่ล้างแค่
      // session ไม่ล้าง PIN, หรือ logout แล้ว login ด้วยบัญชีเดิม) — เข้าแอปทันที
      // ไม่ต้องรอ popup ถาม biometric ก่อน เพราะ Alert.alert เป็น native UI ที่
      // ทำให้ AppState เข้า inactive ชั่วคราวเหมือน Face ID prompt — ถ้ายังอยู่
      // หน้า Login ตอนนั้น (locked=false, PIN ตั้งไว้แล้ว) AppState listener ใน
      // App.js อาจตีความผิดว่าเป็นการสลับแอปแล้วเรียก LockOverlay ขึ้นมาทับซ้ำ
      // หลัง SSO success ทั้งที่เพิ่งยืนยันตัวตนสำเร็จไปหมาดๆ — navigate ก่อนเสมอ
      // แล้วค่อยถาม popup ทีหลัง (เป็นแค่การตั้งค่าสำหรับปลดล็อกครั้งถัดไป)
      navigateToMain();
      promptEnableBiometricAfterNavigation(userId, data.token).catch((error) => {
        console.error("BIOMETRIC PROMPT ERROR:", error);
      });
    } else {
      // บัญชีนี้ยังไม่เคยตั้ง PIN — ยังไม่มี LockOverlay เกี่ยวข้องเลย (locked
      // เป็น false เสมอตราบใดที่บัญชีนี้ยังไม่มี PIN) จึงไม่มีความเสี่ยง AppState
      // race แบบเคสข้างบน ถาม popup biometric ก่อนได้ตามลำดับเดิม แล้วค่อยไป
      // บังคับตั้ง PIN ของบัญชีนี้ต่อ
      await promptEnableBiometricAfterNavigation(userId, data.token);
      navigation.reset({ index: 0, routes: [{ name: "SetPin" }] });
    }
  };

  const loginWithSsoToken = async (accessToken) => {
    const token = String(accessToken || "").trim();
    if (!token || loading) return;

    Keyboard.dismiss();
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/sso-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ access_token: token }),
      });
      const data = await response.json();
      if (response.ok) {
        await completeBackendLogin(data);
      } else {
        Alert.alert(t("login.signInFailedTitle"), t("login.ssoFailed"));
      }
    } catch (_) {
      Alert.alert(t("login.errorTitle"), t("login.ssoNetworkError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ssoAccessToken) loginWithSsoToken(ssoAccessToken);
  }, [ssoAccessToken]);

  const openSsoLogin = () => {
    Keyboard.dismiss();
    ssoHandledRef.current = false;
    ssoCurrentUrlRef.current = SSO_REDIRECT_URL;
    setHideSsoContent(false);
    setSsoPageLoading(true);
    setShowSsoWebView(true);
  };

  const startSsoCallbackTimeout = () => {
    if (ssoHandledRef.current || ssoTimeoutRef.current) return;
    ssoTimeoutRef.current = setTimeout(() => {
      if (ssoHandledRef.current) return;
      setSsoPageLoading(false);
      setHideSsoContent(false);
      Alert.alert(
        "เข้าสู่ระบบใช้เวลานาน",
        "ยังไม่ได้รับข้อมูลยืนยันตัวตนจาก SSO กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง",
      );
    }, 45000);
  };

  const closeSsoLogin = () => {
    if (ssoTimeoutRef.current) {
      clearTimeout(ssoTimeoutRef.current);
      ssoTimeoutRef.current = null;
    }
    setShowSsoWebView(false);
    setHideSsoContent(false);
    setSsoPageLoading(false);
  };

  const handleSsoMessage = async (event) => {
    if (ssoHandledRef.current) return;

    const sourceUrl = event.nativeEvent?.url || ssoCurrentUrlRef.current || "";
    if (!isTrustedSsoMessageUrl(sourceUrl)) {
      if (__DEV__) {
        console.warn(
          "[SSO] rejected WebView message from:",
          sanitizeSsoUrlForLog(sourceUrl),
        );
      }
      return;
    }

    const payload = parseSsoMessage(event.nativeEvent?.data);
    if (__DEV__) {
      console.log("[SSO] message payload keys:", Object.keys(payload || {}));
    }
    if (!payload?.token) return;

    ssoHandledRef.current = true;
    if (ssoTimeoutRef.current) {
      clearTimeout(ssoTimeoutRef.current);
      ssoTimeoutRef.current = null;
    }
    setSsoLoading(true);
    setHideSsoContent(true);
    try {
      closeSsoLogin();
      await completeBackendLogin(payload);
    } catch (error) {
      Alert.alert(t("login.signInFailedTitle"), t("login.ssoFailed"));
    } finally {
      setSsoLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={
        Platform.OS === "ios" ? 0 : (StatusBar.currentHeight ?? 0)
      }
    >
      <StatusBar barStyle="dark-content" backgroundColor="#eaf5ef" />

      {/* Background */}
      <LinearGradient
        colors={["#eaf5ef", "#d6eee3", "#eaf5ef"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View
        className="absolute w-[300px] h-[300px] rounded-full"
        style={{
          top: -130,
          right: -90,
          backgroundColor: "rgba(191,227,208,0.6)",
        }}
      />
      <View
        className="absolute w-[260px] h-[260px] rounded-full"
        style={{
          bottom: -100,
          left: -80,
          backgroundColor: "rgba(15,122,85,0.08)",
        }}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingTop: PT,
          paddingBottom: PB,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bounces={false}
      >
        {/* Logo */}
        <Animated.View className="items-center mb-5" style={logoStyle}>
          <View
            className="w-[148px] h-[148px] rounded-full items-center justify-center"
            style={{
              backgroundColor: "rgba(255,255,255,0.7)",
              elevation: 8,
              shadowColor: "#0f7a55",
              shadowOpacity: 0.15,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <LinearGradient
              colors={["#ffffff", "#f0faf5"]}
              style={{
                width: 128,
                height: 128,
                borderRadius: 64,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Image
                source={require("../assets/urusmartlogo.png")}
                style={{ width: 104, height: 104 }}
                resizeMode="contain"
              />
            </LinearGradient>
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View className="items-center mb-7" style={textStyle}>
          <Text className="text-[24px] font-black text-[#064e35] text-center tracking-[-0.3px]">
            {t("login.title")}
          </Text>
          <Text className="text-[13px] text-[#56706a] text-center font-medium mt-[6px]">
            {t("login.subtitle")}
          </Text>
        </Animated.View>

        {/* Card */}
        <Animated.View className="w-full" style={cardStyle}>
          <View
            className="bg-white rounded-[26px] p-6 border border-[rgba(15,122,85,0.08)]"
            style={{
              elevation: 10,
              shadowColor: "#0f7a55",
              shadowOpacity: 0.12,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 10 },
            }}
          >
            <TouchableOpacity
              onPress={openSsoLogin}
              disabled={loading || ssoLoading}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={
                  ssoLoading
                    ? ["#7bb8a4", "#7bb8a4"]
                    : ["#0a6644", "#0f7a55", "#1a9068"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  height: 58,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  elevation: 4,
                }}
              >
                {ssoLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="school-outline" size={21} color="#fff" />
                    <Text className="text-white text-[16px] font-extrabold">
                      {t("login.ssoSignIn")}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>

      <Modal
        visible={showSsoWebView}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSsoLogin}
      >
        <View className="flex-1 bg-primary">
          <View
            className="flex-row items-center bg-primary px-3 pb-3"
            style={{ paddingTop: PT }}
          >
            <TouchableOpacity
              className="w-10 h-10 items-center justify-center"
              onPress={closeSsoLogin}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text
              className="flex-1 text-white text-[16px] font-bold text-center"
              numberOfLines={1}
            >
              {t("login.ssoTitle")}
            </Text>
            <View className="w-10 h-10" />
          </View>

          <WebView
            ref={ssoWebViewRef}
            source={{ uri: SSO_REDIRECT_URL }}
            className="flex-1 bg-white"
            style={{ opacity: hideSsoContent ? 0 : 1 }}
            onMessage={handleSsoMessage}
            injectedJavaScriptBeforeContentLoaded={HIDE_SSO_CALLBACK_SCRIPT}
            injectedJavaScript={SSO_CAPTURE_SCRIPT}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            originWhitelist={["*"]}
            mixedContentMode="always"
            cacheEnabled={false}
            startInLoadingState
            onShouldStartLoadWithRequest={(request) => {
              debugSso("request", request.url);
              if (!isTrustedSsoNavigationUrl(request.url)) {
                if (__DEV__) {
                  console.warn(
                    "[SSO] blocked untrusted navigation:",
                    sanitizeSsoUrlForLog(request.url),
                  );
                }
                return false;
              }
              ssoCurrentUrlRef.current = request.url;
              // ดัก token จาก URL ตรงๆ (Android มักไม่ fire onMessage)
              const urlToken = extractTokenFromUrl(request.url);
              if (urlToken && !ssoHandledRef.current) {
                ssoHandledRef.current = true;
                if (ssoTimeoutRef.current) {
                  clearTimeout(ssoTimeoutRef.current);
                  ssoTimeoutRef.current = null;
                }
                setHideSsoContent(true);
                setSsoLoading(true);
                closeSsoLogin();
                loginWithSsoToken(urlToken).finally(() => setSsoLoading(false));
                return false;
              }
              if (isSsoCallbackUrl(request.url)) {
                setHideSsoContent(true);
                setSsoPageLoading(true);
                startSsoCallbackTimeout();
              }
              return true;
            }}
            onLoadStart={(event) => {
              const url = event.nativeEvent?.url;
              debugSso("load start", url);
              ssoCurrentUrlRef.current = url || ssoCurrentUrlRef.current;
              setSsoPageLoading(true);
              const urlToken = extractTokenFromUrl(url);
              if (urlToken && !ssoHandledRef.current) {
                ssoHandledRef.current = true;
                if (ssoTimeoutRef.current) { clearTimeout(ssoTimeoutRef.current); ssoTimeoutRef.current = null; }
                setHideSsoContent(true);
                setSsoLoading(true);
                closeSsoLogin();
                loginWithSsoToken(urlToken).finally(() => setSsoLoading(false));
                return;
              }
              setHideSsoContent(isSsoCallbackUrl(url));
              if (isSsoCallbackUrl(url)) startSsoCallbackTimeout();
            }}
            onLoadEnd={(event) => {
              const url = event.nativeEvent?.url;
              debugSso("load end", url);
              ssoCurrentUrlRef.current = url || ssoCurrentUrlRef.current;
              setSsoPageLoading(false);
              const urlToken = extractTokenFromUrl(url);
              if (urlToken && !ssoHandledRef.current) {
                ssoHandledRef.current = true;
                if (ssoTimeoutRef.current) { clearTimeout(ssoTimeoutRef.current); ssoTimeoutRef.current = null; }
                setHideSsoContent(true);
                setSsoLoading(true);
                closeSsoLogin();
                loginWithSsoToken(urlToken).finally(() => setSsoLoading(false));
                return;
              }
              setHideSsoContent(isSsoCallbackUrl(url));
              if (isSsoCallbackUrl(url)) {
                startSsoCallbackTimeout();
                ssoWebViewRef.current?.injectJavaScript(SSO_CAPTURE_SCRIPT);
              }
            }}
            renderLoading={() => (
              <View className="absolute inset-0 items-center justify-center bg-white">
                <ActivityIndicator size="large" color="#0f7a55" />
              </View>
            )}
            onHttpError={(event) => {
              if (__DEV__) {
                console.warn(
                  "[SSO] http error:",
                  event.nativeEvent?.statusCode,
                  sanitizeSsoUrlForLog(event.nativeEvent?.url),
                );
              }
            }}
            onError={(event) => {
              if (__DEV__) {
                console.warn(
                  "[SSO] webview error:",
                  event.nativeEvent?.description,
                  sanitizeSsoUrlForLog(event.nativeEvent?.url),
                );
              }
              setSsoPageLoading(false);
              Alert.alert(t("login.errorTitle"), t("login.ssoNetworkError"));
            }}
          />
          {(ssoPageLoading || hideSsoContent || ssoLoading) && (
            <View
              className="absolute left-0 right-0 bottom-0 items-center justify-center bg-white"
              style={{ top: PT + 52 }}
            >
              <ActivityIndicator size="large" color="#0f7a55" />
            </View>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

export default Login;
