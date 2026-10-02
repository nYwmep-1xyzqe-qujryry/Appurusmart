const getReceivedTime = (item) => {
  const value = new Date(item?.receivedAt ?? 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

export const getAnnouncementId = (item) => {
  const value = item?.data?.announcement_id ?? item?.data?.announcementId;
  return value == null || value === "" ? null : String(value);
};

// Corrects the server's unread_count for state the server does not know about.
//
// Hiding a row locally and owing the server a correction are different things,
// and conflating them is wrong: a dismissal captured as "was unread" cannot be
// subtracted forever. The server may mark that row read from another device,
// a read-all may clear it, or the row may be deleted — in each case the
// server's own count already drops, and subtracting again makes a later unread
// notification show no badge.
//
// So the correction is derived from live server state, never from a stored
// guess. `serverRows` is every row in this page INCLUDING dismissed ones: a
// dismissed row still present there carries its current `read` flag, so it is
// subtracted only while the server itself still counts it as unread.
//
// Dismissed rows that are absent from the page are deliberately NOT corrected
// for. Their state is unknowable — deleted, read elsewhere, or merely past
// per_page all look identical — and guessing re-creates this bug. The badge
// may therefore read high by the number of such rows; that is the honest
// failure direction, and fixing it needs a backend contract (see below).
//
// Returns null when the server sent no count, meaning "unknown" — callers must
// not substitute the number of rows they happened to load, since the response
// is one page of a possibly longer list.
export const getCorrectedUnreadCount = ({
  serverUnreadCount,
  serverRows = [],
  dismissedIds = new Set(),
  pendingReadIds = new Set(),
}) => {
  if (serverUnreadCount == null) return null;

  const dismissedUnreadCount = serverRows.filter(
    (row) => dismissedIds.has(String(row.id)) && !row.read,
  ).length;
  // A row that is both dismissed and pending-read must only be counted once.
  const pendingUnreadCount = serverRows.filter(
    (row) => !dismissedIds.has(String(row.id))
      && pendingReadIds.has(String(row.serverId))
      && !row.read,
  ).length;

  return Math.max(0, serverUnreadCount - pendingUnreadCount - dismissedUnreadCount);
};

// The authenticated server response is authoritative for server-backed rows.
// Preserve only legacy local rows that have no server id of their own.
export const mergeNotificationInbox = (current, serverItems, dismissedIds = new Set()) => {
  const serverIds = new Set(serverItems.map((item) => String(item.id)));
  const normalizedServerItems = serverItems.filter(
    (item) => !dismissedIds.has(String(item.id)),
  );
  const localOnly = current.filter(
    (item) => !item.serverId && !serverIds.has(String(item.id)) && !dismissedIds.has(String(item.id)),
  );

  return [...normalizedServerItems, ...localOnly]
    .sort((a, b) => getReceivedTime(b) - getReceivedTime(a))
    .slice(0, 100);
};
