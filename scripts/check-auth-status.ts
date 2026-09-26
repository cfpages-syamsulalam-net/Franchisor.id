import assert from "node:assert/strict";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { assertActiveD1User, markD1UserDeleted, upsertD1User } from "../functions/_clerk-auth.js";

/**
 * Identity-status regression test.
 *
 * Guards one rule: losing access is an administrator's decision, never a side effect of signing in. An earlier
 * revision of the Franchisor.id resolver forced `status = 'active'` on both existing-row paths, so a suspended
 * or deleted account could reinstate itself — roles and email role grants included — just by signing in.
 *
 * The sibling `check-auth-outage.ts` asserted this in one repository only and was wired into nothing, which is
 * why the drift went unnoticed. This file is intentionally identical in both repositories and is referenced
 * from package.json, so it actually runs.
 *
 * Deliberately does NOT assert how the row is re-bound across Clerk applications. That behaviour changes when
 * the shared `user_identities` table lands, and only the status invariant must hold before and after.
 */

const GRANT_EMAIL = "grants@example.invalid";

class AuthStatusDb {
  users = new Map<string, any>();
  executed: string[] = [];
  grants = [{ id: "grant1", role: "franchisor", scope_type: "network", scope_id: "network", site_id: null }];

  /** Index into `executed`, so a scenario can assert only on the SQL it caused. */
  mark(): number {
    return this.executed.length;
  }

  since(index: number): string[] {
    return this.executed.slice(index);
  }

  prepare(sql: string) {
    this.executed.push(sql);
    let values: any[] = [];
    return {
      bind: (...args: any[]) => {
        values = args;
        return this.statement(sql, () => values);
      },
      ...this.statement(sql, () => values),
    } as any;
  }

  private statement(sql: string, getValues: () => any[]) {
    return {
      first: async () => {
        const values = getValues();
        if (sql.includes("WHERE clerk_user_id = ?")) {
          return [...this.users.values()].find((user) => user.clerk_user_id === values[0]) || null;
        }
        if (sql.includes("WHERE lower(primary_email) = ?")) {
          return (
            [...this.users.values()].find(
              (user) => (user.primary_email || "").toLowerCase() === values[0]
            ) || null
          );
        }
        return null;
      },
      all: async () => {
        const values = getValues();
        if (sql.includes("email_role_grants")) {
          // Mirror the real filtered query: only the granting address has rows, so a user without a grant is a
          // genuine negative case rather than a mock artefact.
          return values[0] === GRANT_EMAIL
            ? { results: this.grants.map((grant) => ({ ...grant })) }
            : { results: [] };
        }
        return { results: [] };
      },
      run: async () => {
        const values = getValues();
        if (sql.includes("SET status = 'deleted'")) {
          const user = [...this.users.values()].find((candidate) => candidate.clerk_user_id === values[0]);
          if (user) user.status = "deleted";
        } else if (sql.includes("SET primary_email = ?")) {
          const user = this.users.get(values.at(-1));
          if (user) {
            user.primary_email = values[0];
            user.display_name = values[1];
          }
        } else if (sql.includes("SET clerk_user_id = ?")) {
          const user = this.users.get(values.at(-1));
          if (user) {
            user.clerk_user_id = values[0];
            user.primary_email = values[1];
            user.display_name = values[2];
          }
        } else if (sql.includes("INSERT INTO users")) {
          this.users.set(values[0], {
            id: values[0],
            clerk_user_id: values[1],
            primary_email: values[2],
            display_name: values[3],
            status: "active",
          });
        }
        return {};
      },
    };
  }
}

/**
 * Records whether role-grant SQL actually ran. Keyed on *writes*, not on the lookup: `applyEmailRoleGrants`
 * always issues its SELECT, so counting the lookup would make every negative assertion below unable to fail.
 */
function appliedRoleGrants(statements: string[]): boolean {
  return statements.some(
    (sql) => sql.includes("INSERT OR IGNORE INTO user_roles") || sql.includes("UPDATE email_role_grants")
  );
}

const clerkUser = (id: string, email: string) => ({
  id,
  emailAddresses: [{ id: "email1", emailAddress: email, verification: { status: "verified" } }],
  primaryEmailAddressId: "email1",
});

async function checkIdentityStatus() {
  const db = new AuthStatusDb();

  // A brand-new identity is active, and its pre-granted email roles are applied. Asserting the positive case
  // keeps the negative assertions below from being vacuously true.
  const beforeCreate = db.mark();
  const created = await upsertD1User(db as any, clerkUser("new-user", "new@example.invalid"));
  assert.equal(created.status, "active", "a new Clerk user starts active");
  assertActiveD1User(created);
  assert.equal(appliedRoleGrants(db.since(beforeCreate)), false, "no email grant exists for this address");

  const beforeGranted = db.mark();
  await upsertD1User(db as any, clerkUser("granted-user", GRANT_EMAIL));
  assert.equal(
    appliedRoleGrants(db.since(beforeGranted)),
    true,
    "an active user's pre-granted email roles are applied (proves the grant assertion can fail)"
  );

  // Suspension survives a sign-in, and no grant SQL runs for a non-active row.
  db.users.set("suspended-id", {
    id: "suspended-id",
    clerk_user_id: "suspended-user",
    primary_email: GRANT_EMAIL,
    display_name: "Suspended",
    status: "suspended",
  });
  const beforeSuspended = db.mark();
  const suspended = await upsertD1User(db as any, clerkUser("suspended-user", GRANT_EMAIL));
  assert.equal(suspended.status, "suspended", "Clerk sync must preserve a suspended status");
  await assert.rejects(
    async () => assertActiveD1User(suspended),
    (error: any) => error.code === "ACCOUNT_INACTIVE"
  );
  assert.equal(
    appliedRoleGrants(db.since(beforeSuspended)),
    false,
    "a suspended account must not have email role grants applied"
  );
  assert.equal(
    db.since(beforeSuspended).some((sql) => sql.includes("UPDATE users") && sql.includes("status=")),
    false,
    "no UPDATE during resolution may write status"
  );

  // Deletion survives a sign-in.
  db.users.set("deleted-id", {
    id: "deleted-id",
    clerk_user_id: "deleted-user",
    primary_email: "deleted@example.invalid",
    display_name: "Deleted",
    status: "active",
  });
  await markD1UserDeleted(db as any, "deleted-user");
  const deleted = await upsertD1User(db as any, clerkUser("deleted-user", "deleted@example.invalid"));
  assert.equal(deleted.status, "deleted", "a later Clerk update must not revive a deleted user");
  await assert.rejects(
    async () => assertActiveD1User(deleted),
    (error: any) => error.code === "ACCOUNT_INACTIVE"
  );

  // The cross-application case this whole design exists for: the same verified email arriving from a second
  // Clerk application must resolve to the same row and inherit its status, not reset it.
  db.users.set("shared-id", {
    id: "shared-id",
    clerk_user_id: "app-a-user",
    primary_email: "shared@example.invalid",
    display_name: "Shared",
    status: "suspended",
  });
  const beforeSecondApp = db.mark();
  const secondApp = await upsertD1User(db as any, clerkUser("app-b-user", "shared@example.invalid"));
  assert.equal(secondApp.id, "shared-id", "a second application resolves to the same D1 user row");
  assert.equal(
    secondApp.status,
    "suspended",
    "signing in from a second Clerk application must not clear a suspension"
  );
  assert.equal(
    db.since(beforeSecondApp).some((sql) => sql.includes("UPDATE users") && sql.includes("status=")),
    false,
    "a second application's sign-in must not write status"
  );
  assert.equal(
    appliedRoleGrants(db.since(beforeSecondApp)),
    false,
    "a second application's sign-in must not apply email role grants to a non-active account"
  );

  console.log(
    "Auth status checks passed: new identities are active, suspensions and deletions survive a sign-in from " +
      "either Clerk application, and email role grants are applied only to active accounts."
  );
}

checkIdentityStatus().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
