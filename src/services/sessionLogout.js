import { invalidateAuthSession, isAuthSessionCurrent, readSessionCredentials } from "./authStorage";
import { finishSessionLogout, prepareSessionLogout } from "./tokenRefresh";
import { getStoredPushToken, removeTokenFromBackend } from "./notificationService";
import api from "./api";

// How long the user waits on the network while signing out. A slow or
// unreachable server must not hold them on the screen for a 30-second timeout.
export const LOGOUT_WAIT_MS = 2000;

const atMost = (promise, ms) => {
  let timer;
  const limit = new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
};

const removePushToken = async (session) => {
  try {
    const pushToken = await getStoredPushToken(session);
    await removeTokenFromBackend(pushToken, session);
  } catch (_) {}
};

// skipAuthRefresh: a 401 here must not renew the session being ended.
// suppressAuthRedirect: logout navigates on its own once local data is gone.
// sessionSnapshot: sent under this session or not at all.
const revokeOnServer = async ({ session, refreshToken }) => {
  try {
    await api.post(
      "/auth/logout",
      refreshToken ? { refresh_token: refreshToken } : null,
      {
        authSession: session,
        sessionSnapshot: true,
        suppressAuthRedirect: true,
        skipAuthRefresh: true,
      },
    );
  } catch (_) {
    // Whatever the server answered, the device signs out: the user asked to
    // leave, and a refused revocation is no reason to keep their credentials.
    // Errors are dropped unread: the request body carries the refresh token,
    // and nothing of it belongs in a log.
  }
};

// Signs `target` out: tells the backend, then clears it locally through
// `cleanup`. Resolves true when the local session was cleared, false when it
// had already ended — signed out, or replaced by another account, whose
// session is never touched.
//
// The server revokes the whole session from any refresh token of it, even one
// already rotated, so the wait for a pending refresh and for the server's
// answers is bounded. Once a request has left it is not cancelled: past the
// limit the device clears itself and the requests finish in the background.
// Only this session's refresh is waited on — another account's never is.
export async function logoutSession(target, cleanup) {
  if (!target) return false;
  try {
    // Already signed out or replaced: nothing of it is left to revoke, and a
    // refresh it left pending is no reason to keep the user waiting.
    if (!await isAuthSessionCurrent(target)) return false;
    await atMost(prepareSessionLogout(target), LOGOUT_WAIT_MS);

    // Null once the session has ended while the refresh settled: there is
    // nothing of this account left to revoke, and the account signed in now
    // is not this logout's to end.
    const latest = await readSessionCredentials(target).catch(() => null);
    if (latest) {
      await atMost(
        Promise.all([removePushToken(latest.session), revokeOnServer(latest)]),
        LOGOUT_WAIT_MS,
      );
    }

    return await invalidateAuthSession(target, cleanup);
  } finally {
    // After invalidation has been attempted, whatever it did: until then the
    // hold on refreshing this session must stand, and after it nothing held
    // for this session is of any use. Only this session's state is released.
    finishSessionLogout(target);
  }
}
