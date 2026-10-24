// Catches a name used but never imported.
//
// ProjectForm called getResearchYear with no import for it, and the screen
// crashed the moment someone opened a research record to edit. Lint passed,
// every test passed, and the build succeeded — nothing reads a module's
// bindings, so the gap only showed on a device.
//
// Compiling each screen is not enough either: an undefined identifier is a
// runtime error in JavaScript, not a syntax one. So the check is textual —
// for each helper module, every file that calls one of its exports must name
// that export in an import from it.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");

// Helper modules whose exports share a recognisable prefix, so a call can be
// matched back to the module that must provide it.
const MODULES = [
  { file: "screens/e-research/researchFields.js", prefix: "getResearch" },
  { file: "utils/expertFields.js", prefix: "getExpert" },
];

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return walk(full);
  return entry.name.endsWith(".js") ? [full] : [];
});

async function main() {
  const files = walk(SRC);

  for (const { file, prefix } of MODULES) {
    const modulePath = path.join(SRC, file);
    const source = fs.readFileSync(modulePath, "utf8");
    const exported = new Set(
      [...source.matchAll(new RegExp(`export const (${prefix}\\w+)`, "g"))].map((m) => m[1]),
    );
    assert.ok(exported.size > 0, `${file} must export names beginning ${prefix}`);

    const moduleName = path.basename(file, ".js");
    for (const consumer of files) {
      if (consumer === modulePath) continue;
      const text = fs.readFileSync(consumer, "utf8");
      const used = new Set(
        [...text.matchAll(new RegExp(`\\b(${prefix}\\w+)\\s*\\(`, "g"))].map((m) => m[1]),
      );
      if (used.size === 0) continue;

      // Everything the file imports from this module, across any import form.
      const importBlocks = [...text.matchAll(
        new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["'][^"']*${moduleName}["']`, "g"),
      )].map((m) => m[1]).join(",");
      const importedNames = new Set(
        importBlocks.split(",").map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean),
      );

      for (const name of used) {
        if (!exported.has(name)) continue;
        assert.ok(
          importedNames.has(name),
          `${path.relative(SRC, consumer)} calls ${name} without importing it from ${moduleName}`,
        );
      }
    }
  }

  console.log("Import integrity tests OK");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  module.exports = main;
}
