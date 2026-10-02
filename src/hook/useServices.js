import { AppState } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { SERVICES_API_ENABLED } from "../config";
import { captureAuthSession, isAuthSessionCurrent, runWithSession, subscribeAuthSession } from "../services/authStorage";
import { readResourceCache, writeResourceCache } from "../services/resourceCache";
import { fetchServices } from "../services/servicesApi";
import { getServiceError, normalizeServices } from "../utils/services";

const CACHE_KEY = "api:services:v1";

const useServices = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(SERVICES_API_ENABLED);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [usingCache, setUsingCache] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(null);
  const queuedForce = useRef(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestSequence.current += 1; };
  }, []);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (!mounted.current || !SERVICES_API_ENABLED) return null;

    if (inFlight.current) {
      if (!force || inFlight.current.force) return inFlight.current.promise;
      if (!queuedForce.current) {
        const queuedSequence = requestSequence.current;
        queuedForce.current = inFlight.current.promise.then(
          () => {
            if (!mounted.current || queuedSequence !== requestSequence.current) return null;
            queuedForce.current = null;
            return refresh({ force: true });
          },
          () => {
            if (!mounted.current || queuedSequence !== requestSequence.current) return null;
            queuedForce.current = null;
            return refresh({ force: true });
          },
        );
      }
      return queuedForce.current;
    }

    const sequence = ++requestSequence.current;
    const request = (async () => {
      const session = await captureAuthSession();
      if (!session?.userId) {
        if (mounted.current && sequence === requestSequence.current) {
          setServices([]);
          setLoading(false);
          setRefreshing(false);
          setUsingCache(false);
        }
        return null;
      }

      const cacheOptions = { scope: session.userId };
      let cached = await readResourceCache(CACHE_KEY, cacheOptions);
      const accessDenied = cached?.data?.accessDenied === true;
      if (accessDenied) cached = null;
      let cachedServices = [];
      try {
        if (cached) cachedServices = normalizeServices(cached.data, { strict: true });
      } catch (_) {
        cached = null;
        // Corrupt cache is ignored; the API response remains authoritative.
      }

      const sessionIsCurrent = await isAuthSessionCurrent(session);
      if (!sessionIsCurrent || sequence !== requestSequence.current) return null;

      if (cached && mounted.current) {
        setServices(cachedServices);
        setUsingCache(true);
        setError(null);
        setLoading(false);
      }
      if (!force && cached?.fresh) return cachedServices;

      if (mounted.current) {
        setError(null);
        if (cached) setRefreshing(true);
        else setLoading(true);
      }

      try {
        const response = await fetchServices({ authSession: session });
        if (!await isAuthSessionCurrent(session) || sequence !== requestSequence.current) return null;

        if (!response.data || !Array.isArray(response.data.data)) throw new Error("Invalid services response");
        const nextServices = normalizeServices(response.data, { strict: true });
        await runWithSession(session, async () => {
          if (!mounted.current || sequence !== requestSequence.current) return;
          await writeResourceCache(CACHE_KEY, nextServices, cacheOptions);
          if (!mounted.current || sequence !== requestSequence.current) return;
          setServices(nextServices);
          setUsingCache(false);
          setError(null);
        });
        return nextServices;
      } catch (requestError) {
        const serviceError = getServiceError(requestError);
        if (accessDenied && serviceError.kind !== "auth") serviceError.kind = "forbidden";
        if (serviceError.kind === "forbidden") {
          await runWithSession(session, () => writeResourceCache(CACHE_KEY, { accessDenied: true }, cacheOptions));
        }
        const current = await isAuthSessionCurrent(session);
        if (mounted.current && current && sequence === requestSequence.current) {
          const authBlocked = serviceError.kind === "auth" || serviceError.kind === "forbidden";
          setError(serviceError);
          setServices(authBlocked ? [] : cachedServices);
          setUsingCache(authBlocked ? false : Boolean(cached));
        }
        return current && serviceError.kind !== "auth" && serviceError.kind !== "forbidden"
          ? cachedServices : null;
      } finally {
        if (mounted.current && sequence === requestSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    const tracked = request.catch((failure) => {
      if (mounted.current && sequence === requestSequence.current) {
        setServices([]);
        setUsingCache(false);
        setError(getServiceError(failure));
        setLoading(false);
        setRefreshing(false);
      }
      return null;
    }).finally(() => {
      if (inFlight.current?.promise === tracked) inFlight.current = null;
    });
    inFlight.current = { promise: tracked, force };
    return tracked;
  }, []);

  useEffect(() => subscribeAuthSession(() => {
    requestSequence.current += 1;
    inFlight.current = null;
    queuedForce.current = null;
    if (!mounted.current) return;
    setServices([]);
    setLoading(SERVICES_API_ENABLED);
    setRefreshing(false);
    setError(null);
    setUsingCache(false);
    if (SERVICES_API_ENABLED) refresh({ force: true });
  }), [refresh]);

  useEffect(() => {
    if (!SERVICES_API_ENABLED) return undefined;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && previousState !== "active") refresh({ force: true });
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [refresh]);

  return {
    services,
    loading,
    refreshing,
    error,
    usingCache,
    apiEnabled: SERVICES_API_ENABLED,
    refresh,
  };
};

export default useServices;
