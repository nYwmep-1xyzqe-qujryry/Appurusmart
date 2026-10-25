import { invalidateAuthSession, isAuthSessionCurrent, readSessionCredentials } from "./authStorage";
import { finishSessionLogout, prepareSessionLogout } from "./tokenRefresh";
import { getStoredPushToken, removeTokenFromBackend } from "./notificationService";
import api from "./api";

// Signs `target` out: tells the backend, then clears it locally through
// `cleanup`. Resolves true when the local session was cleared, false when it
// had already ended — signed out, or replaced by another account, whose
// session is never touched.
//
// The backend revokes exactly the pair it is handed, so it must be handed the
// newest one. A refresh of this session still in flight would rotate both
// tokens: logout waits for it, and holds off any that would start after, so
// what is read below is what the server holds. Only this session's refresh
// is waited on — another account's never is.
export async function logoutSession(target, cleanup) {
  if (!target) return false;
  try {
    // Already signed out or replaced: nothing of it is left to revoke, and a
    // refresh it left pending is no reason to keep the user waiting.
    if (!await isAuthSessionCurrent(target)) return false;
    await prepareSessionLogout(target);

    // Null once the session has ended while the refresh settled: there is
    // nothing of this account left to revoke, and the account signed in now
    // is not this logout's to end.
    const latest = await readSessionCredentials(target).catch(() => null);
    if (latest) {
      const { session, refreshToken } = latest;
      try {
        const pushToken = await getStoredPushToken(session);
        await removeTokenFromBackend(pushToken, session);
      } catch (_) {}
      // skipAuthRefresh: a 401 here must not renew the session being ended.
      // suppressAuthRedirect: logout navigates on its own once local data is
      // gone. sessionSnapshot: sent under this session or not at all.
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
        // Whatever the server answered — 401 included — the device signs
        // out: the user asked to leave, and a server that refuses the
        // revocation is no reason to keep their credentials on the device.
        // Errors are dropped unread: the request body carries the refresh
        // token, and nothing of it belongs in a log.
        //
        // A 401 here is expected after an ambiguous refresh — one that
        // reached the server and rotated the pair while its answer was
        // lost. The device then holds only the superseded pair, and logout
        // can present nothing else: the rotated pair it never received stays
        // valid on the server until it expires. Revoking it needs the
        // backend to accept a credential the device still has, such as the
        // refresh token alone; see docs/backend-session-revocation-handoff.md.
      }
    }

    return await invalidateAuthSession(target, cleanup);
  } finally {
    // After invalidation has been attempted, whatever it did: until then the
    // hold on refreshing this session must stand, and after it nothing held
    // for this session is of any use. Only this session's state is released.
    finishSessionLogout(target);
  }
}
