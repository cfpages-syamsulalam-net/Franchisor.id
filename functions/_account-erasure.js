/**
 * Account erasure — plan step 0.7b, mapped against the live schema in the plan's §5.6b.
 *
 * This is not a mass delete, and not by preference. Three constraints fix the shape:
 *
 *   1. `franchise_submission_reviews.applicant_user_id` is NOT NULL with no ON DELETE, so a `users` row cannot be
 *      deleted once such a review exists. That table has 0 rows today, which is exactly why a routine that only
 *      worked while it was empty would pass its own test and then break in production.
 *   2. Letting `ON DELETE CASCADE` run would take `premium_orders`, `premium_payment_confirmations`,
 *      `franchise_subscriptions` and both event timelines — the financial and audit records we are obliged to
 *      keep, and the membership history the whole premium design depends on.
 *   3. The ownership-proof rows are what make brand removal trustworthy.
 *
 * So three different things happen to three kinds of row:
 *
 *   - **Content that is only theirs** is deleted.
 *   - **Pointers that say "this person acted"** are nulled, so the record survives without the name.
 *   - **The `users` row becomes an anonymous shell**, never deleted. That single step is what makes the rest
 *     tractable: every foreign key still pointing at it — orders, confirmations, subscriptions, both timelines,
 *     the ownership proofs — stops being personal data, because the row it references identifies nobody.
 *
 * `user_blocks` is deliberately not touched. It is the one thing we keep on purpose: a salted hash, a reason and
 * a timestamp, which is what refuses their return.
 *
 * **Not yet covered, and therefore not yet wired into `deleteAccount`:** the brand half (delist a proven owner's
 * brand, blank its contact details, drop `franchises.owner_user_id`) and the R2 objects. Wiring this without
 * those would make the deletion screen's promises *less* true, not more, so it stays unwired until they land.
 */

/**
 * Rows that exist only because of this person, and that no financial or audit obligation needs.
 * Each entry is [table, column]. Both are verified against the live database, not inferred.
 */
const PERSONAL_TABLES = [
  ["user_identities", "user_id"],
  ["user_roles", "user_id"],
  ["franchisee_profiles", "user_id"],
  ["franchisor_profiles", "user_id"],
  ["franchise_saved_opportunities", "user_id"],
  ["staff_google_connections", "user_id"],
  ["staff_google_oauth_states", "user_id"],
  ["premium_notifications", "user_id"],
  ["premium_grace_notifications", "user_id"],
  ["premium_subscription_reminders", "user_id"],
  ["premium_annual_reports", "user_id"],
  ["notification_email_queue", "user_id"],
];

/**
 * Pointers sitting on records we keep. The record survives; the name attached to it does not.
 * Each entry is [table, column].
 */
const ACTOR_POINTERS = [
  ["audit_events", "actor_user_id"],
  ["email_role_grants", "applied_user_id"],
  ["franchise_product_events", "user_id"],
  ["franchise_quality_checks", "reviewer_user_id"],
  ["franchise_removals", "requested_by_user_id"],
  ["franchise_removals", "revoked_by_user_id"],
  ["listing_edit_suggestions", "suggested_by_user_id"],
  ["listing_edit_suggestions", "reviewed_by_user_id"],
  ["listing_outreach_events", "staff_user_id"],
  ["listing_outreach_statuses", "assigned_staff_user_id"],
  ["ocr_batch_runs", "requested_by_user_id"],
  ["ocr_jobs", "requested_by_user_id"],
  ["ocr_provider_configs", "updated_by_user_id"],
  ["ocr_run_leases", "owner_user_id"],
  ["ocr_scheduler_configs", "updated_by_user_id"],
  ["premium_funnel_events", "user_id"],
  ["premium_payment_confirmations", "reviewed_by_user_id"],
  ["premium_settings", "updated_by_user_id"],
  ["site_rebuild_requests", "requested_by_user_id"],
  ["user_membership_events", "recorded_by_user_id"],
  ["user_status_events", "actor_user_id"],
];

/** The address written over the real one. Unique per user, so the partial email index stays satisfied. */
export function erasedEmailPlaceholder(userId) {
  return `deleted+${userId}@deleted.invalid`;
}

/**
 * The value written over `clerk_user_id`.
 *
 * Not NULL, because the column is `NOT NULL UNIQUE` and rewriting a SQLite table to relax that would be a far
 * larger operation than this problem deserves. A per-user tombstone value is unique, satisfies the constraint,
 * and cannot ever equal a real Clerk user id — so the owning application can no longer resolve this row, which is
 * the entire point.
 */
export function erasedClerkIdPlaceholder(userId) {
  return `deleted:${userId}`;
}

/**
 * The statements an erasure consists of, as data rather than side effects.
 *
 * Exposed separately so a test can assert the shape — which tables are touched, and in which way — without
 * running anything. A test that can only observe a database afterwards cannot tell a missing table from a table
 * that happened to be empty.
 */
export function erasurePlan(userId) {
  return {
    deletes: PERSONAL_TABLES.map(function (entry) {
      return { table: entry[0], column: entry[1], sql: `DELETE FROM ${entry[0]} WHERE ${entry[1]} = ?` };
    }),
    nulls: ACTOR_POINTERS.map(function (entry) {
      return {
        table: entry[0],
        column: entry[1],
        sql: `UPDATE ${entry[0]} SET ${entry[1]} = NULL WHERE ${entry[1]} = ? AND ${entry[1]} IS NOT NULL`,
      };
    }),
  };
}

/**
 * Erase a person while keeping the business records that point at them.
 *
 * Runs as a single D1 batch, so a failure part-way leaves nothing half-erased — a person whose identities are
 * gone but whose profile is not is a worse state than either extreme.
 *
 * Only columns confirmed to exist on the live database are written. In particular this does not guess at a
 * `deleted_at` column: recording the status transition is the caller's job, through `recordUserStatusEvent`.
 */
export async function eraseAccount(db, userId) {
  if (!userId) {
    throw new Error("eraseAccount butuh userId.");
  }

  const plan = erasurePlan(userId);
  const placeholderEmail = erasedEmailPlaceholder(userId);

  const statements = [
    ...plan.deletes.map((entry) => db.prepare(entry.sql).bind(userId)),
    ...plan.nulls.map((entry) => db.prepare(entry.sql).bind(userId)),
    // The shell. `clerk_user_id` must be overwritten, not cleared: the column is `NOT NULL`, so NULL is rejected
    // (learned from a failing test, not from reading the migration — migration 0001 says `NOT NULL UNIQUE`).
    db
      .prepare(
        `UPDATE users
         SET status = 'deleted', clerk_user_id = ?, primary_email = ?, display_name = 'Akun dihapus'
         WHERE id = ?`
      )
      .bind(erasedClerkIdPlaceholder(userId), placeholderEmail, userId),
  ];

  await db.batch(statements);

  return { userId, placeholderEmail, deletedFrom: plan.deletes.length, unlinkedFrom: plan.nulls.length };
}
