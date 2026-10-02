const CARD_INSET = 16;
const CARD_GAP = 12;
const NEXT_CARD_PEEK = 24;

// `background`/`border`/`title` dress the no-image text card. Image cards
// use the same tone only as a stable loading/error surface; cover fills the
// frame once the image is available.
const ANNOUNCEMENT_CARD_TONES = [
  { background: "#E7F1EB", border: "#C9DED3", accent: "#006B4F", title: "#183D32", backdrop: "#E7F1EB" },
  { background: "#EAF2FA", border: "#CFDFEF", accent: "#245B86", title: "#183D32", backdrop: "#EAF2FA" },
  { background: "#F0ECF7", border: "#DDD4EB", accent: "#5E467A", title: "#183D32", backdrop: "#F0ECF7" },
  { background: "#FFF4D6", border: "#EEDCA7", accent: "#6A5310", title: "#183D32", backdrop: "#FFF4D6" },
];

const ALERT_CARD_TONE = {
  background: "#FBEDEC",
  border: "#EDCDCA",
  accent: "#A52A24",
  title: "#4B211E",
  backdrop: "#FBEDEC",
  icon: "warning-outline",
};

const getStableIdentity = (item) => String(
  item?.id ?? item?.announcement_id ?? item?.title ?? item?.name ?? "announcement",
);

const hashIdentity = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

export const getAnnouncementStableIndex = (item, size) => (
  size > 0 ? hashIdentity(getStableIdentity(item)) % size : 0
);

const getCategoryValues = (item) => [
  item?.tag,
  item?.category,
  item?.category_name,
  item?.categoryName,
  item?.type,
  item?.kind,
  item?.notice_type,
  item?.noticeType,
  item?.announcement_type,
  item?.announcementType,
].filter((value) => value !== undefined && value !== null && String(value).trim() !== "");

const getCategoryValue = (item) => getCategoryValues(item).join(" ");

export const getAnnouncementCategory = (item, fallback = "") => {
  const category = String(getCategoryValues(item)[0] ?? "").trim();
  return category || fallback;
};

export const getAnnouncementDate = (item) => {
  const value = item?.date
    ?? item?.published_at
    ?? item?.publishedAt
    ?? item?.created_at
    ?? item?.createdAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatAnnouncementDate = (item, language = "th") => {
  const date = getAnnouncementDate(item);
  if (!date) return "";
  const locale = String(language).toLowerCase().startsWith("th") ? "th-TH" : "en-US";
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const getAnnouncementIcon = (item, fallbackIcon = "newspaper-outline") => {
  const explicitIcon = item?.icon ?? item?.icon_name ?? item?.iconName;
  if (explicitIcon) return explicitIcon;

  const category = getCategoryValue(item);
  if (/เตือนภัย|อันตราย|alert|warning/i.test(category)) return "warning-outline";
  if (/กิจกรรม|event|calendar/i.test(category)) return "calendar-outline";
  if (/ประกาศ|announcement|notice/i.test(category)) return "megaphone-outline";
  return fallbackIcon;
};

export const isAnnouncementAlert = (item) => {
  const explicitAlert = item?.is_alert ?? item?.isAlert ?? item?.alert;
  if (explicitAlert === true || explicitAlert === 1 || explicitAlert === "1") return true;
  return /เตือนภัย|อันตราย|alert|warning/i.test(
    `${getCategoryValue(item)} ${item?.title ?? ""}`,
  );
};

export const getAnnouncementCardTone = (item) => (
  isAnnouncementAlert(item)
    ? ALERT_CARD_TONE
    : ANNOUNCEMENT_CARD_TONES[getAnnouncementStableIndex(item, ANNOUNCEMENT_CARD_TONES.length)]
);

// Picks the thumbnail only when we can confirm (from backend-supplied
// dimensions) that it covers the on-screen card at the device's pixel
// density. requiredWidth/requiredHeight are in device pixels (logical
// size * PixelRatio), computed by the caller since this module has no
// RN runtime access. When either image's dimensions are unknown, we
// cannot verify resolution — the documented fallback is to keep
// preferring the thumbnail (smaller payload, same as before this
// check existed), since most announcement images are only moderately
// larger than the card and a wrongly-small thumbnail is a visual softness
// issue rather than a loading failure.
export const getAnnouncementHomeImageSource = (item, requiredWidth = 0, requiredHeight = 0) => {
  const thumbnailUrl = item?.thumbnailUrl || null;
  const imageUrl = item?.imageUrl || null;
  const thumbnailWidth = Number(item?.thumbnailWidth) || null;
  const thumbnailHeight = Number(item?.thumbnailHeight) || null;

  if (!thumbnailUrl) return { uri: imageUrl, fallbackUri: null };
  if (thumbnailUrl === imageUrl) return { uri: thumbnailUrl, fallbackUri: null };

  const canVerifyThumbnail = requiredWidth > 0 && requiredHeight > 0
    && thumbnailWidth > 0 && thumbnailHeight > 0;
  const thumbnailTooSmall = canVerifyThumbnail
    && (thumbnailWidth < requiredWidth || thumbnailHeight < requiredHeight);

  if (thumbnailTooSmall) {
    return { uri: imageUrl, fallbackUri: thumbnailUrl };
  }
  return { uri: thumbnailUrl, fallbackUri: imageUrl || null };
};

export const getAnnouncementLoopItems = (items) => {
  if (!Array.isArray(items) || items.length <= 1) return Array.isArray(items) ? items : [];
  return [items[items.length - 1], ...items, items[0]];
};

export const getAnnouncementCardWidth = (viewportWidth, count) => Math.max(
  180,
  count > 1
    ? viewportWidth - CARD_INSET - CARD_GAP - NEXT_CARD_PEEK
    : viewportWidth - CARD_INSET * 2,
);

// ScrollView pads both ends with CARD_INSET, so the true max scrollable
// offset is contentWidth - viewportWidth, not (loopedCount-1) * snapUnit —
// snapToInterval has no notion of the container's edge padding.
export const getAnnouncementMaxScrollOffset = (contentWidth, viewportWidth) => (
  Math.max(0, contentWidth - viewportWidth)
);

export const getAnnouncementLoopContentWidth = (cardWidth, loopedCount) => (
  loopedCount > 0 ? loopedCount * cardWidth + (loopedCount - 1) * CARD_GAP + CARD_INSET * 2 : 0
);

// Clamp a desired snap-grid offset (index * snapUnit) to what the
// ScrollView can actually reach so teleports/autoplay never request an
// offset native clamps on its own — which would silently cancel our
// onScrollAnimationEnd/finishScroll handshake.
export const clampAnnouncementScrollOffset = (offset, contentWidth, viewportWidth) => (
  Math.min(Math.max(0, offset), getAnnouncementMaxScrollOffset(contentWidth, viewportWidth))
);

// Card height scales with card width but is clamped into a fixed band. A
// single aspect ratio cannot hold the band on its own: card width spans
// 308–378 across phone viewports 360–430, a wider spread than the band
// allows, so the ratio sets the shape and the clamp enforces the band.
//
// Home uses cover to fill a stable frame; the fullscreen viewer shows the
// complete image when the card's crop hides part of the artwork.
//
// Every card in a viewport must share one height for the carousel's
// scroll/snap geometry, so fontScale raises the height for all cards, not
// just the text fallback that needs the extra room.
const CARD_ASPECT_RATIO = 1.81;
const CARD_MIN_HEIGHT = 176;
const CARD_MAX_HEIGHT = 200;
const CARD_FONT_SCALE_GROWTH = 20;

export const getAnnouncementCardHeight = (cardWidth, fontScale = 1) => {
  const aspectHeight = cardWidth / CARD_ASPECT_RATIO;
  const banded = Math.min(Math.max(aspectHeight, CARD_MIN_HEIGHT), CARD_MAX_HEIGHT);
  return Math.ceil(banded + CARD_FONT_SCALE_GROWTH * Math.max(0, fontScale - 1));
};

// Home cards are image-first: an announcement with an image shows only the
// image; one without falls back to a text card. This is
// the single source of truth for that branch so the carousel and any future
// consumer (e.g. a list view) agree on what counts as "has an image".
export const hasAnnouncementImage = (item) => Boolean(item?.imageUrl || item?.thumbnailUrl);

export const getAnnouncementImageFailureKey = (item) => [
  getStableIdentity(item),
  item?.imageUrl ?? "",
  item?.thumbnailUrl ?? "",
  item?.imageCacheKey ?? "",
].join("|");

// Fits an image of (imageWidth x imageHeight) inside a box of
// (boxWidth x boxHeight) via "contain": full image, centered, letterboxed
// on whichever axis has slack. Falls back to filling the box (no visible
// letterbox) when the real aspect ratio isn't known yet, since that's a
// less jarring default than collapsing to 0 while onImageSize is pending.
export const getContainedImageLayout = (imageWidth, imageHeight, boxWidth, boxHeight) => {
  if (!(imageWidth > 0) || !(imageHeight > 0) || !(boxWidth > 0) || !(boxHeight > 0)) {
    return { width: boxWidth, height: boxHeight };
  }
  const imageAspect = imageWidth / imageHeight;
  const boxAspect = boxWidth / boxHeight;
  if (imageAspect > boxAspect) {
    return { width: boxWidth, height: Math.round(boxWidth / imageAspect) };
  }
  return { width: Math.round(boxHeight * imageAspect), height: boxHeight };
};

export const getAnnouncementSnapIndex = (offset, snapUnit) => (
  snapUnit > 0 ? Math.max(0, Math.round(offset / snapUnit)) : 0
);

export const getAnnouncementLoopIndex = (index, count) => {
  if (count <= 1) return 0;
  if (index <= 0) return count;
  if (index >= count + 1) return 1;
  return index;
};

export const getAnnouncementRealIndex = (index, count) => {
  if (count <= 1) return 0;
  return ((index - 1) % count + count) % count;
};

export const getAnnouncementSummary = (item) => {
  const title = String(item?.title ?? "").trim().toLocaleLowerCase();
  const candidates = [item?.sub, item?.body]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return candidates.find((value) => value.toLocaleLowerCase() !== title) ?? "";
};
