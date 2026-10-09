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
  const changes = load("src/services/lrdChanges.js");
  const lrdResponse = load("src/utils/lrdResponse.js");
  const notified = [];
  const unsubscribe = changes.subscribeLrdChange((endpoint) => notified.push(endpoint));
  changes.notifyLrdChange("/info/lrd/researches");
  unsubscribe();
  changes.notifyLrdChange("/info/lrd/papers");
  assert.deepEqual(notified, ["/info/lrd/researches"], "only active listeners receive LRD mutations");

  const state = [];
  const effects = [];
  const pending = [];
  const react = {
    useState(initial) {
      const index = state.length;
      state.push(initial);
      return [initial, (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      }];
    },
    useRef(current) {
      return { current };
    },
    useCallback: (callback) => callback,
    useEffect: (callback) => effects.push(callback),
  };
  const hook = load("src/hook/useLrdResource.js", {
    react,
    "@react-navigation/native": { useFocusEffect: () => {} },
    "../services/lrdApi": {
      deleteLrd: async () => ({ data: {} }),
      getLrd: (endpoint, config) => new Promise((resolve, reject) => {
        pending.push({ endpoint, config, resolve, reject });
      }),
      getLrdErrorMessage: (error) => error.message,
      LRD_ENDPOINTS: { researches: "/info/lrd/researches", papers: "/info/lrd/papers" },
      patchLrd: async () => ({ data: {} }),
      postLrd: async () => ({ data: { data: { id: 3 } } }),
    },
    "../services/lrdChanges": changes,
    "../config": { INFO_API_BASE_URL: "https://info.example.test/api" },
    "../utils/lrdDiagnostics": {
      createLrdRequestId: () => "test-request",
      getLrdCacheAgeMs: () => null,
      getSafeLrdErrorDetails: () => ({ status: null, fields: [], message: "error" }),
      summarizeLrdOwnership: () => null,
      summarizeLrdParams: () => ({}),
    },
    "../utils/lrdResourceState": {
      resolveLrdApiState(payload) {
        const body = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
        const items = Array.isArray(body?.data) ? body.data : [];
        return {
          items,
          pagination: {
            total: Number(body?.total ?? items.length),
            currentPage: body?.current_page ?? 1,
            perPage: body?.per_page ?? 1,
            lastPage: body?.last_page ?? 1,
          },
        };
      },
      resolveLrdFailureState: () => ({ items: [], total: 0, stale: false, source: "none" }),
    },
    "../utils/lrdResponse": lrdResponse,
    "../services/resourceCache": {
      getResourceCacheScope: async () => "account-A",
      invalidateResourceCache: async () => 0,
      readResourceCache: async () => null,
      writeResourceCache: async (_key, data) => ({ data, updatedAt: Date.now() }),
    },
    "../services/authStorage": {
      captureAuthSession: async () => ({ generation: 1, userId: "account-A", token: "test-token" }),
      isResourceSessionCurrent: async () => true,
      runWithSession: async (_session, operation) => operation(),
      subscribeAuthSession: () => () => {},
    },
  }).default;

  const resource = hook("/info/lrd/researches", {
    params: { scope: "mine", page: 1, per_page: 1 },
    loadOnFocus: false,
    refetchAfterMutation: false,
  });
  const cleanups = effects.map((effect) => effect()).filter((cleanup) => typeof cleanup === "function");
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const olderRequest = resource.refetch({ force: true });
  await flush();
  assert.equal(pending.length, 1);
  const newerRequest = resource.refetch({ force: true });
  await flush();
  assert.equal(pending.length, 2, "a forced refresh starts a fresh API request while an older one is pending");

  pending[1].resolve({
    status: 200,
    data: { data: [{ id: "second-project" }], total: 2, current_page: 1, per_page: 1, last_page: 2 },
  });
  await newerRequest;
  pending[0].resolve({
    status: 200,
    data: { data: [{ id: "first-project" }], total: 1, current_page: 1, per_page: 1, last_page: 1 },
  });
  await olderRequest;
  assert.equal(state[1], 2, "a late older response cannot overwrite the refreshed total");
  assert.equal(state[0][0].id, "second-project", "the refreshed page remains visible");

  const unorderedResponse = resource.refetch({ force: true });
  await flush();
  pending[2].resolve({
    status: 200,
    data: { data: [{ id: 3 }, { id: 1 }, { id: 2 }], total: 3, current_page: 1, per_page: 20, last_page: 1 },
  });
  await unorderedResponse;
  assert.deepEqual(state[0].map((row) => row.id), [1, 2, 3], "project pages render oldest-first before numbering");

  const mutationEvents = [];
  const stopListening = changes.subscribeLrdChange((endpoint) => mutationEvents.push(endpoint));
  await resource.create({ projectname: "fixture" });
  stopListening();
  assert.deepEqual(mutationEvents, ["/info/lrd/researches"], "successful create invalidates sibling counters");

  cleanups.forEach((cleanup) => cleanup());
  console.log("LRD resource freshness tests OK");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  module.exports = main;
}
