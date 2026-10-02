const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const asNonNegativeInteger = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
};

const isRowList = (value) => Array.isArray(value) && value.every(isRecord);

const getCreationTime = (row) => {
  const value = row?.created_at ?? row?.createdAt;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getNumericId = (row) => {
  if (typeof row?.id !== "number" && typeof row?.id !== "string") return null;
  const id = Number(row.id);
  return Number.isSafeInteger(id) ? id : null;
};

export const orderLrdRowsByCreation = (rows) => {
  if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows.slice() : [];
  const entries = rows.map((row, index) => ({
    row,
    index,
    createdAt: getCreationTime(row),
    id: getNumericId(row),
  }));
  const hasCompleteCreationTime = entries.every((entry) => entry.createdAt !== null);
  const hasCompleteNumericId = entries.every((entry) => entry.id !== null);
  if (!hasCompleteCreationTime && !hasCompleteNumericId) return rows.slice();

  entries.sort((a, b) => {
    if (hasCompleteCreationTime && a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    if (hasCompleteNumericId && a.id !== b.id) return a.id - b.id;
    return a.index - b.index;
  });
  return entries.map((entry) => entry.row);
};

export const getLrdRows = (payload) => {
  const value = payload?.data ?? payload;
  if (isRowList(value)) return value;
  if (isRecord(value) && isRowList(value.data)) return value.data;
  throw new Error("Invalid LRD collection response");
};

export const getLrdPagination = (payload, rows = getLrdRows(payload)) => {
  const value = payload?.data ?? payload;
  const meta = isRecord(payload?.meta) ? payload.meta : {};
  const nestedMeta = isRecord(value?.meta) ? value.meta : {};
  const total = [payload?.total, meta.total, value?.total, nestedMeta.total]
    .map(asNonNegativeInteger)
    .find((candidate) => candidate !== null);
  const currentPage = [
    payload?.current_page,
    payload?.currentPage,
    meta.current_page,
    meta.currentPage,
    value?.current_page,
    value?.currentPage,
    nestedMeta.current_page,
    nestedMeta.currentPage,
  ].map(asNonNegativeInteger).find((candidate) => candidate !== null);
  const perPage = [
    payload?.per_page,
    payload?.perPage,
    meta.per_page,
    meta.perPage,
    value?.per_page,
    value?.perPage,
    nestedMeta.per_page,
    nestedMeta.perPage,
  ].map(asNonNegativeInteger).find((candidate) => candidate !== null);
  const lastPage = [
    payload?.last_page,
    payload?.lastPage,
    meta.last_page,
    meta.lastPage,
    value?.last_page,
    value?.lastPage,
    nestedMeta.last_page,
    nestedMeta.lastPage,
  ].map(asNonNegativeInteger).find((candidate) => candidate !== null);

  return {
    total: total ?? rows.length,
    currentPage: currentPage ?? null,
    perPage: perPage ?? null,
    lastPage: lastPage ?? null,
  };
};

export const getLrdTotal = (payload, rows = getLrdRows(payload)) =>
  getLrdPagination(payload, rows).total;
