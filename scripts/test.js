const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("@babel/core");

process.env.EXPO_PUBLIC_API_URL = "https://api.example.test/api";

function loadModule(relativePath) {
  const filename = path.resolve(process.cwd(), relativePath);
  const code = fs.readFileSync(filename, "utf8");
  const output = babel.transformSync(code, {
    filename,
    presets: ["babel-preset-expo"],
  });
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output.code, filename);
  return mod.exports;
}

const thaiDate = loadModule("src/utils/thaiDate.js");
const image = loadModule("src/utils/image.js");
const name = loadModule("src/utils/name.js");
const inputSanitize = loadModule("src/utils/inputSanitize.js");
const url = loadModule("src/utils/url.js");

const parsed = thaiDate.parseISOToDate("2024-10-26");
assert.equal(parsed.getFullYear(), 2024);
assert.equal(parsed.getMonth(), 9);
assert.equal(parsed.getDate(), 26);
assert.equal(thaiDate.toISODate(new Date(2024, 9, 26)), "2024-10-26");
assert.equal(thaiDate.formatThaiDate("2024-10-26"), "26/10/2567");
assert.equal(thaiDate.formatThaiDate("0000-00-00"), "");

assert.equal(
  image.fixPhotoUrl("/storage/photos/profile.jpg"),
  "https://api.example.test/storage/photos/profile.jpg",
);
assert.equal(
  image.fixPhotoUrl("http://localhost:8001/storage/photos/profile.jpg"),
  "https://api.example.test/storage/photos/profile.jpg",
);
assert.equal(image.fixPhotoUrl("https://cdn.example.test/a.jpg"), "https://cdn.example.test/a.jpg");
assert.equal(image.fixPhotoUrl(null), "");

assert.equal(name.stripNamePrefix("นางสาว สมใจ ทดสอบ"), "สมใจ ทดสอบ");
assert.equal(name.stripNamePrefix("นายธรานนท์ ไชยโสภา"), "ธรานนท์ ไชยโสภา");
assert.equal(name.stripNamePrefix("ดร. ตัวอย่าง ทดสอบ"), "ตัวอย่าง ทดสอบ");
assert.equal(name.stripNamePrefix("ไม่มีคำนำหน้า"), "ไม่มีคำนำหน้า");

assert.equal(
  inputSanitize.sanitizeAcademicText("O'Reilly: E=mc²; Smith [2026]"),
  "O'Reilly: E=mc²; Smith [2026]",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("Universite\u0301 de Paris\r\nResearch"),
  "Université de Paris\nResearch",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("Thai\u0000 text\u0007"),
  "Thai text",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("University 🫶 of Oxford"),
  "University of Oxford",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("ข้อมูล €$|<>{}^!?#*¥ 🫶 + [] = _ %"),
  "ข้อมูล + [] = _ %",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("คณะวิทยาศาสตร์ ฿ 2569"),
  "คณะวิทยาศาสตร์ 2569",
);
assert.equal(
  inputSanitize.sanitizePhoneInput("08🫶-123 ABC (456)"),
  "08-123 (456)",
);
assert.equal(
  inputSanitize.sanitizeLinkInput(" https://example.org/a b?q=1&x=฿<tag> 😄 "),
  "https://example.org/ab?q=1&x=tag",
);

const driveUrl = url.normalizeOptionalUrl("https://drive.google.com/file/d/example/view");
assert.equal(driveUrl.ok, true);
assert.equal(driveUrl.url, "https://drive.google.com/file/d/example/view");

const urlWithoutProtocol = url.normalizeOptionalUrl("example.org/research/file.pdf");
assert.equal(urlWithoutProtocol.ok, true);
assert.equal(urlWithoutProtocol.url, "https://example.org/research/file.pdf");

const invalidFileLink = url.normalizeOptionalUrl("90198282฿)/&-&:&:@&฿฿฿$$$$€€€¥");
assert.equal(invalidFileLink.ok, false);
assert.equal(invalidFileLink.url, null);

const unsafeProtocol = url.normalizeOptionalUrl("javascript:alert(1)");
assert.equal(unsafeProtocol.ok, false);
assert.equal(unsafeProtocol.url, null);

const emptyUrl = url.normalizeOptionalUrl("");
assert.equal(emptyUrl.ok, true);
assert.equal(emptyUrl.url, null);

async function testForegroundRefresh() {
  const { startForegroundRefresh } = loadModule("src/utils/foregroundRefresh.js");
  let active = true;
  let notify;
  let finish;
  let calls = 0;
  let unsubscribed = false;
  const timers = new Map();
  let timerId = 0;
  const stop = startForegroundRefresh({
    refresh: () => {
      calls += 1;
      return new Promise((resolve) => { finish = resolve; });
    },
    isActive: () => active,
    subscribe: (listener) => {
      notify = listener;
      return () => { unsubscribed = true; };
    },
    schedule: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    cancel: (id) => timers.delete(id),
  });
  assert.equal(calls, 1, "refresh immediately without opening inbox");
  await notify();
  assert.equal(calls, 1, "do not overlap requests");
  finish();
  await Promise.resolve();
  let next = [...timers.values()][0];
  assert.equal(next.delay, 0, "refresh again after session/activity change");
  const running = next.callback();
  finish();
  await running;
  next = [...timers.values()][0];
  assert.equal(next.delay, 10000);
  active = false;
  await notify();
  assert.equal(timers.size, 0, "stop timers in background");
  const previousCalls = calls;
  active = true;
  const resumed = notify();
  assert.equal(calls, previousCalls + 1, "refresh immediately on foreground");
  stop();
  finish();
  await resumed;
  assert.equal(timers.size, 0, "in-flight completion cannot restart disposed timer");
  assert.equal(unsubscribed, true);

  let retry;
  const stopFailure = startForegroundRefresh({
    refresh: async () => { throw new Error("offline"); },
    isActive: () => true,
    subscribe: () => () => {},
    schedule: (callback, delay) => { retry = { callback, delay }; return 1; },
    cancel: () => {},
  });
  await Promise.resolve();
  assert.equal(retry.delay, 10000, "network failure keeps bounded refresh cadence");
  stopFailure();
}

testForegroundRefresh().then(() => console.log("Tests OK")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
