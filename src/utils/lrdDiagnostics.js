let requestSequence = 0;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const SENSITIVE_FIELD_PATTERN = /(token|authorization|password|secret|researcher[_-]?id|citizen|email|phone|mobile|name|title|abstract|keyword)/i;

const asText = (value) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};

export const createLrdRequestId = () => {
  requestSequence += 1;
  return `lrd-${Date.now()}-${requestSequence}`;
};

const asSafeInteger = (value) => {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

export const summarizeLrdParams = (params = {}) => ({
  scope: typeof params.scope === "string" && params.scope.trim() ? params.scope.trim() : "unknown",
  page: asSafeInteger(params.page),
  perPage: asSafeInteger(params.per_page),
  hasQuery: typeof params.q === "string" ? params.q.trim().length > 0 : Boolean(params.q),
});

export const summarizeLrdOwnership = (rows = [], researcherId) => {
  if (researcherId === null || researcherId === undefined) return null;
  return rows.reduce((summary, row) => {
    const ownerId = row?.researcher_id;
    if (ownerId === null || ownerId === undefined || ownerId === "") {
      summary.unknownOwner += 1;
    } else if (String(ownerId) === String(researcherId)) {
      summary.ownedByAccount += 1;
    } else {
      summary.ownedByOthers += 1;
    }
    return summary;
  }, { ownedByAccount: 0, ownedByOthers: 0, unknownOwner: 0 });
};

const redactSensitiveText = (value) => {
  const text = asText(value);
  if (!text) return null;
  return text
    .replace(/bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|access_token|authorization|password)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/gi, "[redacted-email]")
    .replace(/\b(?:researcher[_-]?id|citizen[_-]?id|phone|mobile)\s*[:=]\s*[^,;\s]+/gi, "[redacted-field]")
    .slice(0, 240);
};

const safeFieldName = (field) => {
  const name = asText(field);
  if (!name || SENSITIVE_FIELD_PATTERN.test(name)) return null;
  return name.slice(0, 80);
};

const collectSafeMessages = (errors) => Object.entries(errors)
  .flatMap(([field, value]) => {
    if (!safeFieldName(field)) return [];
    const values = Array.isArray(value) ? value : [value];
    return values.map(redactSensitiveText).filter(Boolean);
  })
  .slice(0, 5);

export const getSafeLrdErrorDetails = (error) => {
  const response = error?.response;
  const data = isRecord(response?.data) ? response.data : {};
  const validationErrors = isRecord(data.errors) ? data.errors : {};
  const fields = Object.keys(validationErrors).map(safeFieldName).filter(Boolean).slice(0, 10);
  const messages = collectSafeMessages(validationErrors);
  const messageSource = response?.status === 422
    ? messages[0] || "Validation failed"
    : messages[0] || data.message || error?.message;
  const message = redactSensitiveText(messageSource) || "Request failed";

  return {
    status: response?.status ?? error?.code ?? "NETWORK_ERROR",
    fields,
    messages,
    message,
  };
};

export const getLrdCacheAgeMs = (updatedAt, now = Date.now()) => {
  if (!Number.isFinite(updatedAt)) return null;
  return Math.max(0, now - updatedAt);
};
