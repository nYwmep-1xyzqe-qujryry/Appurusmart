// Push registration recovery state machine.
//
// Two problems this exists to solve:
//
// 1. A locally stored Expo token is written as soon as the token is minted,
//    before POST /push-token is attempted. Treating that token as proof of
//    backend registration marks a device "registered" even when the backend
//    call failed, and the recovery path then never retries.
//
// 2. The permission prompt can hand the user to system Settings and resolves
//    with the status read *before* they changed anything, so enabling
//    notifications there leaves the install unregistered. Recovery has to
//    notice the denied-to-granted transition on a later foreground — and must
//    keep retrying after a failure rather than treating "we already saw
//    granted" as nothing left to do.
//
// Confirmation is therefore recorded separately from the token, and scoped to
// the exact (session, token, platform, project) tuple that the backend
// accepted, so rotation, reinstall, logout and account switches all invalidate
// it naturally.
//
// Kept free of react-native and expo imports so the real implementation is
// what the tests drive.

export const MAX_REGISTRATION_ATTEMPTS = 3;

// Identity of a confirmed registration. Any field changing means the backend
// has not confirmed *this* combination and registration must run again.
export const getRegistrationIdentity = ({ sessionKey, token, platform, projectId }) => (
  [sessionKey, token, platform, projectId].every((part) => part != null && part !== "")
    ? JSON.stringify({ sessionKey, token, platform, projectId })
    : null
);

export const isRegistrationConfirmed = (confirmation, identity) => (
  Boolean(identity) && confirmation?.identity === identity
);

export const createRegistrationState = () => ({
  observedStatus: null,
  // Set once a denied-to-granted transition is seen and cleared on confirmed
  // success, so a retryable failure stays eligible on later foregrounds.
  pending: false,
  attempts: 0,
  // Set by a non-retryable failure; only an identity change clears it.
  permanentlyFailed: false,
  confirmation: null,
  sessionKey: null,
  // Identity the current attempts/failure state belongs to.
  lastIdentity: null,
});

// Account change: drop everything session-scoped. Never carry a confirmation
// or a pending retry across accounts.
export const resetForSession = (state, sessionKey) => (
  state.sessionKey === sessionKey
    ? state
    : { ...createRegistrationState(), sessionKey, observedStatus: state.observedStatus }
);

// A failure budget belongs to the identity that failed. When the token (or
// platform/project) changes, a permanent failure or exhausted attempt count
// for the old identity must not block the new one.
export const resetForIdentity = (state, identity) => {
  if (!identity || state.lastIdentity === identity) {
    return state.lastIdentity === identity ? state : { ...state, lastIdentity: identity };
  }
  return {
    ...state,
    attempts: 0,
    permanentlyFailed: false,
    // A pending retry for the old token is no longer meaningful.
    pending: false,
    lastIdentity: identity,
  };
};

// Decides what a foreground event (or a login) should do.
export const nextRegistrationAction = (state, {
  currentStatus,
  hasSession,
  identity,
}) => {
  if (!hasSession) return { action: "skip", reason: "no-session" };
  if (currentStatus !== "granted") return { action: "skip", reason: "not-granted" };
  if (isRegistrationConfirmed(state.confirmation, identity)) {
    return { action: "skip", reason: "already-confirmed" };
  }
  if (state.permanentlyFailed) return { action: "skip", reason: "permanent-failure" };
  if (state.attempts >= MAX_REGISTRATION_ATTEMPTS) {
    return { action: "skip", reason: "max-attempts" };
  }

  // Either the user just enabled permission, a previous attempt failed and is
  // still pending, or the identity changed (token rotation, reinstall) so the
  // backend has never confirmed this particular combination.
  const becameGranted = state.observedStatus !== "granted";
  if (becameGranted) return { action: "register", reason: "became-granted" };
  if (state.pending) return { action: "register", reason: "retry-pending" };
  // Permission was already granted and nothing is pending, but there is no
  // confirmation for this identity — the earlier check above would have
  // returned "already-confirmed" otherwise.
  if (identity) return { action: "register", reason: "unconfirmed-identity" };

  return { action: "skip", reason: "no-change" };
};

export const onRegistrationStarted = (state, currentStatus) => ({
  ...state,
  observedStatus: currentStatus,
  pending: true,
  attempts: state.attempts + 1,
});

export const onRegistrationConfirmed = (state, identity) => ({
  ...state,
  pending: false,
  attempts: 0,
  permanentlyFailed: false,
  confirmation: identity ? { identity } : null,
});

export const onRegistrationFailed = (state, { retryable }) => ({
  ...state,
  // A retryable failure stays pending so the next foreground tries again.
  pending: Boolean(retryable),
  permanentlyFailed: !retryable,
});

// An observed status change alone must not clear pending work.
export const onStatusObserved = (state, currentStatus) => (
  state.observedStatus === currentStatus ? state : { ...state, observedStatus: currentStatus }
);
