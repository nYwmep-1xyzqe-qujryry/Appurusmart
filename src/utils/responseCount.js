const toCount = (value) => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) {
    return Math.trunc(Number(value));
  }
  return null;
};

export const extractResponseCount = (payload) => {
  const metadataCount = [
    payload?.total,
    payload?.meta?.total,
    payload?.pagination?.total,
    payload?.data?.total,
    payload?.data?.meta?.total,
    payload?.data?.pagination?.total,
    payload?.count,
    payload?.data?.count,
  ].map(toCount).find((value) => value !== null);

  if (metadataCount !== undefined) return metadataCount;

  const rows = [
    payload,
    payload?.data,
    payload?.items,
    payload?.data?.data,
    payload?.data?.items,
  ].find(Array.isArray);

  return rows?.length ?? null;
};
