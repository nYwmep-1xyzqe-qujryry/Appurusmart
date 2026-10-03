// Orchestrates push registration recovery. All I/O arrives through `deps` so
// the tests drive this exact implementation rather than a reimplementation of
// its rules.
import {
  createRegistrationState,
  getRegistrationIdentity,
  nextRegistrationAction,
  onRegistrationConfirmed,
  onRegistrationFailed,
  onRegistrationStarted,
  onStatusObserved,
  resetForIdentity,
  resetForSession,
} from "../utils/pushRegistrationRetry";

export const createPushRegistrationRecovery = (deps) => {
  const {
    getSession,
    getPermissionStatus,
    getExpoToken,
    registerWithBackend,
    isRetryableError,
    readConfirmation,
    writeConfirmation,
    getPlatform,
    getProjectId,
    onError,
  } = deps;

  let state = createRegistrationState();
  let hydrated = false;
  // Joins overlapping foreground events for the same account instead of
  // running two registrations side by side. Keyed by session so a different
  // account is never queued behind a stale one.
  // Keyed by session+token: a single slot could not hold two overlapping
  // operations, so "A pending -> B pending -> A again" lost the dedupe for A.
  const inFlight = new Map();
  // Monotonic per-session ordering. A registration that started earlier must
  // not overwrite the confirmation of one that started later, even if the
  // older request happens to finish last.
  const intentCounters = new Map();
  const latestIntent = new Map();
  // Incremented by reset(); a request that started before a reset must not
  // write its result afterwards.
  let generation = 0;

  // Logging out and back in as the same user produces a new auth generation.
  // Keying on userId alone would let an operation started before the logout be
  // treated as belonging to the new session.
  const sessionKeyOf = (session) => (
    session?.userId == null ? null : `${session.generation ?? 0}:${session.userId}`
  );

  // True while this operation still owns the shared state. Checked before
  // every mutation that follows an await, not only on the success path.
  const isCurrent = (startedGeneration, sessionKey, currentSession, intent = null) => {
    if (startedGeneration !== generation) return false;
    if (sessionKeyOf(currentSession) !== sessionKey) return false;
    // A newer registration for this session has superseded this one.
    if (intent != null && latestIntent.get(sessionKey) > intent) return false;
    return true;
  };

  const run = async ({ force = false, devicePushToken = null } = {}) => {
    // Captured before the first await: a reset() that lands while the session
    // is being read must still invalidate this run.
    const startedGeneration = generation;
    const session = await getSession();
    const sessionKey = sessionKeyOf(session);
    // A rotation carries a specific device token, so it must not join an
    // in-flight run that is registering a different one.
    const inFlightKey = `${sessionKey}|${devicePushToken?.data ?? ""}`;
    const existing = inFlight.get(inFlightKey);
    if (existing) return existing;

    // Claim the newest intent for this session before awaiting anything else.
    const nextIntent = (intentCounters.get(sessionKey) ?? 0) + 1;
    intentCounters.set(sessionKey, nextIntent);
    latestIntent.set(sessionKey, nextIntent);

    const promise = (async () => runOnce(session, sessionKey, startedGeneration, {
      force,
      devicePushToken,
      intent: nextIntent,
    }))();
    inFlight.set(inFlightKey, promise);
    try {
      return await promise;
    } finally {
      if (inFlight.get(inFlightKey) === promise) inFlight.delete(inFlightKey);
    }
  };

  const runOnce = async (initialSession, initialSessionKey, startedGeneration, { force = false, devicePushToken = null, intent = 0 } = {}) => {
    const session = initialSession;
    const sessionKey = initialSessionKey;
    state = resetForSession(state, sessionKey);

    const status = await getPermissionStatus();
    if (startedGeneration !== generation) {
      return { action: "discarded", reason: "reset-during-permission-read" };
    }

    if (!sessionKey) {
      state = onStatusObserved(state, status);
      return { action: "skip", reason: "no-session" };
    }

    // Confirmation lives in storage so it survives a process restart; a
    // locally stored Expo token is deliberately NOT treated as confirmation,
    // because it is written before the backend call is attempted.
    if (!hydrated || state.confirmation == null) {
      const stored = await readConfirmation(session);
      if (!isCurrent(startedGeneration, sessionKey, await getSession(), intent)) {
        return { action: "discarded", reason: "reset-during-hydration" };
      }
      if (stored?.identity) state = { ...state, confirmation: stored };
      hydrated = true;
    }

    // The token is needed to know *what* would be confirmed. It is read before
    // deciding so a rotated token invalidates an older confirmation.
    const token = await getExpoToken(session);
    if (!isCurrent(startedGeneration, sessionKey, await getSession(), intent)) {
      return { action: "discarded", reason: "reset-during-token-read" };
    }
    const identity = getRegistrationIdentity({
      sessionKey,
      token,
      platform: getPlatform(),
      projectId: getProjectId(),
    });

    // A permanent failure or exhausted budget belongs to the identity that
    // failed. A new token must start with a fresh budget rather than inherit
    // the old one's exhaustion.
    state = resetForIdentity(state, identity);

    const decision = force
      ? { action: "register", reason: "forced" }
      : nextRegistrationAction(state, {
        currentStatus: status,
        hasSession: true,
        identity,
      });

    if (decision.action !== "register") {
      state = onStatusObserved(state, status);
      return decision;
    }

    state = onRegistrationStarted(state, status);

    try {
      // Registration may mint or rotate the token, so the identity that was
      // actually accepted is only known from what it returns. Building the
      // confirmation from the pre-registration token would record an identity
      // the backend never saw.
      const acceptedToken = await registerWithBackend(session, token, devicePushToken);
      // The session can change while the request is in flight; a response for
      // an account that is no longer current must not be recorded.
      const currentSession = await getSession();
      if (sessionKeyOf(currentSession) !== sessionKey) {
        // Do NOT reset here: the new account may already have state of its own,
        // and an old account's response must not clear it.
        return { action: "discarded", reason: "session-changed" };
      }
      // A reset or logout that happened while this was in flight wins.
      if (startedGeneration !== generation) {
        return { action: "discarded", reason: "reset-during-request" };
      }
      // A newer registration superseded this one. Writing now would replace the
      // newer token's confirmation with this older one, even though the newer
      // request already completed.
      if (latestIntent.get(sessionKey) > intent) {
        return { action: "discarded", reason: "superseded" };
      }
      const confirmedIdentity = getRegistrationIdentity({
        sessionKey,
        token: acceptedToken,
        platform: getPlatform(),
        projectId: getProjectId(),
      });
      // A null identity means the accepted token is unknown; persisting it
      // would mark the device registered without proof.
      if (!confirmedIdentity) {
        state = onRegistrationFailed(state, { retryable: true });
        return { action: "failed", retryable: true, reason: "unknown-accepted-token" };
      }
      state = onRegistrationConfirmed(state, confirmedIdentity);
      await writeConfirmation(session, { identity: confirmedIdentity });
      return { action: "confirmed", identity: confirmedIdentity };
    } catch (error) {
      const retryable = isRetryableError(error);
      // The failure belongs to the operation that started it. After a reset or
      // an account change this must not touch the current state.
      if (!isCurrent(startedGeneration, sessionKey, await getSession(), intent)) {
        onError?.(error, { retryable, discarded: true });
        return { action: "discarded", reason: "reset-during-request" };
      }
      state = onRegistrationFailed(state, { retryable });
      onError?.(error, { retryable });
      return { action: "failed", retryable };
    }
  };

  return {
    run,
    // Same confirmed-registration path as `run`, but skips the
    // permission-transition gate. Login, startup and token rotation have
    // already decided they want to register; they still need the accepted
    // token recorded as confirmation.
    register: ({ devicePushToken = null } = {}) => run({ force: true, devicePushToken }),
    // Exposed for assertions and for resetting on logout.
    getState: () => state,
    reset: () => {
      generation += 1;
      inFlight.clear();
      latestIntent.clear();
      state = createRegistrationState();
      hydrated = false;
    },
  };
};
