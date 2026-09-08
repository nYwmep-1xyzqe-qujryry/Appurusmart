import axios from "axios";
import { INFO_API_BASE_URL } from "../config";
import { attachRequestSession, handleUnauthorized } from "./sessionRequest";

// API สำหรับข้อมูล Expert/LRD โดยเฉพาะ ใช้ token เดียวกับ URU Smart API
// แต่แยก instance เพื่อป้องกันการส่ง request ของโมดูลอื่นไป Info โดยไม่ตั้งใจ
const infoApi = axios.create({
  baseURL: INFO_API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// เตรียมแถวผู้ใช้ใน expert2 ก่อนเข้าใช้งาน Expert module ครั้งแรกของ session
// ไม่ส่ง owner/id_card ใน body — backend อ่าน citizen_id จาก Bearer token เท่านั้น
export const ensureExpertProfile = async () => {
  const response = await infoApi.post("/info/expert/profile/ensure", {});
  return response.data?.data?.profile ?? response.data?.profile ?? null;
};

infoApi.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase();
  if (["put", "patch", "delete"].includes(method)) {
    const overrideMethod = method.toUpperCase();
    config.headers = { ...config.headers, "X-HTTP-Method-Override": overrideMethod };
    config.method = "post";
    // Info API รองรับ method override ผ่าน POST + _method ใน body
    // ส่ง header ควบคู่ไว้ด้วยเพื่อรองรับทั้งสองรูปแบบของ server
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      config.data.append("_method", overrideMethod);
    } else {
      config.data = { ...(config.data ?? {}), _method: overrideMethod };
    }
  }

  return attachRequestSession(config);
}, (error) => Promise.reject(error));

// Token ของ Info เป็น token เดียวกับ app หลัก จึงจัดการ session หมดอายุเหมือน API หลัก
infoApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    await handleUnauthorized(error);
    if (__DEV__ && !error.config?.suppressErrorLog) {
      console.warn(`[Info API] ${error.response?.status ?? error.code ?? "NETWORK_ERROR"} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.message);
    }
    return Promise.reject(error);
  },
);

export default infoApi;
