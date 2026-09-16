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
    "",
  ) ?? "").trim();
};

const readText = (...values) => {
  const value = firstValue(...values);
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value !== "object") return "";
  return String(firstValue(value.text, value.value, value.html, value.content, "") ?? "").trim();
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
    source.media?.url,
  );
  const thumbnailSource = firstValue(
    source.thumbnail_url,
    source.thumbnailUrl,
    source.thumbnail,
    source.image_thumbnail_url,
    source.media?.thumbnail_url,
  );
  const imageUrl = fixPhotoUrl(readUrl(imageSource)) || null;
  const thumbnailUrl = fixPhotoUrl(readUrl(thumbnailSource)) || imageUrl;
  const imageWidth = Number(source.image_width ?? source.imageWidth ?? source.image?.width);
  const imageHeight = Number(source.image_height ?? source.imageHeight ?? source.image?.height);
  const imageCacheKey = firstValue(
    source.image_version,
    source.imageVersion,
    source.image_updated_at,
    source.imageUpdatedAt,
    source.updated_at,
    source.updatedAt,
    imageUrl,
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
  };
};

export const normalizeAnnouncements = (value, fallbackTitle = "") =>
  getAnnouncementRows(value).map((item) => normalizeAnnouncement(item, fallbackTitle));
