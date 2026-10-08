// A resource response may outlive the auth session that requested it.
// Keep this comparison pure so the race policy can be regression-tested without
// importing SecureStore or AsyncStorage.
export const isSameSessionSnapshot = (captured, current) => {
  if (!captured || !current) return !captured && !current;
  return captured.generation === current.generation
    && String(captured.userId ?? "") === String(current.userId ?? "")
    && captured.token === current.token;
};
