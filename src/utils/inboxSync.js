// Ordering rules shared by the inbox mutations, kept free of react-native and
// expo imports so tests can drive the real implementation with fake storage and
// deferred promises rather than re-stating the rules.

// A GET that started before a local mutation carries pre-mutation rows. Once
// the mutation's PATCH succeeds its pending id is cleared, so the pending set
// alone cannot protect the row — the stale body would look authoritative and
// resurrect it as unread. Comparing the revision captured at request start
// against the one at commit is what detects this.
export const isInboxResponseStale = (revisionAtStart, revisionAtCommit) => (
  revisionAtStart !== revisionAtCommit
);

// Discarding a stale response wholesale also discards rows the mutation never
// touched — including a notification that has just arrived by push. A tap
// handler syncs and then looks for its own row, so dropping it sends the user
// to the inbox list instead of the announcement.
//
// Only the rows the local mutation actually changed are protected; everything
// else in the response is still applied. `protectedRows` are the current local
// rows whose state the stale body would undo.
export const mergeStaleInboxResponse = (localRows, serverRows, mutatedIds) => {
  const protectedIds = new Set([...mutatedIds].map(String));
  const localById = new Map(localRows.map((row) => [String(row.id), row]));
  // For a mutated row the local state wins. If it is no longer present locally
  // it was dismissed, so it is dropped rather than restored from the stale body.
  const merged = [];
  serverRows.forEach((row) => {
    const id = String(row.id);
    if (!protectedIds.has(id)) {
      merged.push(row);
      return;
    }
    if (localById.has(id)) merged.push(localById.get(id));
  });
  // A mutated row the user still holds locally but which the stale body omits
  // must survive.
  const seen = new Set(merged.map((row) => String(row.id)));
  localRows.forEach((row) => {
    if (protectedIds.has(String(row.id)) && !seen.has(String(row.id))) merged.push(row);
  });
  return merged;
};

// A successful read-all confirms only the ids it covered. Anything queued while
// the request was in flight belongs to a later mutation and must survive, so
// the set is narrowed rather than cleared.
export const removeConfirmedPendingIds = (currentIds, confirmedIds) => {
  const next = new Set([...currentIds].map(String));
  confirmedIds.forEach((id) => next.delete(String(id)));
  return next;
};

// Rows the server still reports unread are shown as read locally while their
// mark-read is queued, so the list does not flicker back to unread before the
// PATCH lands.
export const applyPendingReads = (serverRows, pendingReadIds) => serverRows.map(
  (row) => (pendingReadIds.has(String(row.serverId)) ? { ...row, read: true } : row),
);
