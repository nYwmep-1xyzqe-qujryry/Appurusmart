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
  require.cache[filename] = mod;
  try {
    mod._compile(output.code, filename);
  } catch (error) {
    delete require.cache[filename];
    throw error;
  }
  return mod.exports;
}

const thaiDate = loadModule("src/utils/thaiDate.js");
const image = loadModule("src/utils/image.js");
const name = loadModule("src/utils/name.js");
const expertFields = loadModule("src/utils/expertFields.js");
const inputSanitize = loadModule("src/utils/inputSanitize.js");
const url = loadModule("src/utils/url.js");
const announcement = loadModule("src/utils/announcement.js");

const tests = [];

function addTest(id, moduleName, scenario, input, expected, actual) {
  const pass = actual === expected;
  tests.push({
    id,
    moduleName,
    scenario,
    input,
    expected,
    actual,
    status: pass ? "PASS" : "FAIL",
  });
}

const parsed = thaiDate.parseISOToDate("2024-10-26");
addTest(
  "TC01",
  "thaiDate.parseISOToDate",
  "แปลงวันที่ ISO เป็น Date แบบ local time",
  "2024-10-26",
  "2024-10-26",
  thaiDate.toISODate(parsed),
);

addTest(
  "TC02",
  "thaiDate.toISODate",
  "แปลง Date เป็นรูปแบบ YYYY-MM-DD สำหรับส่ง API",
  "new Date(2024, 9, 26)",
  "2024-10-26",
  thaiDate.toISODate(new Date(2024, 9, 26)),
);

addTest(
  "TC03",
  "thaiDate.formatThaiDate",
  "แสดงวันที่เป็น พ.ศ. สำหรับผู้ใช้",
  "2024-10-26",
  "26/10/2567",
  thaiDate.formatThaiDate("2024-10-26"),
);

addTest(
  "TC04",
  "thaiDate.formatThaiDate",
  "กรณี backend ส่งวันที่ว่างหรือ 0000-00-00",
  "0000-00-00",
  "",
  thaiDate.formatThaiDate("0000-00-00"),
);

addTest(
  "TC05",
  "image.fixPhotoUrl",
  "แปลง path รูปจาก backend ให้เป็น URL เต็ม",
  "/storage/photos/profile.jpg",
  "https://api.example.test/storage/photos/profile.jpg",
  image.fixPhotoUrl("/storage/photos/profile.jpg"),
);

addTest(
  "TC06",
  "image.fixPhotoUrl",
  "แปลง localhost URL ให้ device เปิดได้ผ่าน API base URL",
  "http://localhost:8001/storage/photos/profile.jpg",
  "https://api.example.test/storage/photos/profile.jpg",
  image.fixPhotoUrl("http://localhost:8001/storage/photos/profile.jpg"),
);

addTest(
  "TC07",
  "image.fixPhotoUrl",
  "คงค่า external CDN URL เดิม",
  "https://cdn.example.test/a.jpg",
  "https://cdn.example.test/a.jpg",
  image.fixPhotoUrl("https://cdn.example.test/a.jpg"),
);

addTest(
  "TC08",
  "name.stripNamePrefix",
  "ตัดคำนำหน้าชื่อภาษาไทย",
  "นางสาว สมใจ ทดสอบ",
  "สมใจ ทดสอบ",
  name.stripNamePrefix("นางสาว สมใจ ทดสอบ"),
);

addTest(
  "TC09",
  "name.stripNamePrefix",
  "ตัดคำนำหน้าทางวิชาการ",
  "ดร. ตัวอย่าง ทดสอบ",
  "ตัวอย่าง ทดสอบ",
  name.stripNamePrefix("ดร. ตัวอย่าง ทดสอบ"),
);

addTest(
  "TC10",
  "expertFields.getExpertTitle",
  "ดึงชื่อผลงานจาก field reference เมื่อไม่มี name/title",
  "{ reference: 'FTFY' }",
  "FTFY",
  expertFields.getExpertTitle({ reference: "FTFY" }),
);

addTest(
  "TC11",
  "expertFields.getExpertLink",
  "ดึงลิงก์เอกสารจาก file_url",
  "{ file_url: 'https://example.com/file.pdf' }",
  "https://example.com/file.pdf",
  expertFields.getExpertLink({ file_url: "https://example.com/file.pdf" }),
);

addTest(
  "TC12",
  "expertFields.getExpertYear",
  "ดึงปีของข้อมูล expert",
  "{ year: 2568 }",
  "2568",
  expertFields.getExpertYear({ year: 2568 }),
);

const normalizedAnnouncement = announcement.normalizeAnnouncement({
  announcement_id: 42,
  title: "  ข่าวทดสอบ  ",
  body: "  รายละเอียดข่าว  ",
  image_url: "https://cdn.example.test/news.jpg",
  thumbnail_url: "https://cdn.example.test/news-thumb.jpg",
});
addTest(
  "TC13",
  "announcement.normalizeAnnouncement",
  "ใช้ title และ body ที่ trim แล้วเป็นข้อมูลกลางของข่าว",
  "title/body มีช่องว่างรอบข้อความ",
  "ข่าวทดสอบ | รายละเอียดข่าว",
  `${normalizedAnnouncement.title} | ${normalizedAnnouncement.body}`,
);
addTest(
  "TC14",
  "announcement.normalizeAnnouncement",
  "รองรับรูปเต็มและ thumbnail จาก Backend",
  "image_url และ thumbnail_url เป็น HTTPS",
  "https://cdn.example.test/news.jpg | https://cdn.example.test/news-thumb.jpg",
  `${normalizedAnnouncement.imageUrl} | ${normalizedAnnouncement.thumbnailUrl}`,
);
addTest(
  "TC15",
  "announcement.normalizeAnnouncement",
  "ข่าวเก่าที่ไม่มีรูปยังอ่านได้และไม่สร้างกรอบรูปว่าง",
  "ไม่มี image_url และ thumbnail_url",
  "ข่าวเก่า | null | null",
  (() => {
    const legacy = announcement.normalizeAnnouncement({ name: "ข่าวเก่า", content: "รายละเอียดเก่า" });
    return `${legacy.title} | ${legacy.imageUrl} | ${legacy.thumbnailUrl}`;
  })(),
);
addTest(
  "TC16",
  "inputSanitize.sanitizeAcademicText",
  "ลบ emoji และอักขระอันตราย แต่คงสัญลักษณ์วิชาการที่อนุญาต",
  "ข้อมูล 🫶 €$|<>{}^!?#*¥ + [] = _ %",
  "ข้อมูล + [] = _ %",
  inputSanitize.sanitizeAcademicText("ข้อมูล 🫶 €$|<>{}^!?#*¥ + [] = _ %"),
);
addTest(
  "TC17",
  "url.normalizeOptionalUrl",
  "ปฏิเสธ protocol ที่ไม่ปลอดภัยสำหรับลิงก์ต้นฉบับ",
  "javascript:alert(1)",
  "false",
  String(url.normalizeOptionalUrl("javascript:alert(1)").ok),
);

function escapeCell(value) {
  return String(value)
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "<br>");
}

function toMarkdownTable(rows) {
  const header = [
    "Test Case",
    "Function",
    "Scenario",
    "Input",
    "Expected",
    "Actual",
    "Status",
  ];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];

  rows.forEach((row) => {
    lines.push(
      `| ${[
        row.id,
        row.moduleName,
        row.scenario,
        row.input || "(empty)",
        row.expected || "(empty)",
        row.actual || "(empty)",
        row.status,
      ].map(escapeCell).join(" | ")} |`,
    );
  });

  return lines.join("\n");
}

const passed = tests.filter((t) => t.status === "PASS").length;
const failed = tests.length - passed;
const generatedAt = new Date().toISOString();
const summary = `Total: ${tests.length}, Passed: ${passed}, Failed: ${failed}`;

const report = [
  "# URUSmart Test Report",
  "",
  `Generated at: ${generatedAt}`,
  "",
  "## Summary",
  "",
  `- Total test cases: ${tests.length}`,
  `- Passed: ${passed}`,
  `- Failed: ${failed}`,
  "",
  "## Test Cases",
  "",
  toMarkdownTable(tests),
  "",
].join("\n");

const reportDir = path.resolve(process.cwd(), "reports");
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, "test-report.md");
fs.writeFileSync(reportPath, report, "utf8");

console.log(summary);
console.log(`Report written to: ${path.relative(process.cwd(), reportPath)}`);
console.log("");
console.log(toMarkdownTable(tests));

if (failed > 0) {
  process.exit(1);
}
