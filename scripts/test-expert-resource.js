// Guards the expert CRUD lists (useResource) against showing an entry the
// server has already deleted.
//
// Deleting an entry and leaving the screen before "deleted" appeared left the
// entry on the list when the screen was opened again — while the menu count,
// updated separately, already showed it gone. Pressing edit or delete on it
// answered 404. Leaving the screen unmounted the hook while its post-delete
// refetch was still in flight; the refetch's answer was then discarded as
// belonging to an unmounted screen, and the cached list from before the
// delete stayed "fresh" for five minutes, so reopening served it without
// asking the server.
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

// Just enough of React to mount a hook once, run its effects and unmount it.
const createReact = () => {
  let instance = null;
  const react = {
    useState(initial) {
      const index = instance.state.length;
      instance.state.push(typeof initial === "function" ? initial() : initial);
      const target = instance;
      return [target.state[index], (next) => {
        target.state[index] = typeof next === "function" ? next(target.state[index]) : next;
      }];
    },
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useEffect: (callback) => instance.effects.push(callback),
  };
  const mount = (useHook) => {
    instance = { state: [], effects: [], cleanups: [] };
    const current = instance;
    const api = useHook();
    current.effects.forEach((effect) => {
      const cleanup = effect();
      if (typeof cleanup === "function") current.cleanups.push(cleanup);
    });
    return {
      api,
      items: () => current.state[0],
      unmount: () => current.cleanups.forEach((cleanup) => cleanup()),
    };
  };
  return { react, mount };
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  global.__DEV__ = false;
  const storage = new Map();
  const asyncStorage = {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (keys) => { keys.forEach((key) => storage.delete(key)); },
  };
  const config = { STORAGE_KEYS: { CURRENT_USER_ID: "current_user_id" } };
  const resourceCache = load("src/services/resourceCache.js", {
    "@react-native-async-storage/async-storage": asyncStorage,
    "../config": config,
  });
  const expertChanges = load("src/services/expertChanges.js");

  const gets = [];
  const deletes = [];
  const infoApi = {
    get: (url) => new Promise((resolve) => { gets.push({ url, resolve }); }),
    delete: async (url) => { deletes.push(url); return { data: {} }; },
    post: async () => ({ data: {} }),
    put: async () => ({ data: {} }),
  };
  const session = { token: "t", generation: 1, userId: "u1" };
  const authStorage = {
    captureAuthSession: async () => session,
    isResourceSessionCurrent: async (candidate) => candidate === session,
    runWithSession: async (_session, operation) => operation(),
    subscribeAuthSession: () => () => {},
  };

  const { react, mount } = createReact();
  const { default: useResource } = load("src/hook/useResource.js", {
    react,
    "../services/infoApi": infoApi,
    "../services/expertChanges": expertChanges,
    "../services/resourceCache": resourceCache,
    "../services/authStorage": authStorage,
  });

  const counted = [];
  expertChanges.subscribeExpertChanges((endpoint) => counted.push(endpoint));

  // 1. Open the work-history screen: the list is fetched and cached.
  const first = mount(() => useResource("/workexes"));
  await settle();
  assert.equal(gets.length, 1, "opening the screen fetches the list");
  gets[0].resolve({ data: { data: [{ id: 765 }, { id: 766 }] } });
  await settle();
  assert.deepEqual(first.items().map((e) => e.id), [765, 766], "the list is shown");

  // 2. Delete 765, and leave the screen while the refetch after the delete
  //    is still on its way back.
  const deleting = first.api.remove(765);
  await settle();
  assert.deepEqual(deletes, ["/info/expert/workexes/765"], "the delete reaches the server");
  assert.deepEqual(counted, ["/workexes"], "the menu count is told about the delete");
  assert.equal(gets.length, 2, "the list is refetched after the delete");
  first.unmount();
  gets[1].resolve({ data: { data: [{ id: 766 }] } });
  await deleting;
  await settle();

  // 3. Open the screen again: the deleted entry must not come back from the
  //    cache, and the list must be asked of the server.
  const second = mount(() => useResource("/workexes"));
  await settle();
  assert.ok(
    !(second.items() ?? []).some((entry) => entry.id === 765),
    "an entry deleted on the server is not shown again from the cache",
  );
  if (gets.length === 3) {
    gets[2].resolve({ data: { data: [{ id: 766 }] } });
    await settle();
  }
  assert.deepEqual(second.items().map((e) => e.id), [766], "reopening shows the list as the server has it");
  second.unmount();

  // 4. A slow server: the list is still loading when the user deletes. The
  //    refetch after the delete used to join that earlier request and show
  //    its answer — the list as it was before the delete — so the deleted
  //    entry stayed on screen until something else (adding another entry)
  //    loaded the list again.
  storage.clear();
  gets.length = 0;
  deletes.length = 0;
  const third = mount(() => useResource("/interests"));
  await settle();
  assert.equal(gets.length, 1, "opening the screen starts loading the list");
  const removing = third.api.remove(3);
  await settle();
  assert.deepEqual(deletes, ["/info/expert/interests/3"], "the delete reaches the server");
  assert.equal(gets.length, 2, "the list is asked for again after the delete, not taken from the load already running");
  gets[0].resolve({ data: { data: [{ id: 1 }, { id: 2 }, { id: 3 }] } });
  gets[1].resolve({ data: { data: [{ id: 1 }, { id: 2 }] } });
  await removing;
  await settle();
  assert.deepEqual(third.items().map((e) => e.id), [1, 2], "the deleted entry leaves the list at once");
  const cached = await resourceCache.readResourceCache("expert:/interests:{}", { scope: "u1" });
  assert.deepEqual(cached.data.map((e) => e.id), [1, 2], "and the cache holds the list after the delete");
  third.unmount();

  console.log("Expert resource tests OK");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  module.exports = main;
}
