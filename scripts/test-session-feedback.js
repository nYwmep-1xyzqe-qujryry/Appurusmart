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
  assert.ok(
    /if \(sent \|\| !value/.test(login),
    "the retry must send the token only once",
  );
  // The retry predates a security pass that narrowed where a token may come
  // from; restoring it must not bring back the broader sweep.
  assert.ok(
    !/(local|session)Storage\.getItem/.test(login),
    "the capture script must not read tokens out of web storage",
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
