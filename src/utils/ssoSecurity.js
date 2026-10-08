const ENTRY_PATHS = new Set(["/auth/redirect"]);
const CALLBACK_PATHS = new Set(["/auth/callback"]);

const parseUrl = (value) => {
  try {
    return new URL(String(value ?? ""));
  } catch (_) {
    return null;
  }
};

const normalizedPath = (pathname = "") => {
  const value = String(pathname || "/").replace(/\/+$/, "");
  return value || "/";
};

export const isAllowedSsoCallbackPath = (pathname) => CALLBACK_PATHS.has(normalizedPath(pathname));
export const isAllowedSsoEntryPath = (pathname) => ENTRY_PATHS.has(normalizedPath(pathname));

const isTrustedBackendUrl = (url, backendHost, allowHttp = false, expectedPort = null) => {
  const parsed = parseUrl(url);
  if (!parsed || parsed.hostname.toLowerCase() !== String(backendHost || "").toLowerCase()) return false;
  if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) return false;
  if (expectedPort != null && parsed.port !== String(expectedPort)) return false;
  return parsed;
};

export const isTrustedSsoCallbackUrl = (url, backendHost, allowHttp = false, expectedPort = null) => {
  const parsed = isTrustedBackendUrl(url, backendHost, allowHttp, expectedPort);
  return Boolean(parsed && isAllowedSsoCallbackPath(parsed.pathname));
};

export const isTrustedSsoMessageUrl = (url, backendHost, allowHttp = false, expectedPort = null) => {
  const parsed = isTrustedBackendUrl(url, backendHost, allowHttp, expectedPort);
  return Boolean(parsed && (
    isAllowedSsoCallbackPath(parsed.pathname) || isAllowedSsoEntryPath(parsed.pathname)
  ));
};

export const extractSsoToken = (url, backendHost, allowHttp = false, expectedPort = null) => {
  const parsed = isTrustedBackendUrl(url, backendHost, allowHttp, expectedPort);
  if (!parsed || (!isAllowedSsoCallbackPath(parsed.pathname) && !isAllowedSsoEntryPath(parsed.pathname))) return null;
  return parsed.searchParams.get("token")
    || parsed.searchParams.get("access_token")
    || parsed.searchParams.get("ssoToken")
    || parsed.searchParams.get("passportToken")
    || null;
};
