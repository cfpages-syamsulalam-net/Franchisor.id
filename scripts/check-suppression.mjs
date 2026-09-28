#!/usr/bin/env node
/**
 * Suppression proof for the legacy brand-page copy.
 *
 * `fetchSuppressedSlugs` in `scripts/build-d1-franchise-pages.ts` decides which retained
 * `usaha/<slug>/index.html` pages must NOT be copied into `dist/`; `copy-legacy-static.mjs`
 * enforces that set and refuses to build without a D1-derived one. This check proves the
 * decision against the real migration chain in an in-memory SQLite, covering the cases the
 * re-audit named:
 *
 *   1. an archived brand is suppressed, even when its publication row still says `published`
 *      (erasure archives the brand but leaves the row; the page predicate checks both);
 *   2. a brand hidden after Premium expiry (`publication_status = 'hidden'`, brand still `free`)
 *      is suppressed exactly like an archived one;
 *   3. a live published brand is NOT suppressed;
 *   4. a slug shared across sites does NOT suppress this site's page when only the OTHER
 *      site's projection is hidden (suppression is scoped to `site_franchisor_id`);
 *   5. a non-authoritative removal set (`source !== "d1"`) stops the copy step rather than
 *      warning through it — an empty set reads as "nothing was removed" and would republish
 *      deliberately removed pages.
 *
 * Never touches remote D1. Runs against the real schema, not a hand-written fake, so the
 * predicate is proven against the columns and constraints it will meet in production.
 *
 * Run with `pnpm run suppression:check`.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The schema is owned by the sibling repository: Franchisee.id holds the shared migration chain (migrations
// 0040–0047), and every other local gate that needs real tables resolves them the same way. A Cloudflare Pages
// build sandbox has no sibling checkout, so that is a loud SKIP rather than a pass.
const MIGRATIONS_DIR = resolve(ROOT, "..", "Franchisee.id", "migrations");
const BUILD_SCRIPT = join(ROOT, "scripts", "build-d1-franchise-pages.ts");
const COPY_SCRIPT = join(ROOT, "scripts", "copy-legacy-static.mjs");

const SUPPRESSION_SQL =
  "SELECT DISTINCT p.slug FROM franchise_site_publications p " +
  "JOIN franchises f ON f.id = p.franchise_id " +
  "WHERE p.site_id = 'site_franchisor_id' AND p.slug IS NOT NULL AND p.slug <> '' " +
  "AND NOT (p.publication_status = 'published' AND f.status NOT IN ('archived','suspended'))";

function seedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const name of readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
  }
  return db;
}

function seedPublicationCase(db, { franchiseId, slug, brandStatus, publicationStatus, siteId = "site_franchisor_id", publicationSlug = null }) {
  db.prepare("INSERT INTO franchises (id, brand_name, slug, status) VALUES (?, ?, ?, ?)").all(
    franchiseId, `Brand ${slug}`, slug, brandStatus
  );
  db.prepare(
    "INSERT INTO franchise_site_publications (id, franchise_id, site_id, slug, publication_status) VALUES (?, ?, ?, ?, ?)"
  ).all(`pub_${franchiseId}_${siteId}`, franchiseId, siteId, publicationSlug || slug, publicationStatus);
}

function suppressedSlugs(db) {
  return new Set(db.prepare(SUPPRESSION_SQL).all().map((row) => row.slug));
}

function main() {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log(
      `SKIP suppression check: shared migrations not found at ${MIGRATIONS_DIR} (a skip is not a pass). ` +
        "Run it where both repositories are present."
    );
    process.exit(0);
  }
  // The query under test must be the query in the build script — not a copy of it that can drift.
  const buildSource = readFileSync(BUILD_SCRIPT, "utf8");
  for (const fragment of [
    "p.site_id = 'site_franchisor_id'",
    "AND NOT (p.publication_status = 'published' AND f.status NOT IN ('archived','suspended'))",
  ]) {
    assert.ok(buildSource.includes(fragment), `the build script's suppression query must contain: ${fragment}`);
  }

  const db = seedDb();
  seedPublicationCase(db, { franchiseId: "f_archived", slug: "brand-archived", brandStatus: "archived", publicationStatus: "published" });
  seedPublicationCase(db, { franchiseId: "f_suspended", slug: "brand-suspended", brandStatus: "suspended", publicationStatus: "published" });
  seedPublicationCase(db, { franchiseId: "f_hidden", slug: "brand-hidden", brandStatus: "free", publicationStatus: "hidden" });
  seedPublicationCase(db, { franchiseId: "f_live", slug: "brand-live", brandStatus: "free", publicationStatus: "published" });
  // The cross-site case needs two brands sharing one slug. `franchises.slug` is UNIQUE, so the sibling row lives
  // under a suffixed slug of its own — the shared value is the *publication* slug, which is per-site and is what
  // both the redirect and the suppression match on.
  seedPublicationCase(db, { franchiseId: "f_shared_here", slug: "brand-shared-here", brandStatus: "free", publicationStatus: "published", publicationSlug: "brand-shared" });
  seedPublicationCase(db, { franchiseId: "f_shared_there", slug: "brand-shared-there", brandStatus: "free", publicationStatus: "hidden", siteId: "site_franchisee_id", publicationSlug: "brand-shared" });

  const suppressed = suppressedSlugs(db);
  assert.ok(suppressed.has("brand-archived"), "an archived brand is suppressed even with a published row");
  assert.ok(suppressed.has("brand-suspended"), "a suspended brand is suppressed even with a published row");
  assert.ok(suppressed.has("brand-hidden"), "a brand hidden after Premium expiry is suppressed like an archived one");
  assert.ok(!suppressed.has("brand-live"), "a live published brand is NOT suppressed");
  assert.ok(!suppressed.has("brand-shared"), "a slug hidden only on the sibling site does NOT suppress this site's page");

  // The copy gate: a non-authoritative set must stop the build, not warn through it.
  const copySource = readFileSync(COPY_SCRIPT, "utf8");
  assert.ok(
    copySource.includes('parsed?.source !== "d1"') && copySource.includes("process.exit(1)"),
    "the legacy copy must exit non-zero on a non-D1 removal set"
  );
  const gateSection = copySource.slice(copySource.indexOf('parsed?.source !== "d1"') - 200, copySource.indexOf('parsed?.source !== "d1"') + 900);
  assert.doesNotMatch(gateSection, /console\.warn/, "the non-authoritative path must not be a warning that continues the build");

  console.log("Suppression proof passed:");
  console.log("  archived, suspended and premium-hidden brands are suppressed; live brands are not");
  console.log("  cross-site slugs do not leak; a non-D1 removal set stops the build");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
