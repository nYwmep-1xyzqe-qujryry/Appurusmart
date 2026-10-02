import { Asset } from "expo-asset";

// Keep the in-app brand mark in one place so every screen shares the same
// bundled asset and the app can warm its image cache during startup.
export const URUSMART_LOGO = require("./urusmartlogo.png");

let preloadPromise;

export function preloadBrandAssets() {
  if (!preloadPromise) {
    preloadPromise = Asset.loadAsync([URUSMART_LOGO]).catch(() => undefined);
  }
  return preloadPromise;
}
