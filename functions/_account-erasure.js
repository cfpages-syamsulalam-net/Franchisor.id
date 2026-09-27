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
 * **Wired into `deleteAccount`**, which blocks the account first and then calls this, so a failed erasure still
 * leaves the person unable to sign in. The brand half handles only a **proven** owner; anything left standing is
 * reported back so a decision and an oversight do not look alike. Still not covered: deleting the Clerk user
 * itself at Clerk (the D1 block is what refuses entry) and `franchisee.id`'s own copy of the brand surface.
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
 *
 * **Every column here must be nullable — check with `pragma_table_info` before adding one.** Two that were
 * obvious candidates are deliberately absent because they are `TEXT NOT NULL`, and setting them to NULL raises
 * `NOT NULL constraint failed`, which aborts the *entire* batch and leaves the person blocked but un-erased:
 *
 *   - `listing_edit_suggestions.suggested_by_user_id` — and `queueOwnerReview` writes one of these keyed on the
 *     owner's own id whenever they edit a published listing, upload media, or change their email, so it is
 *     populated for exactly the people most likely to ask for deletion. It had 58 live rows.
 *   - `listing_outreach_events.staff_user_id`
 *
 * They are left pointing at the shell instead, which is sufficient for the same reason everything else is: the
 * `users` row no longer identifies anyone, so a pointer to it is not personal data.
 */
const ACTOR_POINTERS = [
  ["audit_events", "actor_user_id"],
  ["email_role_grants", "applied_user_id"],
  ["franchise_product_events", "user_id"],
  ["franchise_quality_checks", "reviewer_user_id"],
  ["franchise_removals", "requested_by_user_id"],
  ["franchise_removals", "revoked_by_user_id"],
  ["listing_edit_suggestions", "reviewed_by_user_id"],
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

/**
 * Which brands this person is authorised to have erased, and which are deliberately left standing.
 *
 * The rule is that brand data only goes once the person has *claimed* the brand and been approved as its owner.
 * `franchises.owner_user_id` alone does not establish that — nothing in the schema binds the column to a claim —
 * so this uses the same provenance predicate the brand-removal action does. A brand they merely have a profile
 * attached to is left alone and **reported**, so an operator can tell a decision from an oversight.
 */
export async function findErasureBrands(db, userId) {
  const rows = await db
    .prepare(
      `SELECT f.id,
              CASE WHEN EXISTS (
                     SELECT 1 FROM franchise_claims c
                     WHERE c.franchise_id = f.id AND c.status = 'approved' AND c.claimant_user_id = f.owner_user_id
                   )
                   OR EXISTS (
                     SELECT 1 FROM franchise_submission_reviews r
                     WHERE r.franchise_id = f.id AND r.status = 'approved' AND r.applicant_user_id = f.owner_user_id
                   )
              THEN 1 ELSE 0 END AS proven
       FROM franchises f
       WHERE f.owner_user_id = ?`
    )
    .bind(userId)
    .all();

  const list = (rows && rows.results) || rows || [];
  return {
    proven: list.filter((row) => Number(row.proven) === 1).map((row) => row.id),
    unproven: list.filter((row) => Number(row.proven) !== 1).map((row) => row.id),
  };
}

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
export async function eraseAccount(db, userId, options = {}) {
  if (!userId) {
    throw new Error("eraseAccount butuh userId.");
  }

  const plan = erasurePlan(userId);
  const placeholderEmail = erasedEmailPlaceholder(userId);
  const brands = await findErasureBrands(db, userId);

  // Media keys are collected before the rows go, because after the delete there is nothing left to tell us
  // which objects in R2 belonged to this person.
  const assetRows = brands.proven.length
    ? await db
        .prepare(
          `SELECT r2_key FROM franchise_assets
           WHERE franchise_id IN (${brands.proven.map(() => "?").join(", ")}) AND r2_key IS NOT NULL`
        )
        .bind(...brands.proven)
        .all()
    : { results: [] };
  const assetKeys = ((assetRows && assetRows.results) || assetRows || []).map((row) => row.r2_key).filter(Boolean);

  // Snapshot each brand's publication state before hiding it, so the admin restore path can put it back — the
  // same thing `removeOwnedBrand` records when an owner delists a brand themselves.
  const publicationRows = brands.proven.length
    ? await db
        .prepare(
          `SELECT franchise_id, site_id, publication_status FROM franchise_site_publications
           WHERE franchise_id IN (${brands.proven.map(() => "?").join(", ")})`
        )
        .bind(...brands.proven)
        .all()
    : { results: [] };
  const publicationsByBrand = {};
  for (const row of (publicationRows && publicationRows.results) || publicationRows || []) {
    if (!publicationsByBrand[row.franchise_id]) publicationsByBrand[row.franchise_id] = [];
    publicationsByBrand[row.franchise_id].push({ site_id: row.site_id, publication_status: row.publication_status });
  }

  const statements = [
    ...plan.deletes.map((entry) => db.prepare(entry.sql).bind(userId)),
    ...plan.nulls.map((entry) => db.prepare(entry.sql).bind(userId)),
  ];

  for (const brandId of brands.proven) {
    // Archived rather than deleted, for the reason the whole routine exists: a hard delete cascades into premium
    // orders and the ownership proof. Archived is what stops it being published, which is what "my brand is gone"
    // actually requires. Contact fields go because they are how the world reaches a person; the descriptive
    // fields stay, because a delisted stub that still says what the brand was is not personal data and a blank
    // one would lose the only remaining context for the financial rows.
    statements.push(
      db
        .prepare(
          `UPDATE franchises
           SET status = 'archived', owner_user_id = NULL, franchisor_profile_id = NULL,
               phone = NULL, office_address = NULL, logo_url = NULL, cover_url = NULL,
               gallery_urls = NULL, video_url = NULL, proposal_url = NULL, raw_payload = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(brandId),
      // Only this brand's media. Deliberately NOT by `uploaded_by_user_id`: that column holds whoever uploaded
      // the file, which on this network includes bulk imports, so deleting by uploader could take out media
      // belonging to brands that have nothing to do with this person.
      db.prepare("DELETE FROM franchise_assets WHERE franchise_id = ?").bind(brandId),
      // Publications must be hidden explicitly. Archiving the brand is not enough on its own: the directory query
      // filters on `franchise_site_publications.publication_status = 'published'` and never looks at
      // `franchises.status`, so without this the brand the person just had erased keeps appearing in the
      // directory — which is the page's promise, broken on one live surface. Mirrors `removeOwnedBrand`.
      db
        .prepare(
          `UPDATE franchise_site_publications
           SET publication_status = 'hidden', updated_at = CURRENT_TIMESTAMP
           WHERE franchise_id = ? AND publication_status <> 'hidden'`
        )
        .bind(brandId),
      db
        .prepare(
          `INSERT INTO franchise_removals
             (id, franchise_id, requested_by_user_id, basis, reason_code, note, previous_publications, requested_at, effective_at)
           VALUES (?, ?, NULL, 'owner_verified', 'other', 'account erasure', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (franchise_id) DO UPDATE SET
             requested_by_user_id  = NULL,
             basis                 = 'owner_verified',
             reason_code           = 'other',
             note                  = 'account erasure',
             previous_publications = excluded.previous_publications,
             revoked_at            = NULL,
             revoked_by_user_id    = NULL,
             revoke_note           = NULL,
             effective_at          = CURRENT_TIMESTAMP`
        )
        .bind(`erm_${brandId}`, brandId, JSON.stringify(publicationsByBrand[brandId] || []))
    );
  }

  // The shell. `clerk_user_id` must be overwritten, not cleared: the column is `NOT NULL`, so NULL is rejected
  // (learned from a failing test, not from reading the migration — migration 0001 says `NOT NULL UNIQUE`).
  statements.push(
    db
      .prepare(
        `UPDATE users
         SET status = 'deleted', clerk_user_id = ?, primary_email = ?, display_name = 'Akun dihapus'
         WHERE id = ?`
      )
      .bind(erasedClerkIdPlaceholder(userId), placeholderEmail, userId)
  );

  await db.batch(statements);

  // R2 after the commit, never before: an object left behind costs storage, whereas rows pointing at files that
  // have already gone is a broken site. A failure here must not fail the erasure either.
  let objectsDeleted = 0;
  if (options.bucket && assetKeys.length) {
    for (const key of assetKeys) {
      try {
        await options.bucket.delete(key);
        objectsDeleted += 1;
      } catch (error) {
        // Deliberately swallowed; reported through objectsDeleted rather than thrown.
      }
    }
  }

  return {
    userId,
    placeholderEmail,
    deletedFrom: plan.deletes.length,
    unlinkedFrom: plan.nulls.length,
    brandsRemoved: brands.proven,
    brandsLeftStanding: brands.unproven,
    assetKeys,
    objectsDeleted,
  };
}
