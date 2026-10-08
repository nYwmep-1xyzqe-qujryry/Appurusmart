import { useCallback, useEffect, useRef, useState } from "react";
import { getLrd, getLrdErrorMessage, LRD_ENDPOINTS, registerLrdResearcher } from "../services/lrdApi";
import { STORAGE_KEYS } from "../config";
import {
  getUserScopedValueForSession,
  setUserScopedValueForSession,
} from "../services/userScopedStorage";
import {
  readResourceCache,
  writeResourceCache,
} from "../services/resourceCache";
import { captureAuthSession, isResourceSessionCurrent, runWithSession, subscribeAuthSession } from "../services/authStorage";

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
  const requestSequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refetch = useCallback(async ({ force = false } = {}) => {
    if (inFlight.current) return inFlight.current;

    const request = (async () => {
      const sequence = ++requestSequence.current;
      const requestSession = await captureAuthSession();
      const requestScope = requestSession?.userId ?? null;
      const cached = await readResourceCache("lrd:session", { scope: requestScope });
      const cacheMatchesAccount = await isResourceSessionCurrent(requestSession);
      if (sequence !== requestSequence.current || !cacheMatchesAccount) return null;
      if (cached?.data?.authenticated && cacheMatchesAccount) {
        const cachedResearcherId = cached.data?.user?.lrd_researcher_id;
        const resolvedResearcherId = await runWithSession(requestSession, async () =>
          cachedResearcherId || await getUserScopedValueForSession(STORAGE_KEYS.LRD_RESEARCHER_ID, requestSession),
        );
        if (resolvedResearcherId !== undefined && mounted.current && sequence === requestSequence.current) {
          setSession(cached.data);
          setResearcherId(resolvedResearcherId || null);
          setSessionError(null);
          setLoading(false);
        }
      }
      if (!force && cached?.fresh && cacheMatchesAccount) return cached.data;

      try {
        if (!cached && mounted.current) { setLoading(true); setSessionError(null); }
        const response = await getLrd(LRD_ENDPOINTS.session, {
          authSession: requestSession,
          sessionSnapshot: true,
        });
        if (!response.data?.authenticated) throw new Error(response.data?.message || "ไม่พบ session ของผู้ใช้");
        if (sequence !== requestSequence.current || !await isResourceSessionCurrent(requestSession)) return null;
        const sessionResearcherId = response.data?.user?.lrd_researcher_id;
        const committed = await runWithSession(requestSession, async () => {
          await writeResourceCache("lrd:session", response.data, { scope: requestScope });
          const storedResearcherId = sessionResearcherId
            || await getUserScopedValueForSession(STORAGE_KEYS.LRD_RESEARCHER_ID, requestSession);
          if (sessionResearcherId) {
            await setUserScopedValueForSession(STORAGE_KEYS.LRD_RESEARCHER_ID, requestSession, sessionResearcherId);
          }
          return storedResearcherId || null;
        });
        if (committed !== undefined && mounted.current && sequence === requestSequence.current) {
          setSession(response.data);
          setResearcherId(committed);
          setSessionError(null);
        }
        if (committed === undefined) return cached?.data ?? null;
        return response.data;
      } catch (requestError) {
        if (sequence !== requestSequence.current || !await isResourceSessionCurrent(requestSession)) return cached?.data ?? null;
        if (!cached && mounted.current) setSessionError(getLrdErrorMessage(requestError));
        return cached?.data ?? null;
      } finally {
        if (mounted.current && sequence === requestSequence.current) setLoading(false);
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

  useEffect(() => subscribeAuthSession(() => {
    requestSequence.current += 1;
    inFlight.current = null;
    if (!mounted.current) return;
    setSession(null);
    setRegistration(null);
    setResearcherId(null);
    setSessionError(null);
    setLoading(true);
    refetch({ force: true });
  }), [refetch]);

  const connect = useCallback(async () => {
    if (mounted.current) { setConnecting(true); setConnectError(null); }
    try {
      // A non-empty body avoids IIS 411 Length Required in production.
      const requestSession = await captureAuthSession();
      if (!requestSession) throw new Error("ไม่พบ session ของผู้ใช้");
      const response = await registerLrdResearcher({
        authSession: requestSession,
        sessionSnapshot: true,
      });
      if (!response.data?.registered) throw new Error(response.data?.message || "ลงทะเบียนนักวิจัยไม่สำเร็จ");
      if (!response.data?.researcher_id) throw new Error("ระบบไม่ส่งรหัสนักวิจัยกลับมา");
      const committed = await runWithSession(requestSession, async () => {
        await setUserScopedValueForSession(
          STORAGE_KEYS.LRD_RESEARCHER_ID,
          requestSession,
          response.data.researcher_id,
        );
        return true;
      });
      if (committed === undefined) throw new Error("Session changed");
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
