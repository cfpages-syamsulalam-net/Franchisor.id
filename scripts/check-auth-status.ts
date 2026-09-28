import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import {
  assertActiveD1User,
  blockAccount,
  blockAccountStatements,
  getCurrentMembership,
  getCurrentUserStatus,
  getD1UserByClerkId,
  hashBlockedEmail,
  markD1UserDeleted,
  membershipEventStatement,
  recordMembershipEvent,
  unblockAccount,
  upsertD1User,
  userStatusEventStatement,
} from "../functions/_clerk-auth.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { eraseAccount, drainAssetCleanup, erasurePlan, erasedEmailPlaceholder, erasedClerkIdPlaceholder } from "../functions/_account-erasure.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { deleteAccount, updateAccount } from "../functions/_profile-account.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { MutationSchema } from "../functions/_profile-schemas.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { expirePremiumAfterGrace } from "../functions/_premium-lifecycle.js";
// @ts-ignore Node ESM helper without generated declarations.
import { encodePath, decodePath } from "../scripts/render-signature.mjs";

/**
 * Identity-status regression test.
 *
 * Runs the real resolver against the **real migration chain** in an in-memory SQLite rather than against a
 * hand-written fake that pattern-matches SQL strings. That matters: the previous fake could not model
 * `user_identities` at all, and a fake is only ever as good as the assumptions baked into it — the schema is
 * the thing worth testing against.
 *
 * Guards:
 *   * signing in must never write `status`, from either Clerk application;
 *   * a second application's identity links to the same D1 user instead of taking the row over;
 *   * `users.clerk_user_id` stays the home identity and is never overwritten;
 *   * email role grants apply only to active accounts;
 *   * deleting one Clerk account revokes that identity without deleting the shared person;
 *   * membership is a timeline where the newest `effective_at` wins.
 *
 * Requires the sibling migrations directory. Where it is absent — a Cloudflare Pages build sandbox — it SKIPs
 * loudly rather than pretending to have passed.
 */

const MIGRATIONS_DIR = "../Franchisee.id/migrations";

if (!existsSync(MIGRATIONS_DIR)) {
  console.log(
    `SKIP auth status check: shared migrations not found at ${MIGRATIONS_DIR} (a skip is not a pass). ` +
      "Run it where both repositories are present."
  );
  process.exit(0);
}

/** Minimal D1-shaped adapter over node:sqlite, so the resolver runs against real tables and constraints. */
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
      run: async () => {
        const result = statement.run(...values);
        return { meta: { changes: Number(result.changes ?? 0) } };
      },
    };
    return api;
  }

  /** D1 runs statement batches; the adapter needs it too, because expiry and removal both use it. */
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

const APP_A = "franchisee_id";
const APP_B = "franchisor_id";
const GRANT_EMAIL = "grants@example.invalid";
const SUSPENDED_EMAIL = "suspended@example.invalid";

const clerkUser = (id: string, email: string) => ({
  id,
  emailAddresses: [{ id: "email1", emailAddress: email, verification: { status: "verified" } }],
  primaryEmailAddressId: "email1",
});

// Two verified emails on one Clerk person, the shape the re-audit's production sequence needs: the arriving
// address is whatever the person currently uses, and both are verified.
const clerkPerson = (id: string, currentEmail: string, otherEmail: string) => ({
  id,
  emailAddresses: [
    { id: "email1", emailAddress: currentEmail, verification: { status: "verified" } },
    { id: "email2", emailAddress: otherEmail, verification: { status: "verified" } },
  ],
  primaryEmailAddressId: "email1",
});

const appKeysOf = (db: SqliteD1, userId: string) =>
  db
    .rows("SELECT app_key FROM user_identities WHERE user_id = ? ORDER BY app_key", userId)
    .map((row: any) => row.app_key);

async function main() {
  const db = new SqliteD1();
  const anyDb = db as any;

  // `network_sites` is already seeded by migration 0001, but a pre-login email role grant does not exist yet.
  db.exec(
    `INSERT INTO email_role_grants (id, email, email_normalized, role, scope_type, scope_id, is_active)
     VALUES ('grant_fixture', '${GRANT_EMAIL}', '${GRANT_EMAIL}', 'franchisor', 'network', 'network', 1),
            ('grant_suspended', '${SUSPENDED_EMAIL}', '${SUSPENDED_EMAIL}', 'franchisor', 'network', 'network', 1)`
  );

  // 1. A brand-new person.
  const created = await upsertD1User(anyDb, clerkUser("clerk_a_1", "new@example.invalid"), { appKey: APP_A });
  assert.equal(created.status, "active", "a new identity starts active");
  assertActiveD1User(created);
  assert.equal(db.rows("SELECT id FROM users").length, 1, "exactly one users row");
  assert.deepEqual(appKeysOf(db, created.id), [APP_A], "one identity, from app A");
  assert.equal(db.scalar("SELECT link_basis FROM user_identities WHERE app_key = ?", APP_A).link_basis, "first_identity");
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM user_status_events WHERE user_id = ?", created.id).n, 1, "a status baseline is recorded");

  // 2. A repeat sign-in duplicates nothing.
  await upsertD1User(anyDb, clerkUser("clerk_a_1", "new@example.invalid"), { appKey: APP_A });
  assert.equal(db.rows("SELECT id FROM users").length, 1, "no duplicate user on a repeat sign-in");
  assert.equal(db.rows("SELECT id FROM user_identities").length, 1, "no duplicate identity on a repeat sign-in");
  assert.notEqual(db.scalar("SELECT last_seen_at FROM user_identities WHERE app_key = ?", APP_A).last_seen_at, null, "last_seen_at is stamped");

  // 3. The same verified email from a SECOND application links to the same person.
  const secondApp = await upsertD1User(anyDb, clerkUser("clerk_b_1", "new@example.invalid"), { appKey: APP_B });
  assert.equal(secondApp.id, created.id, "a second application resolves to the same D1 user");
  assert.deepEqual(appKeysOf(db, created.id), [APP_A, APP_B], "both applications now reach this user");
  assert.equal(
    db.scalar("SELECT clerk_user_id FROM users WHERE id = ?", created.id).clerk_user_id,
    "clerk_a_1",
    "users.clerk_user_id stays the HOME identity and is never overwritten by a second application"
  );
  assert.equal(db.scalar("SELECT link_basis FROM user_identities WHERE app_key = ?", APP_B).link_basis, "verified_email", "the link records how it happened");
  assert.equal(await getCurrentUserStatus(anyDb, created.id), "active", "current status is read from the timeline");

  // 4. Positive case: an ACTIVE account with a pre-granted email role does receive it. Without this the
  //    negative assertion below could pass for the wrong reason.
  const granted = await upsertD1User(anyDb, clerkUser("clerk_grant_1", GRANT_EMAIL), { appKey: APP_A });
  assert.equal(
    db.rows("SELECT role FROM user_roles WHERE user_id = ?", granted.id).length,
    1,
    "an active account receives its pre-granted email role"
  );

  // 5. Negative case: the account is already suspended, so linking by email must inherit that and grant nothing.
  db.exec(`
    INSERT INTO users (id, clerk_user_id, primary_email, display_name, status)
      VALUES ('user_suspended', 'clerk_susp_1', '${SUSPENDED_EMAIL}', 'Suspended', 'suspended');
    INSERT INTO user_identities (id, user_id, provider, app_key, clerk_user_id, email_at_link, link_basis, verified_email)
      VALUES ('ident_susp', 'user_suspended', 'clerk', '${APP_A}', 'clerk_susp_1', '${SUSPENDED_EMAIL}', 'first_identity', 0);
  `);
  const suspendedViaOtherApp = await upsertD1User(anyDb, clerkUser("clerk_susp_2", SUSPENDED_EMAIL), { appKey: APP_B });
  assert.equal(suspendedViaOtherApp.id, "user_suspended", "the suspended person is reachable from the other application");
  assert.equal(suspendedViaOtherApp.status, "suspended", "signing in must not clear a suspension");
  await assert.rejects(async () => assertActiveD1User(suspendedViaOtherApp), (error: any) => error.code === "ACCOUNT_INACTIVE");
  assert.equal(
    db.rows("SELECT role FROM user_roles WHERE user_id = 'user_suspended'").length,
    0,
    "email role grants are NOT applied to a non-active account"
  );

  // 6. The schema now prevents the ambiguous state outright.
  let duplicateRejected = false;
  try {
    db.exec(
      `INSERT INTO users (id, clerk_user_id, primary_email, display_name, status)
       VALUES ('user_dupe_email', 'clerk_dupe_1', '${GRANT_EMAIL}', 'Duplicate Email', 'active')`
    );
  } catch {
    duplicateRejected = true;
  }
  assert.equal(duplicateRejected, true, "idx_users_primary_email_unique must reject a second row with the same address");

  // 6b. Fail-closed backstop, for a row that predates the index. The corrupt state is simulated by dropping the
  //     index in THIS IN-MEMORY COPY ONLY — production is untouched — so that the linker's refusal can be
  //     proven. Refusing to choose between two people is required by the shared data contract ("fail closed on
  //     conflicting identity"), not a hypothetical: linking the wrong one hands over their brand and roles.
  db.exec("DROP INDEX IF EXISTS idx_users_primary_email_unique");
  db.exec(
    `INSERT INTO users (id, clerk_user_id, primary_email, display_name, status)
     VALUES ('user_dupe_email', 'clerk_dupe_1', '${GRANT_EMAIL}', 'Duplicate Email', 'active')`
  );
  const usersBeforeLink = db.rows("SELECT id FROM users").length;
  const ambiguous = await upsertD1User(anyDb, clerkUser("clerk_dupe_2", GRANT_EMAIL), { appKey: APP_B });
  assert.equal(db.rows("SELECT id FROM users").length, usersBeforeLink + 1, "an ambiguous email creates a separate person instead of linking");
  assert.ok(!["user_dupe_email", granted.id].includes(ambiguous.id), "it links to NEITHER of the two candidates");
  assert.equal(
    db.rows("SELECT id FROM operation_events WHERE event_type = 'user_identities.link_ambiguous'").length >= 1,
    true,
    "the refusal is recorded, not silent"
  );

  // 6. Deleting one Clerk account revokes that identity but keeps the shared person while another lives.
  await markD1UserDeleted(anyDb, "clerk_a_1");
  assert.notEqual(db.scalar("SELECT revoked_at FROM user_identities WHERE app_key = ?", APP_A).revoked_at, null, "the identity is revoked");
  assert.notEqual(db.scalar("SELECT status FROM users WHERE id = ?", created.id).status, "deleted", "the shared user survives while the other identity is live");
  assert.notEqual(await getD1UserByClerkId(anyDb, "clerk_b_1"), null, "resolution still works through the surviving identity");
  assert.equal(await getD1UserByClerkId(anyDb, "clerk_a_1"), null, "the revoked identity no longer resolves");

  // 7. Removing the last identity retires the person.
  await markD1UserDeleted(anyDb, "clerk_b_1");
  assert.equal(db.scalar("SELECT status FROM users WHERE id = ?", created.id).status, "deleted", "with no live identity the user is retired");
  assert.notEqual(await getCurrentUserStatus(anyDb, created.id), "active", "the timeline agrees the account lost access");

  // 8. Membership is a timeline: the newest effective_at wins and history is never rewritten.
  await recordMembershipEvent(anyDb, { userId: created.id, status: "premium", reason: "purchase", effectiveAt: "2026-01-01T00:00:00Z" });
  assert.equal(await getCurrentMembership(anyDb, created.id), "premium", "an upgrade applies");
  await recordMembershipEvent(anyDb, { userId: created.id, status: "free", reason: "expired", effectiveAt: "2026-06-01T00:00:00Z" });
  assert.equal(await getCurrentMembership(anyDb, created.id), "free", "a later downgrade wins");
  await recordMembershipEvent(anyDb, { userId: created.id, status: "premium", reason: "renewal", effectiveAt: "2026-09-01T00:00:00Z" });
  assert.equal(await getCurrentMembership(anyDb, created.id), "premium", "a later upgrade wins again");
  // Migration 0042 backfills a baseline only for users that already exist when it runs, and here the migrations
  // load before any user does — so this account's timeline is exactly the three transitions just recorded, in
  // order, with nothing overwritten.
  const events = db.rows("SELECT status FROM user_membership_events WHERE user_id = ? ORDER BY effective_at", created.id);
  assert.deepEqual(
    events.map((row: any) => row.status),
    ["premium", "free", "premium"],
    "every transition is retained in order, nothing rewritten"
  );

  // 9. Expiry materialises the downgrade. A premium user is never deleted, only downgraded, and every site reads
  //    the newest timeline entry to know the current status — so a lapsed subscription has to append to it rather
  //    than leave "premium" sitting there as the latest row forever.
  db.exec(`
    INSERT INTO franchises (id, brand_name, slug, status, source_sheet)
      VALUES ('brand_exp', 'Expiring Brand', 'brand-exp', 'premium', 'FRANCHISOR');
    INSERT INTO franchise_subscriptions (id, franchise_id, user_id, status, starts_at, ends_at)
      VALUES ('sub_1', 'brand_exp', '${created.id}', 'active', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
  `);
  await recordMembershipEvent(anyDb, { userId: created.id, status: "premium", reason: "purchase", effectiveAt: "2026-01-01T00:00:00Z" });
  assert.equal(await getCurrentMembership(anyDb, created.id), "premium", "a live subscription reads as premium");

  const expired = await expirePremiumAfterGrace(anyDb, { grace_period_days: 0 });
  assert.ok(expired >= 1, "the lapsed subscription was processed");
  assert.equal(db.scalar("SELECT status FROM franchise_subscriptions WHERE id = 'sub_1'").status, "expired", "the subscription is expired");
  assert.equal(
    await getCurrentMembership(anyDb, created.id),
    "free",
    "the expiry appended a downgrade, so the newest row is no longer 'premium'"
  );
  console.log("expiry: a lapsed subscription appends a downgrade to the timeline");

  // 10. The block half of the delete-and-block flow: what actually enforces access.
  const SALT = "test-salt-v1";
  const BLOCKED_EMAIL = "blocked@example.invalid";
  const usersBeforeBlock = db.rows("SELECT id FROM users").length;

  await blockAccount(anyDb, {
    userId: granted.id,
    email: BLOCKED_EMAIL,
    salt: SALT,
    reason: "test block",
    requestSource: "admin",
    acknowledgementVersion: "test",
  });

  const blockedAttempt = await upsertD1User(anyDb, clerkUser("clerk_blocked_new", BLOCKED_EMAIL), {
    appKey: APP_B,
    blockSalt: SALT,
  })
    .then(() => null)
    .catch((error: any) => error);
  assert.ok(blockedAttempt, "a blocked address is refused rather than signed in");
  assert.equal(blockedAttempt.code, "ACCOUNT_BLOCKED", "with the blocked code, not a generic auth error");
  assert.equal(
    db.rows("SELECT id FROM users").length,
    usersBeforeBlock,
    "and no user row was created for it, which is the whole point: the same person cannot simply register again"
  );
  console.log("blocked: a new identity on a blocked address cannot register");

  // A block also follows the person, not only the address. The granted user above is blocked, then the same
  // Clerk identity returns with a different verified email — and is still refused, because the block row points
  // at their user id. This is the identity path (the clerk id resolves first); case 21 below proves the same for
  // the email-link path with a fresh identity. The block is revoked afterwards so the address is reusable: the
  // suite treats a revoked block as history, and later cases must not inherit this fixture's refusal.
  await blockAccount(anyDb, {
    userId: granted.id,
    email: GRANT_EMAIL,
    salt: SALT,
    reason: "test block follows the person",
    requestSource: "admin",
    acknowledgementVersion: "test",
  });
  const changedAttempt = await upsertD1User(anyDb, clerkUser("clerk_grant_1", "changed@example.invalid"), { appKey: APP_A, blockSalt: SALT })
    .then(() => null)
    .catch((error: any) => error);
  assert.equal(changedAttempt?.code, "ACCOUNT_BLOCKED", "the person is refused even though their address changed");
  const blockedUser = await getD1UserByClerkId(anyDb, "clerk_grant_1");
  assert.equal(blockedUser?.status, "blocked", "and still resolves as blocked");
  await assert.rejects(
    async () => assertActiveD1User(blockedUser),
    (error: any) => error.code === "ACCOUNT_BLOCKED"
  );
  await unblockAccount(anyDb, { email: GRANT_EMAIL, salt: SALT, note: "fixture block released" });
  console.log("blocked: the person is refused even after an email change");

  // An unaffected address still works, so this is not simply refusing everybody.
  const unaffected = await upsertD1User(anyDb, clerkUser("clerk_fine_1", "fine@example.invalid"), {
    appKey: APP_B,
    blockSalt: SALT,
  });
  assert.equal(unaffected.status, "active", "an unblocked address signs in normally");

  // The hash depends on the salt. Recorded as an assertion because it is the reason the salt can never be rotated
  // casually: every existing block would silently stop matching.
  const storedHash = db.scalar("SELECT email_hash FROM user_blocks WHERE revoked_at IS NULL LIMIT 1").email_hash;
  assert.notEqual(storedHash, await hashBlockedEmail(BLOCKED_EMAIL, "a-different-salt"), "a different salt produces a different hash");
  assert.equal(storedHash, await hashBlockedEmail(BLOCKED_EMAIL, SALT), "and the same salt reproduces it");

  // Fail closed: with blocks present but no salt configured we cannot prove an address is not blocked, so sign-in
  // is refused rather than quietly allowed through.
  const noSaltAttempt = await upsertD1User(anyDb, clerkUser("clerk_fine_2", "fine2@example.invalid"), { appKey: APP_B })
    .then(() => null)
    .catch((error: any) => error);
  assert.equal(noSaltAttempt?.code, "BLOCK_SALT_MISSING", "no salt with blocks present refuses rather than guessing");

  // Unblocking restores access, and the row stays behind so the history survives.
  await unblockAccount(anyDb, { email: BLOCKED_EMAIL, salt: SALT, note: "appeal upheld" });
  const afterUnblock = await upsertD1User(anyDb, clerkUser("clerk_blocked_new", BLOCKED_EMAIL), {
    appKey: APP_B,
    blockSalt: SALT,
  });
  assert.equal(afterUnblock.status, "active", "unblocking restores normal sign-in");
  assert.notEqual(
    db.scalar("SELECT revoked_at FROM user_blocks WHERE email_hash = ?", storedHash).revoked_at,
    null,
    "the block row is retained with a revocation timestamp rather than deleted"
  );
  console.log("unblocked: access returns and the block history is kept");

  // 11. Settings → "Hapus & blokir akun saya", at the level the page actually calls.
  const DELETION_VERSION = "2026-09-28.1";
  const CONTRACT_VERSION = "2026-09-28.1";
  const SIGN_POINTS = [
    [10, 20],
    [40, 60],
    [90, 30],
    [120, 80],
  ];
  const SIGNED_PAYLOAD = encodePath(SIGN_POINTS, 600, 200);
  const deletionPayload = {
    action: "delete_account",
    confirm: "HAPUS AKUN SAYA",
    acknowledgement_version: DELETION_VERSION,
    contract_version: CONTRACT_VERSION,
    signer_full_name: "Nama Penanda Tangan",
    signature_format: "path/v1",
    signature_payload: SIGNED_PAYLOAD,
    signature_point_count: SIGN_POINTS.length,
  };

  assert.equal(MutationSchema.safeParse(deletionPayload).success, true, "the exact phrase plus a signed contract is accepted");
  assert.equal(
    MutationSchema.safeParse({ ...deletionPayload, confirm: "hapus akun saya" }).success,
    false,
    "the phrase is a literal, so a near miss or a stray click cannot remove an account"
  );
  assert.equal(
    MutationSchema.safeParse({ action: "delete_account", confirm: "HAPUS AKUN SAYA" }).success,
    false,
    "the acknowledgement version is required, so we can always show what the person agreed to"
  );
  assert.equal(
    MutationSchema.safeParse({ ...deletionPayload, contract_version: undefined }).success,
    false,
    "the contract version is required, so the evidence names the clauses that were signed"
  );
  assert.equal(
    MutationSchema.safeParse({ ...deletionPayload, signature_format: "path/v9" }).success,
    false,
    "an unknown signature format is refused, so a client change cannot store a row nothing can read"
  );
  assert.equal(
    MutationSchema.safeParse({ ...deletionPayload, signature_payload: "A".repeat(8001) }).success,
    false,
    "a payload one byte over the cap is refused — the cap is what keeps a retained-for-years table bounded"
  );
  assert.equal(
    MutationSchema.safeParse({ ...deletionPayload, signer_full_name: "" }).success,
    false,
    "an empty name is not a signature"
  );

  // The format must not be write-only: what we store has to come back out as the same geometry, or the evidence
  // is unreadable and proving nothing.
  const decodedSignature = decodePath(SIGNED_PAYLOAD);
  assert.equal(decodedSignature.width, 600, "the canvas size travels with the gesture");
  assert.deepEqual(decodedSignature.points, SIGN_POINTS, "and the points round-trip exactly");
  console.log("contract: the schema requires a signed contract, and path/v1 round-trips");

  const actor = { id: unaffected.id, primary_email: "fine@example.invalid" };

  // Refused without the salt rather than half-done: a block we cannot reproduce would look enforced and be inert.
  const noSaltDeletion = await deleteAccount({}, anyDb, actor, deletionPayload);
  assert.equal(noSaltDeletion.status, 503, "deletion refuses without USER_BLOCK_SALT");
  // Asserted against the specific address rather than "nothing is blocked at all": the earlier phrasing used an
  // `||` whose first operand was already true at this point, so the real check never ran and the assertion could
  // not fail.
  assert.equal(
    db.scalar(
      "SELECT COUNT(*) AS n FROM user_blocks WHERE email_hash = ?",
      await hashBlockedEmail("fine@example.invalid", SALT)
    ).n,
    0,
    "and no block was written for that address"
  );

  // E6: an unsigned deletion is refused, and the refusal must not half-apply.
  const unsigned = await deleteAccount({ USER_BLOCK_SALT: SALT }, anyDb, actor, {
    action: "delete_account",
    confirm: "HAPUS AKUN SAYA",
    acknowledgement_version: DELETION_VERSION,
  });
  assert.equal(unsigned.status, 400, "a deletion without the signed contract is refused");
  assert.equal((await unsigned.json()).error, "CONTRACT_REQUIRED", "with a code the page can act on");
  assert.equal(
    (await getD1UserByClerkId(anyDb, "clerk_fine_1"))?.status,
    "active",
    "and nothing was blocked, so a refused attempt leaves the account usable"
  );
  console.log("contract: an unsigned deletion is refused without changing anything");

  // A live paid membership, so the forfeiture has something real to apply to rather than testing against nothing.
  await recordMembershipEvent(anyDb, {
    userId: unaffected.id,
    status: "premium",
    reason: "test_seed",
    siteId: "site_franchisor_id",
  });

  const deletion = await deleteAccount({ USER_BLOCK_SALT: SALT }, anyDb, actor, deletionPayload);
  const deletionBody = await deletion.json();
  assert.equal(deletion.status, 200, "with a salt the request succeeds");
  assert.equal(deletionBody.blocked, true, "the account is blocked");
  assert.equal(
    deletionBody.erased,
    true,
    "and the response says the data was actually erased — the copy promised it, so the outcome has to match"
  );

  const fineHash = await hashBlockedEmail("fine@example.invalid", SALT);
  assert.equal(
    db.scalar("SELECT acknowledgement_version FROM user_blocks WHERE email_hash = ?", fineHash).acknowledgement_version,
    DELETION_VERSION,
    "the version of the consequence text the person agreed to is recorded on the block"
  );
  assert.equal(
    await getCurrentUserStatus(anyDb, unaffected.id),
    "blocked",
    "and the status timeline records the block"
  );

  // E6: the evidence survives, and the forfeiture actually ends the entitlement.
  const consent = db.scalar(
    "SELECT signer_full_name, contract_version, acknowledgement_version, membership_status_at_signing, signature_format FROM account_erasure_consents WHERE user_id = ?",
    unaffected.id
  );
  assert.ok(consent, "the signed contract is retained — the deliberate, disclosed exception to erasure");
  assert.equal(consent.signature_format, "path/v1", "stored as a gesture rather than a picture");
  assert.equal(consent.contract_version, CONTRACT_VERSION, "naming which clauses were signed");
  assert.equal(consent.acknowledgement_version, DELETION_VERSION, "and which consequence text was on screen");
  assert.equal(consent.membership_status_at_signing, "premium", "and the entitlement the forfeiture applied to");
  assert.equal(
    await getCurrentMembership(anyDb, unaffected.id),
    "free",
    "and entitlement ends, instead of a deleted user still reading as Premium"
  );
  console.log("contract: the signed consent survives the erasure, and the forfeiture ends entitlement");

  // The point of all of it: the person cannot get back in.
  const reEntry = await upsertD1User(anyDb, clerkUser("clerk_fine_3", "fine@example.invalid"), {
    appKey: APP_B,
    blockSalt: SALT,
  })
    .then(() => null)
    .catch((error: any) => error);
  assert.equal(reEntry?.code, "ACCOUNT_BLOCKED", "and they cannot sign in again with that email");
  console.log("deletion: the account is blocked, the acknowledgement is recorded, and re-entry is refused");

  // 12. The erasure routine (0.7b), proven against the real schema.
  const plan = erasurePlan("usr_plan_only");
  const deletedTables = plan.deletes.map((entry: any) => entry.table);
  const unlinkedTables = plan.nulls.map((entry: any) => entry.table);

  // The assertion that matters most, and it is a negative one: a routine that deleted premium orders or the
  // membership timeline would look like a *thorough* erasure and be a disaster. Checked as a list so that adding
  // a table to the delete set is a deliberate act that shows up here.
  for (const keep of [
    "premium_orders",
    "premium_payment_confirmations",
    "franchise_subscriptions",
    "subscriptions",
    "user_membership_events",
    "user_status_events",
    "user_blocks",
    "franchise_claims",
    // The signed contract is the deliberate exception to erasure: retained on purpose, as evidence, and the
    // person is told so in the contract itself and in the consequence list. Guarded here so a future edit cannot
    // quietly add it to the delete set.
    "account_erasure_consents",
  ]) {
    assert.equal(deletedTables.includes(keep), false, `the erasure must never delete from ${keep}`);
  }
  // The guard that would have caught the worst bug in this routine: every column we set to NULL must actually be
  // nullable. Setting a `NOT NULL` column to NULL raises inside `db.batch`, which aborts the *entire* erasure and
  // leaves the person blocked but with all their data still present. Checking the whole list generically means a
  // future addition is caught here rather than in production.
  for (const entry of plan.nulls) {
    const info = db.rows(`SELECT name, "notnull" AS is_not_null FROM pragma_table_info('${entry.table}')`);
    const column = info.find((row: any) => row.name === entry.column);
    assert.ok(column, `${entry.table}.${entry.column} must exist`);
    assert.equal(
      Number(column.is_not_null),
      0,
      `${entry.table}.${entry.column} must be nullable — setting a NOT NULL column to NULL aborts the whole erasure`
    );
  }
  for (const entry of plan.deletes) {
    const info = db.rows(`SELECT name FROM pragma_table_info('${entry.table}')`);
    assert.ok(
      info.some((row: any) => row.name === entry.column),
      `${entry.table}.${entry.column} must exist`
    );
  }

  assert.ok(deletedTables.includes("user_identities"), "but it must delete the login identities");
  assert.ok(deletedTables.includes("franchisor_profiles"), "and the person's own profile");
  assert.ok(unlinkedTables.includes("audit_events"), "while unlinking actor pointers on records it keeps");
  console.log("erasure: deletes personal rows, keeps financial and audit rows, and never touches the block");

  // Now run one, against the real schema.
  const erasable = await upsertD1User(anyDb, clerkUser("clerk_erase_1", "erase@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });
  await blockAccount(anyDb, {
    userId: erasable.id,
    email: "erase@example.invalid",
    salt: SALT,
    requestSource: "self_service",
    acknowledgementVersion: DELETION_VERSION,
  });

  const beforeCounts = {
    orders: db.scalar("SELECT COUNT(*) AS n FROM premium_orders").n,
    membership: db.scalar("SELECT COUNT(*) AS n FROM user_membership_events").n,
    status: db.scalar("SELECT COUNT(*) AS n FROM user_status_events").n,
    assets: db.scalar("SELECT COUNT(*) AS n FROM franchise_assets").n,
  };

  const erased = await eraseAccount(anyDb, erasable.id);
  assert.equal(erased.placeholderEmail, erasedEmailPlaceholder(erasable.id), "the placeholder is per-user");

  // The shell: the row survives on purpose, because financial and audit rows point at it.
  const shell = db.scalar("SELECT id, status, clerk_user_id, primary_email, display_name FROM users WHERE id = ?", erased.userId);
  assert.ok(shell, "the users row is retained as a shell rather than deleted");
  assert.equal(shell.status, "deleted", "and marked deleted");
  assert.equal(
    shell.clerk_user_id,
    erasedClerkIdPlaceholder(erasable.id),
    "with its Clerk link overwritten — the column is NOT NULL, so it is tombstoned rather than cleared, which still means no real Clerk id can match it"
  );
  assert.equal(shell.primary_email, erasedEmailPlaceholder(erasable.id), "and its address replaced");

  // What the shell exists for: the records that must outlive the person still do.
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM premium_orders").n, beforeCounts.orders, "premium orders survive");
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM user_membership_events").n, beforeCounts.membership, "the membership timeline survives");
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM user_status_events").n, beforeCounts.status, "the status timeline survives");
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM franchise_assets").n, beforeCounts.assets, "and so do brand assets, which the brand half will handle");

  // What erasure is for.
  assert.equal(db.rows("SELECT id FROM user_identities WHERE user_id = ?", erasable.id).length, 0, "their identities are gone");
  assert.equal(await getD1UserByClerkId(anyDb, "clerk_erase_1"), null, "so the old Clerk id resolves to nobody");
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM user_blocks WHERE user_id = ? AND revoked_at IS NULL", erasable.id).n,
    1,
    "and the block is the one thing deliberately kept"
  );

  // Which means: erased, and still refused if they try to come back on the same address.
  const comeback = await upsertD1User(anyDb, clerkUser("clerk_erase_2", "erase@example.invalid"), {
    appKey: APP_B,
    blockSalt: SALT,
  })
    .then(() => null)
    .catch((error: any) => error);
  assert.equal(comeback?.code, "ACCOUNT_BLOCKED", "erasure does not reopen the door to the same address");
  console.log("erasure: identity gone, records retained, block intact, and return still refused");

  // 13. The brand half: only a *proven* owner's brand is removed.
  const brandUser = await upsertD1User(anyDb, clerkUser("clerk_brand_1", "brand@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });

  const insertBrand = (id: string, slug: string) =>
    anyDb
      .prepare("INSERT INTO franchises (id, owner_user_id, brand_name, slug, status) VALUES (?, ?, ?, ?, 'free')")
      .bind(id, brandUser.id, `Brand ${id}`, slug)
      .run();

  await insertBrand("fch_proven", "brand-proven");
  await insertBrand("fch_unproven", "brand-unproven");
  // Only one of the two has its ownership proven. That asymmetry is the entire point of the case.
  await anyDb
    .prepare("INSERT INTO franchise_claims (id, franchise_id, claimant_user_id, status) VALUES (?, ?, ?, 'approved')")
    .bind("clm_proven", "fch_proven", brandUser.id)
    .run();
  await anyDb
    .prepare(
      "INSERT INTO franchise_assets (id, franchise_id, uploaded_by_user_id, asset_type, r2_bucket, r2_key) VALUES (?, ?, ?, 'logo', 'franchise-assets', ?)"
    )
    .bind("ast_proven", "fch_proven", brandUser.id, "brands/proven/logo.png")
    .run();
  // Published to a site. Archiving the brand is NOT enough to stop it appearing: the directory query filters on
  // publication_status and never looks at franchises.status, so the publication has to be hidden explicitly.
  // The site id comes from the seeded schema rather than a literal, because the column is a foreign key.
  const seededSiteId = db.scalar("SELECT id FROM network_sites LIMIT 1")?.id ?? null;
  await anyDb
    .prepare(
      "INSERT INTO franchise_site_publications (id, franchise_id, site_id, slug, publication_status) VALUES (?, ?, ?, ?, 'published')"
    )
    .bind("pub_proven", "fch_proven", seededSiteId, "brand-proven")
    .run();

  const fakeBucket = {
    deleted: [] as string[],
    async delete(key: string) {
      this.deleted.push(key);
    },
  };

  const brandErasure = await eraseAccount(anyDb, brandUser.id, { bucket: fakeBucket });

  assert.deepEqual(
    brandErasure.brandsRemoved,
    ["fch_proven"],
    "only the brand whose ownership is proven is removed"
  );
  assert.deepEqual(
    brandErasure.brandsLeftStanding,
    ["fch_unproven"],
    "and the other is left standing, and reported rather than quietly kept — an oversight and a decision must look different"
  );

  const provenBrand = db.scalar("SELECT status, owner_user_id FROM franchises WHERE id = 'fch_proven'");
  assert.equal(provenBrand.status, "archived", "the proven brand is delisted");
  assert.equal(provenBrand.owner_user_id, null, "its owner link is dropped");
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM franchise_assets WHERE franchise_id = 'fch_proven'").n,
    0,
    "its media rows go"
  );
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM franchise_removals WHERE franchise_id = 'fch_proven'").n,
    1,
    "and a removal record explains why it is gone"
  );

  // The assertion that makes "berhenti tayang di seluruh situs jaringan" true rather than aspirational.
  assert.equal(
    db.scalar("SELECT publication_status FROM franchise_site_publications WHERE franchise_id = 'fch_proven'")
      .publication_status,
    "hidden",
    "its publication is hidden, because the directory reads that column and never looks at franchises.status"
  );
  assert.ok(
    String(
      db.scalar("SELECT previous_publications FROM franchise_removals WHERE franchise_id = 'fch_proven'")
        .previous_publications
    ).includes("published"),
    "with the prior publication state recorded, so an admin restore can put it back"
  );

  // The rule Syamsul set: owning a brand without having proven it is not enough to erase it.
  const standingBrand = db.scalar("SELECT status, owner_user_id FROM franchises WHERE id = 'fch_unproven'");
  assert.equal(standingBrand.status, "free", "a brand with no proven ownership is untouched");
  assert.equal(
    standingBrand.owner_user_id,
    brandUser.id,
    "still pointing at the owner, because ownership was never proven"
  );

  assert.deepEqual(fakeBucket.deleted, ["brands/proven/logo.png"], "the media object is deleted from the bucket");
  assert.equal(brandErasure.objectsDeleted, 1, "and counted");
  console.log("erasure: only a proven owner's brand is delisted, with its media; the rest is left and reported");

  // 14. E4: a failure to read block status must never read as "not blocked".
  const failingDb = {
    prepare() {
      throw new Error("D1_ERROR: internal error");
    },
  };

  const failOpenWithSalt = await upsertD1User(failingDb as any, clerkUser("clerk_e4a", "e4a@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  })
    .then(() => null)
    .catch((error: any) => error);
  assert.equal(
    failOpenWithSalt?.code,
    "BLOCK_STATUS_UNAVAILABLE",
    "an unreadable user_blocks must refuse the sign-in, not permit it — this guard runs before linking or creating"
  );
  assert.equal(failOpenWithSalt?.status, 503, "and it must be retryable rather than an authorization failure");

  // The same must hold on the no-salt path, where the "is anything blocked at all" probe is what failed.
  const failOpenNoSalt = await upsertD1User(failingDb as any, clerkUser("clerk_e4b", "e4b@example.invalid"), {
    appKey: APP_A,
  })
    .then(() => null)
    .catch((error: any) => error);
  assert.equal(
    failOpenNoSalt?.code,
    "BLOCK_STATUS_UNAVAILABLE",
    "a failed probe must not be read as an empty block table"
  );

  // And the ordinary case must still work: an empty table is not an error.
  assert.equal(
    await upsertD1User(anyDb, clerkUser("clerk_e4c", "e4c@example.invalid"), { appKey: APP_A, blockSalt: SALT })
      .then((user: any) => user.status)
      .catch((error: any) => error?.code),
    "active",
    "a genuinely empty user_blocks table still permits normal sign-in"
  );
  console.log("blocks: an unreadable block table fails closed, while an empty one still lets people in");

  // 15. E2: a failed erasure must never leave the person blocked with their data still present.
  const strandedUser = await upsertD1User(anyDb, clerkUser("clerk_e2", "e2@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });
  const blocksBefore = db.scalar("SELECT COUNT(*) AS n FROM user_blocks").n;

  const { statements: e2BlockStatements } = await blockAccountStatements(anyDb, {
    userId: strandedUser.id,
    email: "e2@example.invalid",
    salt: SALT,
    requestSource: "self_service",
    acknowledgementVersion: "test",
  });

  const explodingBatch = {
    prepare: (sql: string) => anyDb.prepare(sql),
    batch: async () => {
      throw new Error("D1_ERROR: batch failed");
    },
  };

  const stranded = await eraseAccount(explodingBatch as any, strandedUser.id, {
    homeSiteId: "site_franchisor_id",
    blockStatements: e2BlockStatements,
  })
    .then(() => null)
    .catch((error: any) => error);

  assert.ok(stranded, "a failed erasure batch propagates rather than reporting success");
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM user_blocks").n,
    blocksBefore,
    "and writes no block — because the block is in that same batch, a failure cannot strand someone blocked with their data intact"
  );
  assert.equal(
    (await getD1UserByClerkId(anyDb, "clerk_e2"))?.status,
    "active",
    "so they can still sign in and use the screen again"
  );
  console.log("erasure failure: nothing is blocked, so the person is never stranded");

  // 15b. F3/N3: the terminal events are inside the erasure batch, so a failure at either write rolls back the
  // whole erasure — not just the event. Production D1 batches atomically; node:sqlite runs them statement by
  // statement with no multi-statement transaction here, so the test proves the weaker guarantee instead: the
  // terminal statements are **present in the same batch array** as the erasure, positioned before the block, which
  // is exactly what atomicity commits together. A failure then cannot land the erasure while dropping the event.
  for (const failingTable of ["user_membership_events", "user_status_events"]) {
    const f3User = await upsertD1User(anyDb, clerkUser(`clerk_f3_${failingTable}`, `${failingTable}@example.invalid`), {
      appKey: APP_A,
      blockSalt: SALT,
    });
    await recordMembershipEvent(anyDb, { userId: f3User.id, status: "premium", reason: "test_seed", siteId: "site_franchisor_id" });

    const { statements: f3Block } = await blockAccountStatements(anyDb, {
      userId: f3User.id,
      email: `${failingTable}@example.invalid`,
      salt: SALT,
      requestSource: "self_service",
      acknowledgementVersion: "test",
    });
    // Capture the batch the erasure would commit, without committing it: fail on the terminal table.
    let captured: any[] | null = null;
    const captureDb = {
      prepare: (sql: string) => anyDb.prepare(sql),
      batch: async (statements: any[]) => {
        captured = statements;
        throw new Error(`D1_ERROR: injected ${failingTable} failure`);
      },
    };
    const f3Terminal = [
      membershipEventStatement(captureDb, { userId: f3User.id, status: "free", reason: "account_deleted", siteId: "site_franchisor_id" }),
      userStatusEventStatement(captureDb, f3User.id, "blocked", "test", f3User.id),
    ];
    const f3 = await eraseAccount(captureDb as any, f3User.id, {
      homeSiteId: "site_franchisor_id",
      blockStatements: f3Block,
      consentStatements: [],
      terminalStatements: f3Terminal,
    })
      .then(() => null)
      .catch((error: any) => error);

    assert.ok(f3, `a failure at ${failingTable} propagates rather than reporting success`);
    assert.ok(captured && captured.length > 0, "the erasure assembled its batch before failing");
    // The terminal statements travel inside the same batch array as the erasure and the block — that shared
    // array is the atomic unit, so a real batch either commits all of it or none of it.
    for (const terminal of f3Terminal) {
      assert.ok(captured.includes(terminal), `the ${failingTable} terminal event is in the erasure batch, not a later write`);
    }
    // The terminal writes come before the block write in batch order: with a non-transactional driver a failure
    // part-way still cannot leave the person blocked while their timeline was never moved.
    const terminalIndexes = f3Terminal.map((terminal) => captured.indexOf(terminal));
    const blockIndexes = f3Block.map((statement) => captured.indexOf(statement));
    assert.ok(
      Math.max(...terminalIndexes) < Math.min(...blockIndexes),
      "the terminal events precede the block in the batch"
    );
    // And because the batch never committed, nothing moved.
    assert.equal(
      (await getD1UserByClerkId(anyDb, `clerk_f3_${failingTable}`))?.status,
      "active",
      "so the person is untouched and can use the screen again"
    );
    assert.equal(
      await getCurrentMembership(anyDb, f3User.id),
      "premium",
      "and the effective membership is untouched rather than half-moved"
    );
    assert.equal(
      db.scalar("SELECT COUNT(*) AS n FROM user_blocks WHERE user_id = ?", f3User.id).n,
      0,
      "with no block left behind"
    );
  }
  console.log("erasure terminal events: both commit inside the erasure batch, before the block");

  // 16. E5: a failed object delete must leave a durable, retryable record rather than a lost log line.
  const cleanupUser = await upsertD1User(anyDb, clerkUser("clerk_e5", "e5@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });
  await anyDb
    .prepare("INSERT INTO franchises (id, owner_user_id, brand_name, slug, status) VALUES (?, ?, ?, ?, 'free')")
    .bind("fch_e5", cleanupUser.id, "Brand e5", "brand-e5")
    .run();
  await anyDb
    .prepare("INSERT INTO franchise_claims (id, franchise_id, claimant_user_id, status) VALUES (?, ?, ?, 'approved')")
    .bind("clm_e5", "fch_e5", cleanupUser.id)
    .run();
  await anyDb
    .prepare(
      "INSERT INTO franchise_assets (id, franchise_id, uploaded_by_user_id, asset_type, r2_bucket, r2_key) VALUES (?, ?, ?, 'logo', 'franchise-assets', ?)"
    )
    .bind("ast_e5", "fch_e5", cleanupUser.id, "brands/e5/logo.png")
    .run();

  const flakyBucket = {
    async delete(key: string) {
      if (key === "brands/e5/logo.png") throw new Error("R2 unavailable");
    },
  };

  const e5 = await eraseAccount(anyDb, cleanupUser.id, { bucket: flakyBucket, homeSiteId: "site_franchisor_id" });
  assert.equal(
    e5.cleanupPending,
    1,
    "a failed object delete is reported as pending rather than counted as success"
  );

  const queued = db.scalar(
    "SELECT status, attempts, last_error FROM asset_cleanup_outbox WHERE r2_key = ?",
    "brands/e5/logo.png"
  );
  assert.equal(queued.status, "failed_retryable", "and the key stays queued, which is what was missing before");
  assert.equal(queued.attempts, 1, "with the attempt recorded");
  assert.ok(String(queued.last_error || "").length > 0, "and the reason, so a retry is diagnosable");

  // Retrying is the point of the outbox.
  const drain = await drainAssetCleanup(anyDb, { delete: async () => undefined });
  assert.equal(drain.deleted, 1, "a retry clears it once the bucket recovers");
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM asset_cleanup_outbox WHERE status = 'failed_retryable'").n,
    0,
    "and nothing is left outstanding"
  );
  console.log("asset cleanup: a failed delete is durable and retryable, not a lost log line");

  // 17. E3: an address already owned by somebody else is refused BEFORE Clerk is touched.
  const emailOwner = await upsertD1User(anyDb, clerkUser("clerk_e3a", "e3-owner@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });
  const emailOther = await upsertD1User(anyDb, clerkUser("clerk_e3b", "e3-other@example.invalid"), {
    appKey: APP_B,
    blockSalt: SALT,
  });
  assert.ok(emailOwner && emailOther, "two people exist, in different Clerk applications");

  const conflict = await updateAccount(
    { CLERK_SECRET_KEY: "sk_test_not_a_real_key" },
    anyDb,
    {
      ...emailOther,
      clerk_user_id: "clerk_e3b",
      primary_email: "e3-other@example.invalid",
      roles: [],
      status: "active",
    },
    { email: "E3-OWNER@example.invalid", display_name: "Somebody Else" }
  );
  const conflictBody = await conflict.json();
  assert.equal(conflict.status, 409, "a taken address is refused with a conflict rather than a server error");
  assert.equal(conflictBody.error, "EMAIL_TAKEN", "with a code the client can act on");

  // The ordering is what is being asserted, and the unusable secret key is what proves it: had the code reached
  // Clerk first, that key would have thrown and this would not be a clean 409. Case is mixed above on purpose,
  // because the check has to be case-insensitive to match the unique index.
  assert.equal(
    db.scalar("SELECT primary_email FROM users WHERE id = ?", emailOther.id).primary_email,
    "e3-other@example.invalid",
    "and D1 is untouched"
  );
  console.log("email change: an address owned by somebody else is refused before Clerk is touched");

  // 17b. F5: changing to a blocked (erased) address is refused at the input, before Clerk is touched — with the
  // unusable secret key proving the ordering, the same way case 17 does for taken addresses.
  const blockedTargetUser = await upsertD1User(anyDb, clerkUser("clerk_blocked_target", "blocked-target@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });
  await blockAccount(anyDb, {
    userId: blockedTargetUser.id,
    email: "blocked-target@example.invalid",
    salt: SALT,
    reason: "test target block",
    requestSource: "admin",
    acknowledgementVersion: "test",
  });
  const blockedChange = await updateAccount(
    { CLERK_SECRET_KEY: "sk_test_not_a_real_key", USER_BLOCK_SALT: SALT },
    anyDb,
    {
      ...emailOther,
      clerk_user_id: "clerk_e3b",
      primary_email: "e3-other@example.invalid",
      roles: [],
      status: "active",
    },
    { email: "blocked-target@example.invalid", display_name: "Somebody Else" }
  );
  const blockedChangeBody = await blockedChange.json();
  assert.equal(blockedChange.status, 409, "a blocked address is refused with a conflict rather than a server error");
  assert.equal(blockedChangeBody.error, "EMAIL_BLOCKED", "with a code that names the block rather than a taken address");
  assert.equal(
    db.scalar("SELECT primary_email FROM users WHERE id = ?", emailOther.id).primary_email,
    "e3-other@example.invalid",
    "and D1 is untouched"
  );
  console.log("email change: a blocked address is refused before Clerk is touched");

  // 18. F2: a failed subscription lookup must not be read as "no subscription".
  const f2User = await upsertD1User(anyDb, clerkUser("clerk_f2", "f2@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });
  await recordMembershipEvent(anyDb, {
    userId: f2User.id,
    status: "premium",
    reason: "test_seed",
    siteId: "site_franchisor_id",
  });

  const seedSubscription = (id: string, franchiseId: string, userId: string, endsAt: string) =>
    anyDb
      .prepare(
        "INSERT INTO franchise_subscriptions (id, franchise_id, user_id, status, starts_at, ends_at) VALUES (?, ?, ?, 'active', datetime('now','-400 days'), ?)"
      )
      .bind(id, franchiseId, userId, endsAt)
      .run();
  const seedBrand = (id: string, slug: string, userId: string, status = "premium") =>
    anyDb
      .prepare("INSERT INTO franchises (id, owner_user_id, brand_name, slug, status) VALUES (?, ?, ?, ?, ?)")
      .bind(id, userId, `Brand ${id}`, slug, status)
      .run();

  // Two paid brands: one lapsed past grace, the second still live. That is the case the audit named — a paying
  // member who would lose network Premium because one query failed.
  await seedBrand("fch_f2a", "brand-f2a", f2User.id);
  await seedBrand("fch_f2b", "brand-f2b", f2User.id);
  await seedSubscription("sub_f2_lapsed", "fch_f2a", f2User.id, "2026-01-01 00:00:00");
  await seedSubscription("sub_f2_live", "fch_f2b", f2User.id, "2099-01-01 00:00:00");

  // Fails only the lookup that decides a downgrade. Everything else works, so the failure under test is
  // isolated. Broadened to every live-subscription lookup rather than just the per-user one: both repositories'
  // expiry paths must defer when their deciding read fails, and the per-franchise replacement check deserved the
  // same treatment — a failing first lookup must not fall through to the second behaving normally.
  const flakyLifecycleDb = {
    prepare(sql: string) {
      if (/FROM franchise_subscriptions/.test(sql) && /ends_at > CURRENT_TIMESTAMP/.test(sql)) {
        throw new Error("D1_ERROR: injected failure");
      }
      return anyDb.prepare(sql);
    },
    batch: (statements: any[]) => anyDb.batch(statements),
  };

  // Counted rather than filtered on a column name: this only needs to prove a record was written, and a guessed
  // column would make the assertion fail for the wrong reason.
  const auditCountBefore = db.scalar("SELECT COUNT(*) AS n FROM audit_events").n;

  const deferredExpiry = await expirePremiumAfterGrace(flakyLifecycleDb as any, { grace_period_days: 0 });
  assert.equal(deferredExpiry, 0, "the row is deferred rather than expired");
  assert.equal(
    db.scalar("SELECT status FROM franchise_subscriptions WHERE id = ?", "sub_f2_lapsed").status,
    "active",
    "so nothing was mutated, and the row is still eligible for the next run"
  );
  assert.equal(
    await getCurrentMembership(anyDb, f2User.id),
    "premium",
    "and a paying member whose second brand is still live keeps Premium instead of being downgraded by a failed query"
  );
  assert.ok(
    db.scalar("SELECT COUNT(*) AS n FROM audit_events").n > auditCountBefore,
    "and the deferral is recorded, rather than being silent like the fail-open it replaces"
  );

  // The retry is what makes deferring correct rather than merely safe.
  assert.equal(await expirePremiumAfterGrace(anyDb, { grace_period_days: 0 }), 1, "a retry expires the lapsed subscription");
  assert.equal(
    db.scalar("SELECT status FROM franchise_subscriptions WHERE id = ?", "sub_f2_lapsed").status,
    "expired",
    "and the row reaches its terminal state"
  );
  assert.equal(await getCurrentMembership(anyDb, f2User.id), "premium", "while the member stays Premium, because the second brand is still paid");
  console.log("expiry: a failed lookup defers the row instead of downgrading a paying member");

  // The other half: when it genuinely is the last live subscription, exactly one downgrade results — including
  // if the worker runs again after a partial failure.
  const lastUser = await upsertD1User(anyDb, clerkUser("clerk_f2c", "f2c@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });
  await recordMembershipEvent(anyDb, { userId: lastUser.id, status: "premium", reason: "test_seed", siteId: "site_franchisor_id" });
  await seedBrand("fch_f2c", "brand-f2c", lastUser.id);
  await seedSubscription("sub_f2_only", "fch_f2c", lastUser.id, "2026-01-01 00:00:00");

  await expirePremiumAfterGrace(anyDb, { grace_period_days: 0 });
  assert.equal(await getCurrentMembership(anyDb, lastUser.id), "free", "a lapsed last subscription ends entitlement");
  assert.equal(
    db.scalar(
      "SELECT COUNT(*) AS n FROM user_membership_events WHERE user_id = ? AND status = 'free' AND reason = 'expired'",
      lastUser.id
    ).n,
    1,
    "exactly one downgrade, because the event commits with the expiry rather than after it"
  );

  await expirePremiumAfterGrace(anyDb, { grace_period_days: 0 });
  assert.equal(
    db.scalar(
      "SELECT COUNT(*) AS n FROM user_membership_events WHERE user_id = ? AND status = 'free' AND reason = 'expired'",
      lastUser.id
    ).n,
    1,
    "and running again adds no second downgrade"
  );
  console.log("expiry: a last subscription downgrades exactly once, and re-running adds nothing");

  // 19. F1/N1: the outbox stores a binding label, but R2 needs the physical bucket — and absence is a body
  // shape, not a status. The shapes below are the live API's, verified 2026-09-28 with deletes of nonexistent
  // keys: the label answers HTTP 400 code 10005, a missing object in the real bucket answers HTTP 200
  // success:false code 10007, and neither is a 404.
  const cleanupDrain = await import("./asset-cleanup-drain.mjs");
  const restConfig = { account: "test-account", database: "test-db", token: "test-token", defaultBucket: "franchise-assets", limit: 50 };
  const jsonResponse = (status: number, body: any) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

  assert.equal(cleanupDrain.resolveBucket("FRANCHISE_ASSETS", "franchise-assets"), "franchise-assets", "the historical binding label maps to the physical bucket");
  assert.equal(cleanupDrain.resolveBucket("franchise-assets", "franchise-assets"), "franchise-assets", "the physical name passes through");
  assert.equal(cleanupDrain.resolveBucket("SOMETHING_ELSE", "franchise-assets"), null, "an unknown name resolves to nothing rather than being guessed");
  assert.equal(cleanupDrain.resolveBucket(null, "franchise-assets"), "franchise-assets", "a missing row value falls back to the configured default");

  // Same consumer, same fixture: a row holding the historical label and an object in the physical bucket.
  const r2Fetch = async (url: string, init: any) => {
    if (url.includes("/d1/database/")) return jsonResponse(200, { success: true, result: [{ results: [{ id: "row_1", r2_bucket: "FRANCHISE_ASSETS", r2_key: "brands/f1/logo.png" }] }] })();
    if (init?.method === "DELETE" && url.includes("/r2/buckets/franchise-assets/objects/")) {
      assert.ok(!url.includes("FRANCHISE_ASSETS"), "the label is never sent to R2 as a bucket name");
      return jsonResponse(200, { success: true, errors: [], messages: [], result: {} })();
    }
    return jsonResponse(200, { success: true, result: [{ results: [] }] })();
  };
  const f1Outcome = await cleanupDrain.drainOnce(restConfig as any, r2Fetch as any, () => {});
  assert.deepEqual(f1Outcome, { attempted: 1, deleted: 1, failed: 0 }, "the labelled row deletes the real object and closes");

  // The two absence shapes both close the row — the object is gone, which is the state we wanted.
  for (const [label, status, body] of [
    ["bare 404", 404, null],
    ["200 success:false 10007", 200, { success: false, errors: [{ code: 10007, message: "The specified key does not exist." }], messages: [], result: null }],
  ] as const) {
    const absenceFetch = async (url: string) => {
      if (url.includes("/d1/database/")) return jsonResponse(200, { success: true, result: [{ results: [{ id: "row_1", r2_bucket: "franchise-assets", r2_key: "brands/f1/logo.png" }] }] })();
      return jsonResponse(status, body)();
    };
    assert.deepEqual(
      await cleanupDrain.drainOnce(restConfig as any, absenceFetch as any, () => {}),
      { attempted: 1, deleted: 1, failed: 0 },
      `${label} counts as gone`
    );
  }

  // The wrong-bucket shape must NOT close the row: the object may still exist somewhere, and closing the only
  // retry record is how media outlives the account it belonged to. Unknown names never reach R2 at all.
  const invalidBucketFetch = async (url: string) => {
    if (url.includes("/d1/database/")) return jsonResponse(200, { success: true, result: [{ results: [{ id: "row_2", r2_bucket: "franchise-assets", r2_key: "brands/f1/logo.png" }] }] })();
    return jsonResponse(400, { success: false, errors: [{ code: 10005, message: "The specified bucket name is not valid." }], messages: [], result: null })();
  };
  assert.deepEqual(
    await cleanupDrain.drainOnce(restConfig as any, invalidBucketFetch as any, () => {}),
    { attempted: 1, deleted: 0, failed: 1 },
    "a 400/10005 stays queued with its code in the error"
  );
  const unknownBucketFetch = async (url: string) => {
    if (url.includes("/d1/database/")) return jsonResponse(200, { success: true, result: [{ results: [{ id: "row_3", r2_bucket: "NO_SUCH_BUCKET", r2_key: "brands/f1/logo.png" }] }] })();
    throw new Error("R2 must not be called for an unknown bucket");
  };
  assert.deepEqual(
    await cleanupDrain.drainOnce(restConfig as any, unknownBucketFetch as any, () => {}),
    { attempted: 1, deleted: 0, failed: 1 },
    "an unknown bucket name is requeued without ever calling R2"
  );
  console.log("asset drain: the label maps to the physical bucket, absence closes the row, and bucket errors stay queued");

  // 20. F4/N6: consent proof is structurally validated before anything destructive runs. A fabricated version or
  // a malformed gesture must fail at the schema, never reach the erasure batch.
  const { MutationSchema: ConsentSchema, CURRENT_ACKNOWLEDGEMENT_VERSION: CONSENT_ACK_VERSION, CURRENT_CONTRACT_VERSION: CONSENT_CONTRACT_VERSION } = await import("../functions/_profile-schemas.js");
  const { encodePath: testEncode, decodePath: testDecode } = await import("./render-signature.mjs");
  const validGesture = testEncode([[10, 10], [60, 40], [120, 90]], 300, 150);
  const consentBase = {
    action: "delete_account",
    confirm: "HAPUS AKUN SAYA",
    acknowledgement_version: CONSENT_ACK_VERSION,
    contract_version: CONSENT_CONTRACT_VERSION,
    signer_full_name: "Nama Lengkap",
    signature_format: "path/v1",
    signature_payload: validGesture,
    signature_point_count: 3,
  };
  assert.ok(ConsentSchema.safeParse(consentBase).success, "a valid current-version signature passes");
  assert.equal(
    testDecode(validGesture).points.length,
    3,
    "and the renderer reads back what the encoder wrote"
  );

  const badConsents: Array<[string, Record<string, unknown>]> = [
    ["fabricated contract version", { ...consentBase, contract_version: "2099-01-01.9" }],
    ["stale acknowledgement version", { ...consentBase, acknowledgement_version: "2026-01-01.1" }],
    ["malformed base64 gesture", { ...consentBase, signature_payload: "!!!not-base64!!!" }],
    ["truncated gesture", { ...consentBase, signature_payload: Buffer.from(validGesture, "base64").subarray(0, 5).toString("base64") }],
    ["point-count mismatch", { ...consentBase, signature_point_count: 7 }],
  ];
  // Oversized geometry: a canvas the renderer would allocate 32 767 × 32 767 × 4 bytes for.
  const hugeCanvas = Buffer.alloc(8);
  hugeCanvas.writeInt16LE(32767, 0);
  hugeCanvas.writeInt16LE(32767, 2);
  badConsents.push(["oversized canvas geometry", { ...consentBase, signature_payload: hugeCanvas.toString("base64"), signature_point_count: 1 }]);
  for (const [label, candidate] of badConsents) {
    assert.equal(
      ConsentSchema.safeParse(candidate).success,
      false,
      `${label} fails validation without any write`
    );
  }
  assert.throws(() => testDecode(hugeCanvas.toString("base64")), /canvas size/, "the renderer refuses the oversized canvas before allocating");
  assert.throws(() => testDecode("!!!not-base64!!!"), /whole number of points/, "the renderer refuses malformed input");
  console.log("consent: fabricated versions and malformed gestures fail before any destructive write");

  // 21. F2/N2: a sibling verified email must not walk back in after erasure. One person holding two verified
  // addresses arrives through two Clerk applications and links to one D1 user; erase on the first address, then
  // prove neither address can create or link a new D1 account — including through a fresh Clerk user id the block
  // hash has never seen.
  const twoEmailUser = await upsertD1User(anyDb, clerkPerson("clerk_two_a", "two-a@example.invalid", "two-b@example.invalid"), {
    appKey: APP_A,
    blockSalt: SALT,
  });
  await upsertD1User(anyDb, clerkPerson("clerk_two_b", "two-b@example.invalid", "two-a@example.invalid"), {
    appKey: APP_B,
    blockSalt: SALT,
  }).then(async (second) => {
    assert.equal(second.id, twoEmailUser.id, "the sibling address links to the same D1 user");
  });
  assert.deepEqual(appKeysOf(db, twoEmailUser.id).sort(), [APP_A, APP_B], "both identities are linked");

  const { statements: twoEmailBlock } = await blockAccountStatements(anyDb, {
    userId: twoEmailUser.id,
    email: "two-a@example.invalid",
    salt: SALT,
    requestSource: "self_service",
    acknowledgementVersion: "test",
    // Both verified addresses, as `deleteAccount` collects them from the live Clerk record. Blocking only the
    // arriving address would leave the sibling hash unblocked — and a fresh registration on it would pass the
    // hash check with no user id yet to match against.
    extraEmails: ["two-b@example.invalid"],
  });
  await eraseAccount(anyDb, twoEmailUser.id, {
    homeSiteId: "site_franchisor_id",
    blockStatements: twoEmailBlock,
    consentStatements: [],
    terminalStatements: [],
  });

  // The erased shell keeps its block rows pointing at the user id — one per verified address.
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM user_blocks WHERE user_id = ? AND revoked_at IS NULL", twoEmailUser.id).n,
    2,
    "a block row per verified address, all pointing at the erased person"
  );

  // Same Clerk identities, both addresses: refused.
  for (const address of ["two-a@example.invalid", "two-b@example.invalid"] as const) {
    const reentryA = await upsertD1User(anyDb, clerkPerson("clerk_two_a", address, "two-b@example.invalid"), { appKey: APP_A, blockSalt: SALT })
      .then(() => null)
      .catch((error: any) => error);
    assert.equal(reentryA?.code, "ACCOUNT_BLOCKED", `the erased address ${address} stays blocked on its own identity`);
    const reentryB = await upsertD1User(anyDb, clerkPerson("clerk_two_b", address, "two-a@example.invalid"), { appKey: APP_B, blockSalt: SALT })
      .then(() => null)
      .catch((error: any) => error);
    assert.equal(reentryB?.code, "ACCOUNT_BLOCKED", `the erased address ${address} stays blocked on the sibling identity`);
  }

  // Fresh Clerk user ids — no identity row, no hash the block has seen — on both addresses: still refused.
  // The arriving address matches the erased shell's former email, so the email-link path finds the shell's user
  // id — and the person check refuses it. Without the user-id check, the hash of the *other* address would be the
  // only signal, and it would not match.
  for (const [clerkId, address, app] of [
    ["clerk_two_c", "two-a@example.invalid", APP_A],
    ["clerk_two_d", "two-b@example.invalid", APP_B],
  ] as const) {
    const fresh = await upsertD1User(anyDb, clerkUser(clerkId, address), { appKey: app, blockSalt: SALT })
      .then(() => null)
      .catch((error: any) => error);
    assert.equal(fresh?.code, "ACCOUNT_BLOCKED", `a fresh identity on ${address} is still refused`);
  }
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM users WHERE primary_email IN ('two-a@example.invalid', 'two-b@example.invalid')").n,
    0,
    "and no new D1 account was created for either address"
  );
  console.log("two-address erasure: neither the erased nor the sibling address can return, on any identity");

  console.log(
    "Auth status checks passed against the real schema: one D1 user reachable from two Clerk applications, " +
      "home identity never overwritten, suspensions and deletions authoritative, grants only when active."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
