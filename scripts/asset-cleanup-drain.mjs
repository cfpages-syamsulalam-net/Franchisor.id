#!/usr/bin/env node
/**
 * Drain the asset cleanup outbox: delete the R2 objects that account erasure could not.
 *
 * `_account-erasure.js` records every media key in `asset_cleanup_outbox` inside the same batch that drops its
 * ownership row, and deletes the object immediately after the commit. Anything that failed stays
 * `failed_retryable` with no consumer until now — which meant the outbox only grew and the media was never
 * actually removed. This is that consumer.
 *
 * Deliberately a scheduled script rather than a Cloudflare cron: Pages Functions have no scheduled handler, and
 * the publish queue in this repository is drained the same way, by a GitHub Actions schedule.
 *
 * Object keys are never printed. They are not secrets, but they are the most identifying part of a deleted
 * person's media and this job's output is retained in CI logs.
 */
import process from "node:process";

export class CleanupError extends Error {}

function fail(message) {
  throw new CleanupError(message);
}

// Same allowlist discipline as the publish poller: a repository that is not approved, or an account/database that
// does not match it, refuses to run rather than pointing a destructive token at the wrong place.
const REPOS = {
  "cfpages-syamsulalam-net/Franchisor.id": { account: "0ba63b7f0096bc267a93fe5c80b1f571", database: "812cd8ac-edd0-45d9-981f-c9a15358317b" },
  "cfpages-syamsulalam-net/Franchisee.id": { account: "0ba63b7f0096bc267a93fe5c80b1f571", database: "812cd8ac-edd0-45d9-981f-c9a15358317b" },
};

export function validateConfiguration(env = process.env) {
  const repo = env.GITHUB_REPOSITORY;
  if (repo && !REPOS[repo]) fail("repository is not approved");
  const required = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_API_TOKEN"];
  for (const key of required) if (!env[key]) fail(`missing configuration: ${key}`);
  if (repo) {
    const cfg = REPOS[repo];
    if (env.CLOUDFLARE_ACCOUNT_ID !== cfg.account) fail("account does not match repository allowlist");
    if (env.CLOUDFLARE_D1_DATABASE_ID !== cfg.database) fail("database does not match repository allowlist");
  }
  return {
    account: env.CLOUDFLARE_ACCOUNT_ID,
    database: env.CLOUDFLARE_D1_DATABASE_ID,
    token: env.CLOUDFLARE_API_TOKEN,
    defaultBucket: env.ASSET_BUCKET || "franchise-assets",
    limit: Number.parseInt(env.CLEANUP_LIMIT || "50", 10) || 50,
  };
}

async function d1(config, sql, params = [], fetchImpl = globalThis.fetch) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.account}/d1/database/${config.database}/query`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success !== true) fail(`D1 request failed (${response.status || 0})`);
  return body.result?.[0];
}

/** Slashes stay literal; only the characters inside each segment are escaped. */
function encodeKey(key) {
  return String(key).split("/").map(encodeURIComponent).join("/");
}

/**
 * What the outbox's `r2_bucket` column actually holds, and what the API needs.
 *
 * Uploads store the Pages **binding label** `FRANCHISE_ASSETS` (see `profile-upload.js`, `premium-receipt-upload.js`),
 * but the Delete Object route takes the **physical bucket name** `franchise-assets`. Verified 2026-09-28 against the
 * live API with deletes of nonexistent keys: the label answers HTTP **400** `10005` "The specified bucket name is
 * not valid", while a genuinely absent object in the real bucket answers HTTP **200** with `success: false`,
 * `10007` "The specified key does not exist". Neither is a 404, so the check below cannot be status-based alone —
 * `response.ok` on a `success: false` body would have treated an absent object as a failure and retried it forever.
 */
const KNOWN_BUCKETS = { FRANCHISE_ASSETS: "franchise-assets", "franchise-assets": "franchise-assets" };

export function resolveBucket(stored, defaultBucket) {
  const candidate = stored || defaultBucket;
  return KNOWN_BUCKETS[candidate] || null;
}

export async function deleteObject(config, bucket, key, fetchImpl = globalThis.fetch) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.account}/r2/buckets/${encodeURIComponent(
    bucket
  )}/objects/${encodeKey(key)}`;
  const response = await fetchImpl(url, { method: "DELETE", headers: { Authorization: `Bearer ${config.token}` } });
  const body = await response.json().catch(() => null);
  const codes = new Set(((body && body.errors) || []).map((entry) => entry && entry.code).filter((code) => code != null));
  // Absence is a body shape, not a status: the API answers a missing object with HTTP 200 `success: false` 10007,
  // and historically a bare 404 has meant the same. Both mean the state we wanted, so the row may close.
  if (response.status === 404 || (body && body.success === false && codes.has(10007))) {
    return { deleted: true, alreadyGone: true };
  }
  // An unknown bucket, or any other answered failure, must NOT close the row: the object may still exist
  // somewhere, and closing the only retry record is exactly how media outlives the account it belonged to.
  if (!response.ok || !body || body.success !== true) {
    return { deleted: false, status: response.status, errorCode: [...codes][0] ?? null };
  }
  return { deleted: true, alreadyGone: false };
}

export async function drainOnce(config, fetchImpl = globalThis.fetch, log = () => {}) {
  const pending = await d1(
    config,
    `SELECT id, r2_bucket, r2_key FROM asset_cleanup_outbox
     WHERE status IN ('pending', 'failed_retryable')
     ORDER BY created_at, id
     LIMIT ?`,
    [config.limit],
    fetchImpl
  );

  const rows = Array.isArray(pending?.results) ? pending.results : [];
  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    // The row value is a binding label, not a bucket name — resolve it before anything touches the API, and refuse
    // to guess when it is unknown. An unresolvable name goes back on the queue with its reason rather than being
    // sent to R2 as-is, where the API would answer 400 and, under the old status-only reading, look retryable-but-
    // harmless while the real object sat untouched in the real bucket.
    const bucket = resolveBucket(row.r2_bucket, config.defaultBucket);
    if (!bucket) {
      await d1(
        config,
        `UPDATE asset_cleanup_outbox
         SET status = 'failed_retryable', attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('pending', 'failed_retryable')`,
        [`unknown bucket ${String(row.r2_bucket || "").slice(0, 80) || "(empty)"}; not sent to R2`.slice(0, 300), row.id],
        fetchImpl
      );
      failed += 1;
      continue;
    }
    let outcome;
    try {
      outcome = await deleteObject(config, bucket, row.r2_key, fetchImpl);
    } catch (error) {
      outcome = { deleted: false, status: "network" };
    }

    if (outcome.deleted) {
      await d1(
        config,
        `UPDATE asset_cleanup_outbox
         SET status = 'done', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, last_error = NULL
         WHERE id = ? AND status IN ('pending', 'failed_retryable')`,
        [row.id],
        fetchImpl
      );
      deleted += 1;
    } else {
      // The key is NOT included; the row id is enough to find it, and the row is the durable record.
      await d1(
        config,
        `UPDATE asset_cleanup_outbox
         SET status = 'failed_retryable', attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('pending', 'failed_retryable')`,
        [`r2 delete failed (status ${outcome.status || "unknown"}${outcome.errorCode != null ? ` code ${outcome.errorCode}` : ""})`.slice(0, 300), row.id],
        fetchImpl
      );
      failed += 1;
    }
  }

  const summary = { attempted: rows.length, deleted, failed };
  log(`asset cleanup: attempted=${summary.attempted} deleted=${summary.deleted} still_pending=${summary.failed}`);
  return summary;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/asset-cleanup-drain.mjs");
if (invokedDirectly) {
  try {
    const config = validateConfiguration();
    const summary = await drainOnce(config, globalThis.fetch, (line) => console.log(line));
    // A per-object failure is recorded durably, so it is not a job failure: the next run retries it. Exiting
    // non-zero here would page somebody for something the outbox already handles.
    if (summary.attempted > 0 && summary.deleted === 0 && summary.failed > 0) {
      console.log("asset cleanup: nothing deleted this run; the outbox retains every key for the next attempt");
    }
  } catch (error) {
    console.error(`asset cleanup failed: ${error?.message || error}`);
    process.exit(1);
  }
}
