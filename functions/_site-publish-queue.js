export const SITE_FRANCHISOR_ID = "site_franchisor_id";

export function siteRebuildStatements(db, options) {
  const siteId = normalize(options.siteId) || SITE_FRANCHISOR_ID;
  const franchiseId = normalize(options.franchiseId) || null;
  const reason = normalize(options.reason) || "public_page_change";
  const entityType = normalize(options.entityType) || null;
  const entityId = normalize(options.entityId) || franchiseId;
  const actorUserId = normalize(options.actorUserId) || null;
  const metadata = {
    ...(options.metadata || {}),
    source: options.source || "app",
  };
  const metadataJson = JSON.stringify(metadata);

  return [
    db
      .prepare(
        `UPDATE site_rebuild_requests
         SET requested_by_user_id = COALESCE(?, requested_by_user_id),
             metadata = ?,
             error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE site_id = ?
           AND status IN ('pending', 'failed_retryable')
           AND COALESCE(franchise_id, '') = COALESCE(?, '')
           AND reason = ?
           AND COALESCE(entity_type, '') = COALESCE(?, '')
           AND COALESCE(entity_id, '') = COALESCE(?, '')`
      )
      .bind(actorUserId, metadataJson, siteId, franchiseId, reason, entityType, entityId),
    db
      .prepare(
        `INSERT INTO site_rebuild_requests (
          id, site_id, franchise_id, reason, entity_type, entity_id,
          requested_by_user_id, metadata
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM site_rebuild_requests
          WHERE site_id = ?
            AND status IN ('pending', 'failed_retryable')
            AND COALESCE(franchise_id, '') = COALESCE(?, '')
            AND reason = ?
            AND COALESCE(entity_type, '') = COALESCE(?, '')
            AND COALESCE(entity_id, '') = COALESCE(?, '')
        )`
      )
      .bind(
        `rebuild_${randomId()}`,
        siteId,
        franchiseId,
        reason,
        entityType,
        entityId,
        actorUserId,
        metadataJson,
        siteId,
        franchiseId,
        reason,
        entityType,
        entityId
      ),
    db
      .prepare(
        `INSERT INTO site_publish_state (
          site_id, dirty_since, last_change_at, pending_count, updated_at
        ) VALUES (
          ?,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          (SELECT COUNT(*) FROM site_rebuild_requests WHERE site_id = ? AND status IN ('pending', 'failed_retryable')),
          CURRENT_TIMESTAMP
        )
        ON CONFLICT(site_id) DO UPDATE SET
          dirty_since = COALESCE(site_publish_state.dirty_since, excluded.dirty_since),
          last_change_at = CURRENT_TIMESTAMP,
          pending_count = (SELECT COUNT(*) FROM site_rebuild_requests WHERE site_id = excluded.site_id AND status IN ('pending', 'failed_retryable')),
          updated_at = CURRENT_TIMESTAMP`
      )
      .bind(siteId, siteId),
  ];
}

function normalize(value) {
  return (value || "").toString().trim();
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Math.random().toString(36).slice(2, 12);
}

export async function getPublishedSiteIdsForFranchise(db, franchiseId, homeSiteId = SITE_FRANCHISOR_ID) {
  const siteIds = new Set();
  if (homeSiteId) siteIds.add(homeSiteId);
  const fid = normalize(franchiseId);
  if (!fid) return Array.from(siteIds);
  try {
    const rows = await db
      .prepare(
        `SELECT DISTINCT site_id FROM franchise_site_publications
         WHERE franchise_id = ? AND publication_status = 'published'`
      )
      .bind(fid)
      .all();
    for (const row of rows.results || []) {
      if (row.site_id) siteIds.add(row.site_id);
    }
  } catch (_error) {
    // Fallback gracefully to homeSiteId
  }
  return Array.from(siteIds);
}

export async function getPublishedSiteIdsForProfile(db, profileId, homeSiteId = SITE_FRANCHISOR_ID) {
  const siteIds = new Set();
  if (homeSiteId) siteIds.add(homeSiteId);
  const pid = normalize(profileId);
  if (!pid) return Array.from(siteIds);
  try {
    const rows = await db
      .prepare(
        `SELECT DISTINCT p.site_id FROM franchises f
         JOIN franchise_site_publications p ON p.franchise_id = f.id
         WHERE f.franchisor_profile_id = ? AND p.publication_status = 'published'`
      )
      .bind(pid)
      .all();
    for (const row of rows.results || []) {
      if (row.site_id) siteIds.add(row.site_id);
    }
  } catch (_error) {
    // Fallback gracefully to homeSiteId
  }
  return Array.from(siteIds);
}

export function fanoutSiteRebuildStatements(db, siteIds, options) {
  const uniqueSiteIds = [...new Set((siteIds || []).filter(Boolean))];
  return uniqueSiteIds.flatMap((siteId) => siteRebuildStatements(db, { ...options, siteId }));
}

