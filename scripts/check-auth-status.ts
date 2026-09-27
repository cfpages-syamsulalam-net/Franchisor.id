import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import {
  assertActiveD1User,
  blockAccount,
  getCurrentMembership,
  getCurrentUserStatus,
  getD1UserByClerkId,
  hashBlockedEmail,
  markD1UserDeleted,
  recordMembershipEvent,
  unblockAccount,
  upsertD1User,
} from "../functions/_clerk-auth.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { eraseAccount, erasurePlan, erasedEmailPlaceholder, erasedClerkIdPlaceholder } from "../functions/_account-erasure.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { deleteAccount } from "../functions/_profile-account.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { MutationSchema } from "../functions/_profile-schemas.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { expirePremiumAfterGrace } from "../functions/_premium-lifecycle.js";

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

  // A block also follows the person, not only the address. Somebody who changes their email in Clerk after being
  // blocked still carries the block on their user id, which is why both checks are needed.
  await upsertD1User(anyDb, clerkUser("clerk_grant_1", "changed@example.invalid"), { appKey: APP_A, blockSalt: SALT });
  const blockedUser = await getD1UserByClerkId(anyDb, "clerk_grant_1");
  assert.equal(blockedUser?.status, "blocked", "the person resolves as blocked even though their address changed");
  await assert.rejects(
    async () => assertActiveD1User(blockedUser),
    (error: any) => error.code === "ACCOUNT_BLOCKED"
  );
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
  const DELETION_VERSION = "2026-09-27.1";
  const deletionPayload = {
    action: "delete_account",
    confirm: "HAPUS AKUN SAYA",
    acknowledgement_version: DELETION_VERSION,
  };

  assert.equal(MutationSchema.safeParse(deletionPayload).success, true, "the exact phrase plus a version is accepted");
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
  console.log("deletion: the confirmation phrase and the acknowledgement version are both required");

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

  console.log(
    "Auth status checks passed against the real schema: one D1 user reachable from two Clerk applications, " +
      "home identity never overwritten, suspensions and deletions authoritative, grants only when active."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
