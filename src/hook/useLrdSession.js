import { useCallback, useEffect, useRef, useState } from "react";
import { getLrd, getLrdErrorMessage, LRD_ENDPOINTS, registerLrdResearcher } from "../services/lrdApi";
import { STORAGE_KEYS } from "../config";
import { getUserScopedValue, setUserScopedValue } from "../services/userScopedStorage";
import {
  getResourceCacheScope,
  readResourceCache,
  writeResourceCache,
} from "../services/resourceCache";

export default function useLrdSession() {
  const mounted = useRef(true);
  const [session, setSession] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [researcherId, setResearcherId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const [connectError, setConnectError] = useState(null);
  const inFlight = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refetch = useCallback(async ({ force = false } = {}) => {
    if (inFlight.current) return inFlight.current;

    const request = (async () => {
      const requestScope = await getResourceCacheScope();
      const cached = await readResourceCache("lrd:session", { scope: requestScope });
      const cacheMatchesAccount = await getResourceCacheScope() === requestScope;
      if (cached?.data?.authenticated && cacheMatchesAccount) {
        const cachedResearcherId = cached.data?.user?.lrd_researcher_id;
        const resolvedResearcherId = cachedResearcherId || await getUserScopedValue(STORAGE_KEYS.LRD_RESEARCHER_ID);
        if (mounted.current) {
          setSession(cached.data);
          setResearcherId(resolvedResearcherId || null);
          setSessionError(null);
          setLoading(false);
        }
      }
      if (!force && cached?.fresh && cacheMatchesAccount) return cached.data;

      try {
        if (!cached && mounted.current) { setLoading(true); setSessionError(null); }
        const response = await getLrd(LRD_ENDPOINTS.session);
        if (!response.data?.authenticated) throw new Error(response.data?.message || "ไม่พบ session ของผู้ใช้");
        if (await getResourceCacheScope() !== requestScope) return null;
        await writeResourceCache("lrd:session", response.data, { scope: requestScope });
        const sessionResearcherId = response.data?.user?.lrd_researcher_id;
        const resolvedResearcherId = sessionResearcherId || await getUserScopedValue(STORAGE_KEYS.LRD_RESEARCHER_ID);
        if (sessionResearcherId) {
          await setUserScopedValue(STORAGE_KEYS.LRD_RESEARCHER_ID, sessionResearcherId);
        }
        if (mounted.current) {
          setSession(response.data);
          setResearcherId(resolvedResearcherId || null);
          setSessionError(null);
        }
        return response.data;
      } catch (requestError) {
        if (!cached && mounted.current) setSessionError(getLrdErrorMessage(requestError));
        return cached?.data ?? null;
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
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const connect = useCallback(async () => {
    if (mounted.current) { setConnecting(true); setConnectError(null); }
    try {
      // A non-empty body avoids IIS 411 Length Required in production.
      const response = await registerLrdResearcher();
      if (!response.data?.registered) throw new Error(response.data?.message || "ลงทะเบียนนักวิจัยไม่สำเร็จ");
      if (!response.data?.researcher_id) throw new Error("ระบบไม่ส่งรหัสนักวิจัยกลับมา");
      await setUserScopedValue(STORAGE_KEYS.LRD_RESEARCHER_ID, response.data.researcher_id);
      if (mounted.current) {
        setRegistration(response.data);
        setResearcherId(response.data.researcher_id);
      }
      await refetch({ force: true });
      return response.data;
    } catch (requestError) {
      const message = getLrdErrorMessage(requestError, "เชื่อมต่อข้อมูลนักวิจัยไม่สำเร็จ");
      if (mounted.current) setConnectError(message);
      throw new Error(message);
    } finally {
      if (mounted.current) setConnecting(false);
    }
  }, [refetch]);

  const connected = Boolean(researcherId);
  return {
    session,
    registration,
    researcherId,
    connected,
    loading,
    connecting,
    error: sessionError,
    connectError,
    refetch,
    connect,
  };
}
