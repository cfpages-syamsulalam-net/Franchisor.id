# Franchisor.id latest-diff re-audit — 2026-09-28

**Scope.** This follows [the earlier audit](RECENT_CODE_AUDIT_2026-09-28.md) and reviews `b1625935b76dd17c7e66e7c74817eba4b2c81cd8..3043d9a7e248df14682d2b773932147d10dd944e`. Deterministic OCR preview selected 15 reviewable paths; `CODEBASE.md`, `docs/README.md`, `MANUAL_SETUP_CHECKLIST.md` and `PROVIDER_BOUNDARY_RECORD.md` were read manually. A read-only delegated reviewer traced the current callers and tests; no OCR-managed model or TokenHarbor call was made. Runtime model identity was not independently attested. No application code, database, provider setting or deployment changed in this audit.

**Decision.** The earlier removal/rebuild queue defect and Premium lookup-failure defect are fixed in local code. Production URL retirement, two-app identity, R2 cleanup, erasure completion and a Premium renewal race remain open. Franchisor's directory is `/peluang-usaha/`, while its detail/canonical family is `/usaha/{slug}`. Franchisee uses `/peluang-usaha/` for both directory and detail; fixes must preserve that distinction.

## N1 — R2 cleanup can close the wrong-bucket 404 (high)

`functions/profile-upload.js:114` and `functions/premium-receipt-upload.js:81` store `FRANCHISE_ASSETS`, the Pages binding label, in `franchise_assets.r2_bucket`. The physical bucket is `franchise-assets` (`MANUAL_SETUP_CHECKLIST.md:63,71`). The shared `scripts/asset-cleanup-drain.mjs:95` prefers the row value over its correctly configured `ASSET_BUCKET`; `:74,107` treats any REST HTTP 404 as already deleted and marks the outbox row `done`. A missing-bucket response can thus end retries while the real object remains. The official [Cloudflare Delete Object API](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/delete/) uses a physical bucket-name route parameter; it does not establish that every 404 means the object is gone. The Franchisee workflow is the intended scheduled consumer every 30 minutes; this is not a missing-scheduler finding. Both repo copies of the drain script are byte-identical at review time.

**Repair:** map historical binding labels to physical names, reject unknown buckets, and distinguish proven missing-object outcomes from missing-bucket/other 404s. Keep unresolved keys retryable and visible to operators. **Acceptance:** seed `r2_bucket='FRANCHISE_ASSETS'` with a real object in `franchise-assets`, run the consumer, and verify that object is gone. Inject separate missing-bucket and missing-object responses; only the latter may close the row. Apply and test the shared fix in both repositories.

## N2 — A stale sibling Clerk email may bypass the permanent block (high when two-app rollout is enabled)

`_profile-account.js:201-230` changes only the current Clerk application's email and then updates shared `users.primary_email`. An existing sibling identity can write its older address back through `_clerk-auth.js:622-648`. Deletion blocks only `actor.primary_email` (`_profile-account.js:77-85`) before `_account-erasure.js:41-54` removes identity links. The unblocked verified sibling address can then appear as a new person to the resolver. Local tests cover same-address re-entry, not two linked Clerk identities with different emails. A fresh read-only `/auth-config` observation on 2026-09-28 showed `configured:false,isSatellite:true`; the two-app sequence is **not proven reachable on the current live Franchisor runtime**. Do not infer sign-in works from that endpoint.

**Repair:** reconcile linked verified emails and enforce a stable person block or block all known verified addresses in the atomic deletion transition. **Acceptance:** link two Clerk IDs with different verified emails to one D1 user, change one address, sign in through the sibling, delete from each site in separate runs, and prove every old/new address stays blocked after identity links are removed.

## N3 — Account erasure precedes terminal membership/status events (high)

`_account-erasure.js:216-333` atomically commits the D1 erasure, block and consent. `_profile-account.js:124,136` subsequently appends the `free` membership and blocked-status events. If either write fails, the handler errors after the account has been erased and blocked. The user cannot retry; effective Premium can remain in retained history. Happy-path tests do not prove this failure boundary.

**Repair:** add the required event statements to the erasure batch or use a durable exactly-once reconciliation state. **Acceptance:** inject a failure at each event write and verify either the entire deletion rolls back or a worker finishes the terminal events. The effective membership read must be Free after a completed erasure, including on retry.

## N4 — A concurrent Premium renewal can be undone by expiry (high)

`_premium-lifecycle.js:307,322` reads replacement subscriptions and member entitlement before the expiry batch at `:418`. Another request can activate a subscription after those reads. The stale expiry batch may then expire the old row, hide Franchisor publication, set the listing Free and append a `free` event after the renewal. Moving the lookups before the batch fixed the earlier fail-open query error and retry path, but did not serialize this decision with subscription approval.

**Repair:** make the no-replacement condition part of the committing transition or serialize expiry with approval, then reconcile publication and membership from the actual committed entitlement. A bare stale preflight check is insufficient. **Acceptance:** pause expiry after its second lookup, approve a replacement subscription, release the expiry batch, and assert no Free event or hidden publication wins over the new active subscription. Include a genuinely last-expired-subscription case and safe retry.

## N5 — Legacy-page suppression does not use Franchisor publication state (medium)

`scripts/build-d1-franchise-pages.ts:280-282` selects slugs across sites when canonical status is archived/suspended. It does not scope `site_id='site_franchisor_id'` or suppress a Franchisor publication hidden after Premium expiry while the canonical row remains Free. The shared schema permits the same slug on different sites. Consequently, an archived Franchisee-only slug can suppress an unrelated Franchisor legacy page, while a hidden Franchisor publication can let retained `/usaha/{slug}` HTML reappear through `copy-legacy-static.mjs`. That copy step also warns on a suppression file whose `source` is not `d1`; a stale artifact should fail the build rather than silently republish a removed brand.

**Repair:** derive suppression from the inverse of the actual Franchisor public-read predicate, scoped by Franchisor site and slug; require a current D1-derived suppression artifact in the same build. **Acceptance:** a hidden or expired Franchisor publication with retained legacy HTML stays absent from directory, detail, sitemap and canonical output. A distinct active Franchisor publication with the same slug as an archived sibling-site row stays visible. Run a real build with each seeded row and inspect `dist`, then verify deployed HTTP after publication.

## N6 — Erasure consent versions are caller controlled (medium)

The deletion page supplies fixed contract and acknowledgement versions (`src/pages/pengaturan/hapus-akun/index.astro:10,14`), but `_profile-schemas.js:131,136` accepts arbitrary nonempty values and `_profile-account.js:49,94-107` stores the submitted strings without matching them to server-owned current text. Direct authenticated requests or stale pages can create a consent row that does not identify the displayed agreement. The Franchisee companion re-audit also finds unvalidated signature structure and oversized renderer dimensions in the shared flow.

**Repair:** bind both versions to server-owned accepted constants before any destructive write, and adopt the shared structural signature validation. **Acceptance:** arbitrary or stale versions fail without writes; a valid current version records the exact displayed contract/declaration; invalid signatures never trigger erasure.

## Earlier findings and deployment limits

| Earlier finding | Current disposition |
| --- | --- |
| F1: removal/erasure did not queue rebuilds | Fixed locally: `_profile-franchisor-actions.js:414-480` and `_account-erasure.js:221-333` queue affected sites in their D1 batches; `check-brand-removal.ts` asserts both-site queue rows. The new legacy suppression predicate is still wrong (N5), and no deployed URL retirement was tested. |
| F2: failed subscription lookup caused a Free event | Fixed for the reported lookup failure/retry path: both reads now precede the expiry batch and injected lookup failure leaves the candidate retryable; `check-auth-status.ts` passes. N4 is a different concurrent-renewal interleaving. |
| F3: identity and erasure docs stale | Partly fixed. The new two-app guidance and `CODEBASE.md` are clearer, but `MANUAL_SETUP_CHECKLIST.md:114` says the live site is a satellite while `:167` says satellite values were removed; `PROVIDER_BOUNDARY_RECORD.md:16` still says step 0.12 is pending. The fresh `/auth-config` result supports the flag being present, not working login. Reconcile only after a fresh provider-state check. |

Local `pnpm exec tsx scripts/check-auth-status.ts`, `pnpm exec tsx scripts/check-brand-removal.ts`, and `pnpm run resolver:parity:check` passed. No production D1/R2/Clerk mutation, Pages build, or deployment ran. Presence of migrations and queues in source is not proof of shared remote D1 state or visible URL removal. Before closing this review, repair N1/N3/N4, settle N2/N6 for the two-app launch, correct N5 with seeded real-build output, verify Cloudflare deployment and both-domain HTTP/card/sitemap results, then repeat an independent review of the fix commits.
