// URL ของ API — แก้ที่ .env เท่านั้น (EXPO_PUBLIC_API_URL)
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const rawInfoApiBaseUrl =
  process.env.EXPO_PUBLIC_INFO_API_URL ||
  process.env.EXPO_PUBLIC_LRD_API_URL ||
  "https://info.uru.ac.th/server/api";
const normalizedInfoApiBaseUrl = rawInfoApiBaseUrl.replace(/\/$/, "");
export const INFO_API_BASE_URL = normalizedInfoApiBaseUrl.endsWith("/api")
  ? normalizedInfoApiBaseUrl
  : `${normalizedInfoApiBaseUrl}/api`;
// Base host kept for LRD document/file URLs (which may already include their own path).
export const LRD_API_BASE_URL = normalizedInfoApiBaseUrl.replace(/\/api\/?$/, "");
export const EXPO_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
// Production Build/OTA must provide EXPO_PUBLIC_SERVICES_API_ENABLED=true.
export const SERVICES_API_ENABLED = process.env.EXPO_PUBLIC_SERVICES_API_ENABLED === "true";

// AsyncStorage keys — รวมไว้ที่นี่เพื่อป้องกัน typo
export const STORAGE_KEYS = {
  TOKEN: "token",
  TOKEN_TYPE: "token_type",
  USER: "user",
  // user identifier (data.user.id จาก SSO, fallback เป็น email) — เก็บแยกจาก
  // USER (ก้อนข้อมูล user เต็ม) เพื่อ query เร็วและชัดเจนว่าใช้เป็น per-account key
  CURRENT_USER_ID: "@current_user_id",
  PUSH_TOKEN: "push_token",
  NOTIF_SETTINGS: "@notif_settings",
  NOTIF_PERMISSION_PROMPTED: "@notif_permission_prompted",
  NOTIFICATION_INBOX: "@notification_inbox",
  LAST_NOTIFICATION_RESPONSE: "@last_notification_response",
  CHAT_HISTORY_PREFIX: "@chat_history:",
  E_RESEARCH_PROFILE: "@e_research_profile",
  E_RESEARCH_EDUCATION: "@e_research_education",
  E_RESEARCH_EXPERTISE: "@e_research_expertise",
  E_RESEARCH_PUBLISH_SETTINGS: "@e_research_publish_settings",
  LRD_RESEARCHER_ID: "@lrd_researcher_id",
  // PIN/Biometric preference เป็น per-account เสมอ — ใช้ prefix นี้ต่อด้วย
  // user identifier เป็น key จริง เช่น "@biometric_enabled:16" (ดู userSecurityKeys.js)
  BIOMETRIC_PREFIX: "@biometric_enabled",
  BIOMETRIC_FALLBACK_PREFIX: "@biometric_token_fallback",
  // flag บอกว่ามี biometric token บันทึกไว้ใน SecureStore แล้วหรือยัง (ไม่ใช่ตัว
  // token เอง) — ใช้เช็คก่อนเรียก saveBiometricToken() ซ้ำ เพราะ SecureStore เอง
  // เช็ค key existence ไม่ได้เลยถ้า entry ถูกเขียนด้วย requireAuthentication:true
  // (ต้อง authenticate ก่อนถึงจะรู้ว่ามีหรือไม่มี) ป้องกัน Face ID auto-trigger
  // ซ้ำซ้อนทุกครั้งที่ login ทั้งที่ token เดิมยังใช้งานได้ปกติ
  BIOMETRIC_TOKEN_SAVED_PREFIX: "@biometric_token_saved",
  PIN_ENABLED_PREFIX: "@pin_enabled",
  PIN_ATTEMPTS: "@pin_attempts",
  LAST_BACKGROUND_AT: "@last_background_at",
};

// SecureStore keys — เก็บข้อมูล sensitive
export const SECURE_KEYS = {
  AUTH_TOKEN: "auth_token",
  // PIN/biometric token เป็น per-account เสมอ — ใช้ prefix นี้ต่อด้วย user
  // identifier เป็น key จริง เช่น "biometric_token:16" (ดู userSecurityKeys.js)
  BIOMETRIC_TOKEN_PREFIX: "biometric_token",
  PIN_HASH_PREFIX: "pin_hash",
  PIN_SALT_PREFIX: "pin_salt",
};
