const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const RESOURCE_NAME = "notification_large_icon";
const RESOURCE_PATH = `@drawable/${RESOURCE_NAME}`;
const META_DATA_NAME = "expo.modules.notifications.large_notification_icon";

function withNotificationLargeIcon(config) {
  config = withDangerousMod(config, ["android", (modConfig) => {
    const source = path.join(modConfig.modRequest.projectRoot, "assets", "notification-large-icon.png");
    const destination = path.join(
      modConfig.modRequest.projectRoot,
      "android",
      "app",
      "src",
      "main",
      "res",
      // Android treats a density-less `drawable/` as mdpi and upscales the
      // bitmap by the screen's density factor, so a large asset here is
      // decoded at many times its real size. On a xxxhdpi device that is a 4x
      // scale, which was enough to fail BitmapFactory.decodeResource with an
      // OutOfMemoryError — and because that is an Error rather than an
      // Exception, expo-notifications' catch could not swallow it and the
      // whole notification failed to post. Declaring the bucket keeps the
      // bitmap at its authored size.
      "drawable-xxxhdpi",
      `${RESOURCE_NAME}.png`
    );

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return modConfig;
  }]);

  return withAndroidManifest(config, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults
    );

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      META_DATA_NAME,
      RESOURCE_PATH,
      "resource"
    );

    return manifestConfig;
  });
}

module.exports = withNotificationLargeIcon;
