const fs = require("fs");
const path = require("path");

const RESOURCE_NAME = "notification_large_icon";
// Android treats a density-less `drawable/` as mdpi and upscales the bitmap by
// the screen's density factor, so a large asset there is decoded at many times
// its real size — enough on xxxhdpi to fail BitmapFactory.decodeResource with
// an OutOfMemoryError. That is an Error rather than an Exception, so
// expo-notifications' catch cannot swallow it and posting the notification
// fails outright. Declaring the bucket keeps the bitmap at its authored size.
const TARGET_BUCKET = "drawable-xxxhdpi";
const SOURCE_ASSET = path.join("assets", "notification-large-icon.png");

const resRootFor = (projectRoot) =>
  path.join(projectRoot, "android", "app", "src", "main", "res");

const destinationFor = (projectRoot) =>
  path.join(resRootFor(projectRoot), TARGET_BUCKET, `${RESOURCE_NAME}.png`);

// Copies the asset into the target bucket and removes copies of the SAME
// resource name from every other drawable bucket. An incremental prebuild
// keeps whatever a previous version of this plugin wrote, and a density-less
// copy wins over this one, so the asset would otherwise silently keep its old
// size.
//
// Only files named exactly `${RESOURCE_NAME}.png` directly inside a
// `drawable*` directory are removed. Entry names are checked for path
// separators so a crafted directory name cannot escape the res root.
function applyNotificationLargeIcon(projectRoot) {
  const source = path.join(projectRoot, SOURCE_ASSET);
  const resRoot = resRootFor(projectRoot);
  const destination = destinationFor(projectRoot);

  if (fs.existsSync(resRoot)) {
    for (const entry of fs.readdirSync(resRoot)) {
      if (!entry.startsWith("drawable")) continue;
      // Reject anything that is not a plain directory name.
      if (entry.includes("/") || entry.includes("\\") || entry.includes("..")) continue;
      const bucket = path.join(resRoot, entry);
      if (path.dirname(bucket) !== resRoot) continue;
      if (!fs.statSync(bucket).isDirectory()) continue;

      const stale = path.join(bucket, `${RESOURCE_NAME}.png`);
      if (stale === destination) continue;
      if (path.dirname(stale) !== bucket) continue;
      if (fs.existsSync(stale) && fs.statSync(stale).isFile()) fs.rmSync(stale);
    }
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return destination;
}

module.exports = {
  RESOURCE_NAME,
  TARGET_BUCKET,
  SOURCE_ASSET,
  applyNotificationLargeIcon,
  destinationFor,
  resRootFor,
};
