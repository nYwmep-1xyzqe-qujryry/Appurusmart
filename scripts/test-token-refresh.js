// Guards the session refresh and logout contract with the backend.
//
// POST /auth/refresh:
//   200          a new access + refresh token pair, stored together
//   401          the refresh token is dead — the only answer that ends a session
//   422 403 429  5xx, timeout, offline, a malformed 200: the request fails,
//                the session stays
//   429          additionally: no further refresh until Retry-After
//
// A refresh token may be redeemed once; the backend reads a second redemption
// as theft and revokes the device. So one session's concurrent 401s share one
// refresh, while different sessions refresh independently, and nothing of
// account A ever reads, sends, clears, retries under or overwrites account B's
// tokens.
//
// Everything here runs the shipped modules — api.js, infoApi.js,
// sessionRequest.js, tokenRefresh.js, authStorage.js, sessionLogout.js — with
// only the keychain, AsyncStorage, navigation, push registration and the
// network replaced. Each scenario builds a fresh module graph, so no state
// carries from one to the next.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const { spawnSync } = require("child_process");
const guardUnsettled = require("./settleGuard");

const ROOT = path.join(__dirname, "..");
const SERVICES = path.join(ROOT, "src", "services");

// Compiles a project module and every project module it imports, the way the
// app bundles them, substituting only the requests named in `stubs`.
function loadModuleGraph(entry, stubs, loaded) {
  const babel = require("@babel/core");
  const load = (filename) => {
    if (loaded.has(filename)) return loaded.get(filename).exports;
    const code = babel.transformSync(fs.readFileSync(filename, "utf8"), {
      filename,
      presets: ["babel-preset-expo"],
    }).code;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod.require = (request) => {
      if (request in stubs) return stubs[request];
      if (request.startsWith(".")) return load(`${path.resolve(path.dirname(filename), request)}.js`);
      return require(request);
    };
    loaded.set(filename, mod);
    mod._compile(code, filename);
    return mod.exports;
  };
  return load(entry);
}

// Resolves with the promise's value, or "timed out" once ms have passed. Every
// wait on something a scenario controls goes through this, so a deadlock is a
// named failure rather than a run that silently stops.
const within = (promise, ms = 1000) => {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve("timed out"), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

const pair = (access, refresh) => ({ access_token: access, refresh_token: refresh, expires_in: 7200 });

// One fake backend behind every axios instance, and the app's real session
// modules in front of it.
//
// server.refresh(sentRefreshToken)        -> pair | status | "timeout" | "offline"
//                                            | { status, headers } | any body
// server.resource(authorization, url)     -> status
// server.logout(authorization, body)      -> status | "timeout"
//
// failSecureWrite(key, value, harness) -> true makes that keychain write throw;
// dropSecureWrite(key, value) -> true makes it "succeed" and keep nothing.
function createHarness(server, { onSecureWrite, failSecureRead, failSecureWrite, dropSecureWrite, removePushToken } = {}) {
  const realAxios = require("axios");
  const { AxiosError } = realAxios;
  const secure = new Map();
  const local = new Map();
  const state = {
    refreshesSent: [],
    resourceCalls: [],
    logoutCalls: [],
    logoutSkipsRefresh: [],
    sentToLogin: 0,
    loginReasons: [],
    authEvents: 0,
  };
  let harness;

  const reply = (config, status, data = {}, headers = {}) => {
    const response = { status, statusText: String(status), data, headers, config };
    if (status < 400) return response;
    throw new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, null, response);
  };
  const transport = (config, kind) => {
    if (kind === "timeout") throw new AxiosError("timeout of 30000ms exceeded", AxiosError.ECONNABORTED, config);
    throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
  };
  const adapter = async (config) => {
    const authorization = config.headers?.Authorization ?? null;
    const body = config.data ? JSON.parse(config.data) : null;
    if (config.url === "/auth/refresh") {
      state.refreshesSent.push(body?.refresh_token ?? null);
      const answer = await (server.refresh ?? (() => 503))(body?.refresh_token ?? null);
      if (answer === "timeout" || answer === "offline") return transport(config, answer);
      if (typeof answer === "number") return reply(config, answer);
      if (answer && typeof answer.status === "number") return reply(config, answer.status, {}, answer.headers);
      return reply(config, 200, answer);
    }
    if (config.url === "/auth/logout") {
      state.logoutCalls.push({ authorization, body });
      state.logoutSkipsRefresh.push(config.skipAuthRefresh === true);
      const answer = await (server.logout ?? (() => 200))(authorization, body);
      if (answer === "timeout" || answer === "offline") return transport(config, answer);
      return reply(config, answer);
    }
    state.resourceCalls.push({ url: config.url, authorization });
    return reply(config, await server.resource(authorization, config.url), { ok: true });
  };

  const stubs = {
    axios: { create: (config) => realAxios.create({ ...config, adapter }) },
    "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "when-unlocked",
      getItemAsync: async (key) => {
        if (failSecureRead?.(key)) throw Object.assign(new Error("keychain unavailable"), { name: "KeychainError" });
        return secure.get(key) ?? null;
      },
      setItemAsync: async (key, value) => {
        if (failSecureWrite?.(key, value, harness)) throw Object.assign(new Error("keychain unavailable"), { name: "KeychainError" });
        if (dropSecureWrite?.(key, value)) return;
        secure.set(key, value);
        onSecureWrite?.(harness, key, value);
      },
      deleteItemAsync: async (key) => { secure.delete(key); },
    },
    "@react-native-async-storage/async-storage": {
      getItem: async (key) => local.get(key) ?? null,
      multiSet: async (pairs) => { pairs.forEach(([key, value]) => local.set(key, value)); },
      multiRemove: async (keys) => { keys.forEach((key) => local.delete(key)); },
    },
    "../config": {
      API_BASE_URL: "https://example.test/api",
      INFO_API_BASE_URL: "https://info.example.test/api",
      SECURE_KEYS: { AUTH_TOKEN: "auth_token", REFRESH_TOKEN: "refresh_token" },
      STORAGE_KEYS: {
        TOKEN: "token",
        TOKEN_TYPE: "token_type",
        USER: "user",
        CURRENT_USER_ID: "current_user_id",
        NOTIFICATION_INBOX: "inbox",
      },
    },
    "./userSecurityKeys": {
      getCurrentUserId: async () => local.get("current_user_id") ?? null,
      clearCurrentUserId: async () => { local.delete("current_user_id"); },
    },
    "./biometricService": { clearBiometricToken: async () => {}, setBiometricEnabled: async () => {} },
    "../navigation/navigationRef": {
      navigate: (route, params) => {
        if (route !== "Login") return;
        state.sentToLogin += 1;
        state.loginReasons.push(params?.reason ?? null);
      },
    },
    "./pushRegistrationStorage": { clearPushRegistrationForUser: async () => {} },
    "./notificationService": {
      getStoredPushToken: async () => null,
      removeTokenFromBackend: removePushToken ?? (async () => false),
    },
  };

  const loaded = new Map();
  const load = (file) => loadModuleGraph(path.join(SERVICES, file), stubs, loaded);
  const clients = { api: load("api.js").default, infoApi: load("infoApi.js").default };
  const authStorage = load("authStorage.js");
  const tokenRefresh = load("tokenRefresh.js");
  const { logoutSession } = load("sessionLogout.js");
  authStorage.subscribeAuthSession(() => { state.authEvents += 1; });

  harness = {
    state,
    authStorage,
    tokenRefresh,
    logoutSession,
    tokens: () => [secure.get("auth_token") ?? null, secure.get("refresh_token") ?? null],
    signIn: (token, refreshToken, userId) =>
      authStorage.saveAuthSession(token, { id: userId }, userId, refreshToken),
    switchTo: async (token, refreshToken, userId) => {
      await authStorage.clearAuthSession();
      await authStorage.saveAuthSession(token, { id: userId }, userId, refreshToken);
    },
    request: (client, url, config) => clients[client].get(url, config).then(
      (response) => ({ settled: "resolves", response }),
      (error) => ({ settled: "rejects", error }),
    ),
    authorizationsFor: (url) => state.resourceCalls.filter((call) => call.url === url).map((call) => call.authorization),
  };
  return harness;
}

// The app reads the bundler's __DEV__ global directly.
async function withDevGlobal(run) {
  const hadDev = "__DEV__" in global;
  const previousDev = global.__DEV__;
  global.__DEV__ = false;
  try {
    return await run();
  } finally {
    if (hadDev) global.__DEV__ = previousDev;
    else delete global.__DEV__;
  }
}

async function withClock(run) {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    return await run({ advance: (ms) => { now += ms; }, now: () => now });
  } finally {
    Date.now = realNow;
  }
}

const CLIENTS = ["api", "infoApi"];

async function main() {
  await withDevGlobal(async () => {
    // 1. 200: both rotated tokens are stored, and the request is retried with
    //    the renewed access token.
    for (const client of CLIENTS) {
      const h = createHarness({
        refresh: async () => pair("tA2", "rA2"),
        resource: async (auth) => (auth === "Bearer tA2" ? 200 : 401),
      });
      await h.signIn("tA", "rA", "a");
      const before = await h.authStorage.captureAuthSession();
      const eventsBefore = h.state.authEvents;
      const outcome = await within(h.request(client, "/r"));
      assert.strictEqual(outcome.settled, "resolves", `${client} 200: the retried request succeeds`);
      assert.deepStrictEqual(h.authorizationsFor("/r"), ["Bearer tA", "Bearer tA2"], `${client} 200: retried with the renewed token`);
      assert.deepStrictEqual(h.tokens(), ["tA2", "rA2"], `${client} 200: both rotated tokens are stored`);
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], `${client} 200: one refresh, with the stored token`);
      assert.strictEqual(h.state.sentToLogin, 0, `${client} 200: the user stays signed in`);
      // A renewal changes no identity: snapshots taken before it stay valid
      // and auth subscribers — which reset the current user — are not told.
      const after = await h.authStorage.captureAuthSession();
      assert.strictEqual(after.generation, before.generation, `${client} 200: a renewal keeps the session's identity`);
      assert.strictEqual(h.state.authEvents, eventsBefore, `${client} 200: a renewal does not notify auth subscribers`);
    }

    // 2. 401 from refresh: the session ends and the user is sent to Login.
    for (const client of CLIENTS) {
      const h = createHarness({ refresh: async () => 401, resource: async () => 401 });
      await h.signIn("tA", "rA", "a");
      const outcome = await within(h.request(client, "/r"));
      assert.strictEqual(outcome.settled, "rejects", `${client} refresh 401: the request fails`);
      assert.strictEqual(h.state.sentToLogin, 1, `${client} refresh 401: the user is sent to Login`);
      assert.deepStrictEqual(h.tokens(), [null, null], `${client} refresh 401: no token is left behind`);
      assert.deepStrictEqual(h.authorizationsFor("/r"), ["Bearer tA"], `${client} refresh 401: nothing is retried`);
    }

    // 3. Everything else keeps the session: the request fails with its
    //    original 401, is not re-sent with the token that just failed, and
    //    both stored tokens stand.
    const keepsSession = [
      ["422", async () => 422],
      ["403", async () => 403],
      ["429", async () => ({ status: 429, headers: { "retry-after": "60" } })],
      ["500", async () => 500],
      ["503", async () => 503],
      ["timeout", async () => "timeout"],
      ["offline", async () => "offline"],
      ["200 without a refresh token", async () => ({ access_token: "tA2" })],
      ["200 without an access token", async () => ({ refresh_token: "rA2" })],
      ["200 with an empty body", async () => ({})],
      ["200 with a non-JSON body", async () => "<html>gateway</html>"],
    ];
    for (const client of CLIENTS) {
      for (const [label, refresh] of keepsSession) {
        const h = createHarness({ refresh, resource: async () => 401 });
        await h.signIn("tA", "rA", "a");
        const outcome = await within(h.request(client, "/r"));
        const name = `${client} refresh ${label}`;
        assert.strictEqual(outcome.settled, "rejects", `${name}: the request fails`);
        assert.strictEqual(outcome.error?.response?.status, 401, `${name}: with its own 401`);
        assert.strictEqual(h.state.sentToLogin, 0, `${name}: the user stays signed in`);
        assert.deepStrictEqual(h.tokens(), ["tA", "rA"], `${name}: both tokens are kept`);
        assert.deepStrictEqual(h.authorizationsFor("/r"), ["Bearer tA"], `${name}: not re-sent with the failed token`);
      }
    }

    // 3b. Storage failing mid-refresh is not the server refusing the token.
    {
      const h = createHarness(
        { refresh: async () => pair("tA2", "rA2"), resource: async () => 401 },
        { failSecureRead: (key) => key === "refresh_token" },
      );
      await h.signIn("tA", "rA", "a");
      await within(h.request("api", "/r"));
      assert.deepStrictEqual(h.state.refreshesSent, [], "an unreadable refresh token is not sent");
      assert.strictEqual(h.state.sentToLogin, 0, "an unreadable refresh token keeps the session");
    }

    // 3c. A 200 has already spent the old refresh token. If the new one cannot
    //     be stored after a second attempt, the session cannot renew again: it
    //     ends now, the user is told, and the pair the device cannot hold is
    //     revoked with the refresh token alone.
    for (const [label, options] of [
      ["the new refresh token cannot be written", { failSecureWrite: (key, value) => key === "refresh_token" && value === "rA2" }],
      ["the keychain accepts the new refresh token and keeps nothing", { dropSecureWrite: (key, value) => key === "refresh_token" && value === "rA2" }],
    ]) {
      const h = createHarness(
        { refresh: async () => pair("tA2", "rA2"), resource: async () => 401 },
        options,
      );
      await h.signIn("tA", "rA", "a");
      const outcome = await within(h.request("api", "/r"));
      assert.strictEqual(outcome.settled, "rejects", `${label}: the request fails`);
      assert.deepStrictEqual(h.authorizationsFor("/r"), ["Bearer tA"], `${label}: nothing is retried`);
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], `${label}: the spent token is not presented again`);
      assert.deepStrictEqual(h.state.loginReasons, ["sessionExpired"], `${label}: the session ends with the expiry notice`);
      assert.deepStrictEqual(h.tokens(), [null, null], `${label}: no token is left behind`);
      assert.deepStrictEqual(
        h.state.logoutCalls,
        [{ authorization: null, body: { refresh_token: "rA2" } }],
        `${label}: the pair the device cannot hold is revoked`,
      );
    }
    // A momentary keychain failure is survived by the second attempt.
    {
      let failures = 1;
      const h = createHarness(
        {
          refresh: async () => pair("tA2", "rA2"),
          resource: async (auth) => (auth === "Bearer tA2" ? 200 : 401),
        },
        {
          failSecureWrite: (key, value) => {
            if (key !== "refresh_token" || value !== "rA2" || failures === 0) return false;
            failures -= 1;
            return true;
          },
        },
      );
      await h.signIn("tA", "rA", "a");
      const outcome = await within(h.request("api", "/r"));
      assert.strictEqual(outcome.settled, "resolves", "a second write attempt saves the session");
      assert.deepStrictEqual(h.tokens(), ["tA2", "rA2"], "and both tokens are stored");
      assert.strictEqual(h.state.sentToLogin, 0, "and the user stays signed in");
    }

    // 3d. The access token alone failing keeps the session: the refresh token
    //     the server holds is stored, and the next 401 renews with it.
    const storageFailures = [
      {
        label: "the new access token cannot be written",
        options: { failSecureWrite: (key, value) => key === "auth_token" && value === "tA2" },
        // The refresh token the server now holds is kept; the next 401
        // renews with it.
        left: ["tA", "rA2"],
      },
    ];
    for (const { label, options, left } of storageFailures) {
      let issued = 1;
      const h = createHarness(
        {
          refresh: async () => { issued += 1; return pair(`tA${issued}`, `rA${issued}`); },
          resource: async (auth) => (auth === "Bearer tA3" ? 200 : 401),
        },
        options,
      );
      await h.signIn("tA", "rA", "a");
      const before = await h.authStorage.captureAuthSession();
      const eventsBefore = h.state.authEvents;
      const outcome = await within(h.request("api", "/r"));
      assert.strictEqual(outcome.settled, "rejects", `${label}: the request fails`);
      assert.strictEqual(outcome.error?.response?.status, 401, `${label}: with its own 401`);
      assert.deepStrictEqual(h.authorizationsFor("/r"), ["Bearer tA"], `${label}: nothing is retried`);
      assert.strictEqual(h.state.sentToLogin, 0, `${label}: the user stays signed in`);
      assert.deepStrictEqual(h.tokens(), left, `${label}: the keychain is left as the strategy says`);
      const after = await h.authStorage.captureAuthSession();
      assert.ok(after && after.generation === before.generation, `${label}: the session is still current`);
      assert.strictEqual(h.state.authEvents, eventsBefore, `${label}: auth subscribers are not told`);
    }
    // The state a failed access-token write leaves is recoverable: the next
    // request renews with the refresh token the server holds.
    {
      let issued = 1;
      let failing = false;
      const h = createHarness(
        {
          refresh: async () => { issued += 1; return pair(`tA${issued}`, `rA${issued}`); },
          resource: async (auth) => (auth === "Bearer tA3" ? 200 : 401),
        },
        { failSecureWrite: (key) => failing && key === "auth_token" },
      );
      await h.signIn("tA", "rA", "a");
      failing = true;
      await within(h.request("api", "/first"));
      failing = false;
      h.tokenRefresh.resetRenewalCooldown();
      const next = await within(h.request("api", "/next"));
      assert.strictEqual(next.settled, "resolves", "after a failed access-token write the next request renews");
      assert.deepStrictEqual(h.state.refreshesSent, ["rA", "rA2"], "with the refresh token that was kept");
      assert.deepStrictEqual(h.tokens(), ["tA3", "rA3"], "and the new pair is stored");
    }
    // A's renewal write fails while B signs in: B's pair is untouched.
    {
      let switched = false;
      const h = createHarness(
        {
          refresh: async (sent) => (sent === "rA" ? pair("tA2", "rA2") : pair("tB2", "rB2")),
          resource: async () => 401,
        },
        {
          failSecureWrite: (key, value, self) => {
            if (key !== "refresh_token" || value !== "rA2") return false;
            if (!switched) {
              switched = true;
              self.authStorage.clearAuthSession();
              self.signIn("tB", "rB", "b");
            }
            return true;
          },
        },
      );
      await h.signIn("tA", "rA", "a");
      const a = await within(h.request("api", "/a"));
      await h.authStorage.captureAuthSession();
      assert.strictEqual(a.settled, "rejects", "A's request fails");
      assert.deepStrictEqual(h.authorizationsFor("/a"), ["Bearer tA"], "A's request is not retried");
      assert.deepStrictEqual(h.tokens(), ["tB", "rB"], "B's pair is exactly as B signed in with");
      assert.strictEqual(h.state.sentToLogin, 0, "B is not signed out");
    }

    // 3e. A 422 cannot be cured by asking again: that session stops refreshing
    //     and stays signed in. Another account is not affected.
    {
      const h = createHarness({
        refresh: async (sent) => (sent === "rA" ? 422 : pair("tB2", "rB2")),
        resource: async (auth) => (auth === "Bearer tB2" ? 200 : 401),
      });
      await h.signIn("tA", "rA", "a");
      await within(h.request("api", "/1"));
      await within(h.request("api", "/2"));
      await within(h.request("infoApi", "/3"));
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], "after a 422 the session does not ask again");
      assert.strictEqual(h.state.sentToLogin, 0, "and stays signed in");
      assert.deepStrictEqual(h.tokens(), ["tA", "rA"], "with its tokens kept");
      await h.switchTo("tB", "rB", "b");
      const b = await within(h.request("api", "/b"));
      assert.strictEqual(b.settled, "resolves", "another account still renews");
      assert.deepStrictEqual(h.state.refreshesSent, ["rA", "rB"], "with its own token");
    }

    // 4. 429 holds off further refreshes of that session until Retry-After,
    //    without re-sending the failed request — and only of that session.
    await withClock(async (clock) => {
      const scenarios = [
        ["delay-seconds", (now) => "120", 120 * 1000],
        ["HTTP date", (now) => new Date(now + 90 * 1000).toUTCString(), 90 * 1000],
        ["absent", () => undefined, 30 * 1000],
        ["unreadable", () => "soon", 30 * 1000],
        ["beyond the cap", () => "999999", 10 * 60 * 1000],
      ];
      for (const [label, header, waitMs] of scenarios) {
        let limited = true;
        const h = createHarness({
          refresh: async () => (limited
            ? { status: 429, headers: header(clock.now()) === undefined ? {} : { "retry-after": header(clock.now()) } }
            : pair("tA2", "rA2")),
          resource: async (auth) => (auth === "Bearer tA2" ? 200 : 401),
        });
        await h.signIn("tA", "rA", "a");
        await within(h.request("api", "/first"));
        assert.deepStrictEqual(h.state.refreshesSent, ["rA"], `429 ${label}: one refresh`);
        limited = false;

        clock.advance(waitMs - 2000);
        const early = await within(h.request("api", "/early"));
        assert.strictEqual(early.settled, "rejects", `429 ${label}: before Retry-After the request fails`);
        assert.deepStrictEqual(h.state.refreshesSent, ["rA"], `429 ${label}: no refresh before Retry-After`);
        assert.deepStrictEqual(h.authorizationsFor("/early"), ["Bearer tA"], `429 ${label}: the request is not re-sent`);
        assert.strictEqual(h.state.sentToLogin, 0, `429 ${label}: the user stays signed in`);

        clock.advance(4000);
        const later = await within(h.request("api", "/later"));
        assert.strictEqual(later.settled, "resolves", `429 ${label}: after Retry-After the session renews`);
        assert.deepStrictEqual(h.state.refreshesSent, ["rA", "rA"], `429 ${label}: refreshed again once allowed`);
      }

      // A's rate limit does not hold B back.
      const h = createHarness({
        refresh: async (sent) => (sent === "rA" ? { status: 429, headers: { "retry-after": "600" } } : pair("tB2", "rB2")),
        resource: async (auth) => (auth === "Bearer tB2" ? 200 : 401),
      });
      await h.signIn("tA", "rA", "a");
      await within(h.request("api", "/a"));
      await h.switchTo("tB", "rB", "b");
      const b = await within(h.request("api", "/b"));
      assert.strictEqual(b.settled, "resolves", "A's 429 does not stop B renewing");
      assert.deepStrictEqual(h.state.refreshesSent, ["rA", "rB"], "B refreshes with its own token");
    });
    {
      const { parseRetryAfter } = createHarness({ resource: async () => 200 }).tokenRefresh;
      const now = Date.UTC(2026, 9, 25, 12, 0, 0);
      assert.strictEqual(parseRetryAfter("30", now), 30000, "Retry-After seconds");
      assert.strictEqual(parseRetryAfter(" 0 ", now), 0, "Retry-After zero");
      assert.strictEqual(parseRetryAfter(new Date(now + 5000).toUTCString(), now), 5000, "Retry-After HTTP date");
      assert.strictEqual(parseRetryAfter(new Date(now - 5000).toUTCString(), now), 0, "a past date means now");
      assert.strictEqual(parseRetryAfter("-5", now), null, "a negative delay is unreadable");
      assert.strictEqual(parseRetryAfter("1.5", now), null, "a fractional delay is unreadable");
      assert.strictEqual(parseRetryAfter(null, now), null, "no header");
    }

    // 5. One session's concurrent 401s — across both API clients — redeem the
    //    refresh token once, and every retry carries the one renewed token.
    {
      const answer = deferred();
      const h = createHarness({
        refresh: async () => { await answer.promise; return pair("tA2", "rA2"); },
        resource: async (auth) => (auth === "Bearer tA2" ? 200 : 401),
      });
      await h.signIn("tA", "rA", "a");
      const all = Promise.all([
        h.request("api", "/1"),
        h.request("api", "/2"),
        h.request("infoApi", "/3"),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      answer.resolve();
      const outcomes = await within(all);
      assert.notStrictEqual(outcomes, "timed out", "concurrent 401s settle");
      assert.deepStrictEqual(outcomes.map((o) => o.settled), ["resolves", "resolves", "resolves"], "every request succeeds");
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], "three concurrent 401s redeem the refresh token once");
      for (const url of ["/1", "/2", "/3"]) {
        assert.deepStrictEqual(h.authorizationsFor(url), ["Bearer tA", "Bearer tA2"], `${url} retries with the renewed token`);
      }

      // A request built before the renewal landed, answered 401 moments
      // after it, retries under the renewed token without renewing again.
      const stale = { token: "tA", generation: (await h.authStorage.captureAuthSession()).generation, userId: "a" };
      const late = await within(h.request("api", "/late", { authSession: stale, sessionSnapshot: true }));
      assert.strictEqual(late.settled, "resolves", "a 401 inside the cooldown is retried, not treated as the end");
      assert.deepStrictEqual(h.authorizationsFor("/late"), ["Bearer tA", "Bearer tA2"], "under the renewed token");
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], "without a second refresh");
    }

    // 6. Different sessions refresh concurrently. A's refresh is pending when
    //    B signs in and B's request is answered 401: B refreshes with B's own
    //    token straight away, uses only B's result and stays signed in —
    //    whatever A's refresh finally answers.
    for (const answerForA of [pair("tA2", "rA2"), 401, 503]) {
      const label = `A's refresh pending, then ${typeof answerForA === "number" ? answerForA : 200}`;
      const aStarted = deferred();
      const aAnswer = deferred();
      const h = createHarness({
        refresh: async (sent) => {
          if (sent === "rA") {
            aStarted.resolve();
            await aAnswer.promise;
            return answerForA;
          }
          return pair("tB2", "rB2");
        },
        resource: async (auth) => (auth === "Bearer tB2" ? 200 : 401),
      });
      await h.signIn("tA", "rA", "a");
      const requestA = h.request("api", "/a");
      assert.notStrictEqual(await within(aStarted.promise), "timed out", `${label}: A's refresh starts`);
      await h.switchTo("tB", "rB", "b");

      const b = await within(h.request("api", "/b"));
      assert.notStrictEqual(b, "timed out", `${label}: B does not wait on A's refresh`);
      assert.strictEqual(b.settled, "resolves", `${label}: B renews on its own and succeeds`);
      assert.deepStrictEqual(h.state.refreshesSent, ["rA", "rB"], `${label}: B redeems only B's own token`);

      aAnswer.resolve();
      const a = await within(requestA);
      assert.notStrictEqual(a, "timed out", `${label}: A's request settles`);
      assert.strictEqual(a.settled, "rejects", `${label}: A's request does not succeed as anyone`);
      assert.deepStrictEqual(h.authorizationsFor("/a"), ["Bearer tA"], `${label}: A's request is never sent as B`);
      assert.deepStrictEqual(h.tokens(), ["tB2", "rB2"], `${label}: A's answer leaves B's tokens alone`);
      assert.strictEqual(h.state.sentToLogin, 0, `${label}: B stays signed in`);
    }

    // 7. A's refresh succeeds and B signs in before A's retry goes out. No
    //    retry may carry B's Authorization — A's screen would be shown B's
    //    data, and an edit A made would land in B's account — and B stays
    //    signed in. B signs in from inside A's renewal write, so both of B's
    //    steps are queued behind it and land before A's retry can be built.
    for (const client of CLIENTS) {
      const h = createHarness(
        {
          refresh: async () => pair("tA2", "rA2"),
          resource: async (auth) => (auth === "Bearer tA" ? 401 : 200),
        },
        {
          onSecureWrite: (self, key, value) => {
            if (key !== "refresh_token" || value !== "rA2") return;
            self.authStorage.clearAuthSession();
            self.signIn("tB", "rB", "b");
          },
        },
      );
      await h.signIn("tA", "rA", "a");
      const a = await within(h.request(client, "/a"));
      await h.authStorage.captureAuthSession();
      const sent = h.authorizationsFor("/a");
      assert.ok(!sent.includes("Bearer tB"), `${client}: A's retry is never sent with B's token`);
      assert.ok(sent.every((auth) => auth === "Bearer tA" || auth === "Bearer tA2"), `${client}: only A's own tokens`);
      assert.strictEqual(a.error?.code, "ERR_CANCELED", `${client}: A's retry is cancelled locally`);
      assert.deepStrictEqual(h.tokens(), ["tB", "rB"], `${client}: B's tokens are untouched`);
      assert.strictEqual(h.state.sentToLogin, 0, `${client}: B is not signed out`);
    }
    // The mechanism the retry relies on: a snapshot of a session that has
    // ended is cancelled before anything is sent.
    {
      const h = createHarness({ resource: async () => 200 });
      await h.signIn("tA", "rA", "a");
      const snapshotA = await h.authStorage.captureAuthSession();
      await h.switchTo("tB", "rB", "b");
      const a = await within(h.request("api", "/a", { authSession: snapshotA, sessionSnapshot: true }));
      assert.strictEqual(a.error?.code, "ERR_CANCELED", "a snapshot of an ended session is cancelled");
      assert.deepStrictEqual(h.authorizationsFor("/a"), [], "and never sent");
    }

    // 8. A's request answered 401 only after B signed in, with no refresh in
    //    flight. Refreshing for A would read B's refresh token out of storage
    //    and redeem it; nothing may be sent at all.
    {
      const arrived = deferred();
      const answer = deferred();
      const h = createHarness({
        refresh: async () => pair("tX", "rX"),
        resource: async (auth) => {
          if (auth === "Bearer tA") {
            arrived.resolve();
            await answer.promise;
          }
          return 401;
        },
      });
      await h.signIn("tA", "rA", "a");
      const requestA = h.request("api", "/a");
      await within(arrived.promise);
      await h.switchTo("tB", "rB", "b");
      answer.resolve();
      const a = await within(requestA);
      assert.deepStrictEqual(h.state.refreshesSent, [], "a request from a session already left redeems nothing");
      assert.strictEqual(a.error?.code, "ERR_CANCELED", "and is cancelled");
      assert.deepStrictEqual(h.tokens(), ["tB", "rB"], "B's tokens are untouched");
      assert.strictEqual(h.state.sentToLogin, 0, "B is not signed out by A's stale 401");
    }

    // 8b. A request sent while no one was signed in carries no session. Its
    //     401 arriving after B signed in says nothing about B: no refresh,
    //     no retry under B's token, no sign-out.
    {
      const arrived = deferred();
      const answer = deferred();
      const h = createHarness({
        refresh: async () => pair("tB2", "rB2"),
        resource: async (auth) => {
          if (auth == null) {
            arrived.resolve();
            await answer.promise;
          }
          return 401;
        },
      });
      const anonymous = h.request("api", "/anonymous");
      await within(arrived.promise);
      await h.signIn("tB", "rB", "b");
      answer.resolve();
      await within(anonymous);
      assert.deepStrictEqual(h.state.refreshesSent, [], "a session-less 401 renews no one");
      assert.deepStrictEqual(h.authorizationsFor("/anonymous"), [null], "and is never retried as B");
      assert.deepStrictEqual(h.tokens(), ["tB", "rB"], "B's tokens are untouched");
      assert.strictEqual(h.state.sentToLogin, 0, "B is not signed out");
    }

    // 9. A's refresh answered after B signed in: a 401 clears the refresh
    //    token of the session that was refused — never B's — and a 200 is
    //    never written over B.
    for (const answerForA of [401, pair("tA2", "rA2")]) {
      const label = `A's refresh answered ${typeof answerForA === "number" ? answerForA : 200} after B signed in`;
      let self;
      const h = createHarness({
        refresh: async (sent) => {
          if (sent === "rA") await self.switchTo("tB", "rB", "b");
          return answerForA;
        },
        resource: async () => 401,
      });
      self = h;
      await h.signIn("tA", "rA", "a");
      await within(h.request("api", "/a"));
      assert.deepStrictEqual(h.tokens(), ["tB", "rB"], `${label}: B's tokens stand`);
      assert.strictEqual(h.state.sentToLogin, 0, `${label}: B is not signed out`);
    }

    // 10. Logout during a refresh waits for it and revokes the newest pair.
    {
      const refreshStarted = deferred();
      const answer = deferred();
      const h = createHarness({
        refresh: async () => { refreshStarted.resolve(); await answer.promise; return pair("tA2", "rA2"); },
        resource: async (auth) => (auth === "Bearer tA2" ? 200 : 401),
      });
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      const requestA = h.request("api", "/a");
      await within(refreshStarted.promise);

      let cleaned = 0;
      const logout = h.logoutSession(target, async () => { cleaned += 1; });
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.deepStrictEqual(h.state.logoutCalls, [], "logout waits for the session's refresh to settle");

      answer.resolve();
      assert.strictEqual(await within(logout), true, "logout clears the session");
      await within(requestA);
      assert.deepStrictEqual(
        h.state.logoutCalls,
        [{ authorization: "Bearer tA2", body: { refresh_token: "rA2" } }],
        "logout sends the newest access token and the newest refresh token",
      );
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], "logout triggers no refresh of its own");
      assert.deepStrictEqual(h.tokens(), [null, null], "no token is left on the device");
      assert.strictEqual(cleaned, 1, "local cleanup runs once");
    }

    // 10b. Once logout has begun, the session it is ending is not renewed:
    //      a refresh then would rotate the pair logout is handing the server.
    {
      const logoutArrived = deferred();
      const logoutAnswer = deferred();
      const h = createHarness({
        refresh: async () => pair("tA2", "rA2"),
        resource: async () => 401,
        logout: async () => { logoutArrived.resolve(); await logoutAnswer.promise; return 200; },
      });
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      const logout = h.logoutSession(target, async () => {});
      await within(logoutArrived.promise);
      const during = await within(h.request("api", "/during"));
      assert.strictEqual(during.settled, "rejects", "a request failing during logout just fails");
      assert.deepStrictEqual(h.state.refreshesSent, [], "the session being logged out is not renewed");
      assert.deepStrictEqual(
        h.state.logoutCalls,
        [{ authorization: "Bearer tA", body: { refresh_token: "rA" } }],
        "logout revokes the pair the device holds",
      );
      assert.strictEqual(h.tokenRefresh.refreshStateFor(target).loggingOut, true, "the hold stands while logout is active");
      logoutAnswer.resolve();
      assert.strictEqual(await within(logout), true, "logout completes");
      assert.deepStrictEqual(
        h.tokenRefresh.refreshStateFor(target),
        { inFlight: false, recentRenewal: false, rateLimited: false, loggingOut: false },
        "logout releases everything held for the session",
      );
      assert.strictEqual(h.tokenRefresh.refreshStateSize(), 0, "nothing is held for any session afterwards");
    }

    // 10c. Repeated sign-in, renewal or rate limit, and logout leave nothing
    //      behind: per-session state does not grow with each session.
    {
      let round = 0;
      const h = createHarness({
        refresh: async () => (round % 2 ? { status: 429, headers: { "retry-after": "60" } } : pair(`t${round}x`, `r${round}x`)),
        resource: async (auth) => (auth === `Bearer t${round}x` ? 200 : 401),
      });
      for (round = 0; round < 40; round += 1) {
        await h.signIn(`t${round}`, `r${round}`, `u${round}`);
        const session = await h.authStorage.captureAuthSession();
        await within(h.request("api", `/r${round}`));
        const held = h.tokenRefresh.refreshStateFor(session);
        assert.ok(held.recentRenewal || held.rateLimited, `round ${round}: the round leaves per-session state to release`);
        assert.strictEqual(await within(h.logoutSession(session, async () => {})), true, `round ${round}: logout completes`);
        assert.strictEqual(h.tokenRefresh.refreshStateSize(), 0, `round ${round}: nothing is held after logout`);
      }
    }

    // 10d. A's logout releases only A. B's rate limit and B's pending
    //      refresh survive it, and B keeps working.
    {
      const h = createHarness({
        refresh: async (sent) => (sent === "rA" ? pair("tA2", "rA2") : { status: 429, headers: { "retry-after": "600" } }),
        resource: async (auth) => (auth === "Bearer tA2" ? 200 : 401),
      });
      await h.signIn("tA", "rA", "a");
      const targetA = await h.authStorage.captureAuthSession();
      await within(h.request("api", "/a"));
      assert.strictEqual(h.tokenRefresh.refreshStateFor(targetA).recentRenewal, true, "A holds a cooldown");

      await h.switchTo("tB", "rB", "b");
      const sessionB = await h.authStorage.captureAuthSession();
      await within(h.request("api", "/b"));
      assert.strictEqual(h.tokenRefresh.refreshStateFor(sessionB).rateLimited, true, "B is rate-limited");

      const leftA = await within(h.logoutSession(targetA, async () => {}));
      assert.strictEqual(leftA, false, "the stale logout of A clears nothing locally");
      assert.deepStrictEqual(
        h.tokenRefresh.refreshStateFor(targetA),
        { inFlight: false, recentRenewal: false, rateLimited: false, loggingOut: false },
        "A's state is released",
      );
      assert.strictEqual(h.tokenRefresh.refreshStateFor(sessionB).rateLimited, true, "B's rate limit survives A's logout");
      await within(h.request("api", "/b-limited"));
      assert.deepStrictEqual(h.state.refreshesSent, ["rA", "rB"], "B is still held to its Retry-After");
      assert.deepStrictEqual(h.tokens(), ["tB", "rB"], "B's tokens are untouched");
      assert.strictEqual(h.state.sentToLogin, 0, "B stays signed in");
    }
    // B's pending refresh and B's logout hold survive A's logout completing.
    {
      const bAnswer = deferred();
      const bStarted = deferred();
      const bLogoutArrived = deferred();
      const bLogoutAnswer = deferred();
      const h = createHarness({
        refresh: async (sent) => {
          if (sent === "rB") { bStarted.resolve(); await bAnswer.promise; return pair("tB2", "rB2"); }
          return pair("tA2", "rA2");
        },
        resource: async (auth) => (auth === "Bearer tB2" ? 200 : 401),
        logout: async (auth) => {
          if (auth === "Bearer tB2") { bLogoutArrived.resolve(); await bLogoutAnswer.promise; }
          return 200;
        },
      });
      await h.signIn("tA", "rA", "a");
      const targetA = await h.authStorage.captureAuthSession();
      await h.switchTo("tB", "rB", "b");
      const sessionB = await h.authStorage.captureAuthSession();
      const requestB = h.request("api", "/b");
      await within(bStarted.promise);
      await within(h.logoutSession(targetA, async () => {}));
      assert.strictEqual(h.tokenRefresh.refreshStateFor(sessionB).inFlight, true, "B's pending refresh survives A's logout");

      const logoutB = h.logoutSession(sessionB, async () => {});
      bAnswer.resolve();
      await within(bLogoutArrived.promise);
      await within(h.logoutSession(targetA, async () => {}));
      assert.strictEqual(h.tokenRefresh.refreshStateFor(sessionB).loggingOut, true, "B's logout hold survives A's logout");
      bLogoutAnswer.resolve();
      assert.strictEqual(await within(logoutB), true, "B's logout completes");
      await within(requestB);
      assert.strictEqual(h.tokenRefresh.refreshStateSize(), 0, "and everything is released");
    }

    // 11. Logout never refreshes, and clears the device whatever the server
    //     answers.
    for (const answer of [200, 401, 403, 500, "timeout", "offline"]) {
      const h = createHarness({
        refresh: async () => pair("tA2", "rA2"),
        resource: async () => 200,
        logout: async () => answer,
      });
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      let cleaned = 0;
      const done = await within(h.logoutSession(target, async () => { cleaned += 1; }));
      assert.strictEqual(done, true, `logout answered ${answer}: the session is cleared`);
      assert.deepStrictEqual(h.state.refreshesSent, [], `logout answered ${answer}: no refresh`);
      assert.deepStrictEqual(h.state.logoutSkipsRefresh, [true], `logout answered ${answer}: the logout request is marked skipAuthRefresh`);
      assert.deepStrictEqual(h.tokens(), [null, null], `logout answered ${answer}: no token is left on the device`);
      assert.strictEqual(cleaned, 1, `logout answered ${answer}: local cleanup runs`);
      assert.strictEqual(h.state.sentToLogin, 0, `logout answered ${answer}: logout navigates itself, once`);
      assert.strictEqual(h.tokenRefresh.refreshStateSize(), 0, `logout answered ${answer}: logout state is released`);
    }

    // 11b-push. The push token is removed before the session is revoked: the
    //      removal authenticates with the access token that revoking ends, and
    //      answered 401 it would leave this device receiving the account's
    //      notifications. A removal that does not answer does not stop logout.
    {
      const removal = deferred();
      let pushRemovals = 0;
      const h = createHarness(
        { resource: async () => 200 },
        { removePushToken: async () => { pushRemovals += 1; await removal.promise; return true; } },
      );
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      const logout = h.logoutSession(target, async () => {});
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(pushRemovals, 1, "logout removes the push token");
      assert.deepStrictEqual(h.state.logoutCalls, [], "and does not revoke the session before that is answered");
      removal.resolve();
      assert.strictEqual(await within(logout, 4000), true, "logout then completes");
      assert.strictEqual(h.state.logoutCalls.length, 1, "with the session revoked after the removal");
    }
    {
      const removal = deferred();
      const h = createHarness(
        { resource: async () => 200 },
        { removePushToken: async () => { await removal.promise; return true; } },
      );
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      const done = await within(h.logoutSession(target, async () => {}), 6000);
      assert.strictEqual(done, true, "a push removal that never answers does not stop logout");
      assert.strictEqual(h.state.logoutCalls.length, 1, "the session is still revoked");
      assert.deepStrictEqual(h.tokens(), [null, null], "and the device cleared");
      removal.resolve();
    }

    // 11c. A server that does not answer does not hold the user on the screen:
    //      the request has left, the device clears itself within the limit,
    //      and the late answer changes nothing.
    {
      const answer = deferred();
      const h = createHarness({
        resource: async () => 200,
        logout: async () => { await answer.promise; return 200; },
      });
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      const done = await within(h.logoutSession(target, async () => {}), 4000);
      assert.strictEqual(done, true, "logout does not wait out a silent server");
      assert.deepStrictEqual(h.tokens(), [null, null], "the device is cleared");
      assert.deepStrictEqual(
        h.state.logoutCalls,
        [{ authorization: "Bearer tA", body: { refresh_token: "rA" } }],
        "and the revocation was sent before the session ended",
      );
      answer.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(h.tokenRefresh.refreshStateSize(), 0, "nothing is held afterwards");
    }
    // A refresh that does not answer does not hold logout up either. Its
    // late 200 is not written back over the signed-out device.
    {
      const started = deferred();
      const answer = deferred();
      const h = createHarness({
        refresh: async () => { started.resolve(); await answer.promise; return pair("tA2", "rA2"); },
        resource: async () => 401,
      });
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      const request = h.request("api", "/a");
      assert.notStrictEqual(await within(started.promise), "timed out", "the refresh is pending");
      const done = await within(h.logoutSession(target, async () => {}), 4000);
      assert.strictEqual(done, true, "logout does not wait out a pending refresh");
      assert.deepStrictEqual(
        h.state.logoutCalls,
        [{ authorization: "Bearer tA", body: { refresh_token: "rA" } }],
        "and revokes with the newest token the device has",
      );
      answer.resolve();
      assert.notStrictEqual(await within(request), "timed out", "the pending request settles");
      assert.deepStrictEqual(h.tokens(), [null, null], "the late refresh is not written back");
      assert.strictEqual(h.state.sentToLogin, 0, "and no second sign-out follows");
    }

    // 11a. Logout releases its state even when reading the tokens fails or
    //      the cleanup throws — and still clears the device.
    {
      let failing = false;
      const h = createHarness(
        { resource: async () => 200 },
        { failSecureRead: (key) => failing && key === "refresh_token" },
      );
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      failing = true;
      const done = await within(h.logoutSession(target, async () => {}));
      assert.strictEqual(done, true, "an unreadable keychain does not stop logout");
      assert.deepStrictEqual(h.tokens(), [null, null], "the device is cleared");
      assert.strictEqual(h.tokenRefresh.refreshStateSize(), 0, "logout state is released");
    }
    {
      const h = createHarness({ resource: async () => 200 });
      await h.signIn("tA", "rA", "a");
      const target = await h.authStorage.captureAuthSession();
      const outcome = await within(
        h.logoutSession(target, async () => { throw new Error("cleanup failed"); }).then(() => "resolved", () => "rejected"),
      );
      assert.strictEqual(outcome, "rejected", "a cleanup failure surfaces to the caller");
      assert.deepStrictEqual(h.tokens(), [null, null], "the tokens are cleared before cleanup runs");
      assert.strictEqual(h.tokenRefresh.refreshStateSize(), 0, "logout state is released even so");
    }

    // 11b. Logout of B never waits on A's refresh, and logout of A after B
    //      signed in touches nothing of B.
    {
      const aAnswer = deferred();
      const aStarted = deferred();
      const h = createHarness({
        refresh: async (sent) => { if (sent === "rA") { aStarted.resolve(); await aAnswer.promise; } return 401; },
        resource: async () => 401,
      });
      await h.signIn("tA", "rA", "a");
      const targetA = await h.authStorage.captureAuthSession();
      const requestA = h.request("api", "/a");
      await within(aStarted.promise);
      await h.switchTo("tB", "rB", "b");
      const targetB = await h.authStorage.captureAuthSession();

      const leftA = await within(h.logoutSession(targetA, async () => {}));
      assert.strictEqual(leftA, false, "logging out a session already left clears nothing");
      assert.deepStrictEqual(h.tokens(), ["tB", "rB"], "B's tokens survive A's logout");

      const leftB = await within(h.logoutSession(targetB, async () => {}));
      assert.notStrictEqual(leftB, "timed out", "B's logout does not wait on A's pending refresh");
      assert.deepStrictEqual(
        h.state.logoutCalls,
        [{ authorization: "Bearer tB", body: { refresh_token: "rB" } }],
        "only B's logout reaches the server, with B's own pair",
      );
      aAnswer.resolve();
      await within(requestA);
    }
  });

  // 14. Local credential missing — a client-side recovery policy, not a
  //     backend answer. With no refresh token on the device nothing is sent
  //     to /auth/refresh: the backend confirms nothing. The session still
  //     ends, because an access token just refused cannot be replaced, and it
  //     ends through the same session-expired flow — once, however many
  //     requests failed together.
  await withDevGlobal(async () => {
    for (const client of CLIENTS) {
      const name = `${client} local refresh token missing`;
      const h = createHarness({ refresh: async () => pair("tX", "rX"), resource: async () => 401 });
      await h.authStorage.saveAuthSession("tA", { id: "a" }, "a", "");
      assert.deepStrictEqual(h.tokens(), ["tA", null], `${name}: signed in with no refresh token`);
      const outcomes = await within(Promise.all([h.request(client, "/1"), h.request(client, "/2")]));
      assert.notStrictEqual(outcomes, "timed out", `${name}: the failed requests settle`);
      assert.deepStrictEqual(h.state.refreshesSent, [], `${name}: no POST /auth/refresh is made`);
      assert.deepStrictEqual(h.authorizationsFor("/1"), ["Bearer tA"], `${name}: the failed request is not retried`);
      assert.deepStrictEqual(h.authorizationsFor("/2"), ["Bearer tA"], `${name}: nor is the one that failed beside it`);
      assert.deepStrictEqual(h.state.loginReasons, ["sessionExpired"], `${name}: the session-expired flow runs once`);
      assert.deepStrictEqual(h.tokens(), [null, null], `${name}: the local session is cleared`);
    }
    // The contrast, kept side by side: the backend answering 401 is a refresh
    // that was sent and refused.
    {
      const h = createHarness({ refresh: async () => 401, resource: async () => 401 });
      await h.signIn("tA", "rA", "a");
      await within(h.request("api", "/r"));
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], "backend refresh 401: the refresh was sent");
      assert.deepStrictEqual(h.state.loginReasons, ["sessionExpired"], "backend refresh 401: the same flow follows");
    }
    // A different account is not affected — neither after A's session has
    // ended, nor when A's request fails only after B has signed in.
    {
      const h = createHarness({
        refresh: async (sent) => (sent === "rB" ? pair("tB2", "rB2") : pair("tX", "rX")),
        resource: async (auth) => (auth === "Bearer tB2" ? 200 : 401),
      });
      await h.authStorage.saveAuthSession("tA", { id: "a" }, "a", "");
      await within(h.request("api", "/a"));
      assert.deepStrictEqual(h.state.loginReasons, ["sessionExpired"], "A without a refresh token is signed out");
      await h.signIn("tB", "rB", "b");
      const b = await within(h.request("api", "/b"));
      assert.strictEqual(b.settled, "resolves", "B, signing in afterwards, renews normally");
      assert.deepStrictEqual(h.state.refreshesSent, ["rB"], "with B's own refresh token");
      assert.deepStrictEqual(h.state.loginReasons, ["sessionExpired"], "and is not signed out");
    }
    {
      const arrived = deferred();
      const answer = deferred();
      const h = createHarness({
        refresh: async () => pair("tX", "rX"),
        resource: async (auth) => {
          if (auth === "Bearer tA") { arrived.resolve(); await answer.promise; }
          return 401;
        },
      });
      await h.authStorage.saveAuthSession("tA", { id: "a" }, "a", "");
      const requestA = h.request("api", "/a");
      assert.notStrictEqual(await within(arrived.promise), "timed out", "A's request reaches the server");
      await h.switchTo("tB", "rB", "b");
      answer.resolve();
      assert.notStrictEqual(await within(requestA), "timed out", "A's request settles");
      assert.deepStrictEqual(h.state.refreshesSent, [], "A's late 401 sends nothing");
      assert.deepStrictEqual(h.state.loginReasons, [], "and signs no one out");
      assert.deepStrictEqual(h.tokens(), ["tB", "rB"], "B's tokens are untouched");
    }
  });

  // 15. The ambiguous refresh: the request may have reached the server and
  //     rotated the pair while only the answer was lost. The device keeps the
  //     pair it knows, re-sends nothing, and stays signed in; logout then
  //     revokes the pair the device knows, and clears the device even when
  //     the server answers 401 to it.
  await withDevGlobal(async () => {
    for (const lost of ["timeout", "offline"]) {
      const name = `refresh answer lost (${lost})`;
      const h = createHarness({ refresh: async () => lost, resource: async () => 401, logout: async () => 401 });
      await h.signIn("tA", "rA", "a");
      const session = await h.authStorage.captureAuthSession();

      const outcome = await within(h.request("api", "/r"));
      assert.strictEqual(outcome.settled, "rejects", `${name}: the request fails`);
      assert.strictEqual(outcome.error?.response?.status, 401, `${name}: with its own 401`);
      assert.deepStrictEqual(h.authorizationsFor("/r"), ["Bearer tA"], `${name}: the failed request is not retried`);
      assert.deepStrictEqual(h.state.loginReasons, [], `${name}: the user stays signed in`);
      assert.deepStrictEqual(h.tokens(), ["tA", "rA"], `${name}: the known pair is kept`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], `${name}: the refresh token is not re-sent on its own`);

      let cleaned = 0;
      const done = await within(h.logoutSession(session, async () => { cleaned += 1; }));
      assert.strictEqual(done, true, `${name}: logout completes`);
      assert.deepStrictEqual(
        h.state.logoutCalls,
        [{ authorization: "Bearer tA", body: { refresh_token: "rA" } }],
        `${name}: logout presents only the pair the device knows`,
      );
      assert.deepStrictEqual(h.state.refreshesSent, ["rA"], `${name}: logout does not refresh first`);
      assert.deepStrictEqual(h.tokens(), [null, null], `${name}: a 401 to logout still clears the device`);
      assert.strictEqual(cleaned, 1, `${name}: local cleanup runs`);
      assert.strictEqual(h.tokenRefresh.refreshStateSize(), 0, `${name}: nothing is held afterwards`);
    }
    // The outcome itself, as the interceptor sees it.
    {
      const h = createHarness({ refresh: async () => "timeout", resource: async () => 401 });
      await h.signIn("tA", "rA", "a");
      const session = await h.authStorage.captureAuthSession();
      const outcome = await within(h.tokenRefresh.refreshAuthSession(session));
      assert.deepStrictEqual(
        { outcome: outcome.outcome, session: outcome.session },
        { outcome: h.tokenRefresh.RefreshResult.UNAVAILABLE, session: null },
        "a lost refresh answer is UNAVAILABLE, with no session to retry under",
      );
    }
  });

  // 16. Nothing credential-shaped reaches a log or a failure report. The
  //     development logs are switched on, and every path that writes one is
  //     driven with tokens that would be unmistakable if they leaked.
  {
    const SECRET = /SECRET|Bearer|refresh_token/;
    const captured = [];
    const methods = ["log", "info", "warn", "error", "debug"];
    const original = Object.fromEntries(methods.map((m) => [m, console[m]]));
    const hadDev = "__DEV__" in global;
    const previousDev = global.__DEV__;
    global.__DEV__ = true;
    methods.forEach((m) => {
      console[m] = (...args) => {
        captured.push(args.map((a) => {
          try { return typeof a === "string" ? a : JSON.stringify(a); } catch (_) { return String(a); }
        }).join(" "));
      };
    });
    try {
      const answers = [
        pair("ACCESS-SECRET-A2", "REFRESH-SECRET-A2"),
        401,
        422,
        { status: 429, headers: { "retry-after": "5" } },
        503,
        "timeout",
        "offline",
        { access_token: "ACCESS-SECRET-HALF" },
      ];
      for (const answer of answers) {
        const h = createHarness({
          refresh: async () => answer,
          resource: async (auth) => (auth === "Bearer ACCESS-SECRET-A2" ? 200 : 401),
          logout: async () => 401,
        });
        await h.signIn("ACCESS-SECRET-A", "REFRESH-SECRET-A", "a");
        const session = await h.authStorage.captureAuthSession();
        await within(h.request("api", "/r"));
        await within(h.request("infoApi", "/i"));
        await within(h.logoutSession(session, async () => {}));
      }
    } finally {
      methods.forEach((m) => { console[m] = original[m]; });
      if (hadDev) global.__DEV__ = previousDev;
      else delete global.__DEV__;
    }
    assert.ok(captured.length > 0, "the development logs were exercised");
    const leaked = captured.filter((line) => SECRET.test(line)).length;
    assert.strictEqual(leaked, 0, `no development log line carries a token, header or body (${leaked} did)`);

    // A failure report: an axios error dragging its config and response, and
    // assertions that would print the values they compared.
    const realAxios = require("axios");
    const config = {
      url: "/auth/refresh",
      headers: { Authorization: "Bearer ACCESS-SECRET-X" },
      data: JSON.stringify({ refresh_token: "REFRESH-SECRET-X" }),
    };
    const axiosFailure = new realAxios.AxiosError("Request failed with status code 401", "ERR_BAD_REQUEST", config, null, {
      status: 401, data: { echoed: "REFRESH-SECRET-X" }, headers: {}, config,
    });
    const reports = [axiosFailure];
    for (const compare of [
      () => assert.deepStrictEqual(["ACCESS-SECRET-X"], ["ACCESS-SECRET-Y"]),
      () => assert.strictEqual("REFRESH-SECRET-X", "REFRESH-SECRET-Y"),
    ]) {
      try { compare(); } catch (error) { reports.push(error); }
    }
    for (const report of reports) {
      const safe = sanitizeFailure(report);
      const printed = `${safe.stack}\n${safe.message}\n${Object.keys(safe).join(",")}`;
      assert.ok(!SECRET.test(printed), `a ${report.name} failure is reported without credentials`);
    }
  }

  // 12. The runners fail a run whose async test never settles.
  {
    const guard = JSON.stringify(path.join(__dirname, "settleGuard.js"));
    const hung = spawnSync(process.execPath, ["-e", `require(${guard})("probe"); new Promise(() => {});`], { encoding: "utf8" });
    assert.strictEqual(hung.status, 1, "a run that never settles exits non-zero");
    assert.ok(/probe did not finish/.test(hung.stderr), "and says why");
    const settled = spawnSync(process.execPath, ["-e", `const done = require(${guard})("probe"); Promise.resolve().then(done);`], { encoding: "utf8" });
    assert.strictEqual(settled.status, 0, "a run that finishes exits zero");
    const runner = fs.readFileSync(path.join(__dirname, "test.js"), "utf8");
    assert.ok(/require\("\.\/settleGuard"\)/.test(runner), "the main runner installs the guard");
  }

  // 13. A caller must outlive the renewal it can trigger. The inbox sync ran
  //     with a five-second budget against a thirty-second refresh client, so
  //     a slow connection aborted it while the renewal was still in flight.
  {
    const notifications = fs.readFileSync(path.join(SERVICES, "notificationService.js"), "utf8");
    const refreshSource = fs.readFileSync(path.join(SERVICES, "tokenRefresh.js"), "utf8");
    const refreshBudget = Number(/timeout: (\d+)/.exec(refreshSource)?.[1]);
    assert.ok(refreshBudget > 0, "the refresh client must declare a timeout");
    const syncBudget = Number(/const INBOX_SYNC_TIMEOUT_MS = (\d+);/.exec(notifications)?.[1]);
    assert.ok(syncBudget >= refreshBudget, "the inbox sync must not abort before the renewal it triggers can finish");

    // Removing the push token runs during logout and must not refresh: a
    // renewal there would rotate the pair logout is about to revoke.
    const deleteCall = /api\.delete\("\/push-token",[\s\S]{0,260}?\}\);/.exec(notifications);
    assert.ok(deleteCall && /skipAuthRefresh: true/.test(deleteCall[0]), "the push-token delete must not refresh");
  }

  console.log("Token refresh tests OK");
}

// A failure is reported by what failed, never by the values involved. An
// axios error carries its request config — the Authorization header and a
// body that may hold a refresh token — and an assertion carries the token
// strings it compared; printed whole, either would put credentials in CI
// output if this suite ever ran against real ones.
const sanitizeFailure = (error) => {
  // An assertion without a message of its own describes itself by printing
  // the values it compared.
  const message = error?.generatedMessage
    ? "assertion failed (compared values withheld)"
    : (error?.message ?? String(error));
  const safe = new Error(message);
  safe.name = error?.name ?? "Error";
  if (error?.code) safe.code = error.code;
  safe.stack = `${safe.name}: ${safe.message}\n${String(error?.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line)).join("\n")}`;
  return safe;
};
const run = () => main().catch((error) => { throw sanitizeFailure(error); });

if (require.main === module) {
  const markFinished = guardUnsettled("Token refresh tests");
  run().then(markFinished, (error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });
} else {
  module.exports = run;
}
