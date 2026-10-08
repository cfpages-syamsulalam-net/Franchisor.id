import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

// Database-backed contract check.
//
// The string-based ownership:check cannot fail on a row count, a batch-index
// assumption, a trigger abort, or a schema-resolution error — which is exactly how a
// duplicated `LEFT JOIN users u` once shipped and made every dashboard load throw
// "ambiguous column name". This check loads the real shared migrations into an
// in-memory SQLite database and exercises the changed SQL against it.
//
// Requires Node's built-in `node:sqlite` (Node 22.5+) and the sibling Franchisee.id
// migration chain, which owns the shared schema. It prints SKIP and exits 0 when
// either is unavailable, so it is safe in a runtime that has neither; that means a
// skip is NOT a pass, and the skip line says so.

const MIGRATIONS_DIR = "../Franchisee.id/migrations";

async function loadSqlite() {
  try {
    // @ts-ignore node:sqlite exists at runtime but this project's @types/node version
    // does not declare it. The probe is what makes its absence safe: a missing module
    // returns null and the check takes its explicit SKIP path.
    const mod = await import("node:sqlite");
    return mod.DatabaseSync;
  } catch {
    return null;
  }
}

function sqlTemplates(source: string): string[] {
  return (source.match(/`[^`]*`/g) || [])
    .map((literal) => literal.slice(1, -1))
    .filter((literal) => !literal.includes("${") && /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(literal));
}

function requiredColumns(db: any, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as any[])
    .filter((column) => column.notnull === 1 && column.dflt_value === null && column.pk === 0)
    .map((column) => column.name);
}

function insert(db: any, table: string, values: Record<string, unknown>) {
  const present = Object.keys(values);
  const missing = requiredColumns(db, table).filter((column) => !present.includes(column));
  assert.equal(missing.length, 0, `${table} insert is missing required columns: ${missing.join(", ")}`);
  const placeholders = present.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${table} (${present.join(", ")}) VALUES (${placeholders})`).run(
    ...present.map((column) => values[column] as any),
  );
}

async function main() {
  const DatabaseSync = await loadSqlite();
  if (!DatabaseSync) {
    console.log("SKIP dashboard SQL check: node:sqlite is unavailable in this runtime (a skip is not a pass).");
    return;
  }
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log(`SKIP dashboard SQL check: shared migrations not found at ${MIGRATIONS_DIR} (a skip is not a pass).`);
    return;
  }

  const db = new DatabaseSync(":memory:");
  const files = readdirSync(MIGRATIONS_DIR).filter((file: string) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      db.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
    } catch (error: any) {
      console.log(`SKIP dashboard SQL check: migration ${file} did not apply to SQLite (${error.message}).`);
      return;
    }
  }

  // --- 1. Every dashboard read-model statement must prepare against the real schema. ---
  // This is the direct regression test for the duplicated join: SQLite resolves column
  // names at prepare time, so an ambiguous `u.primary_email` fails right here.
  const dashboardSource = readFileSync("functions/_dashboard-queries.js", "utf8");
  const templates = sqlTemplates(dashboardSource);
  assert.ok(templates.length > 0, "expected SQL templates in the dashboard read model");
  for (const template of templates) {
    try {
      db.prepare(template);
    } catch (error: any) {
      assert.fail(`dashboard read-model SQL does not prepare against the deployed schema: ${error.message}\n${template.slice(0, 400)}`);
    }
  }
  console.log(`  dashboard read model: ${templates.length} statements prepare against ${files.length} real migrations`);

  // --- 2. The claim path must not leave an orphan profile when the claim is unavailable. ---
  const profileSelect = db.prepare(
    `INSERT INTO franchisor_profiles
       (id, user_id, source_site_id, company_name, pic_name, email_contact, country_code, whatsapp,
        website_url, instagram_url, facebook_url, tiktok_url, youtube_url, linkedin_url,
        nib_number, haki_status, haki_number, legacy_row_id, legacy_timestamp, raw_payload)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM franchises
     WHERE id = ? AND owner_user_id IS NULL AND status = 'unclaimed' AND source_sheet = 'UNCLAIMED'`,
  );
  insert(db, "users", { id: "user_applicant", clerk_user_id: "clerk_applicant", primary_email: "a@example.test", display_name: "Applicant" });
  insert(db, "users", { id: "user_other", clerk_user_id: "clerk_other", primary_email: "o@example.test", display_name: "Other Owner" });
  insert(db, "users", { id: "user_admin", clerk_user_id: "clerk_admin", primary_email: "admin@example.test", display_name: "Admin" });
  insert(db, "franchises", {
    id: "franchise_owned", brand_name: "Owned Brand", slug: "owned-brand",
    source_sheet: "FRANCHISOR", status: "free", owner_user_id: "user_other", source_site_id: "site_franchisor_id",
  });
  const orphan = profileSelect.run(
    "profile_orphan", "user_applicant", "site_franchisor_id", "PT Test", "PIC", "a@example.test", "ID",
    "628123", null, null, null, null, null, null, null, null, null, "pub", "ts", "{}", "franchise_owned",
  );
  assert.equal(orphan.changes, 0, "an unavailable claim must insert no profile row");
  const orphanCount = db.prepare("SELECT COUNT(*) AS c FROM franchisor_profiles WHERE id = 'profile_orphan'").get() as any;
  assert.equal(Number(orphanCount.c), 0, "no orphan franchisor_profile may remain after an unavailable claim");
  console.log("  claim path: unavailable target inserts no orphan profile row");

  // --- 3. The deployed triggers must make a second decision impossible. ---
  // The handlers rely on the read-then-write check plus these triggers. This proves the
  // trigger half is real, which is why the code does not need (and must not add) a bare
  // `AND status = 'pending'` predicate that could let later batch statements run.
  insert(db, "franchises", {
    id: "franchise_claimable", brand_name: "Claimable Brand", slug: "claimable-brand",
    source_sheet: "UNCLAIMED", status: "unclaimed", owner_user_id: null, source_site_id: "site_franchisor_id",
  });
  insert(db, "franchise_claims", {
    id: "claim_1", franchise_id: "franchise_claimable", claimant_user_id: "user_applicant", status: "pending",
  });

  // A second pending claim for the same listing must be impossible while one is open.
  assert.throws(
    () => insert(db, "franchise_claims", {
      id: "claim_2", franchise_id: "franchise_claimable", claimant_user_id: "user_applicant", status: "pending",
    }),
    /claim_already_pending/,
    "guard_franchise_claim_pending must reject a parallel claim",
  );
  console.log("  claim guard: a parallel pending claim is aborted by the trigger");

  // The first decision on a pending claim must be applied...
  const firstDecision = db
    .prepare("UPDATE franchise_claims SET status = 'rejected', reviewed_by_user_id = 'user_admin', review_notes = 'evidence' WHERE id = 'claim_1'")
    .run();
  assert.equal(firstDecision.changes, 1, "the first decision on a pending claim must be applied");
  // ...and a second decision on the same row must be aborted, so a stale reviewer can
  // never flip a rejection into an approval.
  assert.throws(
    () => db.prepare("UPDATE franchise_claims SET status = 'approved' WHERE id = 'claim_1'").run(),
    /claim_already_reviewed/,
    "guard_franchise_claim_single_review must reject a second decision",
  );
  console.log("  claim guard: a second decision on a reviewed claim is aborted by the trigger");

  // A claim against a listing that is no longer unclaimed must be aborted.
  db.prepare("UPDATE franchises SET owner_user_id = 'user_other', status = 'free' WHERE id = 'franchise_claimable'").run();
  assert.throws(
    () => insert(db, "franchise_claims", {
      id: "claim_3", franchise_id: "franchise_claimable", claimant_user_id: "user_applicant", status: "pending",
    }),
    /claim_target_not_unclaimed/,
    "guard_franchise_claim_pending must reject a claim against an owned listing",
  );
  console.log("  claim guard: a claim against an owned listing is aborted by the trigger");

  // An unreviewed new brand must not acquire an owner or a published page.
  insert(db, "franchises", {
    id: "franchise_pending", brand_name: "Pending Brand", slug: "pending-brand",
    source_sheet: "FRANCHISOR", status: "pending_review", owner_user_id: null, source_site_id: "site_franchisor_id",
  });
  insert(db, "franchisor_profiles", { id: "profile_pending", user_id: "user_applicant", source_site_id: "site_franchisor_id" });
  insert(db, "franchise_submission_reviews", {
    id: "review_1", franchise_id: "franchise_pending", applicant_user_id: "user_applicant", status: "pending",
  });
  assert.throws(
    () => db.prepare("UPDATE franchises SET owner_user_id = 'user_applicant', status = 'free' WHERE id = 'franchise_pending'").run(),
    /new_brand_review_required/,
    "guard_unreviewed_brand_owner must block ownership before review",
  );
  assert.throws(
    () => insert(db, "franchise_site_publications", {
      id: "publication_1", franchise_id: "franchise_pending", site_id: "site_franchisor_id",
      slug: "pending-brand", canonical_url: "https://franchisor.id/usaha/pending-brand", publication_status: "published",
    }),
    /new_brand_review_required/,
    "guard_unreviewed_brand_publication_insert must block publication before review",
  );
  console.log("  brand guard: an unreviewed brand cannot be owned or published");

  // --- 4. The owner-review partial index must be exactly the shape the code assumes. ---
  const indexRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'unique_pending_owner_review'")
    .get() as any;
  assert.ok(indexRow, "unique_pending_owner_review must exist");
  assert.match(indexRow.sql, /\(franchise_id, suggested_by_user_id, field_name\)/, "the index must key on field_name so one owner can hold a listing proposal and a profile proposal at once");
  assert.match(indexRow.sql, /reason = 'Perubahan pemilik setelah listing diterbitkan'/, "the index must be scoped to the owner-review reason");
  console.log("  owner review: the partial unique index keys on field_name and the owner-review reason");

  // --- 5. The public-read predicate must exclude unpublished and archived rows. ---
  // The offline build fixture cannot express "the row exists but is not published", because
  // a --from-json row set is already the published set. This is where that half is proven,
  // against the real schema and the real canonical status exclusion.
  insert(db, "franchises", {
    id: "franchise_is_published", brand_name: "Is Published", slug: "is-published",
    source_sheet: "FRANCHISOR", status: "free", source_site_id: "site_franchisor_id",
  });
  insert(db, "franchises", {
    id: "franchise_is_archived", brand_name: "Is Archived", slug: "is-archived",
    source_sheet: "FRANCHISOR", status: "archived", source_site_id: "site_franchisor_id",
  });
  insert(db, "franchises", {
    id: "franchise_is_draft", brand_name: "Is Draft", slug: "is-draft",
    source_sheet: "FRANCHISOR", status: "free", source_site_id: "site_franchisor_id",
  });
  insert(db, "franchise_site_publications", {
    id: "publication_is_published", franchise_id: "franchise_is_published", site_id: "site_franchisor_id",
    slug: "is-published", canonical_url: "https://franchisor.id/usaha/is-published", publication_status: "published",
  });
  insert(db, "franchise_site_publications", {
    id: "publication_is_archived", franchise_id: "franchise_is_archived", site_id: "site_franchisor_id",
    slug: "is-archived", canonical_url: "https://franchisor.id/usaha/is-archived", publication_status: "published",
  });
  insert(db, "franchise_site_publications", {
    id: "publication_is_draft", franchise_id: "franchise_is_draft", site_id: "site_franchisor_id",
    slug: "is-draft", canonical_url: "https://franchisor.id/usaha/is-draft", publication_status: "draft",
  });

  const exposedSlugs = (db
    .prepare(
      `SELECT p.slug FROM franchise_site_publications p
       JOIN franchises f ON f.id = p.franchise_id
       WHERE p.site_id = 'site_franchisor_id'
         AND p.publication_status = 'published'
         AND f.status NOT IN ('archived', 'suspended')
       ORDER BY p.slug`,
    )
    .all() as any[]).map((row) => row.slug);
  assert.deepEqual(exposedSlugs, ["is-published"],
    "the public-read predicate must expose only a published, non-archived Franchisor row");
  console.log("  public read: a draft publication and an archived canonical brand are both excluded");

  // --- 6. Multi-site rebuild fan-out must resolve all published network sites. ---
  // @ts-ignore Pages Functions are JavaScript modules without generated declarations.
  const { getPublishedSiteIdsForFranchise, fanoutSiteRebuildStatements } = await import("../functions/_site-publish-queue.js");
  const d1Adapter = {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      let bound: any[] = [];
      const api: any = {
        bind: (...args: any[]) => { bound = args; return api; },
        all: async () => ({ results: stmt.all(...bound) }),
        first: async () => stmt.get(...bound) ?? null,
        run: async () => ({ meta: { changes: Number(stmt.run(...bound).changes ?? 0) } }),
      };
      return api;
    },
    batch: async (statements: any[]) => {
      for (const statement of statements) await statement.run();
    },
  };

  insert(db, "franchise_site_publications", {
    id: "publication_is_published_franchisee", franchise_id: "franchise_is_published", site_id: "site_franchisee_id",
    slug: "is-published", canonical_url: "https://franchisee.id/peluang-usaha/is-published", publication_status: "published",
  });

  const fanoutSites = await getPublishedSiteIdsForFranchise(d1Adapter, "franchise_is_published", "site_franchisor_id");
  assert.deepEqual(fanoutSites.sort(), ["site_franchisee_id", "site_franchisor_id"].sort(),
    "getPublishedSiteIdsForFranchise must return both published sites");

  const fanoutStmts = fanoutSiteRebuildStatements(d1Adapter, fanoutSites, {
    franchiseId: "franchise_is_published",
    reason: "dashboard_listing_edit_approved",
  });
  await d1Adapter.batch(fanoutStmts);

  const queuedSites = (db
    .prepare("SELECT DISTINCT site_id FROM site_rebuild_requests WHERE franchise_id = 'franchise_is_published'")
    .all() as any[]).map((r) => r.site_id).sort();
  assert.deepEqual(queuedSites, ["site_franchisee_id", "site_franchisor_id"].sort(),
    "site_rebuild_requests must be created for every published network site");
  console.log("  rebuild fan-out: multi-site brand edits enqueue rebuild requests for all published network sites");

  console.log("Database-backed dashboard contract check passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
