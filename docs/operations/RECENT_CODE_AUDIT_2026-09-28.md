# Franchisor.id recent-code audit — 2026-09-28

**Decision:** changes need fixes and a new acceptance review before the account-deletion and brand-removal journeys are described as production complete. This is a documentation-only review; no application code, database, provider setting, or deployment was changed.

## Scope and current contract

- Reviewed `159a58c3d977150028f705458d85ac3591ae5bd9..da94d39f8822ae865ffc69882bec70b34de9179d` on `main`. The working tree matched `origin/main` when reviewed.
- Deterministic `ocr delegate preview` selected 34 code/config files. A read-only Luna reviewer traced all 34 and resolved their OCR rules. The 14 exclusions were 13 Markdown/context files and `.github/scripts/test_premium_email_worker.py`; the Python diff only changes the approved GitHub repository identity. The new infrastructure, provider, checklist, parity, and `CODEBASE.md` claims were also read manually.
- Both sites share D1 and R2 but use separate Clerk applications joined by `user_identities` on verified email. Franchisee owns migrations 0040–0045. Franchisor's directory is `/peluang-usaha/`; its brand detail is `/usaha/{slug}`. Franchisee's directory and detail use `/peluang-usaha/`.
- Franchisor builds static brand HTML from a D1 snapshot and retains selected legacy brand HTML. A successful D1 write alone cannot remove HTML already deployed to Pages.

## F1 — Removal and erasure can leave public brand pages online (high; release blocker)

**Evidence.** [`removeOwnedBrand`](../../functions/_profile-franchisor-actions.js) hides every `franchise_site_publications` row and archives the franchise at lines 414–461, but its batch omits `siteRebuildStatements`. Its [`/profile-data` caller](../../functions/profile-data.js) at line 85 returns the result without a publish request. [`eraseAccount`](../../functions/_account-erasure.js) at lines 209–278 does the same for proven owned brands. Both flows can therefore report success with no request for either site's static publisher. The shared queue helper exists in [`_site-publish-queue.js`](../../functions/_site-publish-queue.js); other brand edits already use it.

The problem persists after an incidental Franchisor rebuild for a retained legacy brand. [`copy-legacy-static.mjs`](../../scripts/copy-legacy-static.mjs) at lines 151–161 copies `usaha/<slug>/index.html` to `dist/usaha/<slug>.html` without checking current publication/removal state. Once the D1 generated page disappears, that copy can fill the same canonical URL. The current [`brand:removal:check`](../../scripts/check-brand-removal.ts) asserts hidden D1 rows but does not inspect queue rows or the built page.

**Impact.** A visitor or search crawler can still open `/usaha/{slug}` after the owner was told the brand was removed. Franchisee's already deployed detail may also persist. If the page contains contact information, this defeats the practical effect of account erasure.

**Fix handoff.** In the same D1 transaction as the publication transition, enqueue a rebuild for every affected site ID, including `site_franchisor_id` and any Franchisee publication. Preserve the previous publication snapshot for restoration. Make the legacy-copy step consult an authoritative removal/suppression set, so a delisted legacy slug cannot be republished when the D1 page is omitted. Avoid a broad rule that drops unrelated legacy pages. Define the behavior of the removed URL (404/410 or a deliberate redirect) and keep canonical, sitemap, directory card, and detail output consistent. Account erasure needs the same cross-site path.

**Acceptance.** With a synthetic published brand on both sites, remove it and erase an owner in separate cases. Assert one pending request per affected site in the same committed batch; run each publisher; then request both public detail URLs and assert the brand content is absent. Repeat with a slug that has a retained legacy `usaha/<slug>/index.html`. Assert restoring a brand queues each restored site and republishes its previous approved state. Verify actual Pages responses after deployment; a local build only proves its own output.

## F2 — Premium expiry treats a failed lookup as an empty result (high)

**Evidence.** [`expirePremiumAfterGrace`](../../functions/_premium-lifecycle.js) commits the expiry batch at line 369, then asks whether the user has another active subscription at lines 376–385. `.catch(() => null)` at line 386 turns any D1 failure into the same value as “none found”; lines 388–394 append a `free` membership event. An owner with a second active brand can lose network Premium status because one lookup failed.

There is also a retry boundary: the subscription was already marked expired before that lookup. Merely removing `.catch(() => null)` would throw after the batch, while a retry that selects only `status = 'active'` expired candidates (lines 278–316) may never revisit this row to record the correct membership transition. A later event could repair it accidentally, but that is not a reliable recovery rule.

**Fix handoff.** Require a successful active-subscription lookup before deciding a downgrade. Make subscription expiry and the corresponding membership decision retry safe: perform the decision before irreversible status mutation and commit the status/event together where possible, or add a reconciliation path for already expired subscriptions. Do not make a D1 error mean “no membership.” Preserve billing and subscription history.

**Acceptance.** Give one user an expired subscription and a second active subscription. Inject a failure in the second-subscription query; no `free` event may be written and the operation must be retryable. On retry, the user remains Premium. For a genuinely last expired subscription, exactly one effective `free` transition results even if the worker retries after a partial failure. Run the existing normal-expiry checks as well.

## F3 — Repository guidance contradicts the shipped identity and erasure design (medium; documentation)

[`CODEBASE.md`](../../CODEBASE.md) lines 114–115 and 143–145 still describe deletion/erasure as future work or `erasure_pending`, although `deleteAccount` now invokes `eraseAccount` and the UI says deletion completed. Lines 172–175 still describe Franchisor as a Clerk satellite. [`MANUAL_SETUP_CHECKLIST.md`](MANUAL_SETUP_CHECKLIST.md) lines 110–143 instruct an operator to use the same Clerk application and satellite variables, while [`INFRASTRUCTURE.md`](../architecture/INFRASTRUCTURE.md) lines 175–189 and current code describe two applications and separate credentials. [`PROVIDER_BOUNDARY_RECORD.md`](PROVIDER_BOUNDARY_RECORD.md) also retains historical satellite instructions and old pending-secret language. These can cause the next AI or operator to configure the wrong Clerk instance or repeat a completed step.

**Fix handoff.** After confirming current production settings without exposing secrets, make one authoritative two-app setup checklist. Date and label the satellite sections as historical, remove operational instructions that conflict with `CLERK_APP_KEY` and `user_identities`, reconcile the top-level `CODEBASE.md` and provider record, and state which production smoke tests have actually run. Keep the infrastructure note about write-only Cloudflare secrets and the migration-ledger safety rules. The new audit does not itself prove the live provider configuration.

## Verified behavior and remaining proof

- `pnpm run brand:removal:check`, `auth:status:check`, `schema:check`, `resolver:parity:check`, `ownership:check`, and `node scripts/test-d1-static-publish-poller.mjs` passed locally. `directory:check` passed its redirects but reported zero listing/category fixtures, so it is not a populated-directory proof.
- `published:check` was not run by the read-only reviewer because its fixture replaces tracked snapshot files and build output. The authored check remains useful but its result is not evidence from this audit.
- Current resolver behavior was traced for verified-email linking, block/suspension preservation, and per-app identity revocation. The new 404 page and deprecated-detail redirect have local gates. None of those gates cover F1's full deployed URL or F2's failed lookup.
- No live D1 write, Clerk mutation, Cloudflare deployment, or production endpoint acceptance test was performed. Record deployment SHA and both-domain HTTP results when the fixes are implemented.

## Suggested fix order

1. Close F1 in both repositories with cross-site queueing and legacy-page suppression; prove URL retirement after Pages deployment.
2. Close F2 with a failure-injection test covering the post-commit retry boundary.
3. Reconcile F3's operational documents before the next Clerk/provider change.
4. Rerun local checks and request an independent review of the exact fix commits. The companion Franchisee audit covers the shared erasure, block, email, and R2 failure paths.
