import { auditStatement, randomId } from "./_profile-utils.js";
import { SITE_FRANCHISOR_ID, siteRebuildStatements } from "./_site-publish-queue.js";

export const OWNER_REVIEW_REASON = "Perubahan pemilik setelah listing diterbitkan";

export async function queueOwnerReview(db, actor, franchiseId, changes, previous, fieldName) {
  const pending = await db
    .prepare(
      `SELECT id, old_value, suggested_value FROM listing_edit_suggestions
       WHERE franchise_id = ? AND suggested_by_user_id = ? AND field_name = ? AND status = 'pending' LIMIT 1`,
    )
    .bind(franchiseId, actor.id, fieldName)
    .first();
  if (pending) return { pending: true, suggestion_id: pending.id, existing: true };

  const oldValues = Object.fromEntries(Object.keys(changes).map((field) => [field, previous[field] ?? null]));
  const id = `suggestion_${randomId()}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO listing_edit_suggestions
          (id, franchise_id, site_id, suggested_by_user_id, status, field_name, old_value, suggested_value, reason)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        franchiseId,
        SITE_FRANCHISOR_ID,
        actor.id,
        fieldName,
        JSON.stringify(oldValues),
        JSON.stringify(changes),
        OWNER_REVIEW_REASON,
      ),
    auditStatement(db, "profile.listing.review_requested", "franchises", franchiseId, {
      suggestion_id: id,
      fields: Object.keys(changes),
      field_name: fieldName,
    }, actor.id),
  ]);
  return { pending: true, suggestion_id: id };
}

// Public brand identity/contact fields an owner may change only through admin review.
// Exported as an array so the dashboard action schema can build one exact allowlist
// from the same source instead of keeping a second hand-written list in step.
export const OWNER_PROFILE_FIELDS = [
  "company_name",
  "country_code",
  "whatsapp",
  "website_url",
  "instagram_url",
  "facebook_url",
  "tiktok_url",
  "youtube_url",
  "linkedin_url",
  "nib_number",
  "haki_status",
  "haki_number",
  "pic_name",
  "email_contact",
];

const PROFILE_FIELDS = new Set(OWNER_PROFILE_FIELDS);

export async function reviewedProfileStatements(db, suggestion, selected, reviewerId) {
  const changes = Object.entries(selected).map(([field, value]) => {
    const column = field.startsWith("profile_") ? field.slice(8) : "";
    if (!PROFILE_FIELDS.has(column) || (value !== null && typeof value !== "string")) {
      throw new Error("Invalid franchisor profile review field");
    }
    return [column, value];
  });
  if (!changes.length) throw new Error("Empty franchisor profile review");

  const profile = await db
    .prepare(
      `SELECT fp.* FROM franchisor_profiles fp
       JOIN franchises f ON f.franchisor_profile_id = fp.id
       WHERE f.id = ? AND f.owner_user_id = ? LIMIT 1`,
    )
    .bind(suggestion.franchise_id, suggestion.suggested_by_user_id)
    .first();
  if (!profile) return null;

  const oldValues = JSON.parse(suggestion.old_value || "{}");
  if (changes.some(([column]) => (profile[column] ?? null) !== (oldValues[`profile_${column}`] ?? null))) return null;

  const allPublished = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM franchises f
       JOIN franchise_site_publications p ON p.franchise_id = f.id
       WHERE f.franchisor_profile_id = ? AND p.publication_status = 'published'`,
    )
    .bind(profile.id)
    .first();
  const ownedPublished = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM franchises f
       JOIN franchise_site_publications p ON p.franchise_id = f.id
       WHERE f.franchisor_profile_id = ? AND p.publication_status = 'published' AND f.owner_user_id = ?`,
    )
    .bind(profile.id, suggestion.suggested_by_user_id)
    .first();
  if (Number(allPublished?.total || 0) !== Number(ownedPublished?.total || 0)) return null;

  const publications = await db
    .prepare(
      `SELECT DISTINCT f.id AS franchise_id, p.site_id FROM franchises f
       JOIN franchise_site_publications p ON p.franchise_id = f.id
       WHERE f.franchisor_profile_id = ? AND f.owner_user_id = ?
         AND p.publication_status = 'published'`,
    )
    .bind(profile.id, suggestion.suggested_by_user_id)
    .all();
  if (!publications.results?.length) return null;

  const fields = changes.map(([column]) => column);
  const statements = [
    db
      .prepare(
        `UPDATE franchisor_profiles SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(...changes.map(([, value]) => value), profile.id),
    auditStatement(db, "dashboard.profile.review_applied", "franchisor_profiles", profile.id, {
      suggestion_id: suggestion.id,
      fields,
    }, reviewerId),
  ];
  for (const pub of publications.results) {
    statements.push(
      ...siteRebuildStatements(db, {
        siteId: pub.site_id,
        franchiseId: pub.franchise_id,
        reason: "franchisor_contact_review_approved",
        entityType: "listing_edit_suggestions",
        entityId: suggestion.id,
        actorUserId: reviewerId,
        source: "dashboard",
        metadata: { fields },
      }),
    );
  }
  return statements;
}
