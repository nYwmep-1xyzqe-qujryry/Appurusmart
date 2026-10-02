import { getLrdPagination, getLrdRows } from "./lrdResponse";

export const resolveLrdApiState = (payload) => {
  const items = getLrdRows(payload);
  const pagination = getLrdPagination(payload, items);
  return {
    items,
    total: pagination.total,
    pagination,
    source: "api",
    stale: false,
    error: null,
  };
};

export const resolveLrdFailureState = (cached, error) => ({
  items: cached?.items ?? [],
  total: cached?.total ?? 0,
  pagination: null,
  source: cached ? "cache" : "none",
  stale: Boolean(cached),
  error: error ?? null,
});
