const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const {
  RESOURCE_NAME,
  applyNotificationLargeIcon,
} = require("./notificationLargeIconFiles");

const RESOURCE_PATH = `@drawable/${RESOURCE_NAME}`;
const META_DATA_NAME = "expo.modules.notifications.large_notification_icon";

function withNotificationLargeIcon(config) {
  config = withDangerousMod(config, ["android", (modConfig) => {
    applyNotificationLargeIcon(modConfig.modRequest.projectRoot);
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
