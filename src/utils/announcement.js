import { fixPhotoUrl } from "./image";

const firstValue = (...values) => values.find((value) => {
  if (typeof value === "string") return value.trim() !== "";
  return value !== undefined && value !== null;
});

const readUrl = (value) => {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return String(firstValue(
    value.url,
    value.uri,
    value.src,
    value.path,
    value.image_url,
    value.imageUrl,
    value.file_url,
    value.fileUrl,
    value.image_path,
    value.imagePath,
    "",
  ) ?? "").trim();
};

export const stripAnnouncementMarkup = (value) => String(value ?? "")
  .replace(/<\s*br\s*\/?>/gi, " ")
  .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/\s+/g, " ")
  .trim();

const readText = (...values) => {
  const value = firstValue(...values);
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return stripAnnouncementMarkup(value);
  if (typeof value !== "object") return "";
  return stripAnnouncementMarkup(firstValue(value.text, value.value, value.html, value.content, "") ?? "");
};

const readRows = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.announcements)) return value.announcements;
  return [];
};

export const getAnnouncementRows = readRows;

export const getAnnouncementRecord = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  if (Array.isArray(value?.data)) return value.data[0] ?? null;
  if (value?.announcement && typeof value.announcement === "object") {
    return getAnnouncementRecord(value.announcement);
  }
  if (value?.item && typeof value.item === "object") {
    return getAnnouncementRecord(value.item);
  }
  if (value?.data && typeof value.data === "object") {
    return getAnnouncementRecord(value.data);
  }
  return typeof value === "object" ? value : null;
};

export const normalizeAnnouncement = (item, fallbackTitle = "") => {
  const source = item && typeof item === "object" ? item : {};
  const imageSource = firstValue(
    source.image_url,
    source.imageUrl,
    source.cover_image_url,
    source.banner_url,
    source.image,
    source.media?.image_url,
    source.media?.imageUrl,
    source.media?.file_url,
    source.media?.path,
    source.media?.url,
  );
  const thumbnailSource = firstValue(
    source.thumbnail_url,
    source.thumbnailUrl,
    source.thumbnail,
    source.image_thumbnail_url,
    source.thumbnail_path,
    source.thumbnailPath,
    source.media?.thumbnail_url,
    source.media?.thumbnailUrl,
  );
  const imageUrl = fixPhotoUrl(readUrl(imageSource)) || null;
  // Keep the API distinction intact. Home/list presentation chooses the
  // original as a fallback when a legacy record has no thumbnail; detail and
  // fullscreen must continue to prefer the original image explicitly.
  const thumbnailUrl = fixPhotoUrl(readUrl(thumbnailSource)) || null;
  const imageWidth = Number(source.image_width ?? source.imageWidth ?? source.image?.width);
  const imageHeight = Number(source.image_height ?? source.imageHeight ?? source.image?.height);
  const thumbnailWidth = Number(
    source.thumbnail_width ?? source.thumbnailWidth ?? source.media?.thumbnail_width,
  );
  const thumbnailHeight = Number(
    source.thumbnail_height ?? source.thumbnailHeight ?? source.media?.thumbnail_height,
  );
  // Falling back to imageUrl here would be a no-op: when the backend
  // serves "updated" images at the same URL with an immutable
  // Cache-Control, the URL IS the stale cache key, so using it as the
  // fallback cache key cannot detect a change. React's `key` prop and
  // the <Image> uri-based cache both key off this value — without a
  // real version/updated_at from the backend there is no way for the
  // client to know the image changed. null here is intentional: it
  // tells callers "no reliable version signal", rather than pretending
  // imageUrl was one. The real fix is backend-side (see docs/announcements
  // image cache contract): either the URL itself must change when the
  // image changes, or the backend must send image_version/updated_at.
  const imageCacheKey = firstValue(
    source.image_version,
    source.imageVersion,
    source.image_updated_at,
    source.imageUpdatedAt,
    source.updated_at,
    source.updatedAt,
  ) ?? null;

  return {
    ...source,
    id: source.id ?? source.announcement_id,
    title: readText(
      source.title,
      source.name,
      source.topic,
      source.headline,
      fallbackTitle,
    ),
    body: readText(
      source.body,
      source.message,
      source.content,
      source.detail,
      source.description,
      source.sub,
      "",
    ),
    sub: readText(source.sub),
    imageUrl,
    thumbnailUrl,
    imageAlt: readText(
      source.image_alt,
      source.imageAlt,
      source.image?.alt,
      source.image?.alt_text,
      source.title,
      fallbackTitle,
      "ภาพข่าวสาร",
    ),
    imageCacheKey: imageCacheKey == null ? null : String(imageCacheKey),
    imageWidth: Number.isFinite(imageWidth) && imageWidth > 0 ? imageWidth : null,
    imageHeight: Number.isFinite(imageHeight) && imageHeight > 0 ? imageHeight : null,
    thumbnailWidth: Number.isFinite(thumbnailWidth) && thumbnailWidth > 0 ? thumbnailWidth : null,
    thumbnailHeight: Number.isFinite(thumbnailHeight) && thumbnailHeight > 0 ? thumbnailHeight : null,
  };
};

export const normalizeAnnouncements = (value, fallbackTitle = "") =>
  getAnnouncementRows(value).map((item) => normalizeAnnouncement(item, fallbackTitle));

const DETAIL_PREVIEW_HEIGHT_RATIO = 0.3;
const DETAIL_PREVIEW_SIDE_INSET = 12;
const DETAIL_PREVIEW_MIN_HEIGHT = 160;

// The detail preview is sized as a fraction of the height the user can
// actually see — window height minus the safe-area insets and the header
// — rather than of the raw window height, which would read as a smaller
// share of the screen on devices with a tall notch or home indicator.
// This is only a ceiling: the caller shrinks the frame to the height the
// image's own aspect ratio needs, so wide banners never reach it and the
// ratio only limits square and portrait images. The preview uses contain,
// and the fullscreen viewer keeps the same uncropped source.
export const getAnnouncementDetailPreviewSize = ({
  windowWidth,
  windowHeight,
  topInset = 0,
  bottomInset = 0,
  headerHeight = 0,
}) => {
  const usableHeight = Math.max(
    0,
    windowHeight - topInset - bottomInset - headerHeight,
  );
  return {
    width: Math.max(0, windowWidth - DETAIL_PREVIEW_SIDE_INSET * 2),
    height: Math.max(
      DETAIL_PREVIEW_MIN_HEIGHT,
      Math.round(usableHeight * DETAIL_PREVIEW_HEIGHT_RATIO),
    ),
  };
};
