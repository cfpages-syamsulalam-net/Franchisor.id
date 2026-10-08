import { buildUpdate, listingPatch } from "./_profile-listing-patch.js";
import { queueOwnerReview } from "./_profile-owner-review.js";
import { auditStatement, jsonResponse, normalizeWhatsapp, textOrNull } from "./_profile-utils.js";
import { logOperationEvent } from "./_telemetry.js";
import { manualLocationSummary, manualLocationWriteStatements } from "./_location-writes.js";
import { SITE_FRANCHISOR_ID, fanoutSiteRebuildStatements, getPublishedSiteIdsForFranchise, siteRebuildStatements } from "./_site-publish-queue.js";

export const OWNER_LISTING_EDIT_INTERVAL_HOURS = 6;
const OWNED_LISTING_QUERY_CHUNK_SIZE = 80;

export async function updateFranchisorProfile(db, actor, data) {
  const existing = await db
    .prepare("SELECT * FROM franchisor_profiles WHERE user_id = ? LIMIT 1")
    .bind(actor.id)
    .first();
  if (!existing) {
    return jsonResponse({ success: false, message: "Silakan lengkapi form data brand terlebih dahulu." }, { status: 404 });
  }

  const ownerListing = await db.prepare(`SELECT f.id FROM franchises f
    JOIN franchise_site_publications p ON p.franchise_id = f.id
    WHERE f.franchisor_profile_id = ? AND f.owner_user_id = ?
      AND p.site_id = ? AND p.publication_status = 'published' LIMIT 1`)
    .bind(existing.id, actor.id, SITE_FRANCHISOR_ID).first();
  if (ownerListing) {
    const proposed = {
      company_name: textOrNull(data.company_name), country_code: textOrNull(data.country_code),
      whatsapp: normalizeWhatsapp(data.whatsapp), website_url: textOrNull(data.website_url),
      instagram_url: textOrNull(data.instagram_url), facebook_url: textOrNull(data.facebook_url),
      tiktok_url: textOrNull(data.tiktok_url), youtube_url: textOrNull(data.youtube_url),
      linkedin_url: textOrNull(data.linkedin_url), nib_number: textOrNull(data.nib_number),
      haki_status: textOrNull(data.haki_status), haki_number: textOrNull(data.haki_number),
    };
    const changed = Object.fromEntries(Object.entries(proposed)
      .filter(([field, value]) => (existing[field] ?? null) !== value)
      .map(([field, value]) => [`profile_${field}`, value]));
    if (Object.keys(changed).length) {
      const shared = await db.prepare(`SELECT COUNT(*) AS total FROM franchises
        WHERE franchisor_profile_id = ? AND owner_user_id IS NOT ?`)
        .bind(existing.id, actor.id).first();
      if (Number(shared?.total || 0) > 0) {
        return jsonResponse({ success: false, message: "Profil ini terhubung dengan listing lain. Hubungi admin untuk memperbarui kontak." }, { status: 409 });
      }
      const current = Object.fromEntries(Object.keys(changed)
        .map((field) => [field, existing[field.slice(8)] ?? null]));
      const review = await queueOwnerReview(db, actor, ownerListing.id, changed, current, "franchisor_profile");
      if (!review.pending) return jsonResponse({ success: false, message: "Usulan sebelumnya baru saja diputuskan. Muat ulang dan ajukan ulang." }, { status: 409 });
      return jsonResponse({ success: true, status: "pending", message: review.existing
        ? "Perubahan sebelumnya masih menunggu pemeriksaan admin."
        : "Perubahan kontak dan identitas diajukan untuk diperiksa admin. Data publik tetap seperti semula." });
    }
    return jsonResponse({ success: true, profile: existing });
  }

  await db.batch([
    db
      .prepare(
        `UPDATE franchisor_profiles
            SET company_name = ?, country_code = ?, whatsapp = ?, website_url = ?, instagram_url = ?,
                facebook_url = ?, tiktok_url = ?, youtube_url = ?, linkedin_url = ?,
                nib_number = ?, haki_status = ?, haki_number = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?`,
      )
      .bind(
        textOrNull(data.company_name),
        textOrNull(data.country_code),
        normalizeWhatsapp(data.whatsapp),
        textOrNull(data.website_url),
        textOrNull(data.instagram_url),
        textOrNull(data.facebook_url),
        textOrNull(data.tiktok_url),
        textOrNull(data.youtube_url),
        textOrNull(data.linkedin_url),
        textOrNull(data.nib_number),
        textOrNull(data.haki_status),
        textOrNull(data.haki_number),
        actor.id,
      ),
    auditStatement(db, "profile.franchisor.update", "franchisor_profiles", existing.id, { source: "profile" }, actor.id),
  ]);

  return jsonResponse({ success: true, profile: await loadFranchisorProfile(db, actor.id) });
}

export async function updateOwnedListing(db, actor, data) {
  const franchisorProfile = await loadFranchisorProfile(db, actor.id);
  const listing = await db
    .prepare(
      `SELECT *
       FROM franchises
       WHERE id = ?
         AND (owner_user_id = ? OR (? IS NOT NULL AND franchisor_profile_id = ?))
       LIMIT 1`,
    )
    .bind(data.franchise_id, actor.id, franchisorProfile?.id || null, franchisorProfile?.id || null)
    .first();

  if (!listing) {
    return jsonResponse({ success: false, message: "Listing tidak ditemukan atau bukan milik akun ini." }, { status: 404 });
  }

  const rate = await db
    .prepare(
      `SELECT MAX(created_at) AS last_edit_at, COUNT(*) AS edits
       FROM audit_events
       WHERE actor_user_id = ?
         AND action = 'profile.listing.update'
         AND entity_type = 'franchises'
         AND entity_id = ?
         AND created_at >= datetime('now', ?)`,
    )
    .bind(actor.id, listing.id, `-${OWNER_LISTING_EDIT_INTERVAL_HOURS} hours`)
    .first();

  if (Number(rate?.edits || 0) > 0) {
    return jsonResponse(
      {
        success: false,
        error: "LISTING_EDIT_RATE_LIMITED",
        message: `Listing hanya bisa diedit sekali setiap ${OWNER_LISTING_EDIT_INTERVAL_HOURS} jam. Silakan coba lagi nanti.`,
        last_owner_edit_at: rate.last_edit_at,
        edit_interval_hours: OWNER_LISTING_EDIT_INTERVAL_HOURS,
      },
      { status: 429 },
    );
  }

  const patch = listingPatch(data);
  if (!Object.keys(patch).length) {
    return jsonResponse({ success: false, message: "Tidak ada field listing yang berubah." }, { status: 400 });
  }

  const published = await db.prepare(`SELECT 1 AS published FROM franchise_site_publications
    WHERE franchise_id = ? AND site_id = ? AND publication_status = 'published' LIMIT 1`)
    .bind(listing.id, SITE_FRANCHISOR_ID).first();
  if (published) {
    if (listing.owner_user_id !== actor.id) {
      return jsonResponse({ success: false, message: "Listing ini bukan milik akun Anda." }, { status: 403 });
    }
    const review = await queueOwnerReview(db, actor, listing.id, patch, listing, "json_diff");
    if (!review.pending) {
      return jsonResponse({ success: false, message: "Usulan sebelumnya baru saja diputuskan. Muat ulang dan ajukan ulang." }, { status: 409 });
    }
    return jsonResponse({ success: true, status: "pending", message: review.existing
      ? "Perubahan sebelumnya masih menunggu pemeriksaan admin."
      : "Perubahan diajukan untuk diperiksa admin. Listing publik tetap seperti semula." });
  }

  const update = buildUpdate("franchises", patch, "id");
  const statements = [
    db.prepare(update.sql).bind(...update.values, listing.id),
    auditStatement(db, "profile.listing.update", "franchises", listing.id, { source: "profile", fields: Object.keys(patch) }, actor.id),
    ...fanoutSiteRebuildStatements(db, await getPublishedSiteIdsForFranchise(db, listing.id, SITE_FRANCHISOR_ID), {
      franchiseId: listing.id,
      reason: "owner_listing_update",
      entityType: "franchises",
      entityId: listing.id,
      actorUserId: actor.id,
      source: "profile",
      metadata: {
        slug: listing.slug,
        brand_name: patch.brand_name || listing.brand_name,
        fields: Object.keys(patch),
      },
    }),
  ];

  await db.batch(statements);

  return jsonResponse({
    success: true,
    franchise: await loadOwnedListing(db, actor, listing.id, franchisorProfile?.id || null),
    edit_interval_hours: OWNER_LISTING_EDIT_INTERVAL_HOURS,
  });
}

export async function updateListingLocations(db, actor, data) {
  const franchisorProfile = await loadFranchisorProfile(db, actor.id);
  const listing = await loadOwnedListing(db, actor, data.franchise_id, franchisorProfile?.id || null);
  if (!listing) {
    return jsonResponse({ success: false, message: "Listing tidak ditemukan atau bukan milik akun ini." }, { status: 404 });
  }

  const { locations, statements } = manualLocationWriteStatements(db, listing.id, data.locations || []);

  statements.push(
    auditStatement(
      db,
      "profile.listing.locations.update",
      "franchise_locations",
      listing.id,
      { source: "profile", count: locations.length, locations: manualLocationSummary(locations) },
      actor.id,
    ),
    ...fanoutSiteRebuildStatements(db, await getPublishedSiteIdsForFranchise(db, listing.id, SITE_FRANCHISOR_ID), {
      franchiseId: listing.id,
      reason: "owner_listing_locations_update",
      entityType: "franchise_locations",
      entityId: listing.id,
      actorUserId: actor.id,
      source: "profile",
      metadata: {
        slug: listing.slug,
        brand_name: listing.brand_name,
        count: locations.length,
      },
    }),
  );

  await db.batch(statements);
  const locationMap = await loadOwnedStructuredLocations(db, [listing.id]);

  return jsonResponse({
    success: true,
    structured_locations: locationMap.get(listing.id) || [],
  });
}

export async function updateFranchiseLeadStatus(db, actor, data) {
  const lead = await db
    .prepare(
      `SELECT fl.id, fl.franchise_id, f.owner_user_id, f.franchisor_profile_id
       FROM franchise_leads fl
       INNER JOIN franchises f ON f.id = fl.franchise_id
       LEFT JOIN franchisor_profiles fp ON fp.id = f.franchisor_profile_id
       WHERE fl.id = ?
         AND (f.owner_user_id = ? OR fp.user_id = ?)
       LIMIT 1`,
    )
    .bind(data.lead_id, actor.id, actor.id)
    .first();

  if (!lead) {
    return jsonResponse({ success: false, message: "Lead tidak ditemukan atau bukan milik akun ini." }, { status: 404 });
  }

  await db.batch([
    db
      .prepare("UPDATE franchise_leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(data.status, lead.id),
    auditStatement(db, "profile.franchisor.lead_status", "franchise_leads", lead.id, { status: data.status, franchise_id: lead.franchise_id }, actor.id),
  ]);

  const franchisorProfile = await loadFranchisorProfile(db, actor.id);
  return jsonResponse({
    success: true,
    franchisor_leads: await loadFranchisorLeadInbox(db, actor.id, franchisorProfile?.id || null),
  });
}

export async function loadOwnedStructuredLocations(db, franchiseIds) {
  const ids = Array.from(new Set((franchiseIds || []).filter(Boolean)));
  if (!ids.length) return new Map();
  try {
    const locationRows = [];
    for (const chunk of chunkList(ids, OWNED_LISTING_QUERY_CHUNK_SIZE)) {
      const placeholders = chunk.map(() => "?").join(",");
      const result = await db
        .prepare(
          `SELECT
            fl.id,
            fl.franchise_id,
            fl.location_text,
            fl.location_type,
            fl.source_field,
            fl.confidence_score,
            l.city,
            l.slug,
            l.province
           FROM franchise_locations fl
           LEFT JOIN locations l ON l.id = fl.location_id
           WHERE fl.franchise_id IN (${placeholders})
             AND COALESCE(l.city, fl.location_text) IS NOT NULL
           ORDER BY
             CASE fl.source_field WHEN 'owner_profile' THEN 0 ELSE 1 END,
             CASE fl.location_type WHEN 'head_office' THEN 0 WHEN 'origin' THEN 1 WHEN 'outlet' THEN 2 ELSE 3 END,
             COALESCE(l.city, fl.location_text) ASC`,
        )
        .bind(...chunk)
        .all();
      locationRows.push(...(result.results || []));
    }
    const byFranchise = new Map();
    for (const row of locationRows) {
      const rows = byFranchise.get(row.franchise_id) || [];
      rows.push({
        ...row,
        city: row.city || row.location_text || "",
        source_label: row.source_field === "owner_profile" ? "Diatur pemilik" : "Data awal",
      });
      byFranchise.set(row.franchise_id, rows);
    }
    return byFranchise;
  } catch (_error) {
    return new Map();
  }
}

export async function loadOwnedPublicationDistribution(db, franchiseIds) {
  const ids = Array.from(new Set((franchiseIds || []).filter(Boolean)));
  if (!ids.length) return new Map();
  try {
    const publicationRows = [];
    for (const chunk of chunkList(ids, OWNED_LISTING_QUERY_CHUNK_SIZE)) {
      const placeholders = chunk.map(() => "?").join(",");
      const result = await db
        .prepare(
          `SELECT
            p.franchise_id,
            p.site_id,
            p.slug,
            p.canonical_url,
            p.publication_status,
            p.is_primary,
            p.updated_at,
            ns.domain,
            ns.name,
            ns.site_type
           FROM franchise_site_publications p
           LEFT JOIN network_sites ns ON ns.id = p.site_id
           WHERE p.franchise_id IN (${placeholders})
           ORDER BY p.is_primary DESC, ns.domain ASC`,
        )
        .bind(...chunk)
        .all();
      publicationRows.push(...(result.results || []));
    }
    const byFranchise = new Map();
    for (const row of publicationRows) {
      const rows = byFranchise.get(row.franchise_id) || [];
      rows.push(row);
      byFranchise.set(row.franchise_id, rows);
    }
    return byFranchise;
  } catch (_error) {
    return new Map();
  }
}

/**
 * Takes a brand out of the network at its owner's request.
 *
 * Permission here is deliberately stricter than the other owner actions in this file. Those accept
 * `owner_user_id = ? OR franchisor_profile_id = ?`, and that second branch is only *association* — it says a
 * profile is attached, not that anybody proved ownership. Removal is destructive and one-way for the owner, so
 * it requires the strict, provenance-backed predicate instead: `owner_user_id` matches **and** an approved claim
 * or an approved submission review names the same user. `franchises.owner_user_id` on its own is not proof,
 * because nothing in the schema binds it to a claim — a direct SQL write would grant ownership with no trace.
 *
 * It delists rather than deletes. `DELETE FROM franchises` cascades into twenty tables, including the
 * publications, the premium orders and the very rows that prove ownership; migration 0045 records the full
 * reasoning. Publications are hidden, the previous states are snapshotted so an administrator can restore
 * faithfully, and the removal row keeps the reason that `status = 'archived'` alone cannot distinguish from a
 * rejected pending brand.
 */
export async function removeOwnedBrand(db, actor, data) {
  const listing = await db
    .prepare(
      `SELECT f.id, f.slug, f.brand_name, f.status,
              (SELECT COUNT(*) FROM franchise_claims c
                WHERE c.franchise_id = f.id AND c.claimant_user_id = f.owner_user_id
                  AND c.status = 'approved') AS approved_claims,
              (SELECT COUNT(*) FROM franchise_submission_reviews r
                WHERE r.franchise_id = f.id AND r.applicant_user_id = f.owner_user_id
                  AND r.status = 'approved') AS approved_reviews
       FROM franchises f
       WHERE f.id = ? AND f.owner_user_id = ?
       LIMIT 1`
    )
    .bind(data.franchise_id, actor.id)
    .first();

  if (!listing) {
    return jsonResponse(
      { success: false, message: "Brand tidak ditemukan atau bukan milik akun ini." },
      { status: 404 }
    );
  }

  if (Number(listing.approved_claims || 0) === 0 && Number(listing.approved_reviews || 0) === 0) {
    return jsonResponse(
      {
        success: false,
        error: "OWNERSHIP_NOT_PROVEN",
        message:
          "Kepemilikan brand ini belum terbukti lewat klaim yang disetujui, jadi belum bisa dihapus sendiri. Hubungi admin.",
      },
      { status: 403 }
    );
  }

  const existingRemoval = await db
    .prepare("SELECT id, revoked_at FROM franchise_removals WHERE franchise_id = ? LIMIT 1")
    .bind(listing.id)
    .first();

  if (existingRemoval && !existingRemoval.revoked_at) {
    return jsonResponse({
      success: true,
      already_removed: true,
      message: "Brand ini sudah tidak tayang di seluruh situs jaringan.",
    });
  }

  const publications = await db
    .prepare("SELECT site_id, publication_status FROM franchise_site_publications WHERE franchise_id = ?")
    .bind(listing.id)
    .all();
  const previousPublications = publications.results || [];
  const now = nowSqliteNow();

  // Every site that had a publication needs a rebuild request in the SAME batch as the hide. Hiding the D1 row is
  // not the same as retiring the page: the static HTML already deployed stays live until a publisher runs, so a
  // removal that only writes D1 can report success while the brand is still reachable at its public URL. The home
  // site is always included, because the brand's own detail and directory card live there even when it was never
  // published anywhere else.
  const rebuildSiteIds = [
    ...new Set([...previousPublications.map((publication) => publication.site_id), SITE_FRANCHISOR_ID].filter(Boolean)),
  ];

  await db.batch([
    db
      .prepare(
        `INSERT INTO franchise_removals
           (id, franchise_id, requested_by_user_id, basis, reason_code, note, previous_publications, requested_at, effective_at)
         VALUES (?, ?, ?, 'owner_verified', ?, ?, ?, ?, ?)
         ON CONFLICT (franchise_id) DO UPDATE SET
           requested_by_user_id  = excluded.requested_by_user_id,
           basis                 = excluded.basis,
           reason_code           = excluded.reason_code,
           note                  = excluded.note,
           previous_publications = excluded.previous_publications,
           effective_at          = excluded.effective_at,
           revoked_at            = NULL,
           revoked_by_user_id    = NULL,
           revoke_note           = NULL`
      )
      .bind(
        `removal_${crypto.randomUUID()}`,
        listing.id,
        actor.id,
        data.reason_code,
        data.note || null,
        JSON.stringify(previousPublications),
        now,
        now
      ),
    db
      .prepare(
        `UPDATE franchise_site_publications
         SET publication_status = 'hidden', updated_at = CURRENT_TIMESTAMP
         WHERE franchise_id = ? AND publication_status <> 'hidden'`
      )
      .bind(listing.id),
    db
      .prepare(
        `UPDATE franchises SET status = 'archived', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status <> 'archived'`
      )
      .bind(listing.id),
    ...rebuildSiteIds.flatMap((siteId) =>
      siteRebuildStatements(db, {
        siteId,
        franchiseId: listing.id,
        reason: "brand_removed",
        entityType: "franchise",
        entityId: listing.id,
        actorUserId: actor.id,
      })
    ),
    auditStatement(db, "profile.brand.removed", "franchises", listing.id, {
      brand_name: listing.brand_name,
      slug: listing.slug,
      reason_code: data.reason_code,
      basis: "owner_verified",
      hidden_publications: previousPublications.length,
    }),
  ]);

  // A brand leaving the network is the kind of change an operator should be able to find later.
  await logOperationEvent(db, {
    eventType: "brand.removed_by_owner",
    severity: "warning",
    entityType: "franchise",
    entityId: listing.id,
    message: `${listing.brand_name} was delisted at its owner's request (${data.reason_code})`,
    metadata: { reason_code: data.reason_code, hidden_publications: previousPublications.length },
  });

  return jsonResponse({
    success: true,
    message:
      "Brand Anda sudah tidak tayang di seluruh situs jaringan. Hanya admin yang bisa memulihkannya.",
    hidden_publications: previousPublications.length,
  });
}

/**
 * Puts a removed brand back, restoring the publication states captured at removal time.
 *
 * Administrative, because the owner cannot: the claim guards require `status = 'unclaimed' AND
 * source_sheet = 'UNCLAIMED'`, and approving a claim sets `source_sheet = 'FRANCHISOR'`, so a removed brand can
 * never be re-claimed. Restoring is therefore the only way back, and it has to be faithful — which is why the
 * removal row snapshots the previous publication states instead of guessing them.
 */
export async function restoreRemovedBrand(db, actor, data) {
  const removal = await db
    .prepare(
      `SELECT r.id, r.franchise_id, r.previous_publications, f.brand_name
       FROM franchise_removals r
       JOIN franchises f ON f.id = r.franchise_id
       WHERE r.franchise_id = ? AND r.revoked_at IS NULL
       LIMIT 1`
    )
    .bind(data.franchise_id)
    .first();

  if (!removal) {
    return jsonResponse({ success: false, message: "Brand ini tidak sedang dalam keadaan dihapus." }, { status: 404 });
  }

  let previous = [];
  try {
    previous = JSON.parse(removal.previous_publications || "[]") || [];
  } catch {
    previous = [];
  }

  const statements = [
    db
      .prepare(
        `UPDATE franchise_removals
         SET revoked_at = ?, revoked_by_user_id = ?, revoke_note = ?
         WHERE id = ?`
      )
      .bind(nowSqliteNow(), actor.id, data.note || null, removal.id),
    db
      .prepare(
        `UPDATE franchises SET status = CASE WHEN status = 'archived' THEN 'free' ELSE status END,
                updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(removal.franchise_id),
  ];

  // Restore only what was previously published, and only where the row still exists, so a later deliberate
  // hide is not silently undone.
  for (const entry of previous) {
    if (entry?.publication_status !== "published") continue;
    statements.push(
      db
        .prepare(
          `UPDATE franchise_site_publications
           SET publication_status = 'published', updated_at = CURRENT_TIMESTAMP
           WHERE franchise_id = ? AND site_id = ? AND publication_status = 'hidden'`
        )
        .bind(removal.franchise_id, entry.site_id)
    );
  }

  statements.push(
    auditStatement(db, "admin.brand.removal_revoked", "franchises", removal.franchise_id, {
      brand_name: removal.brand_name,
      restored_publications: previous.filter((entry) => entry?.publication_status === "published").length,
    })
  );

  await db.batch(statements);

  return jsonResponse({
    success: true,
    message: `Brand ${removal.brand_name} dipulihkan. Status publikasi dikembalikan seperti semula.`,
  });
}

function nowSqliteNow() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function chunkList(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function loadFranchisorLeadInbox(db, userId, franchisorProfileId) {
  const result = await db
    .prepare(
      `SELECT fl.id, fl.franchise_id, fl.franchisee_user_id, fl.name, fl.email, fl.country_code,
              fl.whatsapp, fl.city_origin, fl.budget_range, fl.message, fl.status,
              fl.created_at, fl.updated_at,
              f.brand_name, f.slug,
              p.canonical_url
       FROM franchise_leads fl
       INNER JOIN franchises f ON f.id = fl.franchise_id
       LEFT JOIN franchise_site_publications p
         ON p.franchise_id = f.id
        AND p.site_id = ?
       WHERE f.owner_user_id = ?
          OR (? IS NOT NULL AND f.franchisor_profile_id = ?)
       ORDER BY fl.created_at DESC
       LIMIT 80`,
    )
    .bind(SITE_FRANCHISOR_ID, userId, franchisorProfileId || null, franchisorProfileId || null)
    .all();

  return result.results || [];
}

export async function loadFranchisorProfile(db, userId) {
  return await db
    .prepare(
      `SELECT id, user_id, company_name, pic_name, email_contact, country_code, whatsapp,
              website_url, instagram_url, facebook_url, tiktok_url, youtube_url, linkedin_url,
              nib_number, haki_status, haki_number, created_at, updated_at
       FROM franchisor_profiles
       WHERE user_id = ?
       LIMIT 1`,
    )
    .bind(userId)
    .first();
}

export async function loadOwnedListing(db, actor, franchiseId, franchisorProfileId) {
  return await db
    .prepare(
      `SELECT f.*, p.publication_status, p.canonical_url, p.last_synced_at
       FROM franchises f
       LEFT JOIN franchise_site_publications p
         ON p.franchise_id = f.id
        AND p.site_id = ?
       WHERE f.id = ?
         AND (f.owner_user_id = ? OR (? IS NOT NULL AND f.franchisor_profile_id = ?))
       LIMIT 1`,
    )
    .bind(SITE_FRANCHISOR_ID, franchiseId, actor.id, franchisorProfileId || null, franchisorProfileId || null)
    .first();
}
