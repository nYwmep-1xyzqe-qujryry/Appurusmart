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

async function performRefresh(session) {
  const refreshToken = await getRefreshToken();
  // Nothing to exchange: a session predating this feature, or one whose
  // refresh token was already spent and cleared.
  if (!refreshToken) return false;

  let response;
  try {
    response = await refreshClient.post("/auth/refresh", { refresh_token: refreshToken });
  } catch (error) {
    const status = error?.response?.status;
    if (status === 401 || status === 422) {
      // The token is spent, revoked or malformed. Clearing it stops a later
      // 401 from replaying the same dead token, which the backend would read
      // as reuse and answer by revoking the device.
      const current = await captureAuthSession();
      if (current?.token) {
        await saveAuthSession(current.token, undefined, undefined, "");
      }
      return false;
    }
    // A timeout or a 5xx says nothing about the token's validity, so it is
    // kept for the next attempt.
    return false;
  }

  const { accessToken, refreshToken: nextRefreshToken } = readTokens(response?.data);
  if (!accessToken) return false;

  // The session may have been replaced while the request was in flight — a
  // logout, or a different account signing in. Writing now would restore a
  // session the user already left.
  if (!await isAuthSessionCurrent(session)) return false;

  const userId = await getCurrentUserId();
  // Passing the rotated refresh token through the same write keeps the pair
  // consistent: the device never holds a new access token beside the spent
  // refresh token it can no longer use.
  await saveAuthSession(accessToken, undefined, userId ?? undefined, nextRefreshToken ?? "");
  return true;
}

// Resolves true when the session now holds a fresh access token, false when
// the caller should treat the session as finished.
export function refreshAuthSession(session) {
  if (inFlight) return inFlight;
  inFlight = performRefresh(session)
    .catch(() => false)
    .finally(() => { inFlight = null; });
  return inFlight;
}

export const isRefreshInFlight = () => inFlight !== null;
