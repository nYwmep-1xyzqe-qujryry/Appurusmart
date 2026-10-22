import axios from "axios";
import { API_BASE_URL } from "../config";
import { attachRequestSession, handleUnauthorized, tryRefreshForRequest } from "./sessionRequest";

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

    // A 401 means the access token lapsed, not that the user is gone: the
    // refresh token decides that. Retried once, with skipAuthRefresh set so a
    // second 401 on the retry ends the session instead of looping.
    if (await tryRefreshForRequest(error)) {
      // The retry must carry the renewed token, and nothing of the attempt
      // that failed. authSession: null alone was not enough: a request made
      // with sessionSnapshot keeps using its own captured session, so the
      // retry either re-sent the token the refresh had just replaced or, with
      // the snapshot emptied, sent no Authorization header at all. Either way
      // it answered 401 again and ended a session the server had just
      // renewed. Dropping the stale header and the snapshot flag lets the
      // request interceptor attach the current token.
      const { Authorization: _staleAuth, ...headers } = error.config.headers ?? {};
      return api.request({
        ...error.config,
        headers,
        authSession: null,
        sessionSnapshot: false,
        skipAuthRefresh: true,
      });
    }

    await handleUnauthorized(error);

    if (__DEV__ && !error.config?.suppressErrorLog) {
      // hasAuthorization distinguishes a token the server rejected from a
      // request that carried none — the same 401 either way, but a different
      // bug. The header's value is a credential and is never logged.
      console.warn(
        `[API] ${errorLabel} ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
        error.message,
        { hasAuthorization: Boolean(error.config?.headers?.Authorization) },
      );
    }

    return Promise.reject(error);
  },
);

export default api;
