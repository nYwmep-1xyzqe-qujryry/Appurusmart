// app.json แปลงเป็น dynamic config เพราะ googleServicesFile ต้องอ่านจาก
// process.env.GOOGLE_SERVICES_JSON (EAS materializes the sensitive env var
// to a real file path on the builder) — static app.json ทำแบบนี้ไม่ได้
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
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#F0F6EF",
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
            usesCleartextTraffic: true,
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
