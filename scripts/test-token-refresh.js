// Guards the refresh-token contract.
//
// A refresh token may be redeemed once. The backend treats a second
// redemption as theft and revokes every token on the device, so two
// concurrent refreshes do not merely waste a request — they sign the user
// out. The single-flight behaviour is the whole safety property here, and
// these tests drive the real module rather than a copy of it.
const assert = require("assert");
const path = require("path");
const Module = require("module");

const MODULE = path.join(__dirname, "..", "src", "services", "tokenRefresh.js");

// Minimal loader: compile the ES module source with the project's babel
// config and stub its imports, so the test exercises the shipped file.
const loadTokenRefresh = ({ post, refreshToken, currentSession, onSave }) => {
  const babel = require("@babel/core");
  const fs = require("fs");
  // babel-preset-expo is what the rest of the suite compiles with, so the
  // module is transformed exactly as the app sees it.
  const code = babel.transformSync(fs.readFileSync(MODULE, "utf8"), {
    filename: MODULE,
    presets: ["babel-preset-expo"],
  }).code;

  const stubs = {
    axios: { create: () => ({ post }) },
    "../config": { API_BASE_URL: "https://example.test/api" },
    "./authStorage": {
      captureAuthSession: async () => currentSession(),
      getRefreshToken: async () => refreshToken(),
      isAuthSessionCurrent: async (session) => session === currentSession(),
      saveAuthSession: async (...args) => onSave(...args),
    },
    "./userSecurityKeys": { getCurrentUserId: async () => "u1" },
  };

  const wrapper = new Module(MODULE, module);
  wrapper.filename = MODULE;
  wrapper.paths = Module._nodeModulePaths(path.dirname(MODULE));
  wrapper.require = (request) => (request in stubs ? stubs[request] : require(request));
  wrapper._compile(code, MODULE);
  return wrapper.exports;
};

async function main() {
  // 1. Concurrent 401s must redeem the refresh token exactly once.
  {
    let posts = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const session = { token: "old", generation: 1 };
    const saved = [];
    const mod = loadTokenRefresh({
      post: async () => {
        posts += 1;
        await gate;
        return { data: { access_token: "new", refresh_token: "r2" } };
      },
      refreshToken: () => "r1",
      currentSession: () => session,
      onSave: (...args) => { saved.push(args); },
    });

    const all = Promise.all([
      mod.refreshAuthSession(session),
      mod.refreshAuthSession(session),
      mod.refreshAuthSession(session),
    ]);
    release();
    const results = await all;

    assert.strictEqual(posts, 1, "three concurrent 401s must trigger one refresh, not three");
    assert.deepStrictEqual(results, [true, true, true], "every waiter receives the shared result");
    assert.strictEqual(saved.length, 1, "the session is written once");
    assert.strictEqual(saved[0][0], "new", "the new access token is stored");
    assert.strictEqual(saved[0][3], "r2", "the rotated refresh token replaces the spent one");
  }

  // 2. A later refresh starts a fresh request: the gate must not latch.
  {
    let posts = 0;
    const session = { token: "old", generation: 1 };
    const mod = loadTokenRefresh({
      post: async () => {
        posts += 1;
        return { data: { access_token: "new", refresh_token: "r2" } };
      },
      refreshToken: () => "r1",
      currentSession: () => session,
      onSave: () => {},
    });
    await mod.refreshAuthSession(session);
    await mod.refreshAuthSession(session);
    assert.strictEqual(posts, 2, "a refresh after the first settles must issue its own request");
    assert.strictEqual(mod.isRefreshInFlight(), false, "the in-flight slot is released");
  }

  // 3. A 401 from the refresh endpoint clears the dead token, so a later
  //    failure cannot replay it — replay is what the backend calls theft.
  {
    const session = { token: "old", generation: 1 };
    const saved = [];
    const mod = loadTokenRefresh({
      post: async () => {
        const error = new Error("unauthorized");
        error.response = { status: 401 };
        throw error;
      },
      refreshToken: () => "spent",
      currentSession: () => session,
      onSave: (...args) => { saved.push(args); },
    });
    assert.strictEqual(await mod.refreshAuthSession(session), false, "a refused refresh ends the session");
    assert.strictEqual(saved.length, 1, "the spent refresh token is cleared");
    assert.strictEqual(saved[0][3], "", "clearing writes an empty refresh token");
  }

  // 4. A network failure says nothing about the token, so it is kept.
  {
    const session = { token: "old", generation: 1 };
    const saved = [];
    const mod = loadTokenRefresh({
      post: async () => { throw Object.assign(new Error("timeout"), { code: "ECONNABORTED" }); },
      refreshToken: () => "r1",
      currentSession: () => session,
      onSave: (...args) => { saved.push(args); },
    });
    assert.strictEqual(await mod.refreshAuthSession(session), false, "a timeout does not renew the session");
    assert.strictEqual(saved.length, 0, "a timeout must not discard a token that may still be valid");
  }

  // 5. A session replaced mid-flight must not be resurrected.
  {
    const original = { token: "old", generation: 1 };
    let active = original;
    const saved = [];
    const mod = loadTokenRefresh({
      post: async () => {
        active = { token: "other", generation: 2 };
        return { data: { access_token: "new", refresh_token: "r2" } };
      },
      refreshToken: () => "r1",
      currentSession: () => active,
      onSave: (...args) => { saved.push(args); },
    });
    assert.strictEqual(await mod.refreshAuthSession(original), false, "a superseded session is not restored");
    assert.strictEqual(saved.length, 0, "nothing is written for a session the user already left");
  }

  // 6. With no refresh token there is nothing to exchange.
  {
    const session = { token: "old", generation: 1 };
    const mod = loadTokenRefresh({
      post: async () => { throw new Error("must not be called"); },
      refreshToken: () => null,
      currentSession: () => session,
      onSave: () => {},
    });
    assert.strictEqual(await mod.refreshAuthSession(session), false, "no refresh token means no request");
  }

  console.log("Token refresh tests OK");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  module.exports = main;
}
