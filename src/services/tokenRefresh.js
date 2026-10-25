import axios from "axios";
import { API_BASE_URL } from "../config";
import {
  captureAuthSession,
  getRefreshToken,
  isAuthSessionCurrent,
  saveAuthSession,
} from "./authStorage";
import { getCurrentUserId } from "./userSecurityKeys";

// A refresh token may be redeemed exactly once. Redeeming one twice is how the
// backend recognises a stolen token, and it answers by revoking every token on
// the device — so two concurrent refreshes would log the user out rather than
// keep them signed in. Every caller therefore joins the one in-flight attempt
// instead of starting its own.
let inFlight = null;

// Separate from the app's axios instances: those attach the access token and
// route failures into handleUnauthorized, which is exactly what must not
// happen while the session is being renewed.
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

const readTokens = (payload) => {
  const data = payload?.data ?? payload ?? {};
  const accessToken = data.access_token ?? data.token;
  const refreshToken = data.refresh_token;
  return {
    accessToken: typeof accessToken === "string" && accessToken ? accessToken : null,
    refreshToken: typeof refreshToken === "string" && refreshToken ? refreshToken : null,
  };
};

// Development only, and never the token values: a refresh token is a
// credential, and one copied out of a log is one the backend will treat as
// stolen the next time it is used.
const log = (event, detail) => {
  // typeof guards the global: __DEV__ is injected by the React Native
  // bundler and is simply absent under plain Node, where a bare reference
  // throws — and the throw would be swallowed by the refresh's own catch,
  // turning a logging detail into a silent refusal to renew.
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(`[Auth] ${event}`, detail ?? "");
  }
};

async function performRefresh(session) {
  const refreshToken = await getRefreshToken();
  // Nothing to exchange: a session predating this feature, or one whose
  // refresh token was already spent and cleared.
  if (!refreshToken) {
    log("no refresh token stored — session ends here");
    return false;
  }
  log("refreshing session");

  let response;
  try {
    response = await refreshClient.post("/auth/refresh", { refresh_token: refreshToken });
  } catch (error) {
    const status = error?.response?.status;
    log("refresh rejected", { status: status ?? error?.code ?? "network" });
    if (status === 401 || status === 422) {
      // The token is spent, revoked or malformed. Clearing it stops a later
      // 401 from replaying the same dead token, which the backend would read
      // as reuse and answer by revoking the device.
      const current = await captureAuthSession();
      if (current?.token) {
        // renewal: true because this only drops the spent refresh token. The
        // default write advances the session generation, which every snapshot
        // taken before it is compared against — so clearing the token here
        // invalidated the very requests waiting on this refresh, and they
        // reported "session was replaced mid-refresh" and gave up.
        await saveAuthSession(current.token, undefined, undefined, "", { renewal: true });
      }
      return false;
    }
    // A timeout or a 5xx says nothing about the token's validity, so it is
    // kept for the next attempt.
    return false;
  }

  const { accessToken, refreshToken: nextRefreshToken } = readTokens(response?.data);
  if (!accessToken) {
    log("refresh response carried no access token");
    return false;
  }

  // The session may have been replaced while the request was in flight — a
  // logout, or a different account signing in. Writing now would restore a
  // session the user already left.
  if (!await isAuthSessionCurrent(session)) {
    log("session was replaced mid-refresh — discarding the new token");
    return false;
  }

  const userId = await getCurrentUserId();
  // Passing the rotated refresh token through the same write keeps the pair
  // consistent: the device never holds a new access token beside the spent
  // refresh token it can no longer use.
  await saveAuthSession(
    accessToken,
    undefined,
    userId ?? undefined,
    nextRefreshToken ?? "",
    { renewal: true },
  );
  log("refresh succeeded", {
    expiresIn: response?.data?.expires_in ?? response?.data?.data?.expires_in,
    rotated: Boolean(nextRefreshToken),
  });
  return true;
}

// Resolves true when the session now holds a fresh access token, false when
// the caller should treat the session as finished.
// How long a just-renewed session is trusted without renewing again. The
// in-flight guard only merges refreshes that overlap; requests that fail one
// after another each start their own, and a device whose clock or token the
// server disagrees with can renew repeatedly while every retry still answers
// 401. Five seconds is far below the token's lifetime, so an honest expiry
// is never blocked, while a burst of failures is answered once.
const RENEWAL_COOLDOWN_MS = 5000;
let lastRenewalAt = 0;

export function refreshAuthSession(session) {
  if (inFlight) return inFlight;
  if (Date.now() - lastRenewalAt < RENEWAL_COOLDOWN_MS) {
    log("renewed moments ago — not renewing again");
    return Promise.resolve(false);
  }
  inFlight = performRefresh(session)
    .then((renewed) => {
      if (renewed) lastRenewalAt = Date.now();
      return renewed;
    })
    .catch(() => false)
    .finally(() => { inFlight = null; });
  return inFlight;
}

// Login must not inherit the previous session's cooldown.
export const resetRenewalCooldown = () => { lastRenewalAt = 0; };

export const isRefreshInFlight = () => inFlight !== null;
