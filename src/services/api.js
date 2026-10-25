import axios from "axios";
import { API_BASE_URL } from "../config";
import {
  attachRequestSession,
  handleUnauthorized,
  RefreshResult,
  sessionChangedError,
  tryRefreshForRequest,
} from "./sessionRequest";

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
    const refresh = await tryRefreshForRequest(error);
    if (refresh?.outcome === RefreshResult.RENEWED) {
      // The retry must carry the renewed token, nothing of the attempt that
      // failed, and no one else's session. Re-sending the old snapshot sent
      // the token the refresh had just replaced, and it answered 401 again;
      // dropping the snapshot let the retry take whoever was signed in by
      // the time it went out. It is pinned instead to the snapshot the
      // refresh produced — this session, this renewed token — and sent as a
      // snapshot so the request interceptor cancels it if that session ends
      // before it leaves.
      const { Authorization: _staleAuth, ...headers } = error.config.headers ?? {};
      return api.request({
        ...error.config,
        headers,
        authSession: refresh.session,
        sessionSnapshot: true,
        skipAuthRefresh: true,
      });
    }
    // The account this request belonged to has been left. Cancelled, not
    // sent under the new account, and not a reason to sign that one out.
    if (refresh?.outcome === RefreshResult.SUPERSEDED) return Promise.reject(sessionChangedError());
    // Renewal was not possible right now — rate limited, a server or network
    // failure — which says nothing about the session. The request fails as it
    // would have offline; signing the user out over it would end a session
    // with weeks left.
    if (refresh?.outcome !== RefreshResult.UNAVAILABLE) await handleUnauthorized(error);

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
