import createDOMPurify from "dompurify";

const SAFE_TAGS = [
  "html", "head", "body", "meta", "title", "style",
  "div", "span", "p", "br", "hr", "blockquote", "caption",
  "strong", "b", "em", "i", "u", "small", "sup", "sub", "font",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "table", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "th", "td",
  "img", "a",
];

const SAFE_ATTRS = [
  "id", "class", "title", "style", "charset", "name", "content",
  "src", "alt", "width", "height", "loading", "color", "face", "size",
  "href", "target", "rel", "border", "cellpadding", "cellspacing",
  "colspan", "rowspan", "scope",
];

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export const isSafePdfResourceUrl = (value, { image = false } = {}) => {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("//")) return false;
  if (image && /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(raw)) return true;
  try {
    const parsed = new URL(raw, "https://uru-smart.invalid");
    if (parsed.origin === "https://uru-smart.invalid") return !raw.startsWith("data:");
    return SAFE_PROTOCOLS.has(parsed.protocol) && (!image || parsed.protocol !== "mailto:");
  } catch (_) {
    return false;
  }
};

const isSafeCssUrl = (value) => {
  const raw = String(value ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!raw || raw.startsWith("//")) return false;
  if (/^data:(?:image\/(?:png|gif|jpe?g|webp)|font\/[\w.+-]+|application\/(?:font-woff|font-woff2));base64,/i.test(raw)) return true;
  try {
    const parsed = new URL(raw, "https://uru-smart.invalid");
    return parsed.origin === "https://uru-smart.invalid"
      || parsed.protocol === "http:"
      || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
};

// DOMPurify handles the HTML and attribute grammar. This small CSS pass only
// validates URLs inside otherwise legitimate print CSS, so @font-face and
// background images remain usable without permitting executable schemes.
const sanitizeCss = (value) => String(value ?? "")
  .replace(/@import\b[^;]+;?/gi, "")
  .replace(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, url) => (
    isSafeCssUrl(url) ? match : "url(about:blank)"
  ))
  .replace(/expression\s*\(/gi, "invalid(")
  .replace(/behavior\s*:/gi, "invalid:")
  .replace(/-moz-binding\s*:/gi, "invalid:");

const createPdfPurifier = (document) => {
  const purifier = createDOMPurify(document.defaultView || globalThis.window);
  if (typeof purifier.addHook !== "function") {
    throw new Error("A browser DOM window is required for PDF sanitization");
  }
  purifier.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = String(data.attrName || "").toLowerCase();
    if (name === "src" || name === "href") {
      data.keepAttr = isSafePdfResourceUrl(data.attrValue, { image: name === "src" });
    } else if (name === "style") {
      data.attrValue = sanitizeCss(data.attrValue);
    }
  });
  purifier.addHook("uponSanitizeElement", (node) => {
    if (String(node.tagName || "").toLowerCase() === "style") {
      node.textContent = sanitizeCss(node.textContent);
    }
  });
  return purifier;
};

// Browser-only PDF export uses the maintained DOMPurify parser. Native PDF
// generation never calls this function.
export const sanitizeProfilePdfHtml = (html, Parser = globalThis.DOMParser) => {
  if (typeof Parser !== "function") throw new Error("DOMParser is required for web PDF export");
  const document = new Parser().parseFromString(String(html ?? ""), "text/html");
  return createPdfPurifier(document).sanitize(String(html ?? ""), {
    WHOLE_DOCUMENT: true,
    ALLOWED_TAGS: SAFE_TAGS,
    ALLOWED_ATTR: SAFE_ATTRS,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  });
};

export const profilePdfAllowedTags = () => SAFE_TAGS.map((tag) => tag.toUpperCase());
