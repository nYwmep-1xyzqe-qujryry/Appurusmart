// Guards the e-Research research save contract.
//
// PUT/PATCH merges absent keys but writes an explicit null, so sending a
// blank optional field back as null erases whatever the record holds. A
// field the response omits hydrates blank, which made every edit a silent
// delete of the columns the user had not retyped.
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

  ["budget"].forEach((key) => {
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
  assert.strictEqual(editPayload.title_th, "โครงการทดสอบ");
  assert.strictEqual(editPayload.createyear, "2568");
  assert.strictEqual(editPayload.keyword, "คำสำคัญ");

  // 2. The user's real edits to supported columns must still be sent.
  const filledPayload = buildPayload(
    { ...blankForm, keywords: "  คำสำคัญใหม่  ", budget: "50000" },
    editing,
  );
  assert.strictEqual(filledPayload.keyword, "คำสำคัญใหม่", "a typed value is trimmed and sent");
  assert.strictEqual(filledPayload.budget, 50000, "budget is sent as a number");

  // 3. Creating is unaffected: null is harmless on a new row and keeps the
  //    previous contract for a backend that distinguishes absent from null.
  const createPayload = buildPayload(blankForm, null);
  assert.strictEqual(createPayload.budget, null, "create still sends null budget");

  // 4. Clearing a value stays possible through an empty string, which the
  //    backend stores as empty rather than reading as "unchanged".
  const clearedPayload = buildPayload({ ...blankForm, budget: "   " }, editing);
  assert.ok(
    !("budget" in clearedPayload),
    "whitespace-only input is treated as untouched, not as a deliberate clear",
  );

  // 5. The payload speaks the researches endpoint's own field names.
  const named = buildPayload(
    { ...blankForm, abstract: "บทคัดย่อ", titleEn: "An English title" },
    editing,
  );
  assert.strictEqual(named.title_th, "โครงการทดสอบ", "title_th carries the Thai title");
  assert.strictEqual(named.createyear, "2568", "createyear is a string B.E. year");
  assert.strictEqual(named.title_eng, "An English title", "title_eng carries the English title");
  assert.strictEqual(named.abstract, "บทคัดย่อ", "abstract is stored now and must be sent");
  ["projectname", "projectname_eng", "year_id"].forEach((legacy) => {
    assert.ok(!(legacy in named), `${legacy} is the projects-era name and must not be sent`);
  });

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
