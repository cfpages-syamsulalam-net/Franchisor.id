# R2/D1 Migration Runbook

> Current Franchise Network context: [membership rollout](../product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md) and [Franchisor user journeys](../product/FRANCHISOR_USER_JOURNEYS.md). Historical implementation notes here do not prove production behavior.

> Migration ownership notice: Franchisor.id consumes the shared D1/R2 contract, but shared schema migrations remain owned and applied from `../Franchisee.id` until a dedicated network infrastructure repository exists.

Last updated: 2026-07-22 (Asia/Jakarta)

## Purpose
Use this checklist for one-time migrations that move large text/media payloads out of D1 and into R2 while D1 keeps only metadata, previews, structured fields, and object keys.

## Rules
- New large payload writes must go to R2 first; D1 stores object pointers and review metadata.
- Migration scripts must be idempotent and batch-based.
- Cleanup must happen only after remote verification confirms every migrated row has an R2 object key and a readable preview or fallback.
- Do not keep a dashboard button that implies future data will be written to D1 first and migrated later.

## Standard Flow
1. Add or verify D1 columns that store R2 object keys, previews, hashes, and migration status.
2. Write a replayable migration script that:
   - selects only rows missing the target R2 key,
   - writes the R2 object,
   - updates D1 metadata after the R2 write succeeds,
   - logs batch progress without printing secrets.
3. Run a dry count against remote D1.
4. Run the remote migration sequentially. Do not parallelize Wrangler/cfman D1 operations.
5. Verify remote counts:
   - no unmigrated rows remain for the target payload,
   - no rows point to empty object keys,
   - representative objects are readable from R2,
   - old compatibility reads still work for pre-cleanup rows.
6. Run cleanup only after verification:
   - clear large D1 payload columns,
   - keep previews and structured extraction fields,
   - keep object keys and audit metadata.
7. Update the focused contract/runbook, `CODEBASE.md`, `js/symbols_inventory.md` when JavaScript ownership changes, `CHANGELOG.md`, and session context.

## OCR Text Status
The historical OCR text backfill completed on 2026-07-16. New OCR text should be written to R2 directly through `_ocr-text-store.js`; D1 should not become the primary long-text store again.

## Network Identity and Lifecycle Migrations (0040–0047)
Applied additively to production D1 `franchise_db` between 2026-09-27 and 2026-09-28. Migration SQL ownership resides in `../Franchisee.id/migrations/`:
- `0040_user_identities.sql`: Created `user_identities` table and backfilled existing users (`app_key='franchisee_id'`, `link_basis='first_identity'`). Enables multiple Clerk applications to map to a single D1 user without overwriting `users.clerk_user_id`.
- `0041_user_status_events.sql`: Append-only status timeline for auditability (`active`, `pending`, `suspended`, `blocked`).
- `0042_user_membership_events.sql`: Append-only membership timeline for tiers (`free`, `premium`).
- `0043_user_blocks.sql`: Salted email-hash tombstone table surviving account erasure.
- `0044_idx_users_primary_email_unique.sql`: Partial unique index enforcing one row per lowercased email.
- `0045_franchise_removals.sql`: Delist records for owner brand removal, preserving publication snapshot for admin restore.
- `0046_asset_cleanup_outbox.sql`: Durable outbox for R2 media cleanup after account/brand erasure.
- `0047_account_erasure_consents.sql`: Signed contract consent storage (`path/v1` vector gesture) for self-service erasure and paid time forfeiture.

