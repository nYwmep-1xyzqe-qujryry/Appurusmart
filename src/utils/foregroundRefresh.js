// Schedule the next refresh only after the previous request settles.
export function startForegroundRefresh({
  refresh,
  isActive,
  subscribe,
  intervalMs = 10000,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let stopped = false;
  let running = false;
  let timer = null;
  let requested = false;

  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const run = async () => {
    clear();
    if (stopped || !isActive()) return;
    if (running) {
      requested = true;
      return;
    }
    running = true;
    requested = false;
    try {
      await refresh();
    } catch {
      // A failed refresh must not stop subsequent foreground updates.
    } finally {
      running = false;
      if (!stopped && isActive()) {
        timer = schedule(run, requested ? 0 : intervalMs);
      }
    }
  };
  const unsubscribe = subscribe(run);
  run();
  return () => {
    stopped = true;
    clear();
    unsubscribe();
  };
}
