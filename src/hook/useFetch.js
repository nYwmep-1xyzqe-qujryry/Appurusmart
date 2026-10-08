// Hook สำหรับ GET-only endpoint ที่ไม่ต้องการ CRUD
// const { data, loading, error, refetch } = useFetch("/announcements", { params: {}, initialData: [] })

import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { readResourceCache, writeResourceCache } from "../services/resourceCache";
import { captureAuthSession, isResourceSessionCurrent, runWithSession, subscribeAuthSession } from "../services/authStorage";

const useFetch = (endpoint, options = {}) => {
  const {
    params = {},
    initialData = null,
    skip = false,
    debugLabel = null,
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const inFlight = useRef(null);
  const queuedForce = useRef(null);
  const requestSequence = useRef(0);
  const paramsKey = JSON.stringify(params);
  const cacheKey = `api:${endpoint}:${paramsKey}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      queuedForce.current = null;
    };
  }, []);

  const fetchData = useCallback(async ({ force = false } = {}) => {
    if (skip || !mounted.current) return null;
    if (inFlight.current) {
      if (!force || inFlight.current.force) return inFlight.current.promise;
      if (!queuedForce.current) {
        queuedForce.current = inFlight.current.promise.then(
          () => {
            if (!mounted.current) return null;
            queuedForce.current = null;
            return fetchData({ force: true });
          },
          () => {
            if (!mounted.current) return null;
            queuedForce.current = null;
            return fetchData({ force: true });
          },
        );
      }
      return queuedForce.current;
    }

    const request = (async () => {
      const sequence = ++requestSequence.current;
      const session = await captureAuthSession();
      const cacheOptions = { scope: session?.userId ?? null };
      const cached = await readResourceCache(cacheKey, cacheOptions);
      if (!await isResourceSessionCurrent(session) || sequence !== requestSequence.current) return null;
      if (cached && mounted.current) {
        setData(cached.data);
        setError(null);
        setLoading(false);
      }
      if (!force && cached?.fresh) return cached.data;

      try {
        if (!cached && mounted.current) { setLoading(true); setError(null); }
        const requestStartedAt = Date.now();
        const isAnnouncementRequest = debugLabel?.startsWith("announcements:");
        if (__DEV__ && isAnnouncementRequest) {
          console.log(`[${debugLabel}] request start`);
        }
        const res = await api.get(endpoint, {
          params,
          authSession: session,
          sessionSnapshot: true,
        });
        const result = res.data?.data ?? res.data;
        if (!await isResourceSessionCurrent(session) || sequence !== requestSequence.current) {
          return cached?.data ?? null;
        }
        if (__DEV__ && debugLabel) {
          const firstItem = Array.isArray(result)
            ? result[0]
            : result?.data?.[0] ?? result?.items?.[0] ?? result;
          if (isAnnouncementRequest) {
            const rows = Array.isArray(result)
              ? result
              : result?.data ?? result?.items ?? result?.results ?? [];
            console.log(`[${debugLabel}] response`, {
              status: res.status,
              elapsedMs: Date.now() - requestStartedAt,
              rows: Array.isArray(rows) ? rows.length : 0,
              hasImage: Boolean(firstItem?.image_url || firstItem?.imageUrl),
              hasThumbnail: Boolean(firstItem?.thumbnail_url || firstItem?.thumbnailUrl),
              imageWidth: Number(firstItem?.image_width || firstItem?.imageWidth) || null,
              imageHeight: Number(firstItem?.image_height || firstItem?.imageHeight) || null,
              thumbnailWidth: Number(firstItem?.thumbnail_width || firstItem?.thumbnailWidth) || null,
              thumbnailHeight: Number(firstItem?.thumbnail_height || firstItem?.thumbnailHeight) || null,
            });
          } else {
            console.log(`[${debugLabel}] response`, { status: res.status });
          }
        }
        const committed = await runWithSession(session, async () => {
          await writeResourceCache(cacheKey, result, cacheOptions);
          return true;
        });
        if (committed === undefined) return cached?.data ?? null;
        if (mounted.current && sequence === requestSequence.current && await isResourceSessionCurrent(session)) {
          setData(result);
          setError(null);
        }
        return result;
      } catch (err) {
        if (!await isResourceSessionCurrent(session) || sequence !== requestSequence.current) return cached?.data ?? null;
        if (!cached && mounted.current) {
          setError(err.response?.data?.message ?? err.message ?? "เกิดข้อผิดพลาด");
        }
        return cached?.data ?? null;
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    const tracked = request.finally(() => {
      if (inFlight.current?.promise === tracked) inFlight.current = null;
    });
    inFlight.current = { promise: tracked, force };
    try {
      return await tracked;
    } finally {
      if (queuedForce.current && !mounted.current) queuedForce.current = null;
    }
  }, [cacheKey, debugLabel, endpoint, paramsKey, skip]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => subscribeAuthSession(() => {
    requestSequence.current += 1;
    inFlight.current = null;
    queuedForce.current = null;
    if (mounted.current) {
      setData(initialData);
      setError(null);
      setLoading(!skip);
      fetchData({ force: true });
    }
  }), [fetchData, initialData, skip]);

  return { data, loading, error, refetch: fetchData };
};

export default useFetch;
