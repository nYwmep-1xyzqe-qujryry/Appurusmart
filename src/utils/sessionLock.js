// A per-key serialized critical section.
//
// Inbox sync, dismiss, mark-read and read-all all read-modify-write the same
// stored state. Serializing only the write is not enough: a sync that read the
// old state can still commit after a mutation and silently undo it, so the read
// and the write have to happen inside one lock.
//
// Kept free of react-native imports so the real implementation can be driven
// directly by tests with deferred promises.
export const createSessionLock = () => {
  const queues = new Map();

  const withLock = (key, task) => {
    // `previous` is always a promise that swallows its own outcome (see
    // `chained` below), so a failing task cannot poison the ones queued behind
    // it — they simply run next.
    const previous = queues.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    // What the queue chains on must never reject, or the next waiter would see
    // someone else's error and an unhandled rejection would escape. The caller
    // still receives `result`, errors included.
    const chained = result.then(() => {}, () => {});
    queues.set(key, chained);
    void chained.then(() => {
      // Compare against the promise actually stored — comparing the task
      // promise never matches and leaks an entry per key.
      if (queues.get(key) === chained) queues.delete(key);
    });
    return result;
  };

  withLock.pendingKeys = () => [...queues.keys()];
  return withLock;
};

export const withSessionLock = createSessionLock();
