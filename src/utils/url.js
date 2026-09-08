const hasHttpProtocol = (value) => /^https?:\/\//i.test(value);
export const isExternalWebUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};
const isIPv4 = (hostname) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

const hasValidHostname = (hostname) => {
  if (!hostname) return false;
  if (hostname === "localhost") return true;
  if (isIPv4(hostname)) return true;
  return hostname.includes(".") && !hostname.startsWith(".") && !hostname.endsWith(".");
};

export const normalizeOptionalUrl = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, url: null };
  if (/\s/.test(raw)) return { ok: false, url: null };

  const candidate = hasHttpProtocol(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    if (!isHttp || !hasValidHostname(parsed.hostname)) {
      return { ok: false, url: null };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, url: null };
  }
};
