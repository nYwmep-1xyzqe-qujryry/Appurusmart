// รายการความสนใจจาก /ref/search-options ไม่ค่อยเปลี่ยน — cache ไว้ใน module
// เพื่อไม่ให้หน้า ExpertHome (ค้นหา) กับ InterestForm (จัดการข้อมูล) ต้อง fetch ซ้ำ
import { useEffect, useRef, useState } from "react";
import infoApi from "../services/infoApi";

let cache = null;
let inflight = null;

const normalizeInterestOptions = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((interest) => {
      if (typeof interest === "string") {
        return { id: interest, label: interest };
      }

      const label =
        interest?.name ??
        interest?.label ??
        interest?.interest_name ??
        interest?.interest_name_th ??
        interest?.interest_name_en ??
        interest?.title;
      const id =
        interest?.id ??
        interest?.interest_id ??
        interest?.value ??
        label;

      return label ? { id, label } : null;
    })
    .filter(Boolean);

// Exported so the list can be warmed before a screen needs it: a form that
// opens while this is still in flight cannot tell an entry chosen from the
// list apart from one typed by hand, and reopens the wrong input.
export const prefetchInterestOptions = () => fetchInterestOptions().catch(() => []);

const fetchInterestOptions = async () => {
  if (cache) return cache;
  if (!inflight) {
    inflight = infoApi
      .get("/info/expert/ref/search-options")
      .then((res) => {
        const body = res.data ?? {};
        const rows = body.interests ?? body.data?.interests ?? body.data ?? [];
        cache = normalizeInterestOptions(rows);
        return cache;
      })
      // A rejection deliberately leaves the cache unset, so the next screen
      // retries rather than inheriting an empty list.
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

const useInterestOptions = () => {
  const [options, setOptions] = useState(cache ?? []);
  const [loading, setLoading] = useState(!cache);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (cache) return;
    fetchInterestOptions()
      .then((result) => {
        if (mounted.current) setOptions(result);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, []);

  return { options, loading };
};

export default useInterestOptions;
