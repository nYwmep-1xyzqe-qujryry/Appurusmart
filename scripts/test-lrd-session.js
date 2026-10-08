const assert = require("assert/strict");
const fs = require("fs");
const babel = require("@babel/core");

const load = (file, dependencies = {}) => {
  const { code } = babel.transformSync(fs.readFileSync(file, "utf8"), {
    filename: file,
    presets: ["babel-preset-expo"],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name in dependencies) return dependencies[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
};

async function main() {
  global.__DEV__ = false;
  let currentSession = { generation: 1, userId: "A", token: "token-A" };
  let releaseCacheWrite;
  let cacheWriteStarted;
  const storedResearcherIds = [];
  const state = [];
  const effects = [];
  const react = {
    useState(initial) {
      const index = state.length;
      state.push(initial);
      return [initial, (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      }];
    },
    useRef(current) { return { current }; },
    useCallback(callback) { return callback; },
    useEffect(callback) { effects.push(callback); },
  };

  const useLrdSession = load("src/hook/useLrdSession.js", {
    react,
    "../services/lrdApi": {
      getLrd: async () => ({ data: {
        authenticated: true,
        user: { lrd_researcher_id: "researcher-A" },
      } }),
      getLrdErrorMessage: (error) => error.message,
      LRD_ENDPOINTS: { session: "/info/session" },
      registerLrdResearcher: async () => ({ data: { registered: true, researcher_id: "researcher-A" } }),
    },
    "../config": { STORAGE_KEYS: { LRD_RESEARCHER_ID: "lrd_researcher" } },
    "../services/userScopedStorage": {
      getUserScopedValueForSession: async () => null,
      setUserScopedValueForSession: async (_key, session, value) => {
        storedResearcherIds.push({ userId: session.userId, value });
      },
    },
    "../services/resourceCache": {
      readResourceCache: async () => null,
      writeResourceCache: async () => {
        cacheWriteStarted?.();
        return new Promise((resolve) => { releaseCacheWrite = resolve; });
      },
    },
    "../services/authStorage": {
      captureAuthSession: async () => currentSession,
      isResourceSessionCurrent: async (session) => session === currentSession,
      runWithSession: async (_session, operation) => operation(),
      subscribeAuthSession: () => () => {},
    },
  }).default;

  const hook = useLrdSession();
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  cacheWriteStarted = resolveStarted;
  const request = hook.refetch({ force: true });
  await started;

  currentSession = { generation: 2, userId: "B", token: "token-B" };
  releaseCacheWrite();
  await request;

  assert.deepEqual(
    storedResearcherIds,
    [{ userId: "A", value: "researcher-A" }],
    "a delayed A response must never write its researcher id under account B",
  );
  effects.forEach((effect) => {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanup();
  });
  console.log("LRD session race tests OK");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  module.exports = main;
}
