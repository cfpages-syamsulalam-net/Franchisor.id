import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { removeOwnedBrand, restoreRemovedBrand } from "../functions/_profile-franchisor-actions.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { MutationSchema } from "../functions/_profile-schemas.js";

/**
 * Owner brand-removal gate test, run against the real migration chain.
 *
 * The gate is the interesting part: removal is destructive and one-way for the owner, while every other owner
 * action in the same file accepts `owner_user_id = ? OR franchisor_profile_id = ?` — and that second branch
 * proves only *association*. This asserts the strict predicate holds, and that the weaker one is refused, so
 * nobody can delist a brand merely by having a profile attached to it.
 *
 * SKIPs loudly where the sibling migrations directory is absent (a Cloudflare Pages build sandbox).
 */

const MIGRATIONS_DIR = "../Franchisee.id/migrations";

if (!existsSync(MIGRATIONS_DIR)) {
  console.log(`SKIP brand removal check: shared migrations not found at ${MIGRATIONS_DIR} (a skip is not a pass).`);
  process.exit(0);
}

class SqliteD1 {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys = ON;");
    for (const name of readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort()) {
      this.db.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
    }
  }

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let values: any[] = [];
    const api: any = {
      bind: (...args: any[]) => {
        values = args;
        return api;
      },
      first: async () => statement.get(...values) ?? null,
      all: async () => ({ results: statement.all(...values) }),
      run: async () => ({ meta: { changes: Number(statement.run(...values).changes ?? 0) } }),
    };
    return api;
  }

  async batch(statements: any[]) {
    for (const statement of statements) await statement.run();
  }

  rows(sql: string, ...values: any[]) {
    return this.db.prepare(sql).all(...values) as any[];
  }

  scalar(sql: string, ...values: any[]) {
    return this.db.prepare(sql).get(...values) as any;
  }

  exec(sql: string) {
    this.db.exec(sql);
  }
}

const OWNER = { id: "user_owner" };
const STRANGER = { id: "user_stranger" };

async function body(response: any) {
  return { status: response.status, json: await response.json() };
}

function seedBrand(db: SqliteD1, id: string, slug: string, ownerUserId: string | null, profileId: string | null) {
  db.exec(
    `INSERT INTO franchises (id, owner_user_id, franchisor_profile_id, brand_name, slug, status, source_sheet)
     VALUES ('${id}', ${ownerUserId ? `'${ownerUserId}'` : "NULL"}, ${profileId ? `'${profileId}'` : "NULL"},
             'Brand ${slug}', '${slug}', 'free', 'FRANCHISOR');
     INSERT INTO franchise_site_publications (id, franchise_id, site_id, slug, publication_status)
     VALUES ('pub_${id}_1', '${id}', 'site_franchisor_id', '${slug}', 'published'),
            ('pub_${id}_2', '${id}', 'site_franchise_id', '${slug}', 'published');`
  );
}

async function main() {
  const db = new SqliteD1();
  const anyDb = db as any;

  // A profile that exists but owns nothing — the association-only case.
  db.exec(`INSERT INTO users (id, clerk_user_id, primary_email, status) VALUES
    ('${OWNER.id}', 'clerk_owner', 'owner@example.invalid', 'active'),
    ('${STRANGER.id}', 'clerk_stranger', 'stranger@example.invalid', 'active');
    INSERT INTO franchisor_profiles (id, user_id, company_name) VALUES ('profile_1', '${STRANGER.id}', 'Stranger Co');`);

  // 1. Proven owner: an approved claim names the same user who owns the row.
  seedBrand(db, "brand_proven", "brand-proven", OWNER.id, "profile_1");
  db.exec(`INSERT INTO franchise_claims (id, franchise_id, claimant_user_id, status, reviewed_by_user_id, reviewed_at)
    VALUES ('claim_1', 'brand_proven', '${OWNER.id}', 'approved', '${OWNER.id}', CURRENT_TIMESTAMP);`);

  // 2. Owner in the column, but NOTHING proves it.
  seedBrand(db, "brand_tracefree", "brand-tracefree", OWNER.id, null);

  // 3. Merely associated: the owner column is empty, only a profile is attached.
  seedBrand(db, "brand_associated", "brand-associated", null, "profile_1");

  const removeData = (franchiseId: string) => ({
    action: "remove_brand",
    franchise_id: franchiseId,
    reason_code: "no_longer_offering",
    confirm: "HAPUS BRAND SAYA",
  });

  // --- the schema refuses anything but the exact confirmation phrase ---
  assert.equal(MutationSchema.safeParse(removeData("brand_proven")).success, true, "the confirmation phrase is accepted");
  assert.equal(
    MutationSchema.safeParse({ ...removeData("brand_proven"), confirm: "yes" }).success,
    false,
    "a stray click cannot delist a brand, because anything but the exact phrase is rejected"
  );
  assert.equal(
    MutationSchema.safeParse({ ...removeData("brand_proven"), note: "" }).success,
    true,
    "an omitted or blank note is accepted, like every other profile action"
  );
  assert.equal(
    MutationSchema.safeParse({ ...removeData("brand_proven"), note: null }).success,
    false,
    "null is rejected rather than silently coerced — the same contract the other profile actions already have"
  );
  console.log("schema: the confirmation phrase is required");

  // --- an unrelated account cannot touch it ---
  const strangerAttempt = await body(await removeOwnedBrand(anyDb, STRANGER, removeData("brand_proven")));
  assert.equal(strangerAttempt.status, 404, "a non-owner gets nothing");
  console.log("refused: a non-owner");

  // --- association alone is refused (this is the case the weaker predicate would have allowed) ---
  const associatedAttempt = await body(await removeOwnedBrand(anyDb, STRANGER, removeData("brand_associated")));
  assert.equal(associatedAttempt.status, 404, "a profile-linked stranger is not an owner");
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM franchise_removals WHERE franchise_id = 'brand_associated'").n,
    0,
    "nothing happened to the associated brand"
  );
  console.log("refused: profile association only");

  // --- ownership with no provenance is refused ---
  const traceFreeAttempt = await body(await removeOwnedBrand(anyDb, OWNER, removeData("brand_tracefree")));
  assert.equal(traceFreeAttempt.status, 403, "ownership without an approved claim or review is not enough");
  assert.equal(traceFreeAttempt.json.error, "OWNERSHIP_NOT_PROVEN");
  console.log("refused: ownership without provenance");

  // --- the proven owner succeeds, and it delists rather than deletes ---
  const ok = await body(await removeOwnedBrand(anyDb, OWNER, removeData("brand_proven")));
  assert.equal(ok.status, 200, "the proven owner may remove their brand");
  assert.equal(ok.json.hidden_publications, 2, "both publications were hidden");
  assert.equal(
    db.rows("SELECT publication_status FROM franchise_site_publications WHERE franchise_id = 'brand_proven'").every((row: any) => row.publication_status === "hidden"),
    true,
    "every publication is hidden"
  );
  assert.equal(db.scalar("SELECT status FROM franchises WHERE id = 'brand_proven'").status, "archived", "the brand is archived");
  assert.notEqual(db.scalar("SELECT id FROM franchises WHERE id = 'brand_proven'"), null, "the brand row still exists — this is a delist, not a delete");
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM franchise_claims WHERE franchise_id = 'brand_proven'").n, 1, "the ownership proof survives, which a hard delete would have destroyed");

  // F1: hiding the D1 row is not the retirement. The page stays live until a publisher runs, so a removal that
  // only wrote D1 could report success while the brand was still reachable — which is why this check now asserts
  // the queue rows and not just the hidden publications.
  assert.deepEqual(
    db
      .rows(
        "SELECT site_id FROM site_rebuild_requests WHERE franchise_id = 'brand_proven' AND status IN ('pending', 'failed_retryable')"
      )
      .map((row: any) => row.site_id)
      .sort(),
    ["site_franchise_id", "site_franchisor_id"],
    "one rebuild is queued for every site that held a publication"
  );
  const removal = db.scalar("SELECT basis, previous_publications FROM franchise_removals WHERE franchise_id = 'brand_proven'");
  assert.equal(removal.basis, "owner_verified");
  assert.equal(JSON.parse(removal.previous_publications).length, 2, "the previous publication states are snapshotted");
  console.log("allowed: the proven owner, and the result is a delist");

  // --- removing twice is a no-op rather than an error ---
  const again = await body(await removeOwnedBrand(anyDb, OWNER, removeData("brand_proven")));
  assert.equal(again.json.already_removed, true, "a second removal reports the existing state instead of failing");
  console.log("idempotent: a second removal is a no-op");

  // --- admin restore is faithful ---
  const restored = await body(await restoreRemovedBrand(anyDb, OWNER, { franchise_id: "brand_proven", note: "owner reopened" }));
  assert.equal(restored.status, 200, "restore succeeds");
  assert.equal(
    db.rows("SELECT publication_status FROM franchise_site_publications WHERE franchise_id = 'brand_proven'").every((row: any) => row.publication_status === "published"),
    true,
    "the exact prior publication states come back"
  );
  assert.equal(db.scalar("SELECT status FROM franchises WHERE id = 'brand_proven'").status, "free", "the brand leaves archived");
  assert.notEqual(
    db.scalar("SELECT revoked_at FROM franchise_removals WHERE franchise_id = 'brand_proven'").revoked_at,
    null,
    "the removal is marked revoked rather than deleted, so the history remains"
  );
  console.log("restored: publication states are faithful and the removal history is kept");

  console.log("\nBrand removal checks passed: provenance is required, association is not enough, and removal is a delist.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
