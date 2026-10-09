import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { deleteLrd, getLrd, getLrdErrorMessage, LRD_ENDPOINTS, patchLrd, postLrd } from "../services/lrdApi";
import { notifyLrdChange } from "../services/lrdChanges";
import { INFO_API_BASE_URL } from "../config";
import { getLrdCacheAgeMs, getSafeLrdErrorDetails, createLrdRequestId, summarizeLrdOwnership, summarizeLrdParams } from "../utils/lrdDiagnostics";
import { resolveLrdApiState, resolveLrdFailureState } from "../utils/lrdResourceState";
import { orderLrdRowsByCreation } from "../utils/lrdResponse";
import {
  invalidateResourceCache,
  readResourceCache,
  writeResourceCache,
} from "../services/resourceCache";
import { captureAuthSession, isResourceSessionCurrent, runWithSession, subscribeAuthSession } from "../services/authStorage";

const EMPTY_CACHE_INFO = { source: "none", updatedAt: null, stale: false, refreshError: null };
const ORDERED_ENDPOINTS = new Set([LRD_ENDPOINTS.researches, LRD_ENDPOINTS.papers]);

const orderResourceRows = (endpoint, rows) => (
  ORDERED_ENDPOINTS.has(endpoint) ? orderLrdRowsByCreation(rows) : rows
);

export default function useLrdResource(endpoint, options = {}) {
  const {
    params = {}, skip = false, loadOnFocus = true, forceRefreshOnFocus = false,
    refetchAfterMutation = true, diagnosticOwnerId = null,
  } = options;
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(!skip && loadOnFocus);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(EMPTY_CACHE_INFO);
  const mounted = useRef(true);
  const mutationLock = useRef(false);
  const cacheScopeRef = useRef(null);
  const paramsKey = JSON.stringify(params);
  const cacheKey = `lrd:${endpoint}:${paramsKey}`;
  const resourceCachePrefix = `lrd:${endpoint}:`;
  const requestState = useRef(null);
  const requestGeneration = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestState.current = null;
      requestGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    requestGeneration.current += 1;
    requestState.current = null;
    setItems([]);
    setTotal(0);
    setError(null);
    setCacheInfo(EMPTY_CACHE_INFO);
  }, [cacheKey]);

  const refetch = useCallback(async ({ force = false } = {}) => {
    if (skip) {
      if (mounted.current) { setLoading(false); setItems([]); setTotal(0); }
      return [];
    }
    const current = requestState.current;
    if (current?.cacheKey === cacheKey) {
      if (!force) return current.promise;
      requestGeneration.current += 1;
      requestState.current = null;
    }
    const generation = requestGeneration.current;
    const active = () => mounted.current && generation === requestGeneration.current;

    const startRequest = (forceRequest) => {
      const state = { cacheKey };
      const request = (async () => {
        const requestId = createLrdRequestId();
        const requestSession = await captureAuthSession();
        const requestScope = requestSession?.userId ?? null;
        const scopeChanged = cacheScopeRef.current !== null && cacheScopeRef.current !== requestScope;
        cacheScopeRef.current = requestScope;
        if (scopeChanged && active()) {
          setItems([]);
          setTotal(0);
          setError(null);
          setCacheInfo(EMPTY_CACHE_INFO);
        }
        const cached = await readResourceCache(cacheKey, { scope: requestScope });
        const cachedItems = orderResourceRows(endpoint, cached?.data?.items ?? []);
        const sameAccount = () => isResourceSessionCurrent(requestSession);
        const cacheMatchesAccount = await sameAccount();
        const cacheAgeMs = getLrdCacheAgeMs(cached?.updatedAt);
        if (cached && active() && cacheMatchesAccount) {
          setItems(cachedItems);
          setTotal(cached.data?.total ?? 0);
          setError(null);
          setCacheInfo({
            source: "cache",
            updatedAt: cached.updatedAt ?? null,
            stale: false,
            refreshError: null,
          });
          setLoading(false);
          if (__DEV__) {
            console.log("[LRD cache]", {
              requestId,
              baseURL: INFO_API_BASE_URL,
              endpoint,
              ...summarizeLrdParams(params),
              source: "cache",
              cacheAgeMs,
              ...(diagnosticOwnerId == null ? {} : { ownership: summarizeLrdOwnership(cached.data?.items, diagnosticOwnerId) }),
            });
          }
        }
        if (!forceRequest && cached?.fresh && cacheMatchesAccount) return cachedItems;

        try {
          if (!cached && active()) { setLoading(true); setError(null); setCacheInfo(EMPTY_CACHE_INFO); }
          const response = await getLrd(endpoint, {
            params,
            lrdRequestId: requestId,
            authSession: requestSession,
            sessionSnapshot: true,
          });
          const apiState = resolveLrdApiState(response.data);
          const { pagination } = apiState;
          const rows = orderResourceRows(endpoint, apiState.items);
          if (__DEV__) {
            console.log("[LRD response]", {
              requestId,
              baseURL: INFO_API_BASE_URL,
              endpoint,
              status: response.status,
              ...summarizeLrdParams(params),
              total: pagination.total,
              current_page: pagination.currentPage,
              per_page: pagination.perPage,
              last_page: pagination.lastPage,
              rows: rows.length,
              source: "api",
              ...(diagnosticOwnerId == null ? {} : { ownership: summarizeLrdOwnership(rows, diagnosticOwnerId) }),
              // Key names only. Which fields the endpoint returns is the thing
              // that has to be checked against the web report; the values are
              // personal data and never belong in a log.
              fields: rows[0] ? Object.keys(rows[0]).sort() : [],
            });
          }
          if (!active() || !(await sameAccount())) return cached?.data?.items ?? [];
          const cacheEntry = await runWithSession(requestSession, () =>
            writeResourceCache(cacheKey, { items: rows, total: pagination.total }, { scope: requestScope }),
          );
          if (cacheEntry === undefined) return cached?.data?.items ?? [];
          if (active() && await sameAccount()) {
            setItems(rows);
            setTotal(pagination.total);
            setError(null);
            setCacheInfo({
              source: "api",
              updatedAt: cacheEntry?.updatedAt ?? Date.now(),
              stale: false,
              refreshError: null,
            });
          }
          return rows;
        } catch (requestError) {
          const details = getSafeLrdErrorDetails(requestError);
          const message = getLrdErrorMessage(requestError, "โหลดข้อมูลไม่สำเร็จ");
          const authDenied = details.status === 401 || details.status === 403;
          const failureState = resolveLrdFailureState(
            authDenied || !cached ? null : { ...cached.data, items: cachedItems },
            message,
          );
          if (__DEV__) {
            console.warn("[LRD resource]", {
              requestId,
              baseURL: INFO_API_BASE_URL,
              endpoint,
              ...summarizeLrdParams(params),
              status: details.status,
              rows: failureState.items.length,
              source: failureState.source,
              cacheAgeMs,
              ...(diagnosticOwnerId == null ? {} : { ownership: summarizeLrdOwnership(failureState.items, diagnosticOwnerId) }),
              validationFields: details.fields,
              message: details.message,
            });
          }
          if (active() && await sameAccount()) {
            setItems(failureState.items);
            setTotal(failureState.total);
            setError(message);
            setCacheInfo(failureState.stale
              ? {
                  source: "cache",
                  updatedAt: cached.updatedAt ?? null,
                  stale: true,
                  refreshError: message,
                }
              : EMPTY_CACHE_INFO);
          }
          return failureState.items;
        } finally {
          if (active()) setLoading(false);
        }
      })();
      state.promise = request;
      requestState.current = state;
      request.then(
        () => { if (requestState.current === state) requestState.current = null; },
        () => {
          if (requestState.current !== state) return;
          requestState.current = null;
        },
      );
      return request;
    };

    return startRequest(force);
  }, [cacheKey, diagnosticOwnerId, endpoint, paramsKey, skip]);

  useEffect(() => subscribeAuthSession(() => {
    requestGeneration.current += 1;
    requestState.current = null;
    cacheScopeRef.current = null;
    if (!mounted.current) return;
    setItems([]);
    setTotal(0);
    setError(null);
    setCacheInfo(EMPTY_CACHE_INFO);
    if (!skip && loadOnFocus) refetch({ force: true });
  }), [loadOnFocus, refetch, skip]);

  useFocusEffect(useCallback(() => {
    if (loadOnFocus) refetch({ force: forceRefreshOnFocus });
  }, [forceRefreshOnFocus, loadOnFocus, refetch]));

  const mutate = useCallback(async (request, busySetter, fallback) => {
    if (mutationLock.current) return null;
    const mutationSession = await captureAuthSession();
    if (!mutationSession) throw new Error("ไม่พบ session ของผู้ใช้");
    mutationLock.current = true;
    if (mounted.current) busySetter(true);
    try {
      const response = await request(mutationSession);
      if (!await isResourceSessionCurrent(mutationSession)) {
        throw Object.assign(new Error("Session changed"), { code: "ERR_CANCELED" });
      }
      await invalidateResourceCache(resourceCachePrefix, { scope: mutationSession.userId });
      notifyLrdChange(endpoint);
      if (refetchAfterMutation) await refetch({ force: true });
      return response.data?.data ?? response.data;
    } catch (requestError) {
      throw new Error(getLrdErrorMessage(requestError, fallback));
    } finally {
      mutationLock.current = false;
      if (mounted.current) busySetter(false);
    }
  }, [refetch, refetchAfterMutation, resourceCachePrefix]);

  const create = useCallback((data) =>
    mutate((session) => postLrd(endpoint, data, { authSession: session, sessionSnapshot: true }), setSaving, "บันทึกไม่สำเร็จ"), [endpoint, mutate]);
  const update = useCallback((id, data) =>
    mutate((session) => patchLrd(`${endpoint}/${encodeURIComponent(id)}`, data, { authSession: session, sessionSnapshot: true }), setSaving, "แก้ไขไม่สำเร็จ"), [endpoint, mutate]);
  const remove = useCallback((id) =>
    mutate((session) => deleteLrd(`${endpoint}/${encodeURIComponent(id)}`, { authSession: session, sessionSnapshot: true }), setRemoving, "ลบไม่สำเร็จ"), [endpoint, mutate]);

  return { items, total, loading, saving, removing, error, cacheInfo, create, update, remove, refetch };
}
