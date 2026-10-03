// Exercises the SAME file operation the config plugin runs. The plugin's
// dangerous mod body is a one-line call to applyNotificationLargeIcon, so this
// tests production code rather than a copy of its rules.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  RESOURCE_NAME,
  TARGET_BUCKET,
  applyNotificationLargeIcon,
  resRootFor,
} = require("../plugins/notificationLargeIconFiles");

const makeProject = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uru-icon-"));
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets", "notification-large-icon.png"), "SOURCE-192");
  return root;
};

const resPath = (root, ...parts) => path.join(resRootFor(root), ...parts);

const writeRes = (root, bucket, name, contents) => {
  fs.mkdirSync(resPath(root, bucket), { recursive: true });
  fs.writeFileSync(resPath(root, bucket, name), contents);
};

const bucketsHoldingIcon = (root) =>
  fs
    .readdirSync(resRootFor(root))
    .filter((bucket) => fs.existsSync(resPath(root, bucket, `${RESOURCE_NAME}.png`)))
    .sort();

// A stale density-less copy outranks drawable-xxxhdpi, so it must be removed.
{
  const root = makeProject();
  writeRes(root, "drawable", `${RESOURCE_NAME}.png`, "STALE-1024");
  applyNotificationLargeIcon(root);
  assert.deepEqual(bucketsHoldingIcon(root), [TARGET_BUCKET], "the density-less copy is removed");
  assert.equal(
    fs.readFileSync(resPath(root, TARGET_BUCKET, `${RESOURCE_NAME}.png`), "utf8"),
    "SOURCE-192",
    "the target copy comes from the source asset",
  );
}

// Stale copies in any other density bucket are removed too.
{
  const root = makeProject();
  for (const bucket of ["drawable", "drawable-mdpi", "drawable-hdpi", "drawable-xhdpi", "drawable-xxhdpi"]) {
    writeRes(root, bucket, `${RESOURCE_NAME}.png`, `STALE-${bucket}`);
  }
  applyNotificationLargeIcon(root);
  assert.deepEqual(bucketsHoldingIcon(root), [TARGET_BUCKET], "only the xxxhdpi copy remains");
}

// Unrelated resources must never be touched — including other files sharing a
// bucket with a stale copy.
{
  const root = makeProject();
  // Written BEFORE the stale copy so a bucket-wide deletion that walks
  // directory order hits this file first and is caught.
  writeRes(root, "drawable", "a_first_unrelated.png", "FIRST");
  writeRes(root, "drawable", "notification_icon.png", "SMALL-ICON");
  writeRes(root, "drawable", `${RESOURCE_NAME}.png`, "STALE");
  writeRes(root, "drawable", "z_last_unrelated.png", "LAST");
  writeRes(root, "drawable-xxhdpi", "splashscreen_logo.png", "SPLASH");
  writeRes(root, "drawable-mdpi", "ic_launcher_foreground.png", "LAUNCHER");
  writeRes(root, "values", "colors.xml", "<resources/>");
  applyNotificationLargeIcon(root);
  assert.equal(fs.readFileSync(resPath(root, "drawable", "notification_icon.png"), "utf8"), "SMALL-ICON");
  assert.equal(fs.readFileSync(resPath(root, "drawable-xxhdpi", "splashscreen_logo.png"), "utf8"), "SPLASH");
  assert.equal(fs.readFileSync(resPath(root, "drawable-mdpi", "ic_launcher_foreground.png"), "utf8"), "LAUNCHER");
  assert.equal(fs.readFileSync(resPath(root, "values", "colors.xml"), "utf8"), "<resources/>");
  assert.equal(fs.readFileSync(resPath(root, "drawable", "a_first_unrelated.png"), "utf8"), "FIRST");
  assert.equal(fs.readFileSync(resPath(root, "drawable", "z_last_unrelated.png"), "utf8"), "LAST");
  // The stale copy itself must be gone.
  assert.equal(
    fs.existsSync(resPath(root, "drawable", `${RESOURCE_NAME}.png`)),
    false,
    "the stale density-less copy is removed",
  );
}

// The target file must survive the cleanup pass that runs before it is written.
{
  const root = makeProject();
  applyNotificationLargeIcon(root);
  const target = resPath(root, TARGET_BUCKET, `${RESOURCE_NAME}.png`);
  const before = fs.statSync(target).ino;
  applyNotificationLargeIcon(root);
  assert.equal(fs.existsSync(target), true, "the target is never removed by its own cleanup");
  assert.equal(fs.readFileSync(target, "utf8"), "SOURCE-192");
  assert.ok(before >= 0);
}

// Repeated execution is idempotent.
{
  const root = makeProject();
  applyNotificationLargeIcon(root);
  applyNotificationLargeIcon(root);
  applyNotificationLargeIcon(root);
  assert.deepEqual(bucketsHoldingIcon(root), [TARGET_BUCKET], "repeated runs leave exactly one copy");
  assert.equal(
    fs.readFileSync(resPath(root, TARGET_BUCKET, `${RESOURCE_NAME}.png`), "utf8"),
    "SOURCE-192",
  );
}

// Only the exact resource name is considered: a similarly named file stays.
{
  const root = makeProject();
  writeRes(root, "drawable", `${RESOURCE_NAME}_backup.png`, "KEEP");
  writeRes(root, "drawable-mdpi", `${RESOURCE_NAME}.webp`, "KEEP-WEBP");
  applyNotificationLargeIcon(root);
  assert.equal(fs.readFileSync(resPath(root, "drawable", `${RESOURCE_NAME}_backup.png`), "utf8"), "KEEP");
  assert.equal(fs.readFileSync(resPath(root, "drawable-mdpi", `${RESOURCE_NAME}.webp`), "utf8"), "KEEP-WEBP");
}

// Nothing outside the res root is reachable, even via a crafted entry, and a
// non-directory entry starting with "drawable" is ignored rather than removed.
{
  const root = makeProject();
  const outside = path.join(root, "outside-secret.png");
  fs.writeFileSync(outside, "DO-NOT-TOUCH");
  fs.mkdirSync(resRootFor(root), { recursive: true });
  fs.writeFileSync(resPath(root, "drawable-not-a-dir"), "PLAIN-FILE");
  applyNotificationLargeIcon(root);
  assert.equal(fs.readFileSync(outside, "utf8"), "DO-NOT-TOUCH", "files outside res/ are untouched");
  assert.equal(
    fs.readFileSync(resPath(root, "drawable-not-a-dir"), "utf8"),
    "PLAIN-FILE",
    "a non-directory entry is not treated as a bucket",
  );
}

// A file with the resource's name in a NON-drawable bucket must be ignored:
// only drawable* directories are scanned.
{
  const root = makeProject();
  writeRes(root, "mipmap-xxxhdpi", `${RESOURCE_NAME}.png`, "MIPMAP-KEEP");
  writeRes(root, "raw", `${RESOURCE_NAME}.png`, "RAW-KEEP");
  applyNotificationLargeIcon(root);
  assert.equal(
    fs.readFileSync(resPath(root, "mipmap-xxxhdpi", `${RESOURCE_NAME}.png`), "utf8"),
    "MIPMAP-KEEP",
    "a same-named file outside drawable buckets is untouched",
  );
  assert.equal(fs.readFileSync(resPath(root, "raw", `${RESOURCE_NAME}.png`), "utf8"), "RAW-KEEP");
}

// Works from an empty project, which is the clean-prebuild path.
{
  const root = makeProject();
  applyNotificationLargeIcon(root);
  assert.deepEqual(bucketsHoldingIcon(root), [TARGET_BUCKET]);
}

console.log("Notification icon plugin tests OK");
