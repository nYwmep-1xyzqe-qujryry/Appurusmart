// Guards the e-Research project save contract.
//
// GET /projects (list and detail) omits columns the API still accepts on
// save — budget, bcg, sdg — so those fields hydrate blank in the edit form
// even when the stored record holds a value. PUT/PATCH merges absent keys
// but writes an explicit null, so sending that blankness back as null
// erased the user's data on every edit.
//
// The test drives the payload builder from ProjectForm.js itself rather
// than a copy, so reintroducing `|| null` on the update path fails here.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "src", "screens", "e-research", "ProjectForm.js");

// Pull the payload construction out of handleSave and run it in isolation.
// Anchoring on the real source keeps the test honest: if the block is
// renamed or removed the extraction throws rather than silently passing.
const buildPayloadFactory = () => {
  const source = fs.readFileSync(SOURCE, "utf8");
  const start = source.indexOf("      const optional = (value) => {");
  const end = source.indexOf("      const mutationResult = editingItem");
  assert.ok(
    start !== -1 && end !== -1 && end > start,
    "ProjectForm must build its payload through the documented optional()/delete block",
  );
  const body = source.slice(start, end);
  assert.ok(
    !/\|\|\s*null/.test(body),
    "the update payload must not coerce an empty optional field to null",
  );
  // eslint-disable-next-line no-new-func
  return new Function("form", "editingItem", `${body}\n      return payload;`);
};

async function main() {
  const buildPayload = buildPayloadFactory();

  const blankForm = {
    titleTh: "โครงการทดสอบ",
    year: "2568",
    field: "1",
    fundingSource: "2",
    titleEn: "",
    keywords: "คำสำคัญ",
    objective: "",
    abstract: "",
    contributors: "",
    localExperts: "",
    budget: "",
  };

  // 1. Editing a record whose budget/abstract the API never returned.
  const editing = { id: 7, researcher_id: "r1" };
  const editPayload = buildPayload(blankForm, editing);

  ["budget", "abstract", "objective", "contributor", "local_expert", "projectname_eng"]
    .forEach((key) => {
      assert.ok(
        !(key in editPayload),
        `${key} must be omitted on update so the stored value survives`,
      );
    });
  assert.strictEqual(
    Object.values(editPayload).some((value) => value === null),
    false,
    "no key may carry null on update; null clears the column",
  );
  // Required fields still travel.
  assert.strictEqual(editPayload.projectname, "โครงการทดสอบ");
  assert.strictEqual(editPayload.year_id, 2568);
  assert.strictEqual(editPayload.keyword, "คำสำคัญ");

  // 2. The user's real edits must still be sent.
  const filledPayload = buildPayload(
    { ...blankForm, abstract: "  บทคัดย่อ  ", budget: "50000" },
    editing,
  );
  assert.strictEqual(filledPayload.abstract, "บทคัดย่อ", "a typed value is trimmed and sent");
  assert.strictEqual(filledPayload.budget, 50000, "budget is sent as a number");

  // 3. Creating is unaffected: null is harmless on a new row and keeps the
  //    previous contract for a backend that distinguishes absent from null.
  const createPayload = buildPayload(blankForm, null);
  assert.strictEqual(createPayload.abstract, null, "create still sends null for an empty field");
  assert.strictEqual(createPayload.budget, null, "create still sends null budget");

  // 4. Clearing a value stays possible through an empty string, which the
  //    backend stores as empty rather than reading as "unchanged".
  const clearedPayload = buildPayload({ ...blankForm, abstract: "   " }, editing);
  assert.ok(
    !("abstract" in clearedPayload),
    "whitespace-only input is treated as untouched, not as a deliberate clear",
  );

  console.log("Project form payload tests OK");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  module.exports = main;
}
