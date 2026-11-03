// Guards the in-app URU Smart logo: bundled, sized for the screen, and
// available to Login, Card and Chatbot without waiting on anything.
//
// The logo once appeared late on every screen and every cold start. It was
// the 1024px app icon, so each screen decoded a 4MB bitmap the first time it
// mounted the mark — and an Asset.loadAsync "preload" only copied the file
// into the cache directory, warming nothing <Image> draws from, while the app
// waited for it before rendering at all.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

// Width and height from a PNG's IHDR chunk, which always comes first.
const pngSize = (file) => {
  const buffer = fs.readFileSync(file);
  assert.strictEqual(buffer.toString("ascii", 12, 16), "IHDR", `${file} is a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
};

async function main() {
  // 1. Sized for its largest use: the 122pt Login mark is 488px at 4x
  //    density. Anything far beyond that is decode work the user waits on.
  const logoFile = path.join(ROOT, "src", "assets", "urusmartlogo.png");
  const logo = pngSize(logoFile);
  assert.ok(logo.width >= 488 && logo.height >= 488, "the logo stays sharp at 122pt on a 4x screen");
  assert.ok(logo.width <= 512 && logo.height <= 512, "the logo is not the full-size app icon");
  assert.ok(logo.bytes < 300 * 1024, "the bundled logo stays small");
  // The launcher icon and splash are native assets with their own size
  // requirements, and keep their own files.
  assert.strictEqual(pngSize(path.join(ROOT, "assets", "icon.png")).width, 1024, "the app icon keeps its full size");

  // 2. The module is a bundled require and nothing else: no session,
  //    network, storage or preload stands between a screen and the image.
  {
    const babel = require("@babel/core");
    const file = path.join(ROOT, "src", "assets", "brandAssets.js");
    const code = babel.transformSync(fs.readFileSync(file, "utf8"), {
      filename: file,
      presets: ["babel-preset-expo"],
    }).code;
    const requested = [];
    const BUNDLED = { bundledAsset: "urusmartlogo.png" };
    const mod = new Module(file, module);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(path.dirname(file));
    mod.require = (request) => {
      requested.push(request);
      if (request === "./urusmartlogo.png") return BUNDLED;
      throw new Error(`brandAssets must not depend on ${request}`);
    };
    mod._compile(code, file);
    assert.deepStrictEqual(requested, ["./urusmartlogo.png"], "brandAssets loads only the bundled image");
    assert.strictEqual(mod.exports.URUSMART_LOGO, BUNDLED, "URUSMART_LOGO is that bundled image, resolved at load");
    assert.strictEqual(typeof mod.exports.URUSMART_LOGO.then, "undefined", "nothing about it is asynchronous");
  }

  // 3. Every screen draws that constant directly. Login shows it before any
  //    session exists; Card and Chatbot (through HeaderBar) show it without
  //    waiting for the card or chat data they fetch.
  const consumers = [
    ["src/screens/Login.js", "Login"],
    ["src/screens/Card.js", "Staff Card"],
    ["src/components/HeaderBar.js", "HeaderBar (Home, Card, Chatbot)"],
  ];
  for (const [file, label] of consumers) {
    const source = read(file);
    assert.ok(
      /import \{ URUSMART_LOGO \} from "\.\.\/assets\/brandAssets";/.test(source),
      `${label} takes the logo from brandAssets`,
    );
    assert.ok(/source=\{URUSMART_LOGO\}/.test(source), `${label} renders the bundled logo`);
    assert.ok(!/urusmartlogo/i.test(source.replace(/brandAssets/g, "")), `${label} does not load the file another way`);
  }
  assert.ok(/<HeaderBar\b/.test(read("src", "screens", "Chatbot.js")), "Chatbot shows the logo through HeaderBar");

  // 4. App start does not wait on an asset preload. The removed one only
  //    copied the file to the cache directory; the app stayed on the splash
  //    screen until it had.
  const app = read("App.js");
  assert.ok(!/preloadBrandAssets|brandAssets/.test(app), "App start does not wait on the brand asset");
  assert.ok(!/Asset\.loadAsync/.test(read("src", "assets", "brandAssets.js")), "and nothing preloads it into the cache directory");

  console.log("Brand asset tests OK");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  module.exports = main;
}
