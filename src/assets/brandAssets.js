// Keep the in-app brand mark in one place so every screen shares the same
// bundled asset. A static require resolves at bundle time — no session,
// network or preload has to finish before an <Image> can draw it.
//
// The file is sized for the screen, not the store: 512px covers the largest
// use (the 122pt Login mark at 4x density). It used to be the 1024px app icon
// itself, and every screen showing it decoded a 4MB bitmap on first mount —
// again on every cold start — which is what drew the logo late. The app icon
// and splash keep their own full-size files under /assets.
export const URUSMART_LOGO = require("./urusmartlogo.png");
