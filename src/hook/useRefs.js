// Hook สำหรับ dropdown reference data (degrees, journalTypes ฯลฯ)
// ข้อมูลพวกนี้ไม่ค่อยเปลี่ยน — cache ไว้ใน module เพื่อไม่ให้ fetch ซ้ำทุกครั้งที่เปิดฟอร์ม
//
// Info API reference endpoints สำหรับ dropdown ของ Expert module

import { useEffect, useRef, useState } from "react";
import infoApi from "../services/infoApi";
import { readResourceCache, writeResourceCache } from "../services/resourceCache";

const cache = {};

const fetchRef = async (path) => {
  if (cache[path]) return cache[path];
  const cached = await readResourceCache(`expert:ref:${path}`);
  if (cached) {
    cache[path] = Array.isArray(cached.data) ? cached.data : [];
    if (cached.fresh) return cache[path];
  }
  const res = await infoApi.get(path);
  const data = res.data?.data ?? res.data ?? [];
  const arr = Array.isArray(data) ? data : [];
  if (__DEV__ && arr.length > 0 && arr[0].id === undefined) {
    console.warn(`[useRefs] ${path}: items มีไม่มี field 'id' — fields ที่มี:`, Object.keys(arr[0]));
  }
  cache[path] = arr;
  await writeResourceCache(`expert:ref:${path}`, arr);
  return cache[path];
};

const useRefs = () => {
  const [refs, setRefs] = useState({
    degrees: [],
    journalTypes: [],
    researchTypes: [],
    researchLevels: [],
    researchPmuTypes: [],
  });
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const load = async () => {
      const keys = ["degrees", "journalTypes", "researchTypes", "researchLevels", "researchPmuTypes"];
      const paths = [
        "/info/expert/ref/degrees",
        "/info/expert/ref/journal-types",
        "/info/expert/ref/research-types",
        "/info/expert/ref/research-levels",
        "/info/expert/ref/research-pmu-types",
      ];
      const results = await Promise.allSettled(paths.map((p) => fetchRef(p)));
      if (!mounted.current) return;
      const merged = {};
      results.forEach((r, i) => {
        merged[keys[i]] = r.status === "fulfilled" ? r.value : [];
        if (r.status === "rejected" && __DEV__) console.warn(`[useRefs] โหลด ${paths[i]} ไม่สำเร็จ:`, r.reason?.message);
      });
      setRefs((prev) => ({ ...prev, ...merged }));
      setLoading(false);
    };
    load();
  }, []);

  return { ...refs, loading };
};

export default useRefs;
