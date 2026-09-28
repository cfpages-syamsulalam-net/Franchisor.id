#!/usr/bin/env node
/**
 * Published-brand build proof.
 *
 * A green zero-row build proves nothing about the published-brand path. This fixture
 * pushes synthetic rows through the real chain — D1 snapshot generator, Astro build,
 * non-overwriting legacy copy, asset check — and asserts the generated output:
 *
 *   1. a published slug that exists nowhere else: the generated detail page, canonical,
 *      Open Graph URL and directory card must all agree on /usaha/{slug}.
 *   2. a published slug that collides with a retained legacy /usaha/{slug}/ page: the
 *      generated flat page must show the fixture brand rather than copied legacy HTML,
 *      and the legacy directory form must survive.
 *
 * The unpublished case is asserted by `pnpm run schema:check`, which exercises the
 * public-read predicate against the real migrations. A `--from-json` run cannot express
 * "a row exists but is not published", because the row set handed to the generator is
 * already the published set.
 *
 * The hidden case — a brand whose publication was set `hidden` after Premium expiry, or
 * archived outright — is asserted by `pnpm run suppression:check`, which pushes synthetic
 * publication rows through the suppression query and the legacy-copy gate directly.
 *
 * Never touches remote D1, never writes synthetic rows anywhere but a local fixture file,
 * and restores both tracked snapshot files afterwards.
 *
 * Run with `pnpm run published:check`. Expect this to take about a minute: it runs a real
 * Astro build. It is intentionally NOT part of `build:astro`, which would recurse.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = join(ROOT, "json", "d1-franchise-static-data.json");
const UNCLAIMED = join(ROOT, "json", "unclaimed-brands.json");
// Work area lives outside the repository so the fixture never adds untracked files.
const WORK_DIR = join(tmpdir(), "franchisor-published-check");
const FIXTURE_ROWS = join(WORK_DIR, "fixture-rows.json");

const NEW_SLUG = "review-synthetic-new";
const COLLIDING_SLUG = "abo-meatshop";
const ROWS = [
  {
    id: "franchise_review_synthetic_new",
    brand_name: "Review Synthetic New",
    slug: NEW_SLUG,
    category: "Makanan & Minuman",
    status: "free",
    verification_tier: "free",
    source_sheet: "FRANCHISOR",
    short_desc: "Baris sintetis untuk membuktikan halaman brand yang diterbitkan.",
  },
  {
    id: "franchise_review_synthetic_collision",
    brand_name: "Review Synthetic Collision",
    slug: COLLIDING_SLUG,
    category: "Retail & Minimarket",
    status: "free",
    verification_tier: "free",
    source_sheet: "FRANCHISOR",
    short_desc: "Baris sintetis untuk membuktikan tabrakan dengan halaman legacy.",
  },
];

// One command string rather than an args array: shell resolution is needed so pnpm.cmd
// is found on Windows, and passing an args array alongside a shell is deprecated.
function run(command) {
  execSync(command, { cwd: ROOT, stdio: "pipe" });
}

function dist(relativePath) {
  const file = join(ROOT, "dist", relativePath);
  assert.ok(existsSync(file), `expected the build to produce dist/${relativePath}`);
  return readFileSync(file, "utf8");
}

function main() {
  assert.ok(existsSync(SNAPSHOT), "the tracked snapshot json/d1-franchise-static-data.json must exist before the fixture runs");
  assert.ok(existsSync(UNCLAIMED), "the tracked json/unclaimed-brands.json must exist before the fixture runs");
  assert.ok(
    existsSync(join(ROOT, "usaha", COLLIDING_SLUG, "index.html")),
    `the collision fixture assumes a retained legacy page at usaha/${COLLIDING_SLUG}/index.html`,
  );

  mkdirSync(WORK_DIR, { recursive: true });
  copyFileSync(SNAPSHOT, join(WORK_DIR, "d1-franchise-static-data.json.bak"));
  copyFileSync(UNCLAIMED, join(WORK_DIR, "unclaimed-brands.json.bak"));
  const created = [
    `usaha/${NEW_SLUG}.html`,
    `usaha/${COLLIDING_SLUG}.html`,
    `peluang-usaha/${NEW_SLUG}.html`,
    `peluang-usaha/${COLLIDING_SLUG}.html`,
  ];

  try {
    writeFileSync(FIXTURE_ROWS, `${JSON.stringify(ROWS, null, 2)}\n`, "utf8");

    run(`pnpm exec tsx scripts/build-d1-franchise-pages.ts --from-json "${FIXTURE_ROWS}" --no-prune`);
    run("pnpm exec astro build");
    run("node scripts/copy-legacy-static.mjs");
    run("node scripts/check-built-assets.mjs");

    // 1. Each published slug must produce an agreeing generated detail page.
    for (const row of ROWS) {
      const detail = dist(`usaha/${row.slug}.html`);
      assert.match(detail, new RegExp(`rel="canonical" href="/usaha/${row.slug}"`),
        `dist/usaha/${row.slug}.html must declare the /usaha/ canonical`);
      assert.match(detail, new RegExp(`property="og:url" content="/usaha/${row.slug}"`),
        `dist/usaha/${row.slug}.html must declare the /usaha/ Open Graph URL`);
      assert.doesNotMatch(detail, new RegExp(`rel="canonical" href="/peluang-usaha/${row.slug}`),
        `the deprecated path must never be presented as the brand canonical for ${row.slug}`);
      assert.ok(detail.includes(row.brand_name),
        `dist/usaha/${row.slug}.html must show the fixture brand "${row.brand_name}"`);
    }

    // 2. The collision case: the generated flat page wins, the legacy directory form survives.
    const collisionDetail = dist(`usaha/${COLLIDING_SLUG}.html`);
    assert.ok(collisionDetail.includes("Review Synthetic Collision"),
      "a published slug colliding with a legacy page must be generated from D1, not served as copied legacy HTML");
    assert.ok(existsSync(join(ROOT, "usaha", COLLIDING_SLUG, "index.html")),
      "the retained legacy source page must survive the build");
    assert.ok(existsSync(join(ROOT, "dist", "usaha", `${COLLIDING_SLUG}.html`)),
      "the collided slug must still be served from the flat /usaha/{slug}.html path");
    assert.ok(!existsSync(join(ROOT, "dist", "usaha", COLLIDING_SLUG, "index.html")),
      "the legacy directory form must never be emitted: it forces a 308 to /usaha/{slug}/ and contradicts the declared canonical");

    // 3. The directory must card-link the canonical detail path for every published row.
    const directory = dist("peluang-usaha/index.html");
    for (const row of ROWS) {
      assert.ok(directory.includes(`/usaha/${row.slug}`),
        `the directory must link /usaha/${row.slug}`);
      assert.ok(!directory.includes(`href="/peluang-usaha/${row.slug}"`),
        `the directory must not link the deprecated path for ${row.slug}`);
    }
    assert.ok(directory.includes(`https://franchisor.id/usaha/${COLLIDING_SLUG}`),
      "the directory ItemList must use the /usaha/ URL");

    // 4. The deprecated path still resolves, and still declines to compete for indexing.
    for (const row of ROWS) {
      const deprecated = dist(`peluang-usaha/${row.slug}.html`);
      assert.ok(deprecated.includes("noindex"),
        `dist/peluang-usaha/${row.slug}.html must stay noindex as the fallback`);
    }

    console.log("Published-brand build proof passed:");
    console.log(`  generated detail for ${NEW_SLUG} and for the legacy collision ${COLLIDING_SLUG}`);
    console.log("  directory card, canonical and Open Graph agreed on /usaha/ and never on /peluang-usaha/");
  } finally {
    copyFileSync(join(WORK_DIR, "d1-franchise-static-data.json.bak"), SNAPSHOT);
    copyFileSync(join(WORK_DIR, "unclaimed-brands.json.bak"), UNCLAIMED);
    rmSync(WORK_DIR, { recursive: true, force: true });
    for (const relativePath of created) {
      rmSync(join(ROOT, "dist", relativePath), { force: true });
    }
    console.log("  restored the tracked snapshot files and removed the fixture output");
    console.log("  note: dist/ currently reflects the fixture build; run `pnpm run build` to restore the real snapshot");
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
