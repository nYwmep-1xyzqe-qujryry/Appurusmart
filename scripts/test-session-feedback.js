// Guards the two places where a failed request used to look like real data.
//
// 1. A 401 clears the session and sends the user to Login. Without a reason
//    on that navigation the login screen says nothing, and the user has to
//    discover by trial that force-quitting the app is the way back in.
// 2. useExpertCounts leaves a count null when its request failed. Rendering
//    that as 0 told researchers their work had vanished.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

async function main() {
  const sessionRequest = read("src", "services", "sessionRequest.js");
  assert.ok(
    /navigate\("Login",\s*\{\s*reason:\s*"sessionExpired"\s*\}\)/.test(sessionRequest),
    "an expired session must tell the login screen why the user is there",
  );

  const login = read("src", "screens", "Login.js");
  assert.ok(
    /route\?\.params\?\.reason === "sessionExpired"/.test(login)
      && /login\.sessionExpired/.test(login),
    "Login must render the expiry notice it is sent",
  );

  const translations = read("src", "i18n", "translations.js");
  assert.strictEqual(
    (translations.match(/sessionExpired:/g) || []).length,
    2,
    "the expiry notice needs both a Thai and an English string",
  );

  // The dash is already the loading placeholder; an unknown count reuses it
  // rather than borrowing zero, which is a real and different answer.
  const homepage = read("src", "screens", "Homepage.js");
  assert.ok(
    /loading \|\| value == null \? "—" : value/.test(homepage),
    "an unknown stat must render as a dash, never as 0",
  );
  assert.ok(
    !/value \?\? 0/.test(homepage),
    "a null count must not fall back to 0",
  );

  // Screens the user opened must surface a 401; background pollers opt out.
  const lrdApi = read("src", "services", "lrdApi.js");
  assert.ok(
    /suppressAuthRedirect: config\.suppressAuthRedirect \?\? false/.test(lrdApi),
    "LRD requests must not hide an expired session by default",
  );

  const api = read("src", "services", "api.js");
  const timeout = /timeout: (\d+)/.exec(api);
  assert.ok(timeout && Number(timeout[1]) >= 30000, "the main client needs the same 30s budget as infoApi");

  // The forced-expiry switch exists to test this path. It must stay behind
  // both __DEV__ and an explicit env flag: __DEV__ alone would arm it for
  // every developer, and the env flag alone would ship it.
  assert.ok(
    /const FORCE_SESSION_EXPIRED = __DEV__\s*\n\s*&& process\.env\.EXPO_PUBLIC_FORCE_SESSION_EXPIRED === "true";/.test(sessionRequest),
    "the forced-expiry switch must require both __DEV__ and the env flag",
  );
  // A request-interceptor rejection skips the response interceptor, so the
  // switch has to invoke the handler itself or it tests nothing.
  assert.ok(
    /await handleUnauthorized\(error\);/.test(sessionRequest),
    "the forced 401 must run handleUnauthorized, not just abort the request",
  );

  // Android's WebView drops the first postMessage often enough that a single
  // send is not reliable: without the retry the callback never reaches the
  // app and sign-in hangs until the 45s timeout. This has regressed once
  // already, silently, as part of an unrelated change.
  assert.ok(
    /var timer = setInterval\(/.test(login) && /attempts >= 120/.test(login),
    "the SSO capture script must keep retrying until the token is delivered",
  );
  // The loop must stop on acknowledgement, not on having attempted a send:
  // Android can accept postMessage and drop the message without raising, so
  // latching on the call would abandon the retry in the one case it is for.
  assert.ok(
    /if \(window\.__uruSsoDelivered \|\| !value/.test(login),
    "the retry must keep sending until the app confirms it has the token",
  );
  assert.ok(
    /window\.__uruSsoDelivered = true/.test(login),
    "the app must acknowledge the token so the retry stops",
  );
  // The timer clears on capture() returning true, so capture() must report
  // delivery rather than attempt. Returning true right after sendPayload
  // stopped the loop on the first post — reinstating the original bug with
  // the acknowledgement flag present but never consulted again.
  const captureBody = /function capture\(\) \{[\s\S]*?\n    \}/.exec(login);
  assert.ok(captureBody, "the capture function must be present");
  const trueReturns = captureBody[0].match(/return true;/g) || [];
  assert.strictEqual(
    trueReturns.length,
    1,
    "capture() may report true only for the acknowledgement check, not for a send",
  );
  assert.ok(
    /if \(window\.__uruSsoDelivered\) return true;/.test(captureBody[0]),
    "capture() must report true on acknowledgement",
  );
  // The retry predates a security pass that narrowed where a token may come
  // from; restoring it must not bring back the broader sweep.
  assert.ok(
    !/(local|session)Storage\.getItem/.test(login),
    "the capture script must not read tokens out of web storage",
  );

  // The context is proof that the WebView is on a credential page, so only
  // navigation may set it and leaving such a page must revoke it. A generic
  // "last url seen" ref cannot serve: it keeps pointing at the identity
  // provider for most of the flow.
  // One helper decides what navigation does to the context, so the three
  // callbacks cannot drift apart — an earlier version cleared context inline
  // and an about:blank event between documents erased the proof a message was
  // about to need. The decision itself is tested against ssoSecurity.
  // onShouldStartLoadWithRequest, onLoadStart and onLoadEnd — three uses
  // besides the definition.
  // Authorization changes on navigation start only. onLoadEnd fires with the
  // url of the page that finished, so the identity provider's can arrive
  // after the callback page has started — letting it write context would
  // clear the proof the incoming message needs. The decision logic itself is
  // tested against ssoSecurity; this only pins which callbacks may call it.
  assert.strictEqual(
    (login.match(/\bapplySsoNavigationStart\(/g) || []).length,
    2,
    "only onShouldStartLoadWithRequest and onLoadStart may change callback context",
  );
  const loadEnd = /onLoadEnd=\{\(event\) => \{[\s\S]*?\n            \}\}/.exec(login);
  assert.ok(loadEnd, "the onLoadEnd handler must be present");
  assert.ok(
    !/applySsoNavigationStart/.test(loadEnd[0]),
    "onLoadEnd must not change authorization context",
  );
  assert.ok(
    !/setSsoCallbackContext|isSsoCredentialUrl/.test(login),
    "navigation must not set context through an ad-hoc path",
  );
  assert.ok(
    /ssoGenerationRef\.current \+= 1;[\s\S]{0,200}?clearSsoCallbackContext\(\);/.test(login),
    "a new SSO attempt must take a fresh generation and drop stale context",
  );
  // No synthetic event-ordering counter: one stamped when the React callback
  // arrives cannot tell a delayed old event from a current one.
  assert.ok(
    !/navigationGeneration/.test(login),
    "ordering must not rest on a counter the native event does not carry",
  );
  assert.ok(
    /const closeSsoLogin = \(\) => \{\s*\n\s*clearSsoCallbackContext\(\);/.test(login),
    "closing the SSO modal must clear the callback context",
  );
  assert.ok(
    /context: ssoCallbackContextRef\.current,\s*\n\s*ssoGeneration: ssoGenerationRef\.current,/.test(login),
    "the resolver must be told which SSO attempt is on screen",
  );

  // The diagnostic trail was scaffolding for finding the Android failure and
  // came out once the cause was confirmed on a device. Nothing should put it
  // back without a reason: it logged navigation on every SSO event.
  assert.ok(
    !/ssoDiagnostics|recordSsoDiagnostic/.test(login),
    "the SSO diagnostic scaffolding must stay removed",
  );

  // The profile PDF is framed like a printed sheet. The frame is a fixed
  // element because @page borders are unsupported here and a border on body
  // draws once around the whole flow — every page after the first would come
  // out unframed and cut open at the break.
  const profilePdf = read("src", "screens", "expert", "ProfileDetail.js");
  assert.ok(
    /<div class="page-frame"><\/div>/.test(profilePdf),
    "the PDF must carry the frame element",
  );
  assert.ok(
    /\.page-frame \{[^}]*position: fixed;/.test(profilePdf),
    "the frame must be fixed so it repeats on every printed page",
  );
  // A continued table that drops its header stops saying what its columns are.
  assert.ok(
    /thead \{ display: table-header-group; \}/.test(profilePdf),
    "a table split across pages must repeat its header row",
  );
  // A heading alone at the foot of a page labels the wrong section.
  assert.ok(
    /h2 \{[^}]*page-break-after: avoid;/.test(profilePdf),
    "a section heading must not be stranded from its table",
  );

  console.log("Session feedback tests OK");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  module.exports = main;
}
