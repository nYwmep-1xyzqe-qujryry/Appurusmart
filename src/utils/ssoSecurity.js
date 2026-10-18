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

// What Android actually sends as a message's source, and why a URL match is
// not enough on its own.
//
// react-native-webview 13.16.1 calls onMessage with sourceOrigin.toString()
// (RNCWebView.java:256), which is an origin — "https://urusmart.uru.ac.th" —
// with no path. The same field can also arrive empty or as "about:blank".
// None of those match a credential URL, so the only valid SSO message was
// being discarded and sign-in waited out its timeout with the token one
// check away.
//
// An origin alone proves the page is on the backend, not that it is the
// callback, so it is never sufficient by itself: it is accepted only while
// the WebView is known to be sitting on a credential page. That context is
// recorded from top-level navigation, which the app controls, and carries
// the SSO generation so an event from an abandoned attempt cannot authorize
// a message in a later one.
export const isTrustedSsoOrigin = (
  value,
  backendHost,
  allowHttp = false,
  expectedPort = null,
) => {
  const parsed = isTrustedBackendUrl(value, backendHost, allowHttp, expectedPort);
  // Origin-only: no path, and nothing that could carry a payload.
  return Boolean(
    parsed
      && normalizedPath(parsed.pathname) === "/"
      && !parsed.search
      && !parsed.hash,
  );
};

// Only these two mean "the platform had no origin to report". Android uses
// the literal "null" for an opaque origin — a sandboxed or cross-origin frame
// — which is a statement about the sender, not an absence of one, so treating
// it as blank would let such a frame's message through whenever context
// happens to be live. "undefined" is likewise a value, not a gap.
const BLANK_SOURCES = new Set(["", "about:blank"]);



// What a navigation-start event should do to the callback context.
//
// A WebView reports plenty of events that say nothing about where it is — an
// empty url while a load is being set up, an about:blank between documents —
// and treating those as "somewhere other than the callback" discards the
// proof a message is about to need, which is the race that left Android
// waiting out its timeout.
//
// Anything else that is not a credential page clears it, so the context
// cannot outlive the page it describes: an identity provider, an external
// host, a malformed url, http in production, the wrong port, or a backend
// page outside the two credential paths.
//
// There is deliberately no event-ordering guard here. A counter stamped when
// the React callback arrives says when the app heard about a navigation, not
// when the WebView began it, so a delayed event gets a newer number than the
// context it should not touch — the test for such a guard can only pass by
// feeding it an ordering production never produces. Ordering is handled
// instead by which callbacks may write context at all: navigation-start
// events only, never onLoadEnd, which carries the url of the page that
// finished.
export const nextSsoCallbackContext = (
  navigationUrl,
  currentContext,
  ssoGeneration,
  backendHost,
  allowHttp = false,
  expectedPort = null,
) => {
  const url = String(navigationUrl ?? "").trim();
  if (BLANK_SOURCES.has(url.toLowerCase())) {
    return { action: "ignore", context: currentContext ?? null };
  }
  if (isTrustedSsoMessageUrl(url, backendHost, allowHttp, expectedPort)) {
    return { action: "set", context: { url, ssoGeneration } };
  }
  return { action: "clear", context: null };
};

// Whether a stored context still proves the WebView is on a credential page
// for the attempt now on screen. The SSO generation is real evidence: it
// changes only when the app itself starts or ends an attempt.
export const isSsoCallbackContextLive = (
  context,
  ssoGeneration,
  backendHost,
  allowHttp = false,
  expectedPort = null,
) => Boolean(
  context
    && context.ssoGeneration != null
    && context.ssoGeneration === ssoGeneration
    && isTrustedSsoMessageUrl(context.url, backendHost, allowHttp, expectedPort),
);

export const resolveSsoMessageSource = (
  eventUrl,
  callbackContext,
  backendHost,
  allowHttp = false,
  expectedPort = null,
) => {
  const source = String(eventUrl ?? "").trim();
  const input = callbackContext && typeof callbackContext === "object" ? callbackContext : null;
  const context = input?.context ?? null;
  const generation = context?.ssoGeneration ?? null;

  // The context is proof only while it belongs to the SSO attempt now on
  // screen and still points at a credential page.
  const contextTrusted = input
    ? isSsoCallbackContextLive(context, input.ssoGeneration, backendHost, allowHttp, expectedPort)
    : false;

  const verdict = (trusted, kind, url) => ({
    trusted,
    kind,
    url,
    usedContext: trusted && kind !== "url",
    viaFallback: trusted && kind !== "url",
    generation,
  });

  // A full credential URL stands on its own.
  if (isTrustedSsoMessageUrl(source, backendHost, allowHttp, expectedPort)) {
    return verdict(true, "url", source);
  }

  // Blank and origin-only both describe where the message came from without
  // proving it is the callback, so each leans on the navigation context and
  // resolves to the page that context names.
  if (BLANK_SOURCES.has(source.toLowerCase())) {
    return contextTrusted
      ? verdict(true, "blank", context.url)
      : verdict(false, "blank", source);
  }

  if (isTrustedSsoOrigin(source, backendHost, allowHttp, expectedPort)) {
    return contextTrusted
      ? verdict(true, "origin", context.url)
      : verdict(false, "origin", source);
  }

  // An identity provider, another uru.ac.th host, an external site, an opaque
  // origin, a file: or content: url, http in production, the wrong port, or a
  // backend page that is not a credential page. Context never rescues any of
  // them.
  return verdict(false, "untrusted", source);
};