import axios from "axios";
import { API_BASE_URL } from "../config";
import { readSessionCredentials, saveAuthSession } from "./authStorage";

// What a refresh attempt means for the request that asked for it. A boolean
// could not carry this: "retry now" and "keep the session" were both true, so
// a renewal that never reached the server sent the request back out with the
// token that had just failed, and its second 401 signed the user out.
export const RefreshResult = Object.freeze({
  // A fresh access token is stored. The result carries the session snapshot
  // holding it, and the request is retried under that snapshot only.
  RENEWED: "renewed",
  // Renewal is not possible right now: the request fails, the session stays,
  // and a later request renews.
  UNAVAILABLE: "unavailable",
  // The session cannot continue: the server refused the refresh token (401),
  // the device holds none, or a rotated one could not be stored.
  REJECTED: "rejected",
  // The session that asked has already ended — signed out, or replaced by
  // another account. Nothing was read, sent or written for it, and nothing
  // about the session now signed in follows from this.
  SUPERSEDED: "superseded",
});

const result = (outcome, session = null) => Object.freeze({ outcome, session });

// A refresh token may be redeemed exactly once. Redeeming one twice is how the
// backend recognises a stolen token, and it answers by revoking every token on
// the device — so two concurrent refreshes of the same token would log the
// user out rather than keep them signed in. Requests of one session therefore
// join that session's in-flight attempt instead of starting their own.
//
// Keyed by session generation. Different sessions hold different refresh
// tokens and the backend lets them refresh concurrently: account B starts its
// own refresh even while one begun by account A is still pending, and never
// waits on or interprets A's result.
const inFlight = new Map();

// How long a just-renewed session is trusted without renewing again. The
// in-flight guard only merges refreshes that overlap; requests that fail one
// after another each start their own, and a device whose clock or token the
// server disagrees with can renew repeatedly while every retry still answers
// 401. Five seconds is far below the token's lifetime, so an honest expiry
// is never blocked, while a burst of failures is answered once. Keyed by
// session: A's renewal is no evidence B holds a fresh token.
const RENEWAL_COOLDOWN_MS = 5000;
const recentRenewals = new Map();

// 429 is a rate limit, not a verdict on the token. Until the server's
// Retry-After has passed, a session's refreshes report UNAVAILABLE without
// asking again. Keyed by session, so A being limited never blocks B.
//
// Retry-After absent or unreadable: wait 30 seconds — long enough not to
// knock on a limiter that has just said no, short enough that the next
// screen the user opens can renew. Anything the server asks for is honoured
// up to 10 minutes, so a malformed or hostile header cannot leave a session
// unable to renew for hours while still showing as signed in.
const RATE_LIMIT_FALLBACK_MS = 30 * 1000;
const RATE_LIMIT_MAX_MS = 10 * 60 * 1000;
const notBefore = new Map();

// Logout is about to hand the server this session's newest token pair for
// revocation. A refresh starting after that point would rotate the pair out
// from under it, so the session's later refreshes report UNAVAILABLE.
const endingSessions = new Set();

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

// Development only, and never a token, a header or a response body: a refresh
// token is a credential, and one copied out of a log is one the backend will
// treat as stolen the next time it is used.
const log = (event, detail) => {
  // typeof guards the global: __DEV__ is injected by the React Native
  // bundler and is simply absent under plain Node, where a bare reference
  // throws — and the throw would be swallowed by the refresh's own catch,
  // turning a logging detail into a silent refusal to renew.
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(`[Auth] ${event}`, detail ?? "");
  }
};

const readHeader = (headers, name) =>
  headers?.get?.(name) ?? headers?.[name] ?? headers?.[name.toLowerCase()] ?? null;

// Retry-After is either delay-seconds or an HTTP date (RFC 9110 §10.2.3).
export const parseRetryAfter = (value, now = Date.now()) => {
  if (value == null) return null;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  // Every HTTP date names its weekday and month. Date.parse alone is far
  // too willing: it reads "-5" as the year 5 BC and would answer "now".
  if (!/[A-Za-z]/.test(text)) return null;
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
};

const rateLimitDelay = (headers, now) => {
  const asked = parseRetryAfter(readHeader(headers, "Retry-After"), now);
  return Math.min(asked ?? RATE_LIMIT_FALLBACK_MS, RATE_LIMIT_MAX_MS);
};

async function performRefresh(session) {
  // One queued read: the check that this session is still signed in and the
  // reads of its tokens happen with no sign-in able to land between them. A
  // request left over from account A must never redeem B's refresh token —
  // the server would rotate it, the guarded write below would rightly discard
  // the new pair, and B would be left holding a spent token.
  let credentials;
  try {
    credentials = await readSessionCredentials(session);
  } catch (_) {
    log("refresh token could not be read — keeping the session");
    return result(RefreshResult.UNAVAILABLE);
  }
  if (!credentials) {
    log("session ended before the refresh — nothing redeemed");
    return result(RefreshResult.SUPERSEDED);
  }
  // No local refresh token: a session predating refresh tokens, one whose
  // token was cleared after a 401, or a keychain that never kept it.
  //
  // This is a client-side recovery policy, not a backend refresh result —
  // nothing was sent, and the backend has confirmed nothing about any token.
  // It is REJECTED anyway because the session cannot be recovered: the access
  // token has just been refused, and without a refresh token there is no way
  // to get another. Staying signed in would leave every authenticated
  // request failing with 401 on empty screens and no route back in — the bug
  // the login screen's session-expired notice was added for. So the local
  // session ends through that same session-expired flow.
  if (!credentials.refreshToken) {
    log("no refresh token stored — session ends here");
    return result(RefreshResult.REJECTED);
  }
  log("refreshing session");

  let response;
  try {
    response = await refreshClient.post("/auth/refresh", { refresh_token: credentials.refreshToken });
  } catch (error) {
    const status = error?.response?.status ?? null;
    // Status or transport code only. The body may echo what was sent.
    log("refresh failed", { status: status ?? error?.code ?? "network" });
    if (status === 401) {
      // Spent, expired, revoked, logged out or replayed — the only answer
      // that ends the session. Clearing the token stops a later 401 from
      // replaying it, which the backend would read as reuse and answer by
      // revoking the device. renewal keeps the generation, so requests
      // waiting on this refresh are not mistaken for another session's;
      // onlyIfCurrent makes the write a no-op if this session has already
      // been replaced, so the new account's token is never the one cleared.
      await saveAuthSession(credentials.session.token, undefined, undefined, "", {
        renewal: true,
        onlyIfCurrent: session,
      }).catch(() => {});
      return result(RefreshResult.REJECTED);
    }
    if (status === 429) {
      notBefore.set(session.generation, Date.now() + rateLimitDelay(error.response.headers, Date.now()));
    }
    // 422 means this request was malformed, and sending it again cannot change
    // that. Stop asking for this session; the session itself stays. Signing in
    // again, or restarting the app, clears the hold.
    if (status === 422) notBefore.set(session.generation, Infinity);
    // 422 (the request itself was malformed), 403 (never sent by the
    // application; an IIS or proxy answer), 429, 5xx, a timeout, no network:
    // none of them says the token is dead. The token is kept, the request
    // fails, the user stays signed in.
    //
    // A timeout, reset or lost connection is also ambiguous, and no client
    // can resolve it alone: the request may have reached the server, which
    // then rotated the pair, and only the answer was lost. The device cannot
    // tell, so it keeps the pair it knows and does not re-send the refresh
    // token now — a one-time token presented again is what the server's
    // replay detection exists to catch. The next request that needs a
    // renewal presents it once more: if the server did rotate, that is a
    // replay, the server answers 401, and the session ends there, by the
    // server's decision rather than a guess here. Ending the session now
    // would sign out every user whose connection merely dropped.
    // Logout after such a failure still revokes the rotated pair: the server
    // accepts the spent refresh token as naming its whole family. See
    // docs/backend-session-revocation-handoff.md.
    return result(RefreshResult.UNAVAILABLE);
  }

  const { accessToken, refreshToken: nextRefreshToken } = readTokens(response?.data);
  // The contract is a new pair on every 200. Half of one, or something that
  // is not one at all, is stored as nothing: the old pair stands, the request
  // fails, and the session is left to renew on a later request.
  if (!accessToken || !nextRefreshToken) {
    log("refresh response was not a token pair — keeping the session");
    return result(RefreshResult.UNAVAILABLE);
  }

  // Both tokens in one queued write. requirePair makes the save succeed only
  // once both are confirmed in the keychain — a new access token whose
  // refresh token was lost would work until it lapsed and then could not be
  // renewed. onlyIfCurrent is checked inside the queue: a sign-out or another
  // account's sign-in that landed while the request was out is never
  // overwritten with this session's tokens.
  let saved;
  try {
    saved = await saveAuthSession(accessToken, undefined, undefined, nextRefreshToken, {
      renewal: true,
      onlyIfCurrent: session,
      requirePair: true,
    });
  } catch (error) {
    if (error?.refreshTokenLost) {
      // The server has rotated the pair, so the old refresh token is spent
      // and the new one cannot be kept. The next renewal would present the
      // spent token, and the server would end the session then anyway. End it
      // now and revoke the pair this device cannot hold. Not waited on: the
      // user is signed out either way.
      log("rotated refresh token could not be stored — ending the session");
      refreshClient.post("/auth/logout", { refresh_token: nextRefreshToken }).catch(() => {});
      return result(RefreshResult.REJECTED);
    }
    // The refresh token is stored; only the access token is not. The next
    // request answers 401 and renews with the stored refresh token.
    log("renewed access token could not be stored — keeping the session");
    return result(RefreshResult.UNAVAILABLE);
  }
  if (saved === false) {
    log("session was replaced mid-refresh — discarding the new token");
    return result(RefreshResult.SUPERSEDED);
  }
  log("refresh succeeded", {
    expiresIn: response?.data?.expires_in ?? response?.data?.data?.expires_in,
  });
  // The exact snapshot the retry is sent under: this session, this token.
  return result(RefreshResult.RENEWED, {
    token: accessToken,
    generation: session.generation,
    userId: session.userId,
  });
}

const recentRenewalOf = (generation) => {
  const renewal = recentRenewals.get(generation);
  if (!renewal) return null;
  if (Date.now() - renewal.at < RENEWAL_COOLDOWN_MS) return renewal;
  recentRenewals.delete(generation);
  return null;
};

export const wasRenewedRecently = (session) => recentRenewalOf(session?.generation) != null;

// Resolves to { outcome, session }: outcome is one of RefreshResult, and
// session is the renewed snapshot when outcome is RENEWED, otherwise null.
export function refreshAuthSession(session) {
  const generation = session?.generation;
  if (generation == null) return Promise.resolve(result(RefreshResult.SUPERSEDED));

  const pending = inFlight.get(generation);
  if (pending) return pending;

  if (endingSessions.has(generation)) {
    log("session is logging out — not renewing it");
    return Promise.resolve(result(RefreshResult.UNAVAILABLE));
  }

  const limitedUntil = notBefore.get(generation);
  if (limitedUntil != null) {
    if (Date.now() < limitedUntil) {
      log("refresh rate-limited — waiting for Retry-After");
      return Promise.resolve(result(RefreshResult.UNAVAILABLE));
    }
    notBefore.delete(generation);
  }

  const renewal = recentRenewalOf(generation);
  if (renewal) {
    log("renewed moments ago — reusing that renewal");
    // A 401 inside the window is most likely a request built before the
    // renewal landed. It is retried under the renewed snapshot rather than
    // treated as the end of the session — which is what reporting anything
    // else here would make it.
    return Promise.resolve(result(RefreshResult.RENEWED, renewal.session));
  }

  const promise = performRefresh(session)
    .then((outcome) => {
      if (outcome.outcome === RefreshResult.RENEWED) {
        recentRenewals.set(generation, { at: Date.now(), session: outcome.session });
      }
      if (outcome.outcome === RefreshResult.UNAVAILABLE) log("renewal unavailable — keeping the session");
      return outcome;
    })
    // Whatever failed here, it was not the server refusing the token.
    .catch(() => result(RefreshResult.UNAVAILABLE))
    .finally(() => {
      if (inFlight.get(generation) === promise) inFlight.delete(generation);
    });
  inFlight.set(generation, promise);
  return promise;
}

// For logout: settles once this session's in-flight refresh, if any, has
// settled, and holds off any refresh of it starting later. Another session's
// refresh is never waited on. Never rejects.
export function prepareSessionLogout(session) {
  const generation = session?.generation;
  if (generation == null) return Promise.resolve();
  endingSessions.add(generation);
  return (inFlight.get(generation) ?? Promise.resolve()).then(() => {}, () => {});
}

// For logout, once local invalidation has been attempted: drops everything
// held for this one session. Only its generation is touched — a newer
// account's cooldown, rate limit, pending refresh or logout is left alone. An
// in-flight entry removes itself the moment it settles, so a settled one
// never lingers to be cleared; one still pending (logout of a session already
// replaced does not wait for it) is left to finish, since dropping it would
// let a second refresh of the same one-time token start beside it.
export function finishSessionLogout(session) {
  const generation = session?.generation;
  if (generation == null) return;
  endingSessions.delete(generation);
  recentRenewals.delete(generation);
  notBefore.delete(generation);
}

// Diagnostics for tests: what is held for one session, and in total. Counts
// and flags only — never a token.
export const refreshStateFor = (session) => {
  const generation = session?.generation;
  return {
    inFlight: inFlight.has(generation),
    recentRenewal: recentRenewals.has(generation),
    rateLimited: notBefore.has(generation),
    loggingOut: endingSessions.has(generation),
  };
};
export const refreshStateSize = () =>
  inFlight.size + recentRenewals.size + notBefore.size + endingSessions.size;

// Login must not inherit anything from the session before it.
export const resetRenewalCooldown = () => {
  recentRenewals.clear();
  notBefore.clear();
};

export const isRefreshInFlight = (session) =>
  session ? inFlight.has(session.generation) : inFlight.size > 0;
