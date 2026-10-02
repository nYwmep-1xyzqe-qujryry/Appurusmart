import { serviceColors } from "../config/serviceColors";
import { isExternalWebUrl } from "./url";

export const INTERNAL_SERVICE_ROUTES = Object.freeze({
  expert: "Research",
  e_research: "EResearch",
});
const NATIVE_SERVICE_KEYS = new Set(Object.keys(INTERNAL_SERVICE_ROUTES));

const FALLBACK_COLORS = { iconColor: "#07865F", backgroundColor: "#E8F4EF" };
const ICON_NAMES = new Set([
  "document-text-outline", "journal-outline", "book-outline", "videocam-outline",
  "people-outline", "document-outline", "school-outline", "bar-chart-outline",
  "calendar-number-outline", "map-outline", "reader-outline", "star-outline", "car-outline",
]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const text = (value) => {
  const result = typeof value === "string" ? value.trim() : "";
  return result || null;
};

const color = (value, fallback) => {
  const result = text(value);
  return result && HEX_COLOR.test(result) ? result : fallback;
};

const integer = (value, fallback) => {
  const result = Number(value);
  return Number.isInteger(result) ? result : fallback;
};

const extractRows = (payload, strict = false) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.services)) return payload.services;
  if (strict) throw new Error("Invalid services response");
  return [];
};

const actionType = (value) => {
  const normalized = text(value)?.toLowerCase();
  if (["internal_route", "internal", "route"].includes(normalized)) return "internal_route";
  if (["external_url", "external", "url"].includes(normalized)) return "external_url";
  return "unsupported";
};

const servicePalette = (serviceKey) => {
  const paletteKey = serviceKey === "e_research" ? "research"
    : serviceKey === "e_doc" ? "document"
      : serviceKey === "e_meeting" ? "meeting" : serviceKey;
  return serviceColors[paletteKey] ?? FALLBACK_COLORS;
};

export const normalizeService = (raw = {}, index = 0, options = {}) => {
  const { strict = false } = options;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (strict) throw new Error("Invalid service item");
    return null;
  }

  const serviceKey = text(raw.service_key ?? raw.serviceKey ?? raw.key ?? raw.code);
  const id = raw.id ?? null;
  const nameTh = text(raw.name_th ?? raw.nameTh ?? raw.name);
  const nameEn = text(raw.name_en ?? raw.nameEn ?? raw.name);
  const rawActionType = raw.action_type ?? raw.actionType;
  const rawActive = raw.is_active ?? raw.isActive;
  const rawSortOrder = raw.sort_order ?? raw.sortOrder;

  if (strict && (!Number.isSafeInteger(id) || id <= 0 || !serviceKey || (!nameTh && !nameEn))) {
    throw new Error("Service requires id, service_key, and at least one name");
  }
  if (strict && (rawActionType === undefined || actionType(rawActionType) === "unsupported")) {
    throw new Error("Unsupported service action_type");
  }
  if (strict && typeof rawActive !== "boolean") {
    throw new Error("Service is_active must be boolean");
  }
  if (strict && !Number.isSafeInteger(rawSortOrder)) {
    throw new Error("Service sort_order must be an integer");
  }

  const palette = servicePalette(serviceKey);
  const iconName = text(raw.icon_name ?? raw.iconName);
  const iconUrl = text(raw.icon_url ?? raw.iconUrl);
  const url = text(raw.url);
  const normalizedAction = actionType(rawActionType);
  const routeKey = text(raw.route_key ?? raw.routeKey);
  const nativeRouteRequired = NATIVE_SERVICE_KEYS.has(serviceKey);
  const nativeRouteValid = !nativeRouteRequired
    || (normalizedAction === "internal_route" && routeKey === serviceKey);

  if (strict && normalizedAction === "internal_route" && !routeKey) {
    throw new Error("Internal service requires route_key");
  }
  if (strict && normalizedAction === "external_url" && !isExternalWebUrl(url)) {
    throw new Error("External service requires a valid URL");
  }

  return {
    id: id ?? serviceKey ?? `service-${index}`,
    serviceKey: serviceKey ?? `service-${index}`,
    nameTh: nameTh ?? nameEn ?? serviceKey ?? "บริการ",
    nameEn: nameEn ?? nameTh ?? serviceKey ?? "Service",
    actionType: normalizedAction,
    routeKey,
    nativeRouteRequired,
    nativeRouteValid,
    url,
    iconName: iconName && ICON_NAMES.has(iconName) ? iconName : "grid-outline",
    iconUrl: iconUrl && /^https:\/\//i.test(iconUrl) && isExternalWebUrl(iconUrl)
      ? iconUrl : null,
    iconColor: color(raw.icon_color ?? raw.iconColor, palette.iconColor),
    backgroundColor: color(raw.background_color ?? raw.backgroundColor, palette.backgroundColor),
    isActive: rawActive === undefined ? true : rawActive === true,
    sortOrder: integer(rawSortOrder, index),
    updatedAt: text(raw.updated_at ?? raw.updatedAt),
  };
};

export const normalizeServices = (payload, options = {}) => {
  const { strict = false } = options;
  const seenIds = new Set();
  const seenKeys = new Set();
  const unique = [];
  const normalized = extractRows(payload, strict)
    .map((item, index) => normalizeService(item, index, options))
    .filter(Boolean);

  for (const service of normalized) {
    const idKey = String(service.id);
    if (seenIds.has(idKey) || seenKeys.has(service.serviceKey)) {
      if (strict) throw new Error("Duplicate service id or service_key");
      continue;
    }
    seenIds.add(idKey);
    seenKeys.add(service.serviceKey);
    unique.push(service);
  }

  // Backend owns sort_order. Mobile preserves the API array order exactly.
  return unique
    .filter((service) => service.isActive)
    .filter((service) => (
      service.nativeRouteRequired
      || service.actionType !== "internal_route"
      || getServiceRoute(service)
    ));
};

export const getServiceLabel = (service, language = "th") => (
  language?.toLowerCase().startsWith("en")
    ? service.nameEn || service.nameTh || service.serviceKey
    : service.nameTh || service.nameEn || service.serviceKey
);

export const getServiceRoute = (service) => (
  service.actionType === "internal_route"
    && service.serviceKey === service.routeKey
    && Object.prototype.hasOwnProperty.call(INTERNAL_SERVICE_ROUTES, service.routeKey)
    ? INTERNAL_SERVICE_ROUTES[service.routeKey] : null
);

export const isNativeServiceMisconfigured = (service) => (
  service?.nativeRouteRequired === true && service.nativeRouteValid !== true
);

export const isServiceUrlValid = (service) => (
  service.actionType === "external_url" && isExternalWebUrl(service.url)
);

export const getServiceError = (error, fallback = "ไม่สามารถโหลดบริการได้") => {
  const status = error?.response?.status;
  const responseBody = error?.response?.data;
  const responseCode = typeof responseBody?.code === "string" ? responseBody.code : null;
  const responseMessage = responseBody?.message;
  const message = typeof responseMessage === "string"
    ? responseMessage
    : typeof error?.message === "string" ? error.message : fallback;
  const kind = status === 401 ? "auth"
    : status === 403 ? "forbidden"
      : status === 503 && responseCode === "SERVICE_SETUP_REQUIRED" ? "setup"
      : status >= 500 ? "server" : "network";
  return { status, code: responseCode, kind, message };
};

export const getServiceErrorMessage = (error, fallback = "ไม่สามารถโหลดบริการได้") => (
  getServiceError(error, fallback).message
);

export const isSupportedIconName = (name) => ICON_NAMES.has(name);
