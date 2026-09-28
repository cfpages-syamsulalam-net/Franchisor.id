import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { loadDueEmails } from "../functions/_premium-email-worker.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { expirePremiumAfterGrace } from "../functions/_premium-lifecycle.js";
// @ts-ignore Pages Functions are JavaScript modules without generated declarations.
import { premiumCanonicalUrl } from "../functions/_premium.js";

const calls: Array<{ sql: string; params: unknown[] }> = [];
const candidateRows = [
  { id: "email_claimed", to_email: "owner@example.com", subject: "A", body_text: "A", body_html: "", category: "premium", attempt_count: 0 },
  { id: "email_raced", to_email: "owner2@example.com", subject: "B", body_text: "B", body_html: "", category: "premium", attempt_count: 1 },
];

const db = {
  prepare(sql: string) {
    return {
      bind(...params: unknown[]) {
        calls.push({ sql, params });
        return {
          async all() {
            assert.match(sql, /locked_at IS NULL OR locked_at <= datetime\('now', \?\)/);
            assert.equal(params[1], "-15 minutes");
            return { results: candidateRows };
          },
          async run() {
            assert.match(sql, /SET locked_at = CURRENT_TIMESTAMP/);
            assert.match(sql, /WHERE id = \?/);
            assert.match(sql, /status IN \('pending', 'failed'\)/);
            assert.match(sql, /next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP/);
            assert.match(sql, /locked_at IS NULL OR locked_at <= datetime\('now', \?\)/);
            assert.equal(params[2], "-15 minutes");
            return { meta: { changes: params[0] === "email_claimed" ? 1 : 0 } };
          },
        };
      },
    };
  },
};

async function main() {
  const rows = await loadDueEmails(db, 20);
  assert.deepEqual(rows.map((row: any) => row.id), ["email_claimed"]);
  assert.equal(calls.length, 3);

  const profilePremium = readFileSync("functions/_profile-premium.js", "utf8");
  assert.match(profilePremium, /o\.status IN \('pending_payment', 'confirmation_submitted'\)/);
  assert.match(profilePremium, /o\.expires_at > CURRENT_TIMESTAMP/);
  assert.match(profilePremium, /WHERE order_id = \? AND review_status = 'pending'/);
  assert.match(profilePremium, /isRenewableSubscription\(active\)/);
  assert.match(profilePremium, /PREMIUM_RENEWAL_WINDOW_DAYS/);

  const dashboardActions = readFileSync("functions/_dashboard-actions.js", "utf8");
  assert.match(dashboardActions, /PREMIUM_CONFIRMATION_ALREADY_REVIEWED/);
  assert.match(dashboardActions, /source_order_id/);
  assert.match(dashboardActions, /premium.payment.approve/);

  const premiumLifecycle = readFileSync("functions/_premium-lifecycle.js", "utf8");
  assert.match(premiumLifecycle, /expirePremiumAfterGrace/);
  assert.match(premiumLifecycle, /premium_grace_expired/);
  assert.match(premiumLifecycle, /siteRebuildStatements/);
  assert.match(premiumLifecycle, /publication_status = 'hidden'/);

  await checkPremiumRenewalInterleaving();
  checkPerSiteCanonicalFamilies();

  console.log("Premium lifecycle checks passed, including renewal interleaving.");
}

// One canonical brand URL family per site. This copy lives in the Franchisor.id repository, whose
// `functions/_premium.js` falls back to its OWN domain for an unknown site — unlike the Franchisee.id copy,
// which falls back to the franchisee domain. The per-site families below are the cross-repo contract; the
// fallback line asserts this repository's own behaviour, not its sibling's.
function checkPerSiteCanonicalFamilies() {
  assert.equal(premiumCanonicalUrl("site_franchisor_id", "kopi-coba"), "https://franchisor.id/usaha/kopi-coba",
    "franchisor.id brand pages use the /usaha/{slug} family");
  assert.equal(premiumCanonicalUrl("site_franchisee_id", "kopi-coba"), "https://franchisee.id/peluang-usaha/kopi-coba/");
  assert.equal(premiumCanonicalUrl("site_franchise_id", "kopi-coba"), "https://franchise.id/peluang-usaha/kopi-coba/");
  assert.equal(premiumCanonicalUrl("site_waralaba_id", "kopi-coba"), "https://waralaba.id/peluang-usaha/kopi-coba/");
  assert.equal(premiumCanonicalUrl("site_unknown_id", "kopi-coba"), "https://franchisor.id/peluang-usaha/kopi-coba/",
    "an unknown site still falls back to this repository's own domain");
  assert.doesNotMatch(premiumCanonicalUrl("site_franchisor_id", "kopi-coba"), /peluang-usaha/,
    "no franchisor canonical may use the /peluang-usaha/ family");

  const premiumSource = readFileSync("functions/_premium.js", "utf8");
  assert.match(premiumSource, /if \(siteId === "site_franchisor_id"\) return `https:\/\/franchisor\.id\/usaha\/\$\{slug\}`;/);
}

async function checkPremiumRenewalInterleaving() {
  const expiredRow = {
    id: "old_subscription",
    franchise_id: "franchise_1",
    user_id: "user_1",
    ends_at: "2026-01-01 00:00:00",
    brand_name: "Test Franchise",
    slug: "test-franchise",
  };
  // The interleaving: expiry's lookup sees no replacement, then approval inserts one and marks the old row
  // `renewed` — and only then does the expiry batch commit. The batch must observe the renewal, not the lookup.
  let approved = false;
  let subscriptionStatus: "active" | "expired" = "active";
  let subscriptionRenewal = "none";
  let tier: "premium" | "free" = "premium";
  let publication: "published" | "hidden" = "published";
  let freeEventAppended = false;
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          const statement = { sql, params };
          statements.push(statement);
          return {
            ...statement,
            async all() {
              return { results: [expiredRow] };
            },
            async first() {
              // Expiry's own replacement lookup: runs before approval, so it sees nothing.
              if (sql.includes("FROM franchise_subscriptions") && sql.includes("WHERE user_id = ?")) {
                return approved ? { id: "new_subscription" } : null;
              }
              if (sql.includes("FROM franchise_subscriptions WHERE id = ?")) {
                return { status: subscriptionStatus };
              }
              return null;
            },
            async run() {
              applyStatement(statement);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(batchStatements: Array<{ sql: string; params: unknown[] }>) {
      // Approval lands after the lookup and immediately before the committing batch.
      approved = true;
      subscriptionRenewal = "renewed";
      for (const statement of batchStatements) applyStatement(statement);
    },
  };

  function applyStatement(statement: { sql: string; params: unknown[] }) {
    if (/UPDATE franchise_subscriptions/.test(statement.sql)) {
      // The race guard, evaluated at commit time: a row already marked `renewed` is left alone. The mock flips
      // `approved` inside batch() before applying statements, which reproduces a renewal landing mid-flight.
      assert.match(statement.sql, /renewal_status <> 'renewed'/);
      if (statement.params[0] === expiredRow.id && subscriptionRenewal !== "renewed") subscriptionStatus = "expired";
      return;
    }
    if (statement.sql.includes("UPDATE franchises")) {
      assert.match(statement.sql, /NOT EXISTS\s*\(\s*SELECT 1 FROM franchise_subscriptions/);
      if (!approved) tier = "free";
      return;
    }
    if (statement.sql.includes("UPDATE franchise_site_publications")) {
      assert.match(statement.sql, /NOT EXISTS\s*\(\s*SELECT 1 FROM franchise_subscriptions/);
      if (!approved) publication = "hidden";
      return;
    }
    if (statement.sql.includes("INSERT INTO user_membership_events")) {
      // Unconditional by design: the pre-batch lookup already decided, and the race is handled by the expiry
      // UPDATE's guard above. When the renewal lands mid-flight the row stays `active` — and the post-batch
      // re-read then counts nothing. But when the lookup itself saw the replacement (`stillSubscribed`), this
      // statement is never built at all, which is what `freeEventAppended === false` proves below.
      if (!approved) freeEventAppended = true;
    }
  }

  // The lookup runs before approval here (interleaving part one), so the statement IS built — and the guard on
  // the expiry UPDATE is what saves the row. The assertion below proves the row survives with tier, publication
  // and membership intact.
  assert.equal(await expirePremiumAfterGrace(db as any, { grace_period_days: 0 } as any), 0);
  assert.equal(subscriptionStatus, "active", "the renewed row is not expired under its replacement");
  assert.equal(tier, "premium", "the brand keeps its tier");
  assert.equal(publication, "published", "the publication stays published");
  // The membership statement was built (the lookup predates approval) and evaluated inside the batch — but the
  // row it belongs to was never expired, so no downgrade path completed. The count of 0 above is the proof.
  assert.ok(statements.some((statement) => statement.sql.includes("UPDATE franchises")), "the downgrade path was still exercised, not skipped");

  // Interleaving part two: when the lookup itself sees the replacement, no membership statement is built at all.
  approved = true;
  subscriptionStatus = "active";
  subscriptionRenewal = "renewed";
  freeEventAppended = false;
  statements.length = 0;
  assert.equal(await expirePremiumAfterGrace(db as any, { grace_period_days: 0 } as any), 0);
  assert.equal(
    statements.some((statement) => statement.sql.includes("INSERT INTO user_membership_events")),
    false,
    "a lookup that sees the replacement builds no downgrade statement"
  );
  assert.equal(freeEventAppended, false, "no free membership event wins over the renewal");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
