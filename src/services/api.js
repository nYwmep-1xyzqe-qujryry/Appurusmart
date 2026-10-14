import axios from "axios";
import { API_BASE_URL } from "../config";
import { attachRequestSession, handleUnauthorized } from "./sessionRequest";

const api = axios.create({
  baseURL: API_BASE_URL,
  // Matches infoApi and lrdApi. At 10s an announcement image on a slow
  // campus connection aborted mid-download and the card fell back to its
  // placeholder, which read as a broken image rather than a slow one.
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

// แนบ Bearer token ทุก request อัตโนมัติ
api.interceptors.request.use(
  async (config) => {
    const method = config.method?.toLowerCase();

    if (["put", "patch", "delete"].includes(method)) {
      const overrideMethod = method.toUpperCase();

      if (typeof config.headers?.set === "function") {
        config.headers.set("X-HTTP-Method-Override", overrideMethod);
      } else {
        config.headers = {
          ...config.headers,
          "X-HTTP-Method-Override": overrideMethod,
        };
      }

      config.method = "post";
      config.data ??= {};
    }

    return attachRequestSession(config);
  },
  (error) => Promise.reject(error),
);

// 401 → ล้าง session และ redirect ไป Login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const errorLabel = status ?? error.code ?? "NETWORK_ERROR";

    await handleUnauthorized(error);

    if (__DEV__ && !error.config?.suppressErrorLog) {
      console.warn(`[API] ${errorLabel} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.message);
    }

    return Promise.reject(error);
  },
);

export default api;
