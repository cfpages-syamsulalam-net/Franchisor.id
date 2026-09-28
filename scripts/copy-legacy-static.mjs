#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT_DIR, "dist");
const CLERK_JS_SOURCE_DIR = join(ROOT_DIR, "node_modules", "@clerk", "clerk-js", "dist");
const CLERK_JS_TARGET_DIR = join(DIST_DIR, "clerk");
const SUPPRESSION_PATH = join(ROOT_DIR, "json", "brand-suppression.json");
// Resolved once at startup, so a missing removal set stops the build before anything is written rather than
// halfway through the copy.
const suppressedSlugs = loadSuppression();
let brandPagesSuppressed = 0;

const SKIP_TOP_LEVEL = new Set([
  ".agents",
  ".astro",
  ".context",
  ".git",
  ".github",
  ".grok",
  "abjad",
  "anak-balita",
  "bisnis-jasa",
  "category",
  "direktori-franchise",
  "fnb",
  "furnitur-konstruksi-properti",
  "hiburan-hobi",
  "jasa-layanan",
  "kategori",
  "kesehatan-kecantikan",
  "komputer-teknologi",
  "lainnya",
  "laundry-jasa-kebersihan",
  "makanan-minuman",
  "makanan-minuman-fb",
  "otomotif",
  "pendidikan-kursus-pelatihan",
  "penginapan-agen-travel",
  "perhotelan-travel",
  "populer",
  "properti-furniture",
  "csv",
  "dist",
  "docs",
  "functions",
  "migrations",
  "node_modules",
  "peluang-usaha",
  "progress",
  "public",
  "rekomendasi",
  "retail-minimarket",
  "scripts",
  "src",
  "templates",
  "teknologi-digital",
]);

const CANONICAL_ROUTE_MAP = new Map([
  ["/direktori-franchise", "/peluang-usaha"],
  ["/rekomendasi", "/peluang-usaha?sort=rekomendasi"],
  ["/populer", "/peluang-usaha?sort=populer"],
  ["/abjad", "/peluang-usaha?sort=abjad"],
  ["/kategori", "/peluang-usaha/kategori/"],
  ["/category", "/peluang-usaha/kategori/"],
  ["/anak-balita", "/peluang-usaha/kategori/anak-balita"],
  ["/bisnis-jasa", "/peluang-usaha/kategori/bisnis-jasa"],
  ["/fnb", "/peluang-usaha/kategori/makanan-minuman"],
  ["/furnitur-konstruksi-properti", "/peluang-usaha/kategori/furnitur-konstruksi-properti"],
  ["/hiburan-hobi", "/peluang-usaha/kategori/hiburan-hobi"],
  ["/jasa-layanan", "/peluang-usaha/kategori/jasa-layanan"],
  ["/kesehatan-kecantikan", "/peluang-usaha/kategori/kesehatan-kecantikan"],
  ["/komputer-teknologi", "/peluang-usaha/kategori/komputer-teknologi"],
  ["/lainnya", "/peluang-usaha/kategori/lainnya"],
  ["/laundry-jasa-kebersihan", "/peluang-usaha/kategori/laundry-jasa-kebersihan"],
  ["/makanan-minuman", "/peluang-usaha/kategori/makanan-minuman"],
  ["/makanan-minuman-fb", "/peluang-usaha/kategori/makanan-minuman"],
  ["/otomotif", "/peluang-usaha/kategori/otomotif"],
  ["/pendidikan-kursus-pelatihan", "/peluang-usaha/kategori/pendidikan-kursus-pelatihan"],
  ["/penginapan-agen-travel", "/peluang-usaha/kategori/penginapan-agen-travel"],
  ["/perhotelan-travel", "/peluang-usaha/kategori/penginapan-agen-travel"],
  ["/properti-furniture", "/peluang-usaha/kategori/furnitur-konstruksi-properti"],
  ["/retail-minimarket", "/peluang-usaha/kategori/retail-minimarket"],
  ["/teknologi-digital", "/peluang-usaha/kategori/komputer-teknologi"],
]);

const ROOT_FILE_NAMES = new Set(["robots.txt", "sitemap.xml", "sitemap_index.xml", "sitemap-complete.xml", "main-sitemap.xsl"]);
const ROOT_FILE_EXTENSIONS = new Set([".html", ".xml", ".xsl"]);

const LEGAL_FOOTER_LINKS = `<div class="fr-legal-footer-links" style="background:#050505;border-top:4px solid #cf322e;margin:0;padding:18px 20px;text-align:center;color:#ffffff;font-size:14px;">
  <a href="/privacy-policy" style="color:#ffffff;text-decoration:none;font-weight:700;">Privacy Policy</a>
  <span aria-hidden="true" style="display:inline-block;margin:0 10px;color:#cf322e;">|</span>
  <a href="/terms-of-service" style="color:#ffffff;text-decoration:none;font-weight:700;">Terms of Service</a>
</div>`;

const stats = {
  directories: 0,
  filesCopied: 0,
  filesSkipped: 0,
};

if (!existsSync(DIST_DIR)) {
  throw new Error("dist does not exist. Run Astro build before copying legacy static files.");
}

for (const entry of readdirSync(ROOT_DIR, { withFileTypes: true })) {
  const name = entry.name;
  if (name.startsWith(".")) continue;

  const sourcePath = join(ROOT_DIR, name);
  const targetPath = join(DIST_DIR, name);

  if (entry.isDirectory()) {
    if (SKIP_TOP_LEVEL.has(name)) continue;
    copyDirectoryNoOverwrite(sourcePath, targetPath);
    continue;
  }

  if (entry.isFile() && shouldCopyRootFile(name)) {
    copyFileNoOverwrite(sourcePath, targetPath);
  }
}

if (existsSync(CLERK_JS_SOURCE_DIR)) {
  copyDirectoryOverwrite(CLERK_JS_SOURCE_DIR, CLERK_JS_TARGET_DIR);
}

console.log("Legacy static copy:");
console.log(`- directories_scanned=${stats.directories}`);
console.log(`- files_copied=${stats.filesCopied}`);
console.log(`- files_skipped=${stats.filesSkipped}`);
console.log(`- clerk_assets=${existsSync(CLERK_JS_TARGET_DIR) ? "copied" : "missing"}`);
console.log("- skipped_routes=peluang-usaha,category,kategori,rekomendasi,populer,abjad,direktori-franchise,category-aliases");
console.log(`- removed_brand_pages_suppressed=${brandPagesSuppressed}`);

/**
 * The removal set, written by `build-d1-franchise-pages.ts` earlier in the same build.
 *
 * Fails closed when the file is absent: `build:astro` runs the generator before this step, so in a real build it
 * is always there, and assuming "nothing is removed" would republish brand pages that were deliberately taken
 * down. When the file is present but the generator could not reach D1 (`source !== "d1"`) the set is not
 * authoritative — that is a local build without credentials, where the output is never published, so it warns
 * loudly rather than breaking the build. A production build always has the token.
 */
function loadSuppression() {
  if (!existsSync(SUPPRESSION_PATH)) {
    console.error(`Legacy static copy: ${SUPPRESSION_PATH} is missing.`);
    console.error("Run `pnpm run astro:sync` first: this step needs the generator's removal set and must not");
    console.error("guess, because guessing would republish legacy brand pages that were deliberately removed.");
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(SUPPRESSION_PATH, "utf8"));
  const slugs = new Set(Array.isArray(parsed?.slugs) ? parsed.slugs : []);
  if (parsed?.source !== "d1") {
    // A non-authoritative removal set stops the build rather than warning through it. The old behaviour warned
    // and continued with whatever slugs were present — but an empty or partial set reads as "nothing was
    // removed" and republishes pages that were deliberately taken down, which is the exact outcome the removal
    // set exists to prevent. A local build without credentials cannot know what is removed, so it must not
    // build as though it did.
    console.error(
      `Legacy static copy: removal set is not authoritative (source=${parsed?.source ?? "unknown"}). ` +
        `Refusing to copy legacy brand pages without a D1-derived set — run with credentials so the generator ` +
        `queries D1, or do not ship this build.`
    );
    process.exit(1);
  }
  return slugs;
}

/** True only for `usaha/<slug>/index.html` whose slug is in the removal set. */
function isSuppressedBrandPage(sourcePath, fileName) {
  if (fileName !== "index.html") return false;
  const brandDir = dirname(sourcePath);
  if (basename(dirname(brandDir)) !== "usaha") return false;
  return suppressedSlugs.has(basename(brandDir));
}

function shouldCopyRootFile(fileName) {
  if (ROOT_FILE_NAMES.has(fileName)) return true;
  return ROOT_FILE_EXTENSIONS.has(fileName.slice(fileName.lastIndexOf(".")).toLowerCase());
}

function copyDirectoryNoOverwrite(sourceDir, targetDir) {
  stats.directories += 1;

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryNoOverwrite(sourcePath, join(targetDir, entry.name));
      continue;
    }

    if (entry.isFile()) {
      // A legacy brand page must not fill a canonical URL the D1 generator just vacated. Archiving a brand omits
      // its generated page, but the retained `usaha/<slug>/index.html` would otherwise be copied into
      // `/usaha/<slug>` and the owner would be told the brand was gone while the URL stayed live.
      if (isSuppressedBrandPage(sourcePath, entry.name)) {
        brandPagesSuppressed += 1;
        continue;
      }
      copyFileNoOverwrite(sourcePath, legacyBrandTargetPath(targetDir, entry.name));
    }
  }
}

// Legacy brand pages are exported as usaha/<slug>/index.html. They are emitted flat as
// usaha/<slug>.html so the declared canonical /usaha/{slug} serves directly with no
// trailing-slash redirect: astro.config.mjs sets trailingSlash "never", the Astro-generated
// brand pages already land on the flat path, and the directory form made Cloudflare answer a
// 308 to /usaha/<slug>/ — a canonical that redirects. Every other file keeps its source layout.
function legacyBrandTargetPath(targetDir, fileName) {
  if (fileName !== "index.html") return join(targetDir, fileName);

  const brand = basename(targetDir);
  if (brand === "usaha") return join(targetDir, fileName);
  if (basename(dirname(targetDir)) !== "usaha") return join(targetDir, fileName);

  return join(dirname(targetDir), `${brand}.html`);
}

function copyFileNoOverwrite(sourcePath, targetPath) {
  if (existsSync(targetPath)) {
    stats.filesSkipped += 1;
    return;
  }

  const sourceStats = statSync(sourcePath);
  if (!sourceStats.isFile()) return;

  mkdirSync(dirname(targetPath), { recursive: true });
  if (sourcePath.toLowerCase().endsWith(".html")) {
    writeFileSync(targetPath, addLegacyLegalFooterLinks(sanitizeLegacyWordPressRuntime(rewriteLegacyHtmlLinks(readFileSync(sourcePath, "utf8")))));
  } else {
    copyFileSync(sourcePath, targetPath);
  }
  stats.filesCopied += 1;
}

function copyDirectoryOverwrite(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryOverwrite(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function rewriteLegacyHtmlLinks(html) {
  return html.replace(/\bhref=(["'])(\/[^"'#?]*)(\/)?(\?[^"']*)?(#[^"']*)?\1/g, (match, quote, path, slash, query = "", hash = "") => {
    const normalizedPath = normalizePath(path, slash);
    const mapped = mapCanonicalHref(normalizedPath);
    if (!mapped) return match;
    return `href=${quote}${mapped}${hash}${quote}`;
  });
}

function sanitizeLegacyWordPressRuntime(html) {
  return html
    .replace(/<script\b[^>]*>\s*window\._wpemojiSettings[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=(["'])[^"']*wp-emoji-release\.min\.js[^"']*\1[^>]*>\s*<\/script>/gi, "")
    .replace(/<script\b[^>]*\bid=(["'])latepoint-main-front-js-extra\1[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=(["'])[^"']*latepoint\/public\/javascripts\/(?:vendor-front|front)\.js[^"']*\1[^>]*>\s*<\/script>/gi, "")
    .replace(/<script\b[^>]*\bid=(["'])analyticswp-js-extra\1[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=(["'])[^"']*analyticswp\.min\.js[^"']*\1[^>]*>\s*<\/script>/gi, "")
    .replace(/<link\b[^>]*\bhref=(["'])[^"']*latepoint\/public\/stylesheets\/front\.css[^"']*\1[^>]*>/gi, "")
    .replace(/<script\b[^>]*\bsrc=(["'])[^"']*wp-includes\/js\/(?:comment-reply|underscore|wp-util|wp-embed)\.min\.js[^"']*\1[^>]*>\s*<\/script>/gi, "")
    .replace(/\\?\/wp-admin\\?\/admin-ajax\.php/g, "");
}

function addLegacyLegalFooterLinks(html) {
  if (html.includes("/privacy-policy") || html.includes("/terms-of-service")) return html;
  if (!/<\/footer>/i.test(html)) return html;

  return html.replace(/<\/footer>/i, `${LEGAL_FOOTER_LINKS}\n</footer>`);
}

function normalizePath(path, slash = "") {
  const normalized = `${path}${slash || ""}`.replace(/\/+$/, "");
  return normalized || "/";
}

function mapCanonicalHref(path) {
  if (CANONICAL_ROUTE_MAP.has(path)) return CANONICAL_ROUTE_MAP.get(path);

  const categoryMatch = path.match(/^\/(?:kategori|category)\/([^/]+)$/);
  if (categoryMatch) {
    const aliases = new Map([
      ["fnb", "makanan-minuman"],
      ["makanan-minuman-fb", "makanan-minuman"],
      ["perhotelan-travel", "penginapan-agen-travel"],
      ["properti-furniture", "furnitur-konstruksi-properti"],
      ["teknologi-digital", "komputer-teknologi"],
    ]);
    const slug = aliases.get(categoryMatch[1]) || categoryMatch[1];
    return `/peluang-usaha/kategori/${encodeURIComponent(slug)}`;
  }

  return "";
}
