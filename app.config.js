// app.json แปลงเป็น dynamic config เพราะ googleServicesFile ต้องอ่านจาก
// process.env.GOOGLE_SERVICES_JSON (EAS materializes the sensitive env var
// to a real file path on the builder) — static app.json ทำแบบนี้ไม่ได้
const configuredApiUrls = [
  process.env.EXPO_PUBLIC_API_URL,
  process.env.EXPO_PUBLIC_INFO_API_URL,
  process.env.EXPO_PUBLIC_LRD_API_URL,
].filter(Boolean);
const isPrivateDevelopmentHost = (value) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || /^10\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  } catch (_) {
    return false;
  }
};
const isDevelopmentBuild = process.env.NODE_ENV !== "production"
  && process.env.EAS_BUILD_PROFILE !== "production";
const allowCleartextTraffic = isDevelopmentBuild
  && configuredApiUrls.some((value) => /^http:\/\//i.test(value) && isPrivateDevelopmentHost(value));

module.exports = {
  expo: {
    name: "URU Smart",
    slug: "uru-smart",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      bundleIdentifier: "com.focusvc.urusmart",
      buildNumber: "1",
      supportsTablet: true,
      infoPlist: {
        NSUserNotificationsUsageDescription:
          "URU Smart ต้องการส่งการแจ้งเตือนข่าวสารและประกาศจากมหาวิทยาลัย",
        NSFaceIDUsageDescription:
          "ใช้ Face ID เพื่อปลดล็อก URU Smart อย่างรวดเร็วและปลอดภัย",
        NSLocalNetworkUsageDescription:
          "URU Smart ต้องการเชื่อมต่อกับเซิร์ฟเวอร์สำหรับพัฒนาในเครือข่ายภายใน",
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.focusvc.urusmart",
      versionCode: 1,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      adaptiveIcon: {
        // Android shows only the middle 66.7% of the foreground and reserves
        // the rest so each launcher can mask its own shape. assets/icon.png is
        // drawn edge to edge for iOS — its wordmark spans 79% of the canvas —
        // so Android cropped the sides off and the icon looked zoomed in. This
        // foreground is the logo alone on transparency, sized to sit inside
        // that safe area.
        foregroundImage: "./assets/adaptive-icon.png",
        // The background assets/icon.png bakes in, so the launcher icon reads
        // the same colour as the iOS one.
        backgroundColor: "#EBFAF1",
      },
      edgeToEdgeEnabled: true,
      softwareKeyboardLayoutMode: "pan",
      permissions: [
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT",
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-notifications",
        {
          // Android renders the URU mark as the notification small icon.
          // The launcher artwork remains the full-color URU SMART icon.
          icon: "./assets/notification-icon.png",
          color: "#07865F",
          defaultChannel: "default",
        },
      ],
      "./plugins/withNotificationLargeIcon",
      "expo-local-authentication",
      "expo-secure-store",
      "expo-font",
      [
        "expo-image-picker",
        {
          photosPermission:
            "URU Smart ต้องการเข้าถึงรูปภาพเพื่อเปลี่ยนรูปโปรไฟล์",
          cameraPermission:
            "URU Smart ต้องการเข้าถึงกล้องเพื่อถ่ายรูปโปรไฟล์",
          microphonePermission: false,
        },
      ],
      "@react-native-community/datetimepicker",
      [
        "expo-build-properties",
        {
          android: {
            // Local HTTP is permitted only when a configured development API
            // explicitly uses it. Production HTTPS builds keep cleartext off.
            usesCleartextTraffic: allowCleartextTraffic,
          },
        },
      ],
      "expo-asset",
    ],
    extra: {
      eas: {
        projectId: "84e1dc73-478a-47cd-ab3f-036c77153426",
      },
    },
    owner: "tharanon",
  },
};
