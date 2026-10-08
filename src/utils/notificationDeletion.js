export const normalizeNotificationIds = (ids) => [...new Set(
  (Array.isArray(ids) ? ids : [ids])
    .filter((id) => id != null && id !== "")
    .map(String),
)];

export const getDismissedUnreadCount = (items, selectedIds) => {
  const selected = new Set(selectedIds);
  return items.filter((item) => selected.has(String(item.id)) && !item.read).length;
};

export const filterDismissedNotifications = (items, selectedIds) => {
  const selected = new Set(selectedIds);
  return items.filter((item) => !selected.has(String(item.id)));
};
