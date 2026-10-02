const assert = require("assert/strict");
const fs = require("fs");
const babel = require("@babel/core");

const load = (file, dependencies = {}) => {
  const { code } = babel.transformSync(fs.readFileSync(file, "utf8"), {
    filename: file, presets: ["babel-preset-expo"],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name in dependencies) return dependencies[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
};

async function main() {
  const state = [];
  const effects = [];
  const pending = [];
  let session = { userId: "A" };
  let onSession;
  const changes = load("src/services/expertChanges.js");
  const hook = load("src/hook/useExpertCounts.js", {
    react: {
      useState(value) {
        const index = state.length;
        state.push(value);
        return [value, (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
      },
      useRef: (current) => ({ current }),
      useCallback: (callback) => callback,
      useEffect: (callback) => effects.push(callback),
    },
    "../services/infoApi": { get: (path, config) => new Promise((resolve, reject) => pending.push({ path, config, resolve, reject })) },
    "../services/authStorage": {
      captureAuthSession: async () => session,
      isAuthSessionCurrent: async (value) => value === session,
      subscribeAuthSession: (callback) => { onSession = callback; return () => {}; },
    },
    "../services/expertChanges": changes,
    "../utils/responseCount": load("src/utils/responseCount.js"),
  }).default;
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const result = hook([{ key: "books", path: "/books" }]);
  let cleanup = effects[0]();
  await flush();
  assert.equal(pending[0].path, "/info/expert/books");
  pending.shift().resolve({ data: { data: [], total: 2 } });
  await flush();
  assert.equal(state[0].books, 2);

  const older = result.refetch();
  await flush();
  changes.notifyExpertChange("/books");
  await flush();
  assert.equal(state[1], false, "background refresh keeps badges visible");
  pending[1].resolve({ data: { data: [], total: 3 } });
  await flush();
  pending[0].resolve({ data: { data: [], total: 2 } });
  await older;
  assert.equal(state[0].books, 3, "old response cannot overwrite the post-create count");
  pending.splice(0);
  changes.notifyExpertChange("/books");
  await flush();
  pending.shift().resolve({ data: { data: [], total: 0 } });
  await flush();
  assert.equal(state[0].books, 0, "delete can replace a nonzero count with zero");

  void result.refetch();
  await flush();
  session = { userId: "B" };
  onSession();
  await flush();
  pending.shift().resolve({ data: { total: 99 } });
  await flush();
  assert.deepEqual(state[0], {}, "account A result cannot enter account B");
  pending.shift().reject(new Error("404"));
  await flush();
  assert.equal(state[0].books, null, "failure must not claim zero items");

  cleanup();
  cleanup = effects[0]();
  await flush();
  pending.shift().resolve({ data: { total: 7 } });
  await flush();
  assert.equal(state[0].books, 7, "Strict Mode setup after cleanup can publish results");
  cleanup();
  changes.notifyExpertChange("/books");
  await flush();
  assert.equal(pending.length, 0, "unmounted hook is unsubscribed");
  console.log("Expert count behavior tests OK");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
