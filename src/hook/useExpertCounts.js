import { useCallback, useEffect, useRef, useState } from "react";
import infoApi from "../services/infoApi";
import { captureAuthSession, isAuthSessionCurrent, subscribeAuthSession } from "../services/authStorage";
import { subscribeExpertChanges } from "../services/expertChanges";
import { extractResponseCount } from "../utils/responseCount";

export default function useExpertCounts(endpoints) {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const versions = useRef({});
  const epoch = useRef(0);

  const refetch = useCallback(async ({ endpoint } = {}) => {
    const currentEpoch = epoch.current;
    const selected = endpoints.filter((entry) => !endpoint || entry.path === endpoint);
    // Reserve versions before any await so an older request cannot overwrite a mutation refresh.
    const requests = selected.map((entry) => ({
      ...entry,
      version: (versions.current[entry.key] = (versions.current[entry.key] ?? 0) + 1),
    }));
    const session = await captureAuthSession();
    if (!mounted.current || currentEpoch !== epoch.current) return;
    if (!session) { setCounts({}); setLoading(false); return; }
    await Promise.all(requests.map(async ({ key, path, version }) => {
      let count = null;
      try {
        const response = await infoApi.get(`/info/expert${path}`, { authSession: session });
        count = extractResponseCount(response.data);
      } catch (_) {
        // A failed count is unknown, not zero and not a confirmed stale value.
      }
      if (await isAuthSessionCurrent(session) && mounted.current &&
          currentEpoch === epoch.current && versions.current[key] === version) {
        setCounts((previous) => ({ ...previous, [key]: count }));
      }
    }));
    if (mounted.current && currentEpoch === epoch.current) setLoading(false);
  }, [endpoints]);

  useEffect(() => {
    mounted.current = true;
    const unsubscribeChanges = subscribeExpertChanges((endpoint) => { void refetch({ endpoint }); });
    const unsubscribeSession = subscribeAuthSession(() => {
      epoch.current += 1;
      setCounts({});
      setLoading(true);
      void refetch();
    });
    void refetch();
    return () => {
      mounted.current = false;
      epoch.current += 1;
      unsubscribeChanges();
      unsubscribeSession();
    };
  }, [refetch]);

  return { counts, loading, refetch };
}
