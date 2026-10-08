const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("@babel/core");
const { JSDOM } = require("jsdom");

process.env.EXPO_PUBLIC_API_URL = "https://api.example.test/api";

function loadModule(relativePath) {
  const filename = path.resolve(process.cwd(), relativePath);
  if (require.cache[filename]) return require.cache[filename].exports;
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
const inputSanitize = loadModule("src/utils/inputSanitize.js");
const url = loadModule("src/utils/url.js");
const announcement = loadModule("src/utils/announcement.js");
const announcementCarousel = loadModule("src/utils/announcementCarousel.js");
const announcementImageViewer = loadModule("src/utils/announcementImageViewer.js");
const lrdResponse = loadModule("src/utils/lrdResponse.js");
const lrdDiagnostics = loadModule("src/utils/lrdDiagnostics.js");
const lrdResourceState = loadModule("src/utils/lrdResourceState.js");
const responseCount = loadModule("src/utils/responseCount.js");
const services = loadModule("src/utils/services.js");
const refresh = loadModule("src/utils/refresh.js");
const notificationInbox = loadModule("src/utils/notificationInbox.js");
const announcementImageState = loadModule("src/utils/announcementImageState.js");
const sessionLock = loadModule("src/utils/sessionLock.js");
const pushRetry = loadModule("src/utils/pushRegistrationRetry.js");
const pushRecovery = loadModule("src/services/pushRegistrationRecovery.js");
const inboxSync = loadModule("src/utils/inboxSync.js");
const sessionResourceState = loadModule("src/utils/sessionResourceState.js");
const ssoSecurity = loadModule("src/utils/ssoSecurity.js");
const profilePdfSanitizer = loadModule("src/utils/profilePdfSanitizer.js");
const notificationDeletion = loadModule("src/utils/notificationDeletion.js");
const testLrdResource = require("./test-lrd-resource");
const testLrdSession = require("./test-lrd-session");
const testProjectFormPayload = require("./test-project-form-payload");

const parsed = thaiDate.parseISOToDate("2024-10-26");
assert.equal(parsed.getFullYear(), 2024);
assert.equal(parsed.getMonth(), 9);
assert.equal(parsed.getDate(), 26);
assert.equal(thaiDate.toISODate(new Date(2024, 9, 26)), "2024-10-26");
assert.equal(thaiDate.formatThaiDate("2024-10-26"), "26/10/2567");
assert.equal(thaiDate.formatThaiDate("0000-00-00"), "");

assert.equal(
  image.fixPhotoUrl("/storage/photos/profile.jpg"),
  "https://api.example.test/storage/photos/profile.jpg",
);
assert.equal(
  image.fixPhotoUrl("http://localhost:8001/storage/photos/profile.jpg"),
  "https://api.example.test/storage/photos/profile.jpg",
);
assert.equal(image.fixPhotoUrl("https://cdn.example.test/a.jpg"), "https://cdn.example.test/a.jpg");
assert.equal(image.fixPhotoUrl(null), "");

assert.equal(
  sessionResourceState.isSameSessionSnapshot(
    { generation: 1, userId: "A", token: "a" },
    { generation: 1, userId: "A", token: "a" },
  ),
  true,
);
assert.equal(
  sessionResourceState.isSameSessionSnapshot(
    { generation: 1, userId: "A", token: "a" },
    { generation: 2, userId: "A", token: "a" },
  ),
  false,
  "same-user logout/login cannot commit an older resource response",
);
assert.equal(
  sessionResourceState.isSameSessionSnapshot(
    { generation: 1, userId: "A", token: "a" },
    { generation: 1, userId: "B", token: "b" },
  ),
  false,
  "an account switch cannot commit the previous account response",
);
assert.equal(
  ssoSecurity.isTrustedSsoCallbackUrl("https://urusmart.uru.ac.th/auth/callback?token=secret", "urusmart.uru.ac.th"),
  true,
);
assert.equal(
  ssoSecurity.isTrustedSsoCallbackUrl("https://urusmart.uru.ac.th/auth/redirect", "urusmart.uru.ac.th"),
  false,
  "the SSO entry URL is not treated as a completed callback",
);
assert.equal(
  ssoSecurity.isTrustedSsoMessageUrl("https://urusmart.uru.ac.th/auth/redirect", "urusmart.uru.ac.th"),
  true,
  "the existing SSO entry page may still deliver a message without starting the callback timer",
);
assert.equal(
  ssoSecurity.extractSsoToken("https://urusmart.uru.ac.th/auth/redirect?token=secret", "urusmart.uru.ac.th"),
  "secret",
  "a token delivered directly by the existing entry endpoint remains supported",
);
assert.equal(
  ssoSecurity.extractSsoToken("https://login.microsoftonline.com/auth/redirect?token=secret", "urusmart.uru.ac.th"),
  null,
  "credentials from an external navigation host are rejected",
);
assert.equal(
  ssoSecurity.isTrustedSsoCallbackUrl("http://192.168.1.194/auth/redirect?token=secret", "192.168.1.194", false),
  false,
  "HTTP SSO callbacks are unavailable outside development",
);
assert.equal(
  ssoSecurity.isTrustedSsoCallbackUrl("http://192.168.1.194/auth/redirect?token=secret", "192.168.1.194", true),
  false,
);
assert.equal(
  ssoSecurity.extractSsoToken("http://192.168.1.194/auth/redirect?token=secret", "192.168.1.194", true),
  "secret",
  "development LAN token delivery remains supported on the entry path",
);
assert.equal(
  ssoSecurity.isTrustedSsoCallbackUrl("https://urusmart.uru.ac.th:8443/auth/callback?token=secret", "urusmart.uru.ac.th", false, null),
  true,
  "legacy host-only helper remains compatible when no expected port is supplied",
);
assert.equal(
  ssoSecurity.isTrustedSsoCallbackUrl("https://urusmart.uru.ac.th:8443/auth/callback?token=secret", "urusmart.uru.ac.th", false, "443"),
  false,
  "a callback from an unexpected backend port is rejected",
);
assert.equal(
  ssoSecurity.extractSsoToken("https://urusmart.uru.ac.th/profile?token=secret", "urusmart.uru.ac.th"),
  null,
  "tokens on non-callback paths are rejected",
);
assert.equal(profilePdfSanitizer.isSafePdfResourceUrl("https://cdn.example.test/photo.webp", { image: true }), true);
assert.equal(profilePdfSanitizer.isSafePdfResourceUrl("javascript:alert(1)", { image: true }), false);
assert.equal(profilePdfSanitizer.isSafePdfResourceUrl("data:text/html;base64,SGk=", { image: true }), false);
assert.equal(profilePdfSanitizer.isSafePdfResourceUrl("data:image/png;base64,AAAA", { image: true }), true);
assert.equal(profilePdfSanitizer.isSafePdfResourceUrl("//evil.example.test/x.png", { image: true }), false);
assert.ok(profilePdfSanitizer.profilePdfAllowedTags().includes("TABLE"));
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  class TestDOMParser extends dom.window.DOMParser {
    parseFromString(...args) {
      const document = super.parseFromString(...args);
      Object.defineProperty(document, "defaultView", { value: dom.window });
      return document;
    }
  }
  const clean = profilePdfSanitizer.sanitizeProfilePdfHtml(`
    <html><head>
      <style>@font-face { font-family: Thai; src: url('https://cdn.example.test/thai.woff2'); }
        .photo { background-image: url(https://cdn.example.test/bg.png); }
        .bad { background-image: url(javascript:alert(1)); }
      </style>
    </head><body onload="alert(1)">
      <script>alert(1)</script><img src="https://cdn.example.test/photo.webp" onerror="alert(1)">
      <a href="javascript:alert(1)">safe text</a><table><tr><td>ไทย</td></tr></table>
    </body></html>
  `, TestDOMParser);
  assert.ok(!/<script|onload=|onerror=|javascript:/i.test(clean), "HTML sanitizer removes executable content");
  assert.ok(clean.includes("https://cdn.example.test/thai.woff2"), "safe font URLs remain usable");
  assert.ok(clean.includes("https://cdn.example.test/bg.png"), "safe CSS image URLs remain usable");
  assert.ok(clean.includes("<table"), "tables remain available for PDF layout");
}
const selectedNotificationIds = notificationDeletion.normalizeNotificationIds(["a", "a", 2, null, ""]);
assert.deepEqual(selectedNotificationIds, ["a", "2"]);
assert.equal(
  notificationDeletion.getDismissedUnreadCount(
    [{ id: "a", read: false }, { id: "2", read: true }, { id: "3", read: false }],
    selectedNotificationIds,
  ),
  1,
  "bulk dismissal adjusts the badge only for selected unread rows",
);
assert.deepEqual(
  notificationDeletion.filterDismissedNotifications(
    [{ id: "a" }, { id: "2" }, { id: "3" }],
    selectedNotificationIds,
  ).map((item) => item.id),
  ["3"],
  "bulk dismissal removes only the selected rows",
);

assert.equal(responseCount.extractResponseCount({ data: [{ id: 1 }, { id: 2 }], total: 125 }), 125);
assert.equal(responseCount.extractResponseCount({ data: { data: [{ id: 1 }], total: 42 } }), 42);
assert.equal(responseCount.extractResponseCount([{ id: 1 }, { id: 2 }]), 2);

assert.equal(name.stripNamePrefix("นางสาว สมใจ ทดสอบ"), "สมใจ ทดสอบ");
assert.equal(name.stripNamePrefix("นายธรานนท์ ไชยโสภา"), "ธรานนท์ ไชยโสภา");
assert.equal(name.stripNamePrefix("ดร. ตัวอย่าง ทดสอบ"), "ตัวอย่าง ทดสอบ");
assert.equal(name.stripNamePrefix("ไม่มีคำนำหน้า"), "ไม่มีคำนำหน้า");

assert.equal(
  inputSanitize.sanitizeAcademicText("O'Reilly: E=mc²; Smith [2026]"),
  "O'Reilly: E=mc²; Smith [2026]",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("Universite\u0301 de Paris\r\nResearch"),
  "Université de Paris\nResearch",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("Thai\u0000 text\u0007"),
  "Thai text",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("University 🫶 of Oxford"),
  "University of Oxford",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("ข้อมูล €$|<>{}^!?#*¥ 🫶 + [] = _ %"),
  "ข้อมูล + [] = _ %",
);
assert.equal(
  inputSanitize.sanitizeAcademicText("คณะวิทยาศาสตร์ ฿ 2569"),
  "คณะวิทยาศาสตร์ 2569",
);
assert.equal(
  inputSanitize.sanitizePhoneInput("08🫶-123 ABC (456)"),
  "08-123 (456)",
);
assert.equal(
  inputSanitize.sanitizeLinkInput(" https://example.org/a b?q=1&x=฿<tag> 😄 "),
  "https://example.org/ab?q=1&x=tag",
);

const driveUrl = url.normalizeOptionalUrl("https://drive.google.com/file/d/example/view");
assert.equal(driveUrl.ok, true);
assert.equal(driveUrl.url, "https://drive.google.com/file/d/example/view");

const urlWithoutProtocol = url.normalizeOptionalUrl("example.org/research/file.pdf");
assert.equal(urlWithoutProtocol.ok, true);
assert.equal(urlWithoutProtocol.url, "https://example.org/research/file.pdf");

const invalidFileLink = url.normalizeOptionalUrl("90198282฿)/&-&:&:@&฿฿฿$$$$€€€¥");
assert.equal(invalidFileLink.ok, false);
assert.equal(invalidFileLink.url, null);

const unsafeProtocol = url.normalizeOptionalUrl("javascript:alert(1)");
assert.equal(unsafeProtocol.ok, false);
assert.equal(unsafeProtocol.url, null);

const emptyUrl = url.normalizeOptionalUrl("");
assert.equal(emptyUrl.ok, true);
assert.equal(emptyUrl.url, null);

const normalizedAnnouncement = announcement.normalizeAnnouncement({
  announcement_id: 42,
  title: "  ข่าวทดสอบ  ",
  body: "  รายละเอียดข่าว  ",
  image_url: "https://cdn.example.test/news.jpg",
  thumbnail_url: "https://cdn.example.test/news-thumb.jpg",
  image_alt: "ภาพข่าวทดสอบ",
  image_width: 1200,
  image_height: 675,
});
assert.equal(normalizedAnnouncement.id, 42);
assert.equal(normalizedAnnouncement.title, "ข่าวทดสอบ");
assert.equal(normalizedAnnouncement.body, "รายละเอียดข่าว");
assert.equal(normalizedAnnouncement.imageUrl, "https://cdn.example.test/news.jpg");
assert.equal(normalizedAnnouncement.thumbnailUrl, "https://cdn.example.test/news-thumb.jpg");

const withoutThumbnail = announcement.normalizeAnnouncement({
  image_url: "https://cdn.example.test/news-original.jpg",
  thumbnail_url: null,
});
assert.equal(
  withoutThumbnail.thumbnailUrl,
  null,
  "a missing API thumbnail stays null until a presentation helper chooses a fallback",
);
assert.equal(
  announcementCarousel.getAnnouncementHomeImageSource(withoutThumbnail).uri,
  withoutThumbnail.imageUrl,
  "Home falls back to the original only at image selection time",
);
assert.equal(normalizedAnnouncement.imageAlt, "ภาพข่าวทดสอบ");
assert.equal(normalizedAnnouncement.imageWidth, 1200);
assert.equal(normalizedAnnouncement.imageHeight, 675);
// No image_version/updated_at from backend: imageCacheKey must be null,
// NOT fall back to imageUrl — the URL is identical whether the image
// changed or not (especially under an immutable Cache-Control), so using
// it as a "version" signal can never detect a real change.
assert.equal(normalizedAnnouncement.imageCacheKey, null);

const versionedAnnouncement = announcement.normalizeAnnouncement({
  announcement_id: 43,
  title: "ข่าวมีเวอร์ชันรูป",
  image_url: "https://cdn.example.test/news.jpg",
  updated_at: "2026-09-01T00:00:00Z",
});
assert.equal(versionedAnnouncement.imageCacheKey, "2026-09-01T00:00:00Z");

// Detail preview: near-full-bleed width, height a share of the height the
// user can actually see (window minus safe-area insets and header), not of
// the raw window height. This height is a ceiling only — the detail screen
// shrinks the frame to what the image's aspect ratio needs, so wide banners
// stay well under it.
const previewLarge = announcement.getAnnouncementDetailPreviewSize({
  windowWidth: 393,
  windowHeight: 852,
  bottomInset: 34,
  headerHeight: 59 + 64,
});
assert.deepEqual(previewLarge, { width: 369, height: 209 });
assert.equal(previewLarge.width, 393 - 24, "width leaves ~12 units on each side");

const previewSmall = announcement.getAnnouncementDetailPreviewSize({
  windowWidth: 360,
  windowHeight: 640,
  bottomInset: 0,
  headerHeight: 24 + 64,
});
assert.deepEqual(previewSmall, { width: 336, height: 166 });

// The share is taken from usable height: identical windows differing
// only in chrome must produce different preview heights.
const previewNoChrome = announcement.getAnnouncementDetailPreviewSize({
  windowWidth: 393,
  windowHeight: 852,
});
assert.ok(
  previewNoChrome.height > previewLarge.height,
  "removing header/inset chrome must grow the preview height",
);

// Degenerate geometry (chrome larger than the window) must not produce a
// zero-height or negative preview box.
const previewDegenerate = announcement.getAnnouncementDetailPreviewSize({
  windowWidth: 360,
  windowHeight: 200,
  headerHeight: 400,
});
assert.equal(previewDegenerate.height, 160);
assert.ok(previewDegenerate.width >= 0);

// The detail frame is capped at a squarer ratio than a typical banner so
// the preview reads larger; cover then trims the sides to fill it. Images
// already squarer than the cap keep their own ratio and are never widened,
// which would stretch them.
const DETAIL_FRAME_ASPECT_RATIO = 2.6;
const frameAspectRatio = (imageWidth, imageHeight) => Math.min(
  imageWidth / imageHeight,
  DETAIL_FRAME_ASPECT_RATIO,
);
// A 3.2:1 banner is held at 2.6:1, trading side crop for height.
assert.equal(frameAspectRatio(5520, 1725), 2.6);
// The frame is taller than the image's natural height at full width, which
// is what makes the preview bigger: 430/3.2 = 134 before, 430/2.6 = 165 now.
assert.ok(430 / frameAspectRatio(5520, 1725) > 430 / (5520 / 1725));
// Square and portrait images are already squarer than the cap, so they keep
// their own ratio rather than being stretched out to 2.6:1.
assert.equal(frameAspectRatio(1200, 1200), 1);
assert.ok(Math.abs(frameAspectRatio(1000, 1500) - 2 / 3) < 1e-9);

const legacyAnnouncement = announcement.normalizeAnnouncement({
  name: "ข่าวเก่า",
  content: "ข่าวเดิมที่ไม่มีรูป",
});
assert.equal(legacyAnnouncement.title, "ข่าวเก่า");
assert.equal(legacyAnnouncement.body, "ข่าวเดิมที่ไม่มีรูป");
assert.equal(legacyAnnouncement.imageUrl, null);
assert.equal(legacyAnnouncement.thumbnailUrl, null);
assert.equal(
  announcement.stripAnnouncementMarkup("<p>หัวข้อ&nbsp;&amp; รายละเอียด</p>"),
  "หัวข้อ & รายละเอียด",
);
assert.equal(
  announcement.normalizeAnnouncement({ title: "ข่าว", sub: "<b>สรุป</b>" }).sub,
  "สรุป",
);
assert.equal(announcement.getAnnouncementRows({ data: { data: [{ id: 1 }] } }).length, 1);
assert.equal(announcementCarousel.getAnnouncementCardWidth(360, 3), 308);
assert.equal(announcementCarousel.getAnnouncementCardWidth(430, 3), 378);
assert.equal(announcementCarousel.getAnnouncementCardWidth(360, 1), 328);
// Card height must land inside the 220-250 band at fontScale 1 for every
// phone viewport in the 360-430 range (card widths 308-378). The aspect
// ratio alone cannot guarantee this — the width spread is larger than the
// band — so the clamp is what actually enforces it. These assertions pin
// both ends of the range plus the clamped interior.
assert.equal(announcementCarousel.getAnnouncementCardHeight(308, 1), 176);
assert.equal(announcementCarousel.getAnnouncementCardHeight(338, 1), 187);
assert.equal(announcementCarousel.getAnnouncementCardHeight(362, 1), 200);
assert.equal(announcementCarousel.getAnnouncementCardHeight(378, 1), 200);
[308, 338, 362, 378].forEach((cardWidth) => {
  const height = announcementCarousel.getAnnouncementCardHeight(cardWidth, 1);
  assert.ok(
    height >= 176 && height <= 200,
    `cardWidth ${cardWidth}: height ${height} fell outside the 176-200 band`,
  );
});
// The band is the previous 220-250 band reduced by 20%, so every card
// width must land within rounding distance of 80% of its old height.
[[308, 220], [338, 234], [362, 250], [378, 250]].forEach(([cardWidth, previousHeight]) => {
  const height = announcementCarousel.getAnnouncementCardHeight(cardWidth, 1);
  assert.ok(
    Math.abs(height - previousHeight * 0.8) <= 1,
    `cardWidth ${cardWidth}: height ${height} is not 80% of previous ${previousHeight}`,
  );
});
// Accessibility font sizes grow the card so the text fallback keeps its
// room; all cards in one viewport still share a single height.
assert.equal(announcementCarousel.getAnnouncementCardHeight(308, 1.3), 182);
assert.equal(announcementCarousel.getAnnouncementCardHeight(308, 2), 196);
assert.ok(
  announcementCarousel.getAnnouncementCardHeight(308, 2)
    > announcementCarousel.getAnnouncementCardHeight(308, 1),
);
assert.equal(announcementCarousel.getAnnouncementSnapIndex(492, 320), 2);
assert.deepEqual(
  announcementCarousel.getAnnouncementLoopItems([{ id: 1 }, { id: 2 }, { id: 3 }]).map(({ id }) => id),
  [3, 1, 2, 3, 1],
);
assert.deepEqual(announcementCarousel.getAnnouncementLoopItems([{ id: 1 }]), [{ id: 1 }]);
assert.equal(announcementCarousel.getAnnouncementLoopIndex(0, 3), 3);
assert.equal(announcementCarousel.getAnnouncementLoopIndex(1, 3), 1);
assert.equal(announcementCarousel.getAnnouncementLoopIndex(4, 3), 1);
assert.equal(announcementCarousel.getAnnouncementLoopIndex(7, 1), 0);
assert.equal(announcementCarousel.getAnnouncementRealIndex(0, 3), 2);
assert.equal(announcementCarousel.getAnnouncementRealIndex(1, 3), 0);
assert.equal(announcementCarousel.getAnnouncementRealIndex(4, 3), 0);
assert.deepEqual(
  announcementCarousel.getAnnouncementHomeImageSource({
    imageUrl: "https://cdn.example.test/full.jpg",
    thumbnailUrl: "https://cdn.example.test/thumb.jpg",
  }),
  {
    uri: "https://cdn.example.test/thumb.jpg",
    fallbackUri: "https://cdn.example.test/full.jpg",
  },
);
assert.deepEqual(
  announcementCarousel.getAnnouncementHomeImageSource({ imageUrl: "https://cdn.example.test/full.jpg" }),
  { uri: "https://cdn.example.test/full.jpg", fallbackUri: null },
);
// No dimension metadata from backend: cannot verify resolution, documented
// fallback keeps preferring the thumbnail exactly as before this check.
assert.deepEqual(
  announcementCarousel.getAnnouncementHomeImageSource(
    { imageUrl: "https://cdn.example.test/full.jpg", thumbnailUrl: "https://cdn.example.test/thumb.jpg" },
    308 * 2, 164 * 2,
  ),
  { uri: "https://cdn.example.test/thumb.jpg", fallbackUri: "https://cdn.example.test/full.jpg" },
);
// Thumbnail dimensions known and sufficient: use it.
assert.deepEqual(
  announcementCarousel.getAnnouncementHomeImageSource(
    {
      imageUrl: "https://cdn.example.test/full.jpg",
      thumbnailUrl: "https://cdn.example.test/thumb.jpg",
      thumbnailWidth: 800,
      thumbnailHeight: 500,
    },
    616, 328,
  ),
  { uri: "https://cdn.example.test/thumb.jpg", fallbackUri: "https://cdn.example.test/full.jpg" },
);
// Thumbnail dimensions known and insufficient for the required on-screen
// pixel size: skip the thumbnail and go straight to the full image.
assert.deepEqual(
  announcementCarousel.getAnnouncementHomeImageSource(
    {
      imageUrl: "https://cdn.example.test/full.jpg",
      thumbnailUrl: "https://cdn.example.test/thumb.jpg",
      thumbnailWidth: 200,
      thumbnailHeight: 120,
    },
    616, 328,
  ),
  { uri: "https://cdn.example.test/full.jpg", fallbackUri: "https://cdn.example.test/thumb.jpg" },
);
// With contain, a wide banner occupies only its contained box inside the
// card, so the thumbnail bar is the contained size, not the full card.
// A 3.2:1 banner in a 308x176 card contains to 308x96; at PixelRatio 2
// that needs 616x192, which this thumbnail clears even though it is far
// short of the full card's 308x176 at 2x (616x352).
const containedBox = announcementCarousel.getContainedImageLayout(5520, 1725, 308, 176);
assert.deepEqual(containedBox, { width: 308, height: 96 });
assert.deepEqual(
  announcementCarousel.getAnnouncementHomeImageSource(
    {
      imageUrl: "https://cdn.example.test/full.jpg",
      thumbnailUrl: "https://cdn.example.test/thumb.jpg",
      thumbnailWidth: 640,
      thumbnailHeight: 200,
    },
    containedBox.width * 2,
    containedBox.height * 2,
  ),
  { uri: "https://cdn.example.test/thumb.jpg", fallbackUri: "https://cdn.example.test/full.jpg" },
  "a thumbnail that covers the contained box is accepted",
);
// The same thumbnail measured against the whole card would be rejected,
// which is the over-strict behavior this sizing change avoids.
assert.deepEqual(
  announcementCarousel.getAnnouncementHomeImageSource(
    {
      imageUrl: "https://cdn.example.test/full.jpg",
      thumbnailUrl: "https://cdn.example.test/thumb.jpg",
      thumbnailWidth: 640,
      thumbnailHeight: 200,
    },
    308 * 2,
    176 * 2,
  ),
  { uri: "https://cdn.example.test/full.jpg", fallbackUri: "https://cdn.example.test/thumb.jpg" },
);

// thumbnailUrl identical to imageUrl: no fallback needed, no duplicate request.
assert.deepEqual(
  announcementCarousel.getAnnouncementHomeImageSource({
    imageUrl: "https://cdn.example.test/same.jpg",
    thumbnailUrl: "https://cdn.example.test/same.jpg",
  }),
  { uri: "https://cdn.example.test/same.jpg", fallbackUri: null },
);
assert.deepEqual(
  announcementCarousel.getAnnouncementCardTone({ id: 21 }),
  announcementCarousel.getAnnouncementCardTone({ id: 21 }),
  "the same announcement keeps the same color",
);
assert.equal(
  announcementCarousel.getAnnouncementCardTone({ tag: "ข่าวเตือนภัย" }).background,
  "#FBEDEC",
);
assert.equal(
  announcementCarousel.getAnnouncementCardTone({ category: "warning" }).background,
  "#FBEDEC",
);
assert.equal(
  announcementCarousel.getAnnouncementCategory({ tag: "ข่าวสาร", category: "announcement" }),
  "ข่าวสาร",
);
assert.equal(
  announcementCarousel.getAnnouncementIcon({ category: "กิจกรรม" }),
  "calendar-outline",
);
assert.ok(announcementCarousel.formatAnnouncementDate({ date: "2026-09-21" }, "th-TH"));
assert.notEqual(
  announcementCarousel.getAnnouncementImageFailureKey({
    id: 1,
    imageUrl: "https://cdn.example.test/news.jpg",
    imageCacheKey: "v1",
  }),
  announcementCarousel.getAnnouncementImageFailureKey({
    id: 1,
    imageUrl: "https://cdn.example.test/news.jpg",
    imageCacheKey: "v2",
  }),
  "image version changes must reset image failure state",
);
// Every tone (including the alert tone) must carry a backdrop color — it
// is what fills the letterbox strip behind a contained image on image-first
// Home cards, so a missing backdrop would render a transparent/undefined
// gap instead of an intentional frame.
assert.ok(typeof announcementCarousel.getAnnouncementCardTone({ id: 1 }).backdrop === "string");
assert.ok(typeof announcementCarousel.getAnnouncementCardTone({ tag: "ข่าวเตือนภัย" }).backdrop === "string");

// Home cards are image-first: an item with either an image or a thumbnail
// shows the image only; one with neither falls back to a text card.
assert.equal(announcementCarousel.hasAnnouncementImage({ imageUrl: "https://cdn.example.test/a.jpg" }), true);
assert.equal(announcementCarousel.hasAnnouncementImage({ thumbnailUrl: "https://cdn.example.test/a.jpg" }), true);
assert.equal(announcementCarousel.hasAnnouncementImage({ imageUrl: null, thumbnailUrl: null }), false);
assert.equal(announcementCarousel.hasAnnouncementImage({}), false);

// getContainedImageLayout: "contain" fit inside a fixed box — full image,
// centered, letterboxed on whichever axis has slack.
// Wide banner (3.2:1, e.g. 5520x1725) inside a 308x247 box: width-limited,
// height shrinks below the box, leaving vertical letterbox space.
assert.deepEqual(
  announcementCarousel.getContainedImageLayout(5520, 1725, 308, 247),
  { width: 308, height: 96 },
);
// Box wider than the image's aspect ratio: height-limited instead.
assert.deepEqual(
  announcementCarousel.getContainedImageLayout(400, 400, 308, 247),
  { width: 247, height: 247 },
);
// Unknown dimensions (e.g. onImageSize hasn't fired yet): fill the box
// rather than collapsing to 0, so there's no flash of an empty card.
assert.deepEqual(
  announcementCarousel.getContainedImageLayout(null, null, 308, 247),
  { width: 308, height: 247 },
);
assert.deepEqual(
  announcementCarousel.getContainedImageLayout(0, 0, 308, 247),
  { width: 308, height: 247 },
);

assert.equal(announcementCarousel.getAnnouncementSummary({ title: "ข่าวด่วน", body: "ข่าวด่วน" }), "");
assert.equal(announcementCarousel.getAnnouncementSummary({ title: "ข่าวด่วน", sub: "รายละเอียดเพิ่มเติม" }), "รายละเอียดเพิ่มเติม");
assert.equal(announcementCarousel.getAnnouncementSummary({ title: "ข่าวด่วน", sub: "ข่าวด่วน", body: "เนื้อหาข่าว" }), "เนื้อหาข่าว");

// Trailing-copy snap target must land within the ScrollView's real max
// offset (contentWidth - viewport). The loop grid (index * snapUnit) does
// not account for the container's CARD_INSET padding on both edges, so
// without clamping, the computed target for the trailing looped copy
// overshoots what native can actually scroll to and the scroll-settle
// handshake (onScrollAnimationEnd / finishScroll) never fires.
function checkCarouselGeometry(viewportWidth, realCount) {
  const cardWidth = announcementCarousel.getAnnouncementCardWidth(viewportWidth, realCount);
  const snapUnit = cardWidth + 12; // CARD_GAP
  const loopedCount = realCount + 2; // [last, ...items, first]
  const contentWidth = announcementCarousel.getAnnouncementLoopContentWidth(cardWidth, loopedCount);
  const maxOffset = announcementCarousel.getAnnouncementMaxScrollOffset(contentWidth, viewportWidth);
  const trailingCopyIndex = realCount + 1;
  const rawTarget = trailingCopyIndex * snapUnit;
  const clampedTarget = announcementCarousel.clampAnnouncementScrollOffset(rawTarget, contentWidth, viewportWidth);
  assert.ok(
    clampedTarget <= maxOffset + 0.01,
    `viewport ${viewportWidth}/${realCount} items: clamped target ${clampedTarget} exceeds reachable max ${maxOffset}`,
  );
  assert.ok(
    rawTarget > maxOffset,
    `viewport ${viewportWidth}/${realCount} items: expected the raw (unclamped) target to reproduce the original overshoot bug`,
  );
  return { cardWidth, snapUnit, contentWidth, maxOffset, rawTarget, clampedTarget };
}

const geom360 = checkCarouselGeometry(360, 3);
assert.equal(geom360.rawTarget - geom360.maxOffset, 20, "reproduces the reported 20-unit shortfall at viewport 360");
assert.equal(geom360.clampedTarget, geom360.maxOffset);

const geom430 = checkCarouselGeometry(430, 3);
assert.equal(geom430.rawTarget - geom430.maxOffset, 20, "reproduces the reported 20-unit shortfall at viewport 430");
assert.equal(geom430.clampedTarget, geom430.maxOffset);

// A mid-loop target (not the trailing copy) must stay unclamped — only the
// edges of the loop are ever unreachable.
const geomMid = checkCarouselGeometryOk = (() => {
  const viewportWidth = 360;
  const realCount = 3;
  const cardWidth = announcementCarousel.getAnnouncementCardWidth(viewportWidth, realCount);
  const snapUnit = cardWidth + 12;
  const loopedCount = realCount + 2;
  const contentWidth = announcementCarousel.getAnnouncementLoopContentWidth(cardWidth, loopedCount);
  const midTarget = 2 * snapUnit; // second real item, well within bounds
  const clamped = announcementCarousel.clampAnnouncementScrollOffset(midTarget, contentWidth, viewportWidth);
  assert.equal(clamped, midTarget, "mid-loop snap targets are not altered by clamping");
})();

// Single-item and empty lists never need clamping (no loop copies exist).
assert.equal(announcementCarousel.getAnnouncementMaxScrollOffset(0, 360), 0);
assert.equal(announcementCarousel.clampAnnouncementScrollOffset(500, 0, 360), 0);
const imageBounds = announcementImageViewer.getAnnouncementImageBounds(320, 500, 360, 780, 2);
assert.deepEqual(imageBounds, { maxX: 140, maxY: 110 });
assert.deepEqual(announcementImageViewer.clampAnnouncementImageTranslation(500, -500, imageBounds), { x: 140, y: -110 });
assert.deepEqual(
  announcementImageViewer.clampAnnouncementImageTranslation(35, -22,
    announcementImageViewer.getAnnouncementImageBounds(320, 500, 360, 780, 1)),
  { x: 0, y: 0 },
  "returning to 1x centers the image and prevents stale translation",
);
const thumbnailFallbackAnnouncement = announcement.normalizeAnnouncement({
  id: 43,
  image_url: "https://cdn.example.test/news-full.jpg",
  thumbnail_url: "/storage/news-missing-thumb.jpg",
});
assert.equal(thumbnailFallbackAnnouncement.imageUrl, "https://cdn.example.test/news-full.jpg");
assert.equal(thumbnailFallbackAnnouncement.thumbnailUrl, "https://api.example.test/storage/news-missing-thumb.jpg");

const paginatedLrdPayload = {
  data: {
    data: [{ id: 1 }, { id: 2 }],
    total: 1207,
    current_page: 2,
    per_page: 20,
    last_page: 61,
  },
};
const projectFixture = Array.from({ length: 1207 }, (_, index) => ({
  id: index + 1, researcher_id: index % 2 ? "B" : "A",
}));
const collectedProjects = [];
for (let page = 1; page <= 61; page += 1) {
  const parsed = lrdResourceState.resolveLrdApiState({
    data: projectFixture.slice((page - 1) * 20, page * 20),
    total: 1207, current_page: page, per_page: 20, last_page: 61,
  });
  assert.equal(parsed.total, 1207);
  assert.equal(parsed.pagination.currentPage, page);
  collectedProjects.push(...parsed.items);
}
assert.deepEqual(collectedProjects, projectFixture, "parser preserves all API rows across pages and owners");
assert.deepEqual(lrdResponse.getLrdRows(paginatedLrdPayload), [{ id: 1 }, { id: 2 }]);
assert.deepEqual(lrdResponse.getLrdPagination(paginatedLrdPayload), {
  total: 1207,
  currentPage: 2,
  perPage: 20,
  lastPage: 61,
});
assert.equal(
  lrdResponse.getLrdTotal({ data: [{ id: 1 }, { id: 2 }], total: null }),
  2,
  "null total falls back to the current rows instead of zero",
);
assert.throws(
  () => lrdResponse.getLrdRows({ html: "<html>login</html>" }),
  /Invalid LRD collection response/,
);
assert.throws(
  () => lrdResponse.getLrdRows({ data: [null] }),
  /Invalid LRD collection response/,
);
assert.deepEqual(lrdResponse.getLrdRows({ data: [] }), [], "a valid empty page stays empty");
assert.deepEqual(lrdResponse.orderLrdRowsByCreation([
  { id: 3 }, { id: 1 }, { id: 2 },
]).map((row) => row.id), [1, 2, 3], "new projects append after older numeric IDs");
assert.deepEqual(lrdResponse.orderLrdRowsByCreation([
  { id: 9, created_at: "2026-03-03T00:00:00Z" },
  { id: 4, created_at: "2026-03-01T00:00:00Z" },
  { id: 7, created_at: "2026-03-02T00:00:00Z" },
]).map((row) => row.id), [4, 7, 9], "creation time defines append order when available");
assert.deepEqual(lrdResponse.orderLrdRowsByCreation([
  { id: "opaque-b" }, { id: "opaque-a" },
]), [{ id: "opaque-b" }, { id: "opaque-a" }], "unknown IDs retain API order");
assert.deepEqual(lrdResourceState.resolveLrdApiState({
  data: [{ id: "new" }, { id: "other" }],
  total: 2,
  current_page: 1,
  per_page: 20,
  last_page: 1,
}), {
  items: [{ id: "new" }, { id: "other" }],
  total: 2,
  pagination: { total: 2, currentPage: 1, perPage: 20, lastPage: 1 },
  source: "api",
  stale: false,
  error: null,
}, "API data replaces the previous collection in server order");
assert.deepEqual(lrdResourceState.resolveLrdApiState({ data: [], total: 0, current_page: 2, per_page: 20, last_page: 2 }).items, []);
assert.deepEqual(lrdResourceState.resolveLrdFailureState(
  { items: [{ id: "cached" }], total: 99 },
  "422 validation failed",
), {
  items: [{ id: "cached" }],
  total: 99,
  pagination: null,
  source: "cache",
  stale: true,
  error: "422 validation failed",
}, "a failed refresh keeps cache but marks it stale");
assert.deepEqual(lrdResourceState.resolveLrdFailureState(null, "offline"), {
  items: [],
  total: 0,
  pagination: null,
  source: "none",
  stale: false,
  error: "offline",
});
assert.deepEqual(lrdDiagnostics.summarizeLrdParams({ scope: "all", page: 3, per_page: 20, q: "private title" }), {
  scope: "all",
  page: 3,
  perPage: 20,
  hasQuery: true,
}, "diagnostics record query presence without the query value");
assert.deepEqual(lrdDiagnostics.summarizeLrdOwnership([
  { researcher_id: 7 },
  { researcher_id: "8" },
  { researcher_id: null },
], 7), {
  ownedByAccount: 1,
  ownedByOthers: 1,
  unknownOwner: 1,
}, "ownership diagnostics report aggregate counts without identifiers");
assert.equal(lrdDiagnostics.summarizeLrdOwnership([{ researcher_id: 7 }], null), null);
const safe422 = lrdDiagnostics.getSafeLrdErrorDetails({
  response: {
    status: 422,
    data: {
      message: "The scope field is invalid",
      errors: {
        scope: ["The selected scope is invalid"],
        researcher_id: ["do not log this"],
      },
    },
  },
});
assert.equal(safe422.status, 422);
assert.deepEqual(safe422.fields, ["scope"], "sensitive validation field names are omitted");
assert.equal(JSON.stringify(safe422).includes("researcher_id"), false);
assert.equal(lrdDiagnostics.getLrdCacheAgeMs(1000, 1500), 500);

const notificationCurrent = [
  { id: "1", serverId: "1", receivedAt: "2026-09-23T10:00:00Z" },
  { id: "2", serverId: "2", receivedAt: "2026-09-23T09:00:00Z" },
  { id: "local", receivedAt: "2026-09-23T08:00:00Z" },
];
const notificationMerged = notificationInbox.mergeNotificationInbox(
  notificationCurrent,
  [{ id: "1", receivedAt: "2026-09-23T10:00:00Z" }, { id: "3", receivedAt: "2026-09-23T11:00:00Z" }],
);
assert.deepEqual(notificationMerged.map((item) => item.id), ["3", "1", "local"]);
assert.equal(notificationInbox.getAnnouncementId({ data: { announcement_id: 42 } }), "42");
assert.equal(notificationInbox.getAnnouncementId({ data: { announcementId: 43 } }), "43");

const reconciledAnnouncementNotifications = notificationInbox.reconcileAnnouncementNotificationContent(
  [
    {
      id: "edited-news",
      title: "old push title",
      body: "old push body",
      data: { type: "announcement", announcement_id: 18 },
    },
    {
      id: "other-notification",
      title: "keep this title",
      body: "keep this body",
      data: { type: "reminder" },
    },
    {
      id: "missing-news",
      title: "push fallback",
      body: "push fallback body",
      data: { type: "announcement", announcementId: 999 },
    },
  ],
  [{ id: 18, title: "เฉลิมฉลองครบ 90 ปี", body: "ข้อความข่าวที่แก้ไขแล้ว" }],
);
assert.deepEqual(
  reconciledAnnouncementNotifications.map((item) => [item.id, item.title, item.body]),
  [
    ["edited-news", "เฉลิมฉลองครบ 90 ปี", "ข้อความข่าวที่แก้ไขแล้ว"],
    ["other-notification", "keep this title", "keep this body"],
    ["missing-news", "push fallback", "push fallback body"],
  ],
  "the announcement list updates text only; an unmatched id stays visible with its push snapshot",
);

// An announcement notification must survive even when its announcement is no
// longer in GET /announcements. That list is paginated (Home requests limit=5),
// so an older announcement falls out of it while the detail endpoint still
// serves the record — filtering on list membership silently hid valid
// notifications. Membership in the authenticated inbox is what counts.
const oldAnnouncementNotification = [
  { id: "900", serverId: "900", receivedAt: "2026-01-01T00:00:00Z", data: { announcement_id: 900 } },
];
assert.deepEqual(
  notificationInbox
    .mergeNotificationInbox([], oldAnnouncementNotification)
    .map((item) => item.id),
  ["900"],
  "a notification for an announcement outside the list page is kept",
);

// Dismissal is local-only, so a dismissed row must stay out of the inbox even
// though the server keeps returning it on every sync.
const dismissedOnce = new Set(["2"]);
assert.deepEqual(
  notificationInbox
    .mergeNotificationInbox(
      notificationCurrent,
      [
        { id: "1", receivedAt: "2026-09-23T10:00:00Z" },
        { id: "2", receivedAt: "2026-09-23T09:00:00Z" },
      ],
      dismissedOnce,
    )
    .map((item) => item.id),
  ["1", "local"],
  "a dismissed notification does not come back on the next sync",
);

// Badge correction — exercises the production implementation that
// notificationService calls, so breaking it fails here. The correction is
// derived from the live server rows, never from a flag stored at dismissal
// time: that stored flag could not be reconciled once the server's own count
// changed for the row, which made later notifications show no badge.
const badgeRows = [
  { id: "1", serverId: "1", read: false },
  { id: "2", serverId: "2", read: false },
  { id: "3", serverId: "3", read: false },
];
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 3,
    serverRows: badgeRows,
  }),
  3,
);
// A dismissed row the server still reports unread is subtracted, so hiding it
// drops the badge immediately.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 3,
    serverRows: badgeRows,
    dismissedIds: new Set(["2"]),
  }),
  2,
  "dismissing one unread notification lowers the badge",
);
// Once the server reports that row read — marked from another device — the
// server count has already dropped, so no further correction is owed.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 2,
    serverRows: [
      { id: "1", serverId: "1", read: false },
      { id: "2", serverId: "2", read: true },
      { id: "3", serverId: "3", read: false },
    ],
    dismissedIds: new Set(["2"]),
  }),
  2,
  "a dismissed row read elsewhere is not subtracted twice",
);
// Read-all clears every row, then a new unread B arrives. The stale dismissal
// of A must not eat B's badge.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 1,
    serverRows: [
      { id: "A", serverId: "A", read: true },
      { id: "B", serverId: "B", read: false },
    ],
    dismissedIds: new Set(["A"]),
  }),
  1,
  "a new notification keeps its badge after an earlier dismissal was read",
);
// The server deleted the dismissed row entirely; a new unread B still counts.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 1,
    serverRows: [{ id: "B", serverId: "B", read: false }],
    dismissedIds: new Set(["A"]),
  }),
  1,
  "a deleted dismissed row does not keep reducing the badge",
);
// Dismissing an already-read row changes nothing, since the server never
// counted it.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 3,
    serverRows: [...badgeRows.slice(0, 2), { id: "3", serverId: "3", read: true }],
    dismissedIds: new Set(["3"]),
  }),
  3,
);
// Several dismissals accumulate while the server still reports them unread.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 5,
    serverRows: badgeRows,
    dismissedIds: new Set(["1", "2"]),
  }),
  3,
);
// A row both dismissed and pending-read is subtracted once, not twice.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 3,
    serverRows: badgeRows,
    dismissedIds: new Set(["1"]),
    pendingReadIds: new Set(["1"]),
  }),
  2,
);
// Pending-read and dismissed corrections are independent otherwise.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 3,
    serverRows: badgeRows,
    dismissedIds: new Set(["1"]),
    pendingReadIds: new Set(["2"]),
  }),
  1,
);
// The badge never goes negative when the counts disagree.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: 1,
    serverRows: badgeRows,
    dismissedIds: new Set(["1", "2"]),
  }),
  0,
);
// No server count means unknown — callers must not substitute a row count.
assert.equal(
  notificationInbox.getCorrectedUnreadCount({
    serverUnreadCount: null,
    serverRows: badgeRows,
  }),
  null,
);

// Stale image callbacks — the guard AnnouncementImage actually calls.
assert.equal(announcementImageState.isCurrentImageCallback("b.jpg", "b.jpg"), true);
assert.equal(
  announcementImageState.isCurrentImageCallback("b.jpg", "a.jpg"),
  false,
  "a late callback from a previous image must not update the current one",
);
// Falling back from thumbnail to original retargets the active URI, so only
// the new source's callback counts.
assert.equal(announcementImageState.isCurrentImageCallback("original.jpg", "thumb.jpg"), false);
assert.equal(announcementImageState.isCurrentImageCallback("original.jpg", "original.jpg"), true);
assert.equal(announcementImageState.isCurrentImageCallback(null, null), false);

// Cache-only placeholder gating — the helper AnnouncementImage calls.
assert.equal(
  announcementImageState.shouldShowCachedPlaceholder({
    placeholderUri: "thumb.jpg",
    currentUri: "original.jpg",
    platformOS: "ios",
  }),
  true,
);
// Android ignores the cache policy, so showing a placeholder there would start
// a real download.
assert.equal(
  announcementImageState.shouldShowCachedPlaceholder({
    placeholderUri: "thumb.jpg",
    currentUri: "original.jpg",
    platformOS: "android",
  }),
  false,
  "no placeholder on platforms that ignore the cache-only policy",
);
// An evicted entry fails the cache-only load; the placeholder is dropped
// rather than refetched.
assert.equal(
  announcementImageState.shouldShowCachedPlaceholder({
    placeholderUri: "thumb.jpg",
    currentUri: "original.jpg",
    platformOS: "ios",
    placeholderMissed: true,
  }),
  false,
  "a cache miss drops the placeholder instead of hitting the network",
);
// Nothing to overlay when the placeholder is the image already being shown.
assert.equal(
  announcementImageState.shouldShowCachedPlaceholder({
    placeholderUri: "same.jpg",
    currentUri: "same.jpg",
    platformOS: "ios",
  }),
  false,
);
assert.equal(
  announcementImageState.shouldShowCachedPlaceholder({
    placeholderUri: null,
    currentUri: "original.jpg",
    platformOS: "ios",
  }),
  false,
);

const normalizedServices = services.normalizeServices({ data: [
  {
    id: 2,
    service_key: "e_research",
    name_th: " e-Research ",
    name_en: "e-Research",
    action_type: "internal_route",
    route_key: "e_research",
    sort_order: 20,
    is_active: true,
    icon_name: "journal-outline",
    icon_color: "#07865F",
    background_color: "#E8F4EF",
  },
  {
    id: 1,
    service_key: "lms",
    name_th: "LMS",
    name_en: "LMS",
    action_type: "external_url",
    url: "https://lms.uru.ac.th",
    sort_order: 10,
    is_active: true,
    icon_name: "book-outline",
  },
  { id: 3, service_key: "hidden", is_active: false, sort_order: 1 },
] });
assert.equal(normalizedServices.length, 2);
assert.equal(normalizedServices[0].serviceKey, "e_research");
assert.equal(normalizedServices[1].serviceKey, "lms");
assert.equal(services.getServiceRoute(normalizedServices[0]), "EResearch");
assert.equal(services.isServiceUrlValid(normalizedServices[1]), true);
assert.equal(services.isServiceUrlValid({ actionType: "external_url", url: "javascript:alert(1)" }), false);
assert.equal(services.getServiceLabel(normalizedServices[0], "en"), "e-Research");
assert.equal(services.normalizeService({ service_key: "broken", icon_name: "not-real" }).iconName, "grid-outline");
const cachedService = services.normalizeServices(normalizedServices);
assert.equal(cachedService[0].serviceKey, "e_research");
assert.equal(cachedService[1].actionType, "external_url");
assert.equal(services.getServiceRoute({ actionType: "internal_route", routeKey: "constructor" }), null);
assert.equal(services.getServiceRoute({ actionType: "internal_route", serviceKey: "other", routeKey: "expert" }), null);
const mismatchedNativeServices = services.normalizeServices({ data: [
  {
    id: 15,
    service_key: "expert",
    name_th: "Expert",
    action_type: "external_url",
    route_key: null,
    url: "https://expert.uru.ac.th",
    sort_order: 10,
    is_active: true,
  },
  {
    id: 20,
    service_key: "lms",
    name_th: "LMS",
    action_type: "external_url",
    url: "https://lms.uru.ac.th",
    sort_order: 20,
    is_active: true,
  },
] }, { strict: true });
assert.equal(mismatchedNativeServices.length, 2);
assert.equal(services.isNativeServiceMisconfigured(mismatchedNativeServices[0]), true);
assert.equal(services.isServiceUrlValid(mismatchedNativeServices[0]), true);
assert.equal(services.isNativeServiceMisconfigured(mismatchedNativeServices[1]), false);
assert.throws(
  () => services.normalizeServices({ html: "<html>login</html>" }, { strict: true }),
  /Invalid services response/,
);
assert.throws(
  () => services.normalizeServices({ data: [
    { id: 1, service_key: "one", name_th: "One", action_type: "external_url", url: "https://one.test", sort_order: 1, is_active: true },
    { id: 1, service_key: "two", name_th: "Two", action_type: "external_url", url: "https://two.test", sort_order: 2, is_active: true },
  ] }, { strict: true }),
  /Duplicate service id/,
);
assert.equal(services.getServiceError({ response: { status: 403, data: { message: { error: "forbidden" } } } }).kind, "forbidden");
assert.equal(services.getServiceError({ response: { status: 403, data: { message: { error: "forbidden" } } } }).message, "ไม่สามารถโหลดบริการได้");
const setupError = services.getServiceError({
  response: { status: 503, data: { code: "SERVICE_SETUP_REQUIRED", message: "Service catalog is not ready." } },
});
assert.equal(setupError.kind, "setup");
assert.equal(setupError.code, "SERVICE_SETUP_REQUIRED");

const serviceFixture = { id: 2, service_key: "expert", name_th: "Thai name", name_en: null,
  action_type: "internal_route", route_key: "expert", sort_order: 10, is_active: true };
const oneLanguage = services.normalizeService(serviceFixture, 0, { strict: true });
assert.equal(services.getServiceLabel(oneLanguage, "en"), "Thai name");
assert.deepEqual(services.normalizeServices({ data: [
  {
    ...serviceFixture,
    id: 10,
    service_key: "other",
    action_type: "external_url",
    route_key: null,
    url: "https://other.uru.ac.th",
  },
  serviceFixture,
] }, { strict: true }).map(row => row.id), [10, 2]);
for (const change of [{ is_active: "false" }, { sort_order: null }, { id: {} }, { name_th: {}, name_en: null }]) {
  assert.throws(() => services.normalizeService({ ...serviceFixture, ...change }, 0, { strict: true }));
}
assert.deepEqual(services.normalizeServices({ data: [] }, { strict: true }), []);
assert.throws(() => services.normalizeServices({ data: [null] }, { strict: true }));
const signedIcon = "https://cdn.example.test/icon.png?signature=abc%2B123";
assert.equal(services.normalizeService({ ...serviceFixture, icon_url: signedIcon, updated_at: "2026-09-21" }).iconUrl, signedIcon);
assert.equal(services.getServiceRoute({ actionType: "internal_route", routeKey: "__proto__" }), null);
assert.equal(services.normalizeServices({ data: [
  { ...serviceFixture, id: 99, service_key: "future_route", route_key: "future_route" },
] }, { strict: true }).length, 0);

async function testRefreshTaskSettlement() {
  let resolveSlow;
  let finished = false;
  const slowTask = new Promise((resolve) => { resolveSlow = resolve; });
  const aggregate = refresh.settleRefreshTasks([
    () => slowTask,
    () => Promise.reject(new Error("stats unavailable")),
    () => Promise.resolve("announcements loaded"),
  ]).then((result) => {
    finished = true;
    return result;
  });

  await Promise.resolve();
  assert.equal(finished, false, "Home refresh waits for the slowest request");
  resolveSlow("services loaded");
  const result = await aggregate;
  assert.deepEqual(result.map((item) => item.status), ["fulfilled", "rejected", "fulfilled"]);
  assert.equal(finished, true, "Home refresh settles after every request completes");
}

async function testForegroundRefresh() {
  const { startForegroundRefresh } = loadModule("src/utils/foregroundRefresh.js");
  let active = true;
  let notify;
  let finish;
  let calls = 0;
  let unsubscribed = false;
  const timers = new Map();
  let timerId = 0;
  const stop = startForegroundRefresh({
    refresh: () => {
      calls += 1;
      return new Promise((resolve) => { finish = resolve; });
    },
    isActive: () => active,
    subscribe: (listener) => {
      notify = listener;
      return () => { unsubscribed = true; };
    },
    schedule: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    cancel: (id) => timers.delete(id),
  });
  assert.equal(calls, 1, "refresh immediately without opening inbox");
  await notify();
  assert.equal(calls, 1, "do not overlap requests");
  finish();
  await Promise.resolve();
  let next = [...timers.values()][0];
  assert.equal(next.delay, 0, "refresh again after session/activity change");
  const running = next.callback();
  finish();
  await running;
  next = [...timers.values()][0];
  assert.equal(next.delay, 10000);
  active = false;
  await notify();
  assert.equal(timers.size, 0, "stop timers in background");
  const previousCalls = calls;
  active = true;
  const resumed = notify();
  assert.equal(calls, previousCalls + 1, "refresh immediately on foreground");
  stop();
  finish();
  await resumed;
  assert.equal(timers.size, 0, "in-flight completion cannot restart disposed timer");
  assert.equal(unsubscribed, true);

  let retry;
  const stopFailure = startForegroundRefresh({
    refresh: async () => { throw new Error("offline"); },
    isActive: () => true,
    subscribe: () => () => {},
    schedule: (callback, delay) => { retry = { callback, delay }; return 1; },
    cancel: () => {},
  });
  await Promise.resolve();
  assert.equal(retry.delay, 10000, "network failure keeps bounded refresh cadence");
  stopFailure();
}

// Drives the real lock used by notificationService with deferred promises, so
// the interleavings these tests describe are the ones production takes.
async function testInboxLockOrdering() {
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  // A sync that started first must commit before a dismissal that arrives
  // mid-flight, so the dismissal is never overwritten by the stale snapshot.
  {
    const withLock = sessionLock.createSessionLock();
    const order = [];
    const syncGate = deferred();
    const syncDone = withLock("user:1", async () => {
      order.push("sync:start");
      await syncGate.promise;
      order.push("sync:commit");
    });
    await flush();
    const dismissDone = withLock("user:1", async () => {
      order.push("dismiss:commit");
    });
    await flush();
    assert.deepEqual(order, ["sync:start"], "a later mutation waits for the in-flight commit");
    syncGate.resolve();
    await Promise.all([syncDone, dismissDone]);
    assert.deepEqual(
      order,
      ["sync:start", "sync:commit", "dismiss:commit"],
      "the dismissal commits after the sync, never interleaved with it",
    );
  }

  // A failing task must not poison the queue, and must not surface as an
  // unhandled rejection for the next waiter.
  {
    const withLock = sessionLock.createSessionLock();
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    // Queue the follow-up BEFORE the failure settles, so it genuinely chains
    // onto a rejected promise rather than onto an already-cleared queue.
    const failing = withLock("user:1", async () => { throw new Error("sync failed"); });
    const after = withLock("user:1", async () => "ran anyway");
    const settled = await Promise.allSettled([failing, after]);

    assert.equal(settled[0].status, "rejected");
    assert.match(String(settled[0].reason?.message), /sync failed/);
    assert.equal(
      settled[1].status,
      "fulfilled",
      "a task queued behind a failing one must not inherit its rejection",
    );
    assert.equal(settled[1].value, "ran anyway");

    // Let any escaped rejection surface before asserting none did.
    await flush();
    await flush();
    process.off("unhandledRejection", onUnhandled);
    assert.deepEqual(
      unhandled.map((reason) => String(reason?.message ?? reason)),
      [],
      "a failing task must not produce an unhandled rejection from the queue",
    );
  }

  // Different accounts must not block each other.
  {
    const withLock = sessionLock.createSessionLock();
    const order = [];
    const blocked = deferred();
    const first = withLock("user:1", async () => {
      order.push("a:start");
      await blocked.promise;
      order.push("a:end");
    });
    await flush();
    const other = withLock("user:2", async () => { order.push("b:ran"); });
    await other;
    assert.deepEqual(order, ["a:start", "b:ran"], "a second account runs while the first is held");
    blocked.resolve();
    await first;
  }

  // The queue must be emptied once work settles, on both paths — comparing the
  // wrong promise during cleanup leaks an entry per key.
  {
    const withLock = sessionLock.createSessionLock();
    await withLock("user:1", async () => "ok");
    await flush();
    assert.deepEqual(withLock.pendingKeys(), [], "queue is cleaned up after success");

    await assert.rejects(withLock("user:2", async () => { throw new Error("nope"); }), /nope/);
    await flush();
    assert.deepEqual(withLock.pendingKeys(), [], "queue is cleaned up after failure");
  }
}

// Inbox mutation ordering, driven through the real lock and the real
// sequencing helpers that notificationService calls. Storage is a fake Map and
// the API is deferred promises, so each mandated interleaving is reproduced
// exactly. Network calls stay OUTSIDE the lock here because production keeps
// them outside it.
async function testInboxMutationOrdering() {
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  // Minimal stand-in for the service's storage + locked helpers, composed from
  // the same primitives production uses.
  const makeHarnessFor = (session = "user:1") => {
    const store = new Map([["pending", []], ["inbox", []]]);
    const withLock = sessionLock.createSessionLock();
    let revision = 0;
    const readPending = async () => new Set(store.get("pending").map(String));
    const writePending = async (ids) => store.set("pending", [...ids].map(String));
    return {
      session,
      withLock,
      getRevision: () => revision,
      bumpRevision: () => { revision += 1; return revision; },
      readPending,
      writePending,
      readInbox: async () => store.get("inbox"),
      writeInbox: async (rows) => store.set("inbox", rows),
      addPendingLocked: async (serverId) => {
        const ids = await readPending();
        ids.add(String(serverId));
        await writePending(ids);
        return ids;
      },
    };
  };

  // A sync must not slip between the local inbox write and the pending
  // enqueue: that gap leaves the row read with nothing queued for the server.
  {
    const h = makeHarnessFor();
    const order = [];
    const inboxWritten = deferred();
    const markRead = h.withLock(h.session, async () => {
      order.push("mark:write-inbox");
      await h.writeInbox([{ id: "1", serverId: "1", read: true }]);
      await inboxWritten.promise;
      await h.addPendingLocked("1");
      h.bumpRevision();
      order.push("mark:enqueue-pending");
    });
    await flush();
    const sync = h.withLock(h.session, async () => { order.push("sync:commit"); });
    await flush();
    assert.deepEqual(order, ["mark:write-inbox"], "the sync waits for the whole mark-read step");
    inboxWritten.resolve();
    await Promise.all([markRead, sync]);
    assert.deepEqual(
      order,
      ["mark:write-inbox", "mark:enqueue-pending", "sync:commit"],
      "inbox write and pending enqueue are one atomic step",
    );
    assert.deepEqual([...await h.readPending()], ["1"]);
  }

  // Clearing pending A while B is being queued must keep B.
  {
    const h = makeHarnessFor();
    await h.addPendingLocked("A");
    const clearA = h.withLock(h.session, async () => {
      const ids = inboxSync.removeConfirmedPendingIds(await h.readPending(), ["A"]);
      await h.writePending(ids);
    });
    const addB = h.withLock(h.session, () => h.addPendingLocked("B"));
    await Promise.all([clearA, addB]);
    assert.deepEqual(
      [...await h.readPending()].sort(),
      ["B"],
      "clearing A does not drop a concurrently queued B",
    );
  }

  // A successful read-all must clear only what it confirmed. C was queued while
  // the request was in flight and has never been sent, so it must survive.
  {
    const h = makeHarnessFor();
    await h.addPendingLocked("A");
    await h.addPendingLocked("B");
    const covered = [...await h.readPending()];
    const readAllCall = deferred();
    const readAll = (async () => {
      await readAllCall.promise;
      return h.withLock(h.session, async () => {
        const ids = inboxSync.removeConfirmedPendingIds(await h.readPending(), covered);
        await h.writePending(ids);
      });
    })();
    await h.withLock(h.session, () => h.addPendingLocked("C"));
    readAllCall.resolve();
    await readAll;
    assert.deepEqual(
      [...await h.readPending()],
      ["C"],
      "a read-all keeps pending ids queued after it started",
    );
  }

  // A GET that started before a mark-read returns after the PATCH succeeded and
  // the pending id was cleared. The pending set can no longer protect the row,
  // so the revision check is what stops the stale body resurrecting it.
  {
    const h = makeHarnessFor();
    await h.writeInbox([{ id: "1", serverId: "1", read: false }]);
    const revisionAtStart = h.getRevision();
    const getResponse = deferred();

    const sync = (async () => {
      const staleRows = await getResponse.promise; // GET body, pre-mutation
      return h.withLock(h.session, async () => {
        if (inboxSync.isInboxResponseStale(revisionAtStart, h.getRevision())) {
          return { applied: false, rows: await h.readInbox() };
        }
        await h.writeInbox(staleRows);
        return { applied: true, rows: staleRows };
      });
    })();

    // mark-read commits, then its PATCH succeeds and clears the pending id.
    await h.withLock(h.session, async () => {
      await h.writeInbox([{ id: "1", serverId: "1", read: true }]);
      await h.addPendingLocked("1");
      h.bumpRevision();
    });
    await h.withLock(h.session, async () => {
      const ids = inboxSync.removeConfirmedPendingIds(await h.readPending(), ["1"]);
      await h.writePending(ids);
    });
    assert.deepEqual([...await h.readPending()], [], "the PATCH cleared the pending id");

    getResponse.resolve([{ id: "1", serverId: "1", read: false }]);
    const result = await sync;
    assert.equal(result.applied, false, "a stale GET body is not applied");
    assert.deepEqual(
      (await h.readInbox()).map((row) => row.read),
      [true],
      "the row stays read even though the pending id was already cleared",
    );
  }

  // Switching accounts mid-request: each session has its own lock key and
  // revision, so the second account is never blocked by the first.
  {
    const a = makeHarnessFor("user:1");
    const b = makeHarnessFor("user:2");
    const order = [];
    const held = deferred();
    const first = a.withLock(a.session, async () => {
      order.push("a:start");
      await held.promise;
      order.push("a:end");
    });
    await flush();
    await b.withLock(b.session, async () => { order.push("b:ran"); });
    assert.deepEqual(order, ["a:start", "b:ran"], "a second account is not blocked");
    held.resolve();
    await first;
  }

  // A storage failure must not wedge the queue for the session.
  {
    const h = makeHarnessFor();
    const failing = h.withLock(h.session, async () => { throw new Error("storage down"); });
    const after = h.withLock(h.session, () => h.addPendingLocked("Z"));
    const settled = await Promise.allSettled([failing, after]);
    assert.equal(settled[0].status, "rejected");
    assert.equal(settled[1].status, "fulfilled", "a storage failure does not wedge later work");
    assert.deepEqual([...await h.readPending()], ["Z"]);
  }

  // A push arriving during a local mutation must still reach the tap handler.
  // The tap syncs, then looks for its own row; discarding the whole stale
  // response would hide the new row and send the user to the inbox list
  // instead of the announcement.
  {
    const localRows = [{ id: "OLD", serverId: "OLD", read: false }];
    const serverRows = [
      { id: "OLD", serverId: "OLD", read: true },
      { id: "NEW", serverId: "NEW", read: false },
    ];
    // The user dismissed/read OLD while the GET was in flight, so only OLD is
    // protected from the stale body.
    const merged = inboxSync.mergeStaleInboxResponse(localRows, serverRows, new Set(["OLD"]));
    assert.ok(
      merged.some((row) => String(row.serverId) === "NEW"),
      "a push that arrived during a mutation is still delivered to the inbox",
    );
    assert.equal(
      merged.find((row) => String(row.id) === "OLD").read,
      false,
      "the stale body does not undo the local mutation",
    );
  }

  // A row dismissed locally and absent from the stale body must not reappear.
  {
    const localRows = [];
    const serverRows = [{ id: "GONE", serverId: "GONE", read: false }];
    const merged = inboxSync.mergeStaleInboxResponse(localRows, serverRows, new Set(["GONE"]));
    assert.deepEqual(merged, [], "a dismissed row is not resurrected by a stale body");
  }

  // With nothing mutated, the server response is taken as-is.
  {
    const serverRows = [{ id: "A", serverId: "A", read: true }];
    assert.deepEqual(
      inboxSync.mergeStaleInboxResponse([{ id: "A", serverId: "A", read: false }], serverRows, new Set()),
      serverRows,
    );
  }

  // applyPendingReads keeps a queued read from flickering back to unread.
  {
    const rows = [
      { id: "1", serverId: "1", read: false },
      { id: "2", serverId: "2", read: false },
    ];
    assert.deepEqual(
      inboxSync.applyPendingReads(rows, new Set(["1"])).map((row) => row.read),
      [true, false],
      "a row with a queued mark-read renders as read",
    );
    assert.deepEqual(
      inboxSync.applyPendingReads(rows, new Set()).map((row) => row.read),
      [false, false],
    );
  }
}

// Push registration recovery — drives the same orchestrator that
// notificationService constructs, with fake I/O. Asserting only against the
// pure decision function would not cover the lifecycle these cases describe.
async function testPushRegistrationRecovery() {
  const makeHarness = (overrides = {}) => {
    const calls = { backend: 0 };
    const store = new Map();
    const env = {
      session: { userId: "u1" },
      status: "denied",
      token: "ExponentPushToken[aaa]",
      // Default: backend accepts and echoes back the token it received, the
      // way ensurePushTokenRegistered resolves with the accepted token.
      backend: async (session, token) => token ?? env.token,
      ...overrides,
    };
    const recovery = pushRecovery.createPushRegistrationRecovery({
      getSession: async () => env.session,
      getPermissionStatus: async () => env.status,
      getExpoToken: async () => env.token,
      registerWithBackend: async (session, token, devicePushToken) => {
        calls.backend += 1;
        return env.backend(session, token, devicePushToken);
      },
      isRetryableError: (error) => error?.retryable !== false,
      readConfirmation: async (session) => store.get(`c:${session.userId}`) ?? null,
      writeConfirmation: async (session, c) => store.set(`c:${session.userId}`, c),
      getPlatform: () => "android",
      getProjectId: () => "proj-1",
    });
    return { recovery, env, calls, store };
  };

  // denied -> granted, backend accepts.
  {
    const h = makeHarness();
    assert.equal((await h.recovery.run()).action, "skip", "stays idle while denied");
    h.env.status = "granted";
    const result = await h.recovery.run();
    assert.equal(result.action, "confirmed", "registers once permission is granted");
    assert.equal(result.token, h.env.token, "confirmation exposes the token accepted by the backend");
    assert.equal(h.calls.backend, 1);
  }

  // Expo token exists locally but the backend call fails: must NOT be treated
  // as registered. This is the false "already registered" bug.
  {
    const h = makeHarness({
      status: "granted",
      backend: async () => { throw Object.assign(new Error("boom"), { retryable: true }); },
    });
    const first = await h.recovery.run();
    assert.equal(first.action, "failed");
    assert.equal(first.retryable, true);
    assert.equal(
      h.recovery.getState().confirmation,
      null,
      "a stored Expo token alone is never treated as backend confirmation",
    );
    // A later foreground retries rather than skipping.
    h.env.backend = async (session, token) => token ?? h.env.token;
    const second = await h.recovery.run();
    assert.equal(second.action, "confirmed", "a retryable failure retries on the next foreground");
    assert.equal(h.calls.backend, 2);
  }

  // A retryable failure keeps the attempt pending, which is what preserves the
  // bounded-retry budget. Without it the state machine would rely on the
  // unconfirmed-identity fallback and lose the distinction.
  {
    const failed = pushRetry.onRegistrationFailed(
      pushRetry.onRegistrationStarted(pushRetry.createRegistrationState(), "granted"),
      { retryable: true },
    );
    assert.equal(failed.pending, true, "a retryable failure stays pending");
    assert.equal(failed.permanentlyFailed, false);
    assert.equal(
      pushRetry.nextRegistrationAction(failed, {
        currentStatus: "granted",
        hasSession: true,
        identity: "id-1",
      }).reason,
      "retry-pending",
      "a pending retry is the reason to register, not an identity fallback",
    );
  }

  // Non-retryable 4xx stops retrying.
  {
    const h = makeHarness({
      status: "granted",
      backend: async () => { throw Object.assign(new Error("bad request"), { retryable: false }); },
    });
    assert.equal((await h.recovery.run()).action, "failed");
    const after = await h.recovery.run();
    assert.equal(after.action, "skip");
    assert.equal(after.reason, "permanent-failure", "a permanent failure does not keep retrying");
    assert.equal(h.calls.backend, 1);
  }

  // Bounded attempts for repeated retryable failures.
  {
    const h = makeHarness({
      status: "granted",
      backend: async () => { throw Object.assign(new Error("flaky"), { retryable: true }); },
    });
    for (let i = 0; i < 6; i += 1) await h.recovery.run();
    assert.equal(
      h.calls.backend,
      pushRetry.MAX_REGISTRATION_ATTEMPTS,
      "retries stop at the configured maximum",
    );
    assert.equal((await h.recovery.run()).reason, "max-attempts");
  }

  // A confirmed registration does not call the backend again.
  {
    const h = makeHarness({ status: "granted" });
    await h.recovery.run();
    await h.recovery.run();
    await h.recovery.run();
    assert.equal(h.calls.backend, 1, "a confirmed registration avoids redundant requests");
    assert.equal((await h.recovery.run()).reason, "already-confirmed");
  }

  // Token rotation invalidates the old confirmation.
  {
    const h = makeHarness({ status: "granted" });
    await h.recovery.run();
    assert.equal(h.calls.backend, 1);
    h.env.token = "ExponentPushToken[bbb]";
    const rotated = await h.recovery.run();
    assert.equal(rotated.action, "confirmed", "a rotated token re-registers");
    assert.equal(h.calls.backend, 2);
  }

  // Account switch while the request is in flight: the response must not be
  // recorded against the new account.
  {
    const h = makeHarness({ status: "granted" });
    h.env.backend = async (session, token) => { h.env.session = { userId: "u2" }; return token ?? h.env.token; };
    const result = await h.recovery.run();
    assert.equal(result.action, "discarded");
    assert.equal(result.reason, "session-changed");
    assert.equal(
      h.recovery.getState().confirmation,
      null,
      "a confirmation is never recorded for a switched account",
    );
  }

  // Logout before completion.
  {
    const h = makeHarness({ status: "granted" });
    h.env.backend = async (session, token) => { h.env.session = null; return token ?? h.env.token; };
    const result = await h.recovery.run();
    assert.equal(result.action, "discarded", "a logout mid-flight discards the result");
    const after = await h.recovery.run();
    assert.equal(after.reason, "no-session", "no registration without a session");
  }

  // Confirmation persisted by a previous process is reused.
  {
    const h = makeHarness({ status: "granted" });
    await h.recovery.run();
    assert.equal(h.calls.backend, 1);
    const identity = h.store.get("c:u1").identity;
    const h2 = makeHarness({ status: "granted" });
    h2.store.set("c:u1", { identity });
    const reused = await h2.recovery.run();
    assert.equal(reused.reason, "already-confirmed", "a stored confirmation survives a restart");
    assert.equal(h2.calls.backend, 0);
  }

  // Repeated foreground events with no change do nothing.
  {
    const h = makeHarness({ status: "granted" });
    await h.recovery.run();
    const before = h.calls.backend;
    for (let i = 0; i < 5; i += 1) await h.recovery.run();
    assert.equal(h.calls.backend, before, "repeated foregrounds do not re-register");
  }

  // reset() clears state so a restarted watcher behaves like a fresh process.
  {
    const h = makeHarness({ status: "granted" });
    await h.recovery.run();
    h.recovery.reset();
    assert.equal(h.recovery.getState().confirmation, null, "reset clears in-memory confirmation");
  }

  // Production registration may mint or rotate the token, so confirmation must
  // use what the backend accepted — not the value read beforehand. This fails
  // if registerWithBackend's return value is ignored.
  {
    const h = makeHarness({ status: "granted", token: null });
    h.env.backend = async () => "ExponentPushToken[minted]";
    const result = await h.recovery.run();
    assert.equal(result.action, "confirmed", "registration mints a token when none is stored");
    assert.ok(
      result.identity.includes("ExponentPushToken[minted]"),
      "confirmation identity uses the minted token",
    );
    // A later run with that token now stored is already confirmed.
    h.env.token = "ExponentPushToken[minted]";
    assert.equal((await h.recovery.run()).reason, "already-confirmed");
  }

  // The token rotates during registration: the accepted token wins over the
  // one read before the request.
  {
    const h = makeHarness({ status: "granted", token: "ExponentPushToken[old]" });
    h.env.backend = async () => "ExponentPushToken[rotated]";
    const result = await h.recovery.run();
    assert.ok(
      result.identity.includes("ExponentPushToken[rotated]"),
      "confirmation follows the rotated token, not the pre-read one",
    );
    assert.ok(
      !result.identity.includes("ExponentPushToken[old]"),
      "the stale pre-registration token is never confirmed",
    );
  }

  // An unknown accepted token must never be persisted as a confirmation.
  {
    const h = makeHarness({ status: "granted" });
    h.env.backend = async () => null;
    const result = await h.recovery.run();
    assert.equal(result.action, "failed");
    assert.equal(result.reason, "unknown-accepted-token");
    assert.equal(h.store.get("c:u1"), undefined, "no confirmation is written without a token");
    assert.equal(result.retryable, true, "an unknown accepted token stays retryable");
  }

  // Two concurrent foreground callbacks join one registration.
  {
    const h = makeHarness({ status: "granted" });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    h.env.backend = async (session, token) => { await gate; return token ?? h.env.token; };
    const a = h.recovery.run();
    const b = h.recovery.run();
    release();
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(h.calls.backend, 1, "overlapping foreground events do not register twice");
    assert.equal(ra.action, "confirmed");
    assert.equal(rb.action, "confirmed");
  }

  // A request that finishes after reset()/logout must not write its result.
  {
    const h = makeHarness({ status: "granted" });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    h.env.backend = async (session, token) => { await gate; return token ?? h.env.token; };
    const pending = h.recovery.run();
    h.recovery.reset();
    release();
    const result = await pending;
    assert.equal(result.action, "discarded");
    assert.ok(
      String(result.reason).startsWith("reset-during-"),
      `a reset wins over an older in-flight request (got ${result.reason})`,
    );
    assert.equal(h.recovery.getState().confirmation, null);
  }

  // Login and rotation both record the accepted token through the same path.
  {
    const h = makeHarness({ status: "granted", token: null });
    h.env.backend = async (session, token, devicePushToken) =>
      devicePushToken?.data ? `ExponentPushToken[${devicePushToken.data}]` : "ExponentPushToken[login]";
    const login = await h.recovery.register();
    assert.equal(login.action, "confirmed", "login records confirmation");
    assert.ok(login.identity.includes("ExponentPushToken[login]"));

    const rotated = await h.recovery.register({ devicePushToken: { data: "rot", type: "android" } });
    assert.equal(rotated.action, "confirmed", "rotation records confirmation");
    assert.ok(
      rotated.identity.includes("ExponentPushToken[rot]"),
      "rotation confirms the rotated token, not the login token",
    );
  }

  // A rotation must not be swallowed by an in-flight registration for an
  // older token.
  {
    const h = makeHarness({ status: "granted", token: "ExponentPushToken[old]" });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    h.env.backend = async (session, token, devicePushToken) => {
      if (!devicePushToken) { await gate; return "ExponentPushToken[old]"; }
      return `ExponentPushToken[${devicePushToken.data}]`;
    };
    // Started while `slow` is still in flight, so a session-only dedupe key
    // would make the rotation join it and resolve with the OLD token.
    const slow = h.recovery.register();
    const rotationPromise = h.recovery.register({ devicePushToken: { data: "new", type: "android" } });
    release();
    const rotation = await rotationPromise;
    const older = await slow;
    assert.equal(rotation.action, "confirmed");
    assert.ok(
      rotation.identity.includes("ExponentPushToken[new]"),
      "a rotation runs its own registration rather than joining the older one",
    );
    // The older run is superseded by the rotation, so it must not confirm the
    // stale token even though it started first.
    assert.notEqual(older.action, "confirmed", "the superseded run does not confirm");
  }

  // A permanent failure for token A must not block token B.
  {
    const h = makeHarness({ status: "granted", token: "ExponentPushToken[A]" });
    h.env.backend = async () => { throw Object.assign(new Error("bad"), { retryable: false }); };
    assert.equal((await h.recovery.run()).action, "failed");
    assert.equal((await h.recovery.run()).reason, "permanent-failure");
    // Token rotates: the new identity gets a fresh budget.
    h.env.token = "ExponentPushToken[B]";
    h.env.backend = async (session, token) => token;
    const afterRotation = await h.recovery.run();
    assert.equal(
      afterRotation.action,
      "confirmed",
      "a new token is not blocked by the previous token's permanent failure",
    );
  }

  // An exhausted budget for token A must not block token B either.
  {
    const h = makeHarness({ status: "granted", token: "ExponentPushToken[A]" });
    h.env.backend = async () => { throw Object.assign(new Error("flaky"), { retryable: true }); };
    for (let i = 0; i < 5; i += 1) await h.recovery.run();
    assert.equal((await h.recovery.run()).reason, "max-attempts");
    const spent = h.calls.backend;
    h.env.token = "ExponentPushToken[B]";
    h.env.backend = async (session, token) => token;
    assert.equal((await h.recovery.run()).action, "confirmed", "a new token gets a fresh budget");
    assert.equal(h.calls.backend, spent + 1);
  }

  // Logging out and back in as the SAME user produces a new auth generation,
  // so an operation from the old session must not be reused.
  {
    const h = makeHarness({ status: "granted" });
    h.env.session = { userId: "u1", generation: 1 };
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    h.env.backend = async (session, token) => { await gate; return token ?? h.env.token; };
    const pending = h.recovery.run();
    // Logout then login as the same user.
    h.env.session = { userId: "u1", generation: 2 };
    release();
    const result = await pending;
    assert.equal(
      result.action,
      "discarded",
      "a request from the previous auth generation is not applied to the new one",
    );
  }

  // An old account's failure must not clear the new account's state.
  {
    const h = makeHarness({ status: "granted" });
    h.env.session = { userId: "u1", generation: 1 };
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    h.env.backend = async () => { await gate; throw Object.assign(new Error("late"), { retryable: true }); };
    const pending = h.recovery.run();
    h.env.session = { userId: "u2", generation: 1 };
    release();
    const result = await pending;
    assert.equal(result.action, "discarded", "an old account's failure is discarded");
    assert.equal(
      h.recovery.getState().permanentlyFailed,
      false,
      "the new account's state is untouched by the old account's failure",
    );
  }

  // A reset during a FAILING request: the catch branch must not record the
  // failure against state that now belongs to a fresh run.
  {
    const h = makeHarness({ status: "granted" });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    h.env.backend = async () => {
      await gate;
      throw Object.assign(new Error("late failure"), { retryable: false });
    };
    const pending = h.recovery.run();
    h.recovery.reset();
    release();
    const result = await pending;
    assert.equal(result.action, "discarded", "a failure after reset is discarded");
    assert.equal(
      h.recovery.getState().permanentlyFailed,
      false,
      "a discarded failure does not mark the fresh state permanently failed",
    );
    assert.equal(
      h.recovery.getState().attempts,
      0,
      "a discarded failure does not consume the fresh retry budget",
    );
  }

  // Reaches the CATCH branch specifically: the account switches only after the
  // backend request has actually started, so the earlier permission/token
  // guards are already past and the rejection lands in catch.
  {
    const h = makeHarness({ status: "granted" });
    h.env.session = { userId: "u1", generation: 1 };
    let signalStarted;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    let rejectRequest;
    const request = new Promise((_, reject) => { rejectRequest = reject; });
    h.env.backend = async () => {
      signalStarted();
      return request;
    };
    const pending = h.recovery.run();
    await started;
    // Switch accounts while the request is genuinely in flight.
    h.env.session = { userId: "u2", generation: 1 };
    rejectRequest(Object.assign(new Error("late failure"), { retryable: false }));
    const result = await pending;
    assert.equal(result.action, "discarded", "the catch branch discards a superseded failure");
    assert.equal(
      h.recovery.getState().permanentlyFailed,
      false,
      "a discarded failure does not mark the new account permanently failed",
    );
  }

  // Same, but a reset lands after the request started.
  {
    const h = makeHarness({ status: "granted" });
    let signalStarted;
    const started = new Promise((resolve) => { signalStarted = resolve; });
    let rejectRequest;
    const request = new Promise((_, reject) => { rejectRequest = reject; });
    h.env.backend = async () => { signalStarted(); return request; };
    const pending = h.recovery.run();
    await started;
    h.recovery.reset();
    rejectRequest(Object.assign(new Error("late"), { retryable: true }));
    const result = await pending;
    assert.equal(result.action, "discarded", "a reset after the request started discards the failure");
    assert.equal(h.recovery.getState().attempts, 0, "the fresh retry budget is untouched");
  }

  // B succeeds before A: the older A must not overwrite B's confirmation.
  {
    const h = makeHarness({ status: "granted", token: null });
    const gates = {};
    const makeGate = (key) => {
      let release;
      gates[key] = { promise: new Promise((resolve) => { release = resolve; }) };
      gates[key].release = release;
    };
    makeGate("A");
    makeGate("B");
    h.env.backend = async (session, token, devicePushToken) => {
      const key = devicePushToken?.data ?? "A";
      await gates[key].promise;
      return `ExponentPushToken[${key}]`;
    };
    const a = h.recovery.register({ devicePushToken: { data: "A", type: "android" } });
    const b = h.recovery.register({ devicePushToken: { data: "B", type: "android" } });
    gates.B.release();
    const rb = await b;
    assert.equal(rb.action, "confirmed");
    assert.ok(rb.identity.includes("ExponentPushToken[B]"));
    gates.A.release();
    const ra = await a;
    assert.notEqual(ra.action, "confirmed", "the older registration does not confirm");
    assert.ok(
      h.store.get("c:u1").identity.includes("ExponentPushToken[B]"),
      "the newer token's confirmation survives the older request completing last",
    );
  }

  // Each await in the pipeline has its own guard. A single removed guard is
  // masked by the next one, so this pins the stage each is responsible for:
  // a reset landing at that step must be caught there, not later.
  {
    const stages = [
      [1, "reset-during-permission-read"],
      [2, "reset-during-hydration"],
      [3, "reset-during-token-read"],
      [4, "reset-during-request"],
    ];
    for (const [resetAfter, expectedReason] of stages) {
      let step = 0;
      let recovery;
      const bump = () => {
        step += 1;
        if (step === resetAfter) recovery.reset();
      };
      recovery = pushRecovery.createPushRegistrationRecovery({
        getSession: async () => ({ userId: "u1", generation: 1 }),
        getPermissionStatus: async () => { bump(); return "granted"; },
        readConfirmation: async () => { bump(); return null; },
        getExpoToken: async () => { bump(); return "ExponentPushToken[a]"; },
        registerWithBackend: async () => { bump(); return "ExponentPushToken[a]"; },
        isRetryableError: () => true,
        writeConfirmation: async () => {},
        getPlatform: () => "android",
        getProjectId: () => "p1",
      });
      const result = await recovery.run();
      assert.equal(result.action, "discarded", `reset after step ${resetAfter} is discarded`);
      assert.equal(
        result.reason,
        expectedReason,
        `a reset at step ${resetAfter} is caught by its own guard`,
      );
    }
  }

  // Supersession AFTER the request reached the backend. This is the case the
  // success-path guard exists for: A is already inside registerWithBackend
  // when B starts, so the earlier hydration/token guards are long past and
  // only the check before writing can stop A overwriting B's confirmation.
  {
    const h = makeHarness({ status: "granted", token: null });
    let signalAStarted;
    const aStarted = new Promise((resolve) => { signalAStarted = resolve; });
    const gates = {};
    for (const key of ["A", "B"]) {
      let release;
      gates[key] = { promise: new Promise((resolve) => { release = resolve; }) };
      gates[key].release = release;
    }
    h.env.backend = async (session, token, devicePushToken) => {
      const key = devicePushToken?.data ?? "A";
      if (key === "A") signalAStarted();
      await gates[key].promise;
      return `ExponentPushToken[${key}]`;
    };

    const a = h.recovery.register({ devicePushToken: { data: "A", type: "android" } });
    // Only start B once A is genuinely inside the backend call.
    await aStarted;
    const b = h.recovery.register({ devicePushToken: { data: "B", type: "android" } });

    gates.B.release();
    const rb = await b;
    gates.A.release();
    const ra = await a;

    assert.equal(rb.action, "confirmed", "the newer token confirms");
    assert.equal(
      ra.action,
      "discarded",
      "a registration superseded after it reached the backend does not confirm",
    );
    assert.equal(ra.reason, "superseded");
    assert.ok(
      h.store.get("c:u1").identity.includes("ExponentPushToken[B]"),
      "the stale response does not overwrite the newer confirmation",
    );
  }

  // A pending -> B pending -> another A request: the second A joins the first
  // rather than starting a third operation.
  {
    const h = makeHarness({ status: "granted", token: null });
    const gates = {};
    for (const key of ["A", "B"]) {
      let release;
      gates[key] = { promise: new Promise((resolve) => { release = resolve; }) };
      gates[key].release = release;
    }
    h.env.backend = async (session, token, devicePushToken) => {
      const key = devicePushToken?.data ?? "A";
      await gates[key].promise;
      return `ExponentPushToken[${key}]`;
    };
    const a1 = h.recovery.register({ devicePushToken: { data: "A", type: "android" } });
    const b = h.recovery.register({ devicePushToken: { data: "B", type: "android" } });
    const a2 = h.recovery.register({ devicePushToken: { data: "A", type: "android" } });
    gates.A.release();
    gates.B.release();
    const [r1, rb, r2] = await Promise.all([a1, b, a2]);
    // A2 must join A1 rather than start a third operation — a single in-flight
    // slot would have lost A1's entry when B was registered.
    assert.equal(r1.action, r2.action, "the repeated A request joins the pending one");
    assert.equal(r1.reason, r2.reason);
    // Only the newest intent (B) is allowed to confirm.
    assert.equal(rb.action, "confirmed");
    assert.notEqual(r1.action, "confirmed", "the superseded A does not confirm");
    assert.equal(h.calls.backend, 1, "the superseded A never reaches the backend");
  }

  // The total number of network attempts is intentional: the orchestrator's
  // budget multiplies the inner retry loop, so this pins the product.
  {
    const h = makeHarness({ status: "granted" });
    let inner = 0;
    // Models ensurePushTokenRegistered's own 3-attempt loop.
    h.env.backend = async () => {
      for (let i = 0; i < 3; i += 1) { inner += 1; }
      throw Object.assign(new Error("flaky"), { retryable: true });
    };
    for (let i = 0; i < 10; i += 1) await h.recovery.run();
    assert.equal(
      h.calls.backend,
      pushRetry.MAX_REGISTRATION_ATTEMPTS,
      "the orchestrator stops at its own budget",
    );
    assert.equal(
      inner,
      pushRetry.MAX_REGISTRATION_ATTEMPTS * 3,
      "total network attempts = orchestrator budget x inner retry loop",
    );
  }

  // No unhandled rejection escapes a failing run.
  {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const h = makeHarness({
      status: "granted",
      backend: async () => { throw Object.assign(new Error("explode"), { retryable: true }); },
    });
    await h.recovery.run();
    await new Promise((resolve) => setImmediate(resolve));
    process.off("unhandledRejection", onUnhandled);
    assert.deepEqual(unhandled, [], "a failing registration produces no unhandled rejection");
  }
}

Promise.resolve()
  .then(testRefreshTaskSettlement)
  .then(testForegroundRefresh)
  .then(testLrdResource)
  .then(testLrdSession)
  .then(testProjectFormPayload)
  .then(testInboxLockOrdering)
  .then(testInboxMutationOrdering)
  .then(testPushRegistrationRecovery)
  .then(() => require("./test-notification-icon-plugin.js"))
  .then(() => console.log("Tests OK"))
  .catch((error) => {
  console.error(error);
  process.exitCode = 1;
  });
