const TITLE_LOWER_WORDS = new Set(["dan", "di", "ke", "dari", "untuk", "yang", "atau", "dengan", "pada", "dalam"]);
const KNOWN_UPPERCASE_TERMS = new Map(
  [
    "pt",
    "cv",
    "ud",
    "tbk",
    "persero",
    "umkm",
    "bpom",
    "nib",
    "siup",
    "npwp",
    "iso",
    "sop",
    "haccp",
    "b2b",
    "b2c",
    "f&b",
    "fnb",
    "kfc",
    "spbu",
    "atm",
    "pos",
    "wa",
  ].map((term) => [term, term.toUpperCase()]),
);

export function formatRupiah(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "Tanya Admin";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} Miliar`;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)} Juta`;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);
}

export function getThumb(url: string | null | undefined) {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  if (!normalized.includes("cloudinary.com")) return normalized;
  return normalized.replace("/upload/", "/upload/w_400,h_200,c_fill,q_auto,f_auto/");
}

export function paragraphs(text: string) {
  return normalizeText(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

export function truncate(text: string, maxLength: number) {
  const normalized = normalizeText(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

export function slugify(text: string) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export function normalizeText(value: unknown) {
  return (value ?? "").toString().replace(/\s+/g, " ").trim();
}

export function normalizeBrandName(value: unknown) {
  return normalizeTitleLikeName(value);
}

export function normalizeCompanyName(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  return text
    .replace(/\b(PT|CV|UD)\.?\s+([^,.;]+)/gi, (_match, prefix: string, name: string) => `${prefix.toUpperCase()} ${titleCasePhrase(name)}`)
    .replace(/\b(TBK|PERSERO)\b/gi, (match) => match.toUpperCase());
}

export function normalizeDescriptionText(value: unknown, brandName?: string) {
  const text = normalizeText(value);
  if (!text) return "";
  if (!looksMostlyUppercase(text)) return ensureFinalPunctuation(fixCommonIndonesianCompounds(normalizeCompanyNameInText(text)));

  let normalized = fixCommonIndonesianCompounds(text.toLowerCase());
  normalized = normalized.replace(/\b(pt|cv|ud)\.?\s+([a-z0-9&.' -]+?)(?=\s+(?:yang|bergerak|merupakan|adalah|dengan|dan|di|ke|untuk|,|\.|;|$))/g, (_match, prefix: string, name: string) => {
    return `${prefix.toUpperCase()} ${titleCasePhrase(name)}`;
  });
  normalized = normalized.replace(/\b(franchisee\.id|franchisor\.id|franchise\.id)\b/gi, (match) => match.toLowerCase());
  normalized = restoreKnownUppercaseTerms(normalized);
  normalized = sentenceCase(normalized);

  const displayBrand = normalizeBrandName(brandName);
  if (displayBrand) {
    normalized = replaceCaseInsensitivePhrase(normalized, normalizeText(brandName).toLowerCase(), displayBrand);
  }

  return ensureFinalPunctuation(normalized);
}

export function normalizeUrl(value: unknown) {
  return normalizeText(value);
}

export function normalizeExternalUrl(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^\/\//.test(text)) return `https:${text}`;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(text)) return `https://${text}`;
  return "";
}

export function escapeHtml(value: unknown) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(value: unknown) {
  return escapeHtml(value);
}

export function normalizeGeneratedHtml(html: string) {
  return sanitizeLegacyWordPressRuntime(html)
    .replace(/^[\t ]+/gm, (indent) => {
      let normalized = indent;
      while (normalized.includes(" \t")) normalized = normalized.replace(/ \t/g, "\t");
      return normalized;
    })
    .replace(/[ \t]+$/gm, "");
}

export function sanitizeLegacyWordPressRuntime(html: string) {
  return html
    .replace(/<script\b[^>]*>\s*window\._wpemojiSettings[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=(["'])[^"']*wp-emoji-release\.min\.js[^"']*\1[^>]*>\s*<\/script>/gi, "")
    .replace(/<script\b[^>]*\bid=(["'])latepoint-main-front-js-extra\1[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=(["'])[^"']*latepoint\/public\/javascripts\/(?:vendor-front|front)\.js[^"']*\1[^>]*>\s*<\/script>/gi, "")
    .replace(/<script\b[^>]*\bid=(["'])analyticswp-js-extra\1[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=(["'])[^"']*analyticswp\.min\.js[^"']*\1[^>]*>\s*<\/script>/gi, "")
    .replace(/\\?\/wp-admin\\?\/admin-ajax\.php/g, "");
}

export function applyCanonicalLegacyLinks(html: string) {
  return html
    .replace(/\bhref=(["'])\/direktori-franchise\/?\1/g, "href=$1/peluang-usaha$1")
    .replace(/\bhref=(["'])\/rekomendasi\/?\1/g, "href=$1/peluang-usaha?sort=rekomendasi$1")
    .replace(/\bhref=(["'])\/populer\/?\1/g, "href=$1/peluang-usaha?sort=populer$1")
    .replace(/\bhref=(["'])\/abjad\/?\1/g, "href=$1/peluang-usaha?sort=abjad$1")
    .replace(/\bhref=(["'])\/kategori\/?\1/g, "href=$1/peluang-usaha/kategori/$1")
    .replace(/\bhref=(["'])\/category\/?\1/g, "href=$1/peluang-usaha/kategori/$1")
    .replace(/\bhref=(["'])\/kategori\/([^"'#?]+)\/?\1/g, (_match, quote: string, slug: string) => `href=${quote}${canonicalCategoryPath(slug)}${quote}`)
    .replace(/\bhref=(["'])\/category\/([^"'#?]+)\/?\1/g, (_match, quote: string, slug: string) => `href=${quote}${canonicalCategoryPath(slug)}${quote}`)
    .replace(
      /\bhref=(["'])\/(anak-balita|bisnis-jasa|fnb|furnitur-konstruksi-properti|hiburan-hobi|jasa-layanan|kesehatan-kecantikan|komputer-teknologi|lainnya|laundry-jasa-kebersihan|makanan-minuman|makanan-minuman-fb|otomotif|pendidikan-kursus-pelatihan|penginapan-agen-travel|perhotelan-travel|properti-furniture|retail-minimarket|teknologi-digital)\/?\1/g,
      (_match, quote: string, slug: string) => `href=${quote}${canonicalCategoryPath(slug)}${quote}`,
    )
    .replace(/\bhref=(["'])\/peluang-usaha\/?\?kategori=([^"'&#]+)(?:&amp;|&)?([^"']*)\1/g, (_match, quote: string, slug: string, rest: string) => {
      const suffix = rest ? `?${rest.replace(/^amp;/, "")}` : "";
      return `href=${quote}${canonicalCategoryPath(slug)}${suffix}${quote}`;
    });
}

function normalizeTitleLikeName(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  if (!looksMostlyUppercase(text)) return normalizeCompanyNameInText(text);
  return text
    .toLowerCase()
    .split(/(\s+|[-/])/)
    .map((part, index, parts) => {
      if (/^\s+$|^[-/]$/.test(part)) return part;
      const previous = parts[index - 1] || "";
      const lower = part.toLowerCase();
      if (index > 0 && previous !== "-" && TITLE_LOWER_WORDS.has(lower)) return lower;
      return formatTitleWord(part);
    })
    .join("")
    .replace(/\b(PT|CV|UD)\.?\s+/gi, (match) => match.toUpperCase().replace(".", ""));
}

function titleCasePhrase(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .split(/(\s+|[-/])/)
    .map((part, index, parts) => {
      if (/^\s+$|^[-/]$/.test(part)) return part;
      const previous = parts[index - 1] || "";
      const lower = part.toLowerCase();
      if (index > 0 && previous !== "-" && TITLE_LOWER_WORDS.has(lower)) return lower;
      return formatTitleWord(part);
    })
    .join("");
}

function looksMostlyUppercase(text: string) {
  const letters = text.match(/[A-Za-zÀ-ÿ]/g) || [];
  if (letters.length < 6) return false;
  const uppercase = letters.filter((letter) => letter === letter.toUpperCase() && letter !== letter.toLowerCase()).length;
  const lowercase = letters.filter((letter) => letter === letter.toLowerCase() && letter !== letter.toUpperCase()).length;
  return uppercase / letters.length >= 0.72 && lowercase / letters.length <= 0.12;
}

function fixCommonIndonesianCompounds(text: string) {
  return text
    .replace(/\bdibidang\b/gi, "di bidang")
    .replace(/\bdi bidang\s+retail\b/gi, "di bidang retail")
    .replace(/\bkerjasama\b/gi, "kerja sama")
    .replace(/\bfranchisee\.id\b/gi, "Franchisor.id")
    .replace(/\bfranchise\.id\b/gi, "Franchisor.id");
}

function normalizeCompanyNameInText(text: string): string {
  return text
    .replace(/\b(PT|CV|UD)\.?\s+([^,.;]+)/gi, (_match, prefix: string, name: string) => `${prefix.toUpperCase()} ${titleCasePhrase(name)}`)
    .replace(/\b(TBK|PERSERO)\b/gi, (match) => match.toUpperCase());
}

function restoreKnownUppercaseTerms(text: string) {
  return text.replace(/\b[a-z0-9&.+-]+\b/gi, (word) => {
    const key = word.toLowerCase();
    return KNOWN_UPPERCASE_TERMS.get(key) || word;
  });
}

function sentenceCase(text: string) {
  let shouldCapitalize = true;
  let result = "";

  for (const char of text) {
    if (/[A-Za-zÀ-ÿ]/.test(char)) {
      result += shouldCapitalize ? char.toUpperCase() : char;
      shouldCapitalize = false;
      continue;
    }
    result += char;
    if (/[.!?]\s*$/.test(char)) shouldCapitalize = true;
  }

  return result.replace(/\bi\b/g, "I");
}

function formatTitleWord(word: string) {
  const key = word.toLowerCase();
  if (KNOWN_UPPERCASE_TERMS.has(key)) return KNOWN_UPPERCASE_TERMS.get(key) || word.toUpperCase();
  if (/^\d/.test(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function replaceCaseInsensitivePhrase(text: string, needle: string, replacement: string) {
  if (!needle || !replacement || needle.length < 2) return text;
  return text.replace(new RegExp(escapeRegExp(needle), "gi"), replacement);
}

function ensureFinalPunctuation(text: string) {
  if (!text) return "";
  return /[.!?)]$/.test(text) ? text : `${text}.`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
import { canonicalCategoryPath } from "../shared/franchise-category-route.mjs";
