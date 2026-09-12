import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { deleteLrd, getLrd, getLrdErrorMessage, patchLrd, postLrd } from "../services/lrdApi";
import { getLrdRows, getLrdTotal } from "../utils/lrdResponse";

export default function useLrdResource(endpoint, options = {}) {
  const {
    params = {}, skip = false, loadOnFocus = true, refetchAfterMutation = true,
  } = options;
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(!skip && loadOnFocus);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const mutationLock = useRef(false);
  const paramsKey = JSON.stringify(params);

  useEffect(() => () => { mounted.current = false; }, []);

  const refetch = useCallback(async () => {
    if (skip) {
      if (mounted.current) { setLoading(false); setItems([]); setTotal(0); }
      return [];
    }
    if (mounted.current) { setLoading(true); setError(null); }
    try {
      const response = await getLrd(endpoint, { params });
      const rows = getLrdRows(response.data);
      if (__DEV__ && endpoint.includes("expertise")) {
        console.log("[expertise GET]", JSON.stringify(response.data).slice(0, 400));
      }
      if (mounted.current) {
        setItems(rows);
        setTotal(getLrdTotal(response.data, rows));
      }
      return rows;
    } catch (requestError) {
      const message = getLrdErrorMessage(requestError, "โหลดข้อมูลไม่สำเร็จ");
      if (mounted.current) setError(message);
      return [];
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [endpoint, paramsKey, skip]);

  useFocusEffect(useCallback(() => {
    if (loadOnFocus) refetch();
  }, [loadOnFocus, refetch]));

  const mutate = useCallback(async (request, busySetter, fallback) => {
    if (mutationLock.current) return null;
    mutationLock.current = true;
    if (mounted.current) busySetter(true);
    try {
      const response = await request();
      if (refetchAfterMutation) await refetch();
      return response.data?.data ?? response.data;
    } catch (requestError) {
      throw new Error(getLrdErrorMessage(requestError, fallback));
    } finally {
      mutationLock.current = false;
      if (mounted.current) busySetter(false);
    }
  }, [refetch, refetchAfterMutation]);

  const create = useCallback((data) =>
    mutate(() => postLrd(endpoint, data), setSaving, "บันทึกไม่สำเร็จ"), [endpoint, mutate]);
  const update = useCallback((id, data) =>
    mutate(() => patchLrd(`${endpoint}/${encodeURIComponent(id)}`, data), setSaving, "แก้ไขไม่สำเร็จ"), [endpoint, mutate]);
  const remove = useCallback((id) =>
    mutate(() => deleteLrd(`${endpoint}/${encodeURIComponent(id)}`), setRemoving, "ลบไม่สำเร็จ"), [endpoint, mutate]);

  return { items, total, loading, saving, removing, error, create, update, remove, refetch };
}
