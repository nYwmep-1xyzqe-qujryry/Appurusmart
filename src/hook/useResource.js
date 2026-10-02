// Generic CRUD hook — ใช้กับทุก expert form
// const { items, loading, saving, create, update, remove, refetch } = useResource("/awards")
// year ต้องเป็น string ทุก endpoint รวมถึง /researches — ยืนยันจากตัวอย่าง
// POST body ของ /info/expert/researches ที่ backend ส่งมา (year: "2567")

import { useCallback, useEffect, useRef, useState } from "react";
import infoApi from "../services/infoApi";
import { notifyExpertChange } from "../services/expertChanges";
import { readResourceCache, writeResourceCache } from "../services/resourceCache";

const expertEndpoint = (endpoint) => `/info/expert${endpoint}`;

const useResource = (endpoint, options = {}) => {
  const { params = {}, skip = false } = options;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const mounted = useRef(true);
  const inFlight = useRef(null);
  const createLock = useRef(false);
  const updateLock = useRef(false);
  const removeLock = useRef(false);
  const paramsKey = JSON.stringify(params);
  const cacheKey = `expert:${endpoint}:${paramsKey}`;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refetch = useCallback(async ({ force = false } = {}) => {
    if (skip) return;
    if (inFlight.current) return inFlight.current;

    const request = (async () => {
      const cached = await readResourceCache(cacheKey);
      if (cached && mounted.current) {
        setItems(cached.data ?? []);
        setError(null);
        setLoading(false);
      }
      if (!force && cached?.fresh) return cached.data ?? [];

      try {
        if (!cached && mounted.current) { setLoading(true); setError(null); }
        const res = await infoApi.get(expertEndpoint(endpoint), { params });
        const result = res.data?.data ?? res.data;
        const sorted = Array.isArray(result)
          ? [...result].sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0))
          : [];
        await writeResourceCache(cacheKey, sorted);
        if (mounted.current) {
          setItems(sorted);
          setError(null);
        }
        if (__DEV__ && sorted.length > 0) console.log(`[useResource] GET ${endpoint} fields:`, Object.keys(sorted[0]));
        if (__DEV__ && endpoint === "/researches") {
          console.log("[useResource] GET /researches response sample:", JSON.stringify(sorted[0] ?? null));
        }
        return sorted;
      } catch (err) {
        if (__DEV__) console.warn(`[useResource] GET ${endpoint} ล้มเหลว:`, err?.response?.status, err.message);
        if (!cached && mounted.current) setError(err.response?.data?.message ?? err.message ?? "โหลดข้อมูลไม่สำเร็จ");
        return cached?.data ?? [];
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    inFlight.current = request;
    try {
      return await request;
    } finally {
      if (inFlight.current === request) {
        inFlight.current = null;
      }
    }
  }, [cacheKey, endpoint, paramsKey, skip]);

  useEffect(() => { refetch(); }, [refetch]);

  const normalizePayload = (data) => {
    if (!data || typeof data !== "object") return data;
    const out = { ...data };
    if (out.year !== undefined && out.year !== null) out.year = String(out.year);
    return out;
  };

  const extractMessage = (err, fallback) => {
    const d = err.response?.data;
    if (!d) return err.message ?? fallback;
    if (d.message) return d.message;
    if (d.errors) {
      const first = Object.values(d.errors).flat()[0];
      if (first) return first;
    }
    return err.message ?? fallback;
  };

  const create = useCallback(async (data) => {
    if (createLock.current) return null;
    createLock.current = true;
    setSaving(true);
    try {
      const res = await infoApi.post(expertEndpoint(endpoint), normalizePayload(data));
      notifyExpertChange(endpoint);
      await refetch({ force: true });
      return res.data?.data ?? res.data;
    } catch (err) {
      if (__DEV__) console.warn(`[useResource] POST ${endpoint} body:`, JSON.stringify(err.response?.data));
      throw new Error(extractMessage(err, "บันทึกไม่สำเร็จ"));
    } finally {
      createLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [endpoint, refetch]);

  const update = useCallback(async (id, data) => {
    if (updateLock.current) return null;
    updateLock.current = true;
    setSaving(true);
    try {
      const res = await infoApi.put(`${expertEndpoint(endpoint)}/${id}`, normalizePayload(data));
      notifyExpertChange(endpoint);
      await refetch({ force: true });
      return res.data?.data ?? res.data;
    } catch (err) {
      if (__DEV__) console.warn(`[useResource] PUT ${endpoint}/${id} body:`, JSON.stringify(err.response?.data));
      throw new Error(extractMessage(err, "แก้ไขไม่สำเร็จ"));
    } finally {
      updateLock.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [endpoint, refetch]);

  const remove = useCallback(async (id) => {
    if (removeLock.current) return null;
    removeLock.current = true;
    setRemoving(true);
    try {
      await infoApi.delete(`${expertEndpoint(endpoint)}/${id}`);
      notifyExpertChange(endpoint);
      await refetch({ force: true });
    } catch (err) {
      throw new Error(extractMessage(err, "ลบไม่สำเร็จ"));
    } finally {
      removeLock.current = false;
      if (mounted.current) setRemoving(false);
    }
  }, [endpoint, refetch]);

  return { items, loading, error, saving, removing, create, update, remove, refetch };
};

export default useResource;
