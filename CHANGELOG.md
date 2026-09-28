# Changelog

## 2026-09-28 — 0.12 step 18 (part): new Clerk application keys stored

- **Stored:** new application's `PUBLIC_CLERK_PUBLISHABLE_KEY` (plain text), `CLERK_SECRET_KEY` (secret) and `CLERK_APP_KEY=franchisor_id` (plain text) on the `franchisor-id` Pages project, **production** only — preview untouched per Syamsul's call. Clipboard key shapes revalidated immediately before sending (`pk_live_` 35 chars, `sk_live` 50 chars, no whitespace, no dupes).
- **Removed from production:** the six satellite-only vars (`CLERK_IS_SATELLITE`, `CLERK_DOMAIN`, `CLERK_SIGN_IN_URL`, `CLERK_SIGN_UP_URL`, `CLERK_ALLOWED_REDIRECT_ORIGINS`, `CLERK_SATELLITE_AUTO_SYNC`) via single-key `[key]: null` PATCHes — the shape wrangler's own `pages secret delete` uses, confirmed from the bundled source rather than docs memory. Survivor list re-read after: 10 vars, all expected, both pre-existing secrets intact.
- **Local:** clipboard written to `.dev.vars` for `wrangler dev`; `.gitignore` gained `.dev.vars` (it only covered `.env`, so the file showed as untracked — caught before it could be committed). The secret values appear nowhere in this changelog, the docs, or the repo.
- **Still open (both need the Clerk dashboard, neither exists anywhere readable):** `CLERK_AUTHORIZED_PARTIES` still holds the satellite-era origins and must be re-set to the new app's own parties, and `CLERK_WEBHOOK_SIGNING_SECRET` needs the new `/clerk-webhook` endpoint created first (plan step 19). Until both are set, sign-in on the new app is unproven — use plan §7 live scenarios 1–3, not `/auth-config` alone.
- **Not a deploy:** no code changed, no build triggered. The new keys take effect on the next production deployment.

## 2026-09-28 — Re-audit repairs: shared fixes plus suppression, renewal guards, and a recovered schema

- **Shared with Franchisee.id (same repairs, same proofs):** F1/N1 bucket-label mapping with body-shape absence, F3/N3 terminal events inside the erasure batch, F4/N6 server-owned consent versions with structural gesture validation, N4 `renewed`-guarded expiry with commit-reflecting counts, and F2/N2 per-address blocks with person-level refusal. `auth:status:check`, `premium:lifecycle:check`, `resolver:parity:check` and `state-transitions:check` all pass; `check-auth-status.ts`, `_account-erasure.js`, `asset-cleanup-drain.mjs` and `render-signature.mjs` are byte-identical across the two repositories.
- **N4 Franchisor half — the brand and publication downgrade carry in-batch `NOT EXISTS` guards.** This repository's expiry path gates those writes on a pre-batch `hasReplacement` lookup, so the same mid-flight renewal would have downgraded the brand and hidden the publication even with the row guard in place. Both statements now re-check liveness inside the committing batch; the lifecycle check proves the interleaving leaves tier and publication intact.
- **N5 — suppression is the inverse of the public read, and a non-D1 set stops the build.** `fetchSuppressedSlugs` now suppresses a Franchisor projection unless its own publication row is `published` for `site_franchisor_id` and the brand is neither archived nor suspended — so a Premium-hidden brand is suppressed exactly like an archived one, and a sibling site's hidden row cannot suppress this site's page. `copy-legacy-static.mjs` exits non-zero on a non-D1 removal set instead of warning through it. New `suppression:check` (wired into `build:astro`) proves archived, suspended, hidden, live and cross-site cases against the real migration chain, plus the gate itself.
- **N6 Franchisor half — consent versions bound to the same server-owned literals**, with the page already at `2026-09-28.1` on both sites.
- **Recovered during the port: `RemoveBrandSchema` had been dropped from `MutationSchema`.** Copying the consent-hardened `_profile-schemas.js` over deleted the `remove_brand` action the dashboard's `removeOwnedBrand` still serves — the brand-removal gate caught it (`the confirmation phrase is accepted` failing at first assertion), which is the gate doing its job. Restored verbatim; `brand:removal:check` passes.
- **Also repaired:** the parity checker's `\n}\n` scan (CRLF + indented closers failed the whole gate; now brace-matches), and the lifecycle test's canonical fallback, which asserted the Franchisee.id fallback inside this repository whose `_premium.js` falls back to its own domain.
- **Not done here, stated plainly:** no production D1/R2/Clerk mutation, no Pages build or deployment, no live two-app sign-in acceptance, no deployed URL retirement proof (E1/N1-acceptance still needs the REST consumer exercised against seeded rows, not just mocks).

## 2026-09-28 — Latest-diff code re-audit (documentation only)
- Added [latest-diff re-audit](docs/operations/RECENT_CODE_REAUDIT_2026-09-28.md) for `b162593..3043d9a`, including six findings, earlier-finding dispositions and release checks. Linked it from `CODEBASE.md` and `docs/README.md`.
- Added `.context/session-20260928-1815.md` for the implementation handoff. No application code or production state changed.

## 2026-09-28 — Documentation-only review of recent code

- Added [recent-code audit](docs/operations/RECENT_CODE_AUDIT_2026-09-28.md) for the current Franchisor head, with cross-site static-removal and Premium-expiry failure findings, evidence, and acceptance checks. Linked it from the codebase and documentation index. No application code or production state changed.

## 2026-09-27 (latest) — Account deletion now actually deletes

- **The erasure is wired in and the promises are true.** Until now the screen said the erasure was an admin follow-up, because it was. Now `deleteAccount` blocks the account and then erases it, the response reports `erased: true`, and the acknowledgement version is bumped to **2026-09-27.2** — one line of the consequence text was corrected too (`Brand yang Anda miliki` rather than `kelola`, because only a proven owner's brand goes).
- **Only a *proven* owner's brand is removed.** `franchises.owner_user_id` alone does not establish ownership — nothing in the schema binds that column to a claim — so it uses the same predicate the brand-removal action does. A brand the person merely has a profile attached to is left standing **and reported back**, so a decision and an oversight look different. Tested directly: two brands, one proven, one not.
- **Archived, not deleted** — a hard delete cascades into premium orders and the ownership proof. Archived is what stops it being published, which is what "my brand is gone" requires. Contact fields and media references are cleared, a `franchise_removals` row records why, and its assets and R2 objects go. Descriptive fields stay: a delisted stub is not personal data, and blanking it would destroy the last context for the financial rows.
- **A dangerous shortcut deliberately not taken:** assets are not deleted by `uploaded_by_user_id`. That column also holds bulk-import uploaders, so deleting by uploader could have taken out media belonging to brands with nothing to do with this person.
- **Order matters twice.** The block goes in *before* the erasure, so a failed erasure still leaves the person unable to sign in. And R2 deletion happens *after* the database commit — an object left behind costs storage, whereas rows pointing at files that no longer exist is a broken site.
- **Two bugs the tests caught, not review.** `users.clerk_user_id` is `NOT NULL`, so clearing it aborted the entire batch; it is now tombstoned with a per-user value. And the existing test's `erasure_pending` assertion failed the moment the behaviour changed — which is exactly what should happen to stale copy.
- ⬜ Residual: the Clerk *user* is not deleted at Clerk. The D1 block is what refuses entry, so this is belt-and-braces and needs the per-app secret keys.

## 2026-09-27 — One login for the network, and first login now really is registration

- **The `Masuk / Buat Akun` tab bar is gone.** There is one login screen, framed as the network account: one account for the whole network, use the **same** email as on our other sites so brand, subscription and settings sync.
- **Google is the first and recommended action**, with a note saying why: it is faster, and Google has already verified the address — which is exactly what makes cross-site account linking work. A person signing in with Google arrives verified, so they link to their existing account instead of silently creating a second one.
- **The mechanical half, which is not wording.** Previously a first-time visitor who typed an email into the login form got "account not found" and had to find a separate signup page. `handleLogin` now catches `form_identifier_not_found` and hands them into registration with the email prefilled, so first login *is* registration. Google already behaved this way (`continueSignUp`); only the email path did not.
- **Only that one code counts as "no account".** `form_password_incorrect` must never trigger it: that is somebody with a real account mistyping their password, and sending them into registration would offer to create a second account for an email that already has one. A visible "Pertama kali di jaringan ini?" link stays as the guaranteed path if Clerk ever stops exposing the code.
- The register form stays in the DOM but has no tab, because the email-verification step and the first-login hand-off both need it. Verified in the **built** output of both sites, not the source.
- ⬜ Not done: the `Daftar` links in the navs still point at a separate-signup page that no longer conceptually exists (recorded as 0.11b).

## 2026-09-27 — The deletion screen is now reachable, on both sites

- **The Akun tab ends in a danger row** linking to `/pengaturan/hapus-akun/`, so the screen the previous entry added is finally reachable. Verified in the **built** `dist/js/profile-account.js` rather than the source, because that tab is client-rendered and a source-only check would have proved nothing.
- **`franchisee.id` gets the screen too** (274 → 275 pages). That is more than symmetry: the account is shared across the network, so it should be closable from whichever site the person happens to be on.
- Both sites rebuilt green, all asset references resolving.

## 2026-09-27 — Account deletion screen, with the acknowledgement recorded

- **`/pengaturan/hapus-akun/`** states the consequences in full, requires the person to type `HAPUS AKUN SAYA`, and carries an **acknowledgement version** for the exact text they saw. The server validates the phrase against the same literal, so a stray click, a near miss or a replayed request cannot remove an account; the version is required by the schema and stored on the block row, so we can always show what someone actually agreed to.
- **What it deliberately does not claim.** The data erasure is plan step 0.7b and does not exist yet, so the response returns `erasure_pending: true` and the message describes the erasure as an admin-executed follow-up. The **block is real** — the account is blocked, the status timeline records it, and the same email cannot register again; the test proves all three. Copy asserting that data was deleted while it still exists was the one thing worth refusing to write, because the acknowledgement would have been a record of a false promise.
- **Two refusals, both on purpose.** Without `USER_BLOCK_SALT` the action returns 503 rather than writing a hash that could never match and would look enforced while blocking nothing. And the account cannot delete itself without a primary email, since the block is keyed by it.
- **⚠️ Not yet reachable from the UI.** `/profil/` renders its settings tab client-side, so nothing links to the new page yet — the link needs an edit to `js/profile-account.js`. Recorded as plan step 0.8b rather than quietly shipped as done. `franchisee.id` has the action and schema but not the page.
- `auth:status:check` covers the flow at the level the page calls: both fields required, a near miss rejected, no salt means 503 with nothing written, the successful path blocks and records the acknowledgement, and re-entry with that email is refused.

## 2026-09-27 — Account blocks are now enforced at sign-in

- **The enforcing half of the delete-and-block flow.** `user_blocks` (migration 0043) is the tombstone that survives erasure, keyed by a salted SHA-256 of the normalised email so it cannot be read back as personal data. `blockAccount`, `unblockAccount` and `hashBlockedEmail` join the identity module; a block can be created by an admin now and the self-service flow will reuse the same helper.
- **Enforcement is three places, and the order matters.** `upsertD1User` refuses a blocked address **before** linking an identity or inserting a user — a check running afterwards would let the same person simply register again. Both the identity-resolved and the email-matched user carry a blocked flag, so the block follows the **person** and not only the address; someone who changes their email in Clerk after being blocked still carries it. And `assertActiveD1User` rejects `blocked` with its own code and message, because a generic "not active" reads like a temporary state when the person actually asked for their data to be deleted.
- **A hole the test found rather than reading.** `getD1UserByClerkId` — the fast path — returned `users.status` raw, so a blocked account looked `active` and `requireD1UserFast` let it straight through; that function only falls back to the full sync when the status is not active. Its status now comes from a CASE that consults `user_blocks`, in both the identity lookup and the legacy fallback.
- **Fail-closed and fail-safe are deliberately different.** Creating a block without `USER_BLOCK_SALT` is refused, because a hash we cannot reproduce would look enforced while matching nothing. With a salt missing but blocks present, sign-in is refused too, since we cannot prove the caller is not a blocked address. With neither, there is nothing to enforce and sign-in continues — the state the live sites are in today.
- **⚠️ Operational prerequisite: set `USER_BLOCK_SALT` as a Pages secret before the first block is created.** It must never be rotated casually: every stored hash is derived from it, so changing it would silently stop every existing block matching.
- `auth:status:check` gained the block scenarios — a blocked address cannot register and creates no user row; the person is refused after an email change; an unblocked address is unaffected; the hash depends on the salt; a missing salt with blocks present refuses rather than guessing; and unblocking restores access while keeping the row.
- Not done, deliberately: the erasure half. It is irreversible and spans roughly twenty tables plus R2 objects, so it needs its own pass, tested bucket by bucket.

## 2026-09-27 — Expiry now downgrades the membership timeline

- **Fixed a status gap.** A premium user is never deleted, only downgraded, and every site reads the newest row in `user_membership_events` to decide the current status. Expiry wrote the subscription and the franchise tier but **appended nothing to that timeline**, so the newest row still said `premium` after the subscription had lapsed — any site reading it would have reported the wrong status. It now appends a `free` event with reason `expired`.
- **Only when no other live subscription remains**, so an owner with two brands is not downgraded by the first one lapsing.
- `auth:status:check` gained an expiry scenario asserting the newest membership row moves off `premium`, so this cannot regress silently.

## 2026-09-27 — A proven owner can take their brand out of the network

- **New:** `remove_brand` on `/profile-data`, plus `restoreRemovedBrand` for admins, and migration `0045 franchise_removals` (applied additively; ledger gapless 1–45).
- **The gate is stricter than the other owner actions here, deliberately.** Those accept `owner_user_id = ? OR franchisor_profile_id = ?`, and that second branch proves only that a profile is *attached* — not that anybody established ownership. Removal is destructive and one-way, so it requires `owner_user_id` **and** an approved claim or an approved submission review naming the same user. `owner_user_id` alone is not enough either: nothing in the schema binds it to a claim, so a direct SQL write would grant ownership with no trace.
- **It delists rather than deletes.** `DELETE FROM franchises` cascades into twenty tables — publications, premium orders, payment confirmations, and the very rows that prove ownership. So every publication is hidden, the brand is archived, the previous publication states are snapshotted for a faithful restore, and the reason is recorded separately because `status = 'archived'` already means "a rejected pending brand".
- **The request must echo `HAPUS BRAND SAYA`** — the exact text shown on the consequence screen — so a stray click or a replayed request cannot delist a brand.
- **`restoreRemovedBrand` is the only way back**, because the owner cannot do it: the claim guards require `status = 'unclaimed' AND source_sheet = 'UNCLAIMED'`, and approving a claim sets `source_sheet = 'FRANCHISOR'`, so a removed brand can never be re-claimed.
- **New gate `brand:removal:check`**, run against the real migration chain and wired into `build:astro`. It asserts a non-owner is refused, a profile-linked stranger is refused with nothing changed, ownership without provenance is refused with `OWNERSHIP_NOT_PROVEN`, the proven owner gets a delist with the brand row and its ownership proof intact, a second removal is a no-op, and restore brings back the exact prior publication states.
- Not implemented: the same action on the `franchisee.id` surface, where an owner cannot yet remove a brand.

## 2026-09-27 — One D1 user, reachable from two Clerk applications

Migrations 0040–0044 applied to the shared D1, plus a resolver rewrite in both repositories. Applied
**additively**: every object was verified present before its ledger row was recorded, the SQL came straight
from the committed migration files under a statement allowlist, and nothing was deleted or updated in any
existing table — `users` stayed at 4 and `franchises` at 197 throughout. The ledger now has no gaps across ids
1–44, so a future `wrangler d1 migrations apply` cannot re-run anything already applied (0038 contains
`DROP TRIGGER IF EXISTS`).

- **0040 `user_identities`** — one row per linked Clerk identity, backfilled one per existing user, with
  `users.clerk_user_id` as the home identity that is never overwritten.
- **0041 `user_status_events`** / **0042 `user_membership_events`** — append-only timelines; the newest
  `effective_at` wins. Premium is downgraded, never deleted. Both backfilled a baseline per existing user.
- **0043 `user_blocks`** — the tombstone that survives erasure, keyed by a salted email hash.
- **0044 `idx_users_primary_email_unique`** — makes one-row-per-email real. The linker assumes it; nothing
  enforced it, and the profile email-change path could create a duplicate. Two rows sharing an address means the
  linker cannot tell two people apart, and the wrong choice hands over their brand, roles and premium.

**Three defects in my own work, each found by testing rather than review:**

1. The verified-email lookup used `LIMIT 1`, so with two people on one address it linked to whichever row came
   back first. It now asks for two: one match links, none creates a person, more than one **refuses to guess**,
   creates a separate account and logs `user_identities.link_ambiguous`.
2. `getD1UserByClerkId`'s legacy fallback matched `users.clerk_user_id`, which is the *home* identity — so
   revoking an identity still resolved through the fallback and re-admitted the access revocation was meant to
   cut off. The fallback is now restricted to users with no identity rows at all.
3. Status and membership events defaulted `effective_at` and `recorded_at` to `CURRENT_TIMESTAMP`, which is
   second-granular, so two events in the same second ordered arbitrarily and "newest wins" was not
   deterministic. Both are now written with millisecond precision.

**`scripts/check-auth-status.ts` was rebuilt** to run the real resolver against the **real migration chain** in
an in-memory SQLite, instead of a hand-written fake that pattern-matched SQL strings — the old fake could not
model `user_identities` at all. It covers two applications reaching one user, the home identity never being
overwritten, suspensions and deletions surviving a sign-in from either site, grants applied only to active
accounts, one Clerk account's deletion revoking only its own identity, the unique index rejecting a duplicate,
and the fail-closed refusal on a legacy ambiguous row.

Docs: `CODEBASE.md` gained a shared-identity section recording each decision and its reason. The `CLERK_*`
satellite variables on the Pages project are now **obsolete** — under this design each site signs in against
its own application and they are to be removed when the second application is created.

## 2026-09-26 (latest) — Suspended accounts could reinstate themselves here; now they cannot

Security fix plus the checks that keep it fixed, and a new infrastructure reference.

- **The defect.** `functions/_clerk-auth.js` forced `status = 'active'` on both existing-row paths, so a suspended or deleted account reinstated itself — roles and email role grants included — simply by signing in. `Franchisee.id` preserved the status; this copy did not.
- **A second, larger gap found while fixing it.** This repository was **also missing `assertActiveD1User` entirely** — not just the export but both call sites, in `requireD1User` and `syncD1User`. Nothing here inspected account status at all, so a suspended user holding a valid session and an `admin` or `staff` role would have passed every authenticated path on this site. Both are now mirrored from `Franchisee.id`.
- **Why nothing caught it.** `check-auth-outage.ts` asserted exactly these invariants, in `Franchisee.id` only, and was referenced by no script and no workflow — so it never ran. The two `_clerk-auth.js` copies are hand-maintained and nothing compared them.
- **New gates, both wired into `build:astro`.** `scripts/check-auth-status.ts` covers new identities, suspension and deletion survival, the cross-application case (the same verified email arriving from a second Clerk application resolves to the same D1 row and inherits its status), and the rule that email role grants apply only to active accounts. `scripts/check-clerk-resolver-parity.mjs` compares the `upsertD1User` body **and the exported surface** of the two copies, and asserts no existing-row `UPDATE` writes `status`. The parity check was **proven able to fail** by un-exporting `assertActiveD1User`, which produced `only in Franchisee.id : assertActiveD1User`.
- **New:** `docs/architecture/INFRASTRUCTURE.md` — a standalone infrastructure reference verified from the live Cloudflare API: account, zone, DNS, Pages build config, variables, bindings, custom domains, the www→apex redirect rule and the token scope it needs, deployment history including the failed `74cdc080`, both Clerk applications, the traps that have already caused incidents here, and a verification recipe.
- Full build green: `ownership:check`, `auth:status:check`, `resolver:parity:check`, `schema:check`, 34 brands flat, 5,002 deployed files.

## 2026-09-26 — www now redirects to the apex

- **Done, verified live.** A zone **Redirect Rule** (Single Redirect, phase `http_request_dynamic_redirect`, ruleset `33ad9567295941f9ba0c0bd1d9cac715`, rule ref `www_to_apex_franchisor_id`) 301s `http.host eq "www.franchisor.id"` to `concat("https://franchisor.id", http.request.uri.path)` with the query string preserved. `www/`, `www/usaha/abo-meatshop`, `www/peluang-usaha/` and `www/usaha/abo-meatshop/?x=1` all answer 301 with path and query intact and land on 200 in exactly one hop, so there is no loop. The apex is unaffected (200 / 200 / 308-to-canonical / 404). `MANUAL_SETUP_CHECKLIST.md` §4 step 3 is met, and Page Rules were deliberately left at zero.
- **Corrected my own wrong guidance.** I had asked for a "Zone → Rules → Edit" permission, which is **not a real Cloudflare permission group**. The zone's **Rules** menu is a set of separate features, each with its own API phase and permission, and only Redirect Rules (Single Redirects) can change a hostname. The correct scope is **Zone → Single Redirect → Edit**, shown as **Dynamic URL Redirects → Write** in newer token UI. Cache, Config, Origin, Transform, Custom Error and HTTP DDoS rules cannot do this. The full mapping is now recorded in `KNOWLEDGE/KNOWLEDGE-CLOUDFLARE-PAGES.md` §8 and referenced from the provider boundary record.

## 2026-09-26 — Real 404 added; Cloudflare Pages and Clerk references written

- **Unknown URLs now return a real 404 (`68c1fd8`).** Cloudflare Pages assumes a single-page application when the build output has no top-level `404.html`, and in that mode it answers every unmatched path with the root document and HTTP 200 — which is exactly what this site did, returning a byte-identical copy of the homepage for any URL. `src/pages/404.astro` now emits `dist/404.html` with `noindex` and no canonical, and `check-built-assets.mjs` fails the build if that file disappears (proven able to fail by removing it). Verified live on deployment `65a63096` on both hosts: junk URLs, unknown brand slugs and missing static files return **404** with the 1,631-byte not-found page, while `/`, `/peluang-usaha/` and `/usaha/abo-meatshop` stay 200 and the slash form still 308s to the canonical. Build is now 13 pages / 5,002 files.
- **Two portfolio knowledge references written** (hub): `KNOWLEDGE/KNOWLEDGE-CLOUDFLARE-PAGES.md` — the SPA-fallback trap, `_redirects`/`_headers`, Functions routing and `_routes.json`, account-scoped bindings, custom domains and www→apex, the `build_config` vs `deployment_configs` silent no-op, secret write-only behaviour and the PATCH trap, API-driven deploy mechanics and verification recipes — and `KNOWLEDGE/KNOWLEDGE-CLERK-SATELLITE.md` — primary vs satellite, why the shared D1 `clerk_user_id` contract forbids a separate Clerk application, the `satelliteAutoSync` trade-off, and setup steps. Both are routed from the hub `AGENTS.md`.
- Corrections recorded while writing them: `CLERK_DOMAIN` is the **satellite's own** domain while `CLERK_SIGN_IN_URL`/`_UP_URL` must point at the **primary** (the values already set are correct); `satelliteAutoSync: true` redirects every first visit to the primary, which is a real cost now documented; and a production satellite needs a CNAME for `clerk.franchisor.id`.
- Still outstanding: `www.franchisor.id` does not redirect to the apex. The token gained Zone DNS read but **`/zones/{id}/rulesets` still returns 403**, so the redirect rule needs **Zone → Rules → Edit**.

## 2026-09-26 — Domains live, Clerk satellite config set, and a self-inflicted build failure

- **Custom domains are active.** `franchisor.id` and `www.franchisor.id` both report `active` with `ssl=active`; `https://franchisor.id/` returns 200 and the flat-page fix is confirmed on the real domain (`/usaha/abo-meatshop` → 200, `/usaha/abo-meatshop/` → 308 back to the canonical). Outstanding: **`www` does not redirect to the apex** (it returns 200 and serves the site), so checklist §4 step 3 is unmet. That needs Zone Rules scope this token lacks.
- **Seven non-secret Clerk variables set** for Production and Preview with the values checklist §3 prescribes: `CLERK_IS_SATELLITE=true`, `CLERK_DOMAIN=franchisor.id`, the Franchisee.id sign-in/sign-up URLs, both `franchisor.id` origins, `CLERK_SATELLITE_AUTO_SYNC=true`. Verified live on deployment `684707f3`: `/auth-config` returns `isSatellite:true` with the right domain, URLs and origins, and `configured:false` — correct, since `configured` is `Boolean(publishableKey)` and that key is still pending.
- **⚠️ I broke the build and then fixed it.** Adding those variables, I read `deployment_configs`, merged my keys, and PATCHed the map back. Cloudflare returns `secret_text` values **empty**, so the round trip wrote `CLOUDFLARE_API_TOKEN=""` and erased it; deployment `74cdc080` failed with `No Cloudflare token found … and CLOUDFLARE_API_TOKEN is not set`. Production never went down (Pages kept serving the last good deployment). Recovery: re-sent the complete map with known values for every key, then deployed `684707f3` → `deploy/success`, which is only possible if the D1 read worked. **Rule recorded:** never round-trip `deployment_configs` from a GET into a PATCH — supply the complete map, or PATCH only the keys being changed.
- **Do not create a new Clerk account for this site.** Use the existing instance and add `franchisor.id` under Domains → Satellites. A separate instance gives different Clerk user ids for the same person, and `_clerk-auth.js` resolves users from the **shared** D1 by `clerk_user_id`, so cross-site membership would break. Checklist §3 says the same. Note production satellite domains need a paid Clerk plan.
- **`schema:check` still SKIPs inside the Pages build** — now for a second reason: the sibling `Franchisee.id` checkout is absent from the build sandbox, so the 39 shared migrations cannot be loaded. The Node 22 move removed only the runtime reason. A green Pages build is not proof the dashboard SQL was validated.
- Documented what the soft-404 finding actually means, with byte-identical proof and the fix shape (see the provider boundary record §7).

## 2026-09-26 — Legacy brand URLs fixed; custom domains added

- **Fixed the trailing-slash canonical mismatch (`2dd0702`).** Every legacy brand page was exported as `usaha/<slug>/index.html`, so Cloudflare answered the declared canonical `/usaha/{slug}` with a **308** to the slash form — the served URL contradicted the canonical for all 34 brands. `copy-legacy-static.mjs` now emits those pages flat as `usaha/<slug>.html`, the same path the Astro-generated brand pages already use, so the two sources collide and the existing no-overwrite rule still lets generated content win. Flattening was proven safe first: the legacy HTML has **zero** relative asset references. Verified live on deployment `f9fd9747`: `/usaha/abo-meatshop` → 200 (was 308) and `/usaha/abo-meatshop/` → 308 back to the canonical. New gate in `check-built-assets.mjs` fails the build if any brand lacks a flat page or the directory form returns; the published-brand collision fixture was updated to assert the same.
- **Custom domains added:** `franchisor.id` and `www.franchisor.id` are now attached to the Pages project. Both report `pending`; the apex resolves publicly, but **`www.franchisor.id` has no DNS record** and this token cannot create one (`/zones/{id}/dns_records` and `/zones/{id}/rulesets` both return **403** — no Zone DNS or Zone Rules scope). So the `www` CNAME and the `www`→apex redirect still need either a broader token or dashboard work. Recorded in the provider boundary record §8.
- **Runtime variables cannot be copied from `franchisee-id`, for two independent reasons, now documented in §8:** Cloudflare returns every `secret_text` value **empty** (verified: `len=0`), so no secret can be read or copied; and the two variable sets genuinely differ — `franchisee-id` has 14, the Franchisor code reads ~35, and franchisee-id has **none** of the Clerk satellite variables this site needs. Several entries must be site-specific rather than shared (`CLERK_WEBHOOK_SIGNING_SECRET` is issued per endpoint; `GOOGLE_CONTACTS_REDIRECT_URI` would point the OAuth callback at the wrong domain; `PREMIUM_EMAIL_FROM`/`_REPLY_TO` are brand-facing). `FRANCHISE_ASSETS_PUBLIC_BASE_URL`/`R2_PUBLIC_BASE_URL` are genuinely shared and safe to reuse. Nothing was half-set: `/auth-config` still reports `configured: false`, which is the accurate state.
- Still open from the previous entry: unknown URLs answer HTTP 200 with the legacy document instead of a real 404.

## 2026-09-26 — Pages project created; first production deployment succeeded

Infrastructure, not application code. No D1 write, no migration, no secret change in the repository.

- **Project `franchisor-id` created in the `franchise-network` account** (id `866cd8f9-e5bc-4d73-a253-a96a0d161f7e`, subdomain `franchisor-id-9ar.pages.dev`), Git-integrated to `cfpages-syamsulalam-net/Franchisor.id` on `main`. Created and configured through the Cloudflare API, not the dashboard, so every value is exact and reproducible: `build_config` = `pnpm run build` → `dist`, root at the repository root; `NODE_VERSION=22`, `PNPM_VERSION=10.34.1`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID` as plain-text vars; `CLOUDFLARE_API_TOKEN` as an encrypted secret; `franchise_db` and `FRANCHISE_ASSETS` bindings for **both** Production and Preview. The binding shapes were copied verbatim from the working `franchisee-id` project. Note `build_command` and `destination_dir` live on the project's `build_config`, not inside `deployment_configs` — sending them in `deployment_configs` is silently ignored.
- **First production deployment succeeded:** `8588ba9d-95c7-4950-9422-97eee771f159` on commit `d028dea`, stage `deploy/success`, build log `Built asset check passed for 5001 deployed files`. `ownership:check` and `schema:check` ran inside the Pages build without failing.
- **Now verified live:** `/auth-config` returns 156 bytes of JSON instead of the legacy directory document; `/dashboard/`, `/profil/` and `/premium/` render the application; `/peluang-usaha/` serves the Astro directory. The documented "never the legacy HTML" signal holds.
- **Two live findings recorded in `docs/operations/PROVIDER_BOUNDARY_RECORD.md` §7, both still open and neither a regression:** unknown URLs answer **HTTP 200** with the legacy document rather than a real 404 (the known Gate 2 soft-404, now confirmed live); and legacy brand URLs **308-redirect to a trailing slash** (`/usaha/abo-meatshop` → `/usaha/abo-meatshop/`), contradicting the declared canonical family `/usaha/{slug}`, so the served URL and the canonical disagree for all 34 legacy brands.
- Not done, deliberately: the custom domain (`franchisor.id`) is Syamsul's step, and the Clerk variables are unset — which is why `/auth-config` reports `configured: false`.

## 2026-09-26 — Repository transferred to cfpages-syamsulalam-net

Supersedes the "Not changed" decision in the entry below. No D1, secret, provider, or application-code change.

- **Transferred `cfpages-admtravelbos/Franchisor.id` → `cfpages-syamsulalam-net/Franchisor.id`** via the GitHub API. The old URL redirects; remote parity verified after the move.
- **Why:** Syamsul uses the `cfpages-*` GitHub organization name as his own marker for which Cloudflare account hosts a project, because he hosts many. `cfpages-syamsulalam-net` means the `me@syamsulalam.net` account (the `franchise-network` account holding `franchise_db`, `franchise-assets` and `franchisee-id`); `cfpages-admtravelbos` means the `admtravelbos@gmail.com` account. Franchisor.id must be hosted in `franchise-network`, so the marker must say so. Two corrections of my own earlier claims: I said the Cloudflare Pages GitHub App "is not authorized for `cfpages-admtravelbos`" — the App was in fact installed on **both** organizations; and I recommended keeping the repository in place on technical-churn grounds, ignoring a convention that matters operationally.
- **Consequential updates in the same commit:** `package.json` (repository/issues/homepage), `.github/workflows/d1-static-publish.yaml` (`GITHUB_REPOSITORY`), `scripts/d1-static-publish-poller.mjs` (`REPOS` allowlist key), `scripts/test-d1-static-publish-poller.mjs` and `.github/scripts/test_premium_email_worker.py` fixtures, plus `AGENTS.md`, `docs/operations/PROVIDER_BOUNDARY_RECORD.md`, `docs/operations/MANUAL_SETUP_CHECKLIST.md`, `docs/operations/ASTRO_CLOUDFLARE_BRAND_PUBLISH_PLAN.md`, `ARTICLE_PROGRESS.md`, and `TOPICAL_AUTHORITY.md`.
- **The App prerequisite is already satisfied:** `cloudflare-workers-and-pages` is installed on `cfpages-syamsulalam-net` with `repository_selection = all`, so this repository is covered with no further grant. The Pages project still does not exist (verified `HTTP 404`) and remains the next step.

## 2026-09-26 — Deployment placement clarified; project confirmed absent

Documentation only. No code, D1, secret, or provider change.

- **Confirmed by read-only API probe:** the `franchise-network` Cloudflare account holds 30 Pages projects and `GET …/pages/projects/franchisor-id` returns **HTTP 404** — the project has never been created. The earlier record implied it might already exist.
- **Decided and recorded:** the project must be created in the **`franchise-network`** account (`0ba63b7f…`), because Cloudflare bindings are account-scoped and the Pages Functions need `env.franchise_db` and `env.FRANCHISE_ASSETS` at runtime. A project in any other account would serve the public directory and then fail every authenticated call. Franchisor.id and Franchisee.id share one database, so they must share one Cloudflare account and one set of nameservers; their identity separation can be organisational only.
- **Corrected my own earlier inference:** I previously wrote that the Cloudflare Pages GitHub App "is not authorized for `cfpages-admtravelbos`". What was actually observed is that the `franchise-network` account has no project from that organisation — which is equally consistent with that organisation's repositories deploying into a different Cloudflare account. The real prerequisite is a GitHub-side App grant on the organisation, and per Syamsul every `cfpages-*` organisation is his, not a third party.
- Updated `docs/operations/PROVIDER_BOUNDARY_RECORD.md` §6 (account placement, the 404, the App-grant prerequisite, and `NODE_VERSION=22`), `docs/operations/MANUAL_SETUP_CHECKLIST.md` (`NODE_VERSION`), and `AGENTS.md` (deployment-placement paragraph).
- **Superseded the same day:** I first recorded that the repository stays in `cfpages-admtravelbos`. That was reversed by the transfer entry above, because my reasoning weighed only technical churn and ignored Syamsul's convention of using the GitHub organization name as the marker for which Cloudflare account hosts a project.

## 2026-09-26 (latest) — Handoff steps 3 and 5 implemented locally

The two items in the [Astro/Pages handoff](docs/operations/ASTRO_CLOUDFLARE_BRAND_PUBLISH_PLAN.md) that did not need the Cloudflare dashboard. No D1, secret, migration, or provider change, and no synthetic row was written to remote D1.

- Added `functions/peluang-usaha/[slug].js`: a real HTTP **301** to `/usaha/{slug}` for the deprecated brand path, answered only when the shared D1 database confirms a published `site_franchisor_id` projection. `kategori`, `kota`, `modal` and the directory aliases are reserved and fall through, so directory subroutes can never be captured; an unverified slug, a D1 failure, or a non-GET method also falls through. `src/pages/peluang-usaha/[slug].astro` remains only as a `noindex` meta-refresh fallback and its comment now says so.
- Added `scripts/check-published-brand-build.mjs` and the `published:check` script: the published-brand build proof, run explicitly rather than from `build:astro` (which would recurse). It drives the real chain — snapshot generator via `--from-json`, `astro build`, the legacy copy bridge, `assets:check` — from a synthetic two-row snapshot covering a new published slug and a published slug colliding with a retained legacy `/usaha/{slug}/` page, then asserts the generated flat page wins over copied legacy HTML, the legacy directory form survives, and the directory card / canonical / Open Graph URL agree on `/usaha/` and never on `/peluang-usaha/`. Both tracked snapshot files are restored and the work area lives outside the repository.
- Extended `scripts/check-dashboard-sql.ts` with the public-read predicate: against the real migrations it now proves a draft publication and an archived canonical brand are both excluded. A `--from-json` fixture cannot express "row exists but is not published", so that half lives here.
- Extended `scripts/check-franchise-directory.ts` to cover the new redirect handler: 301 on a verified published slug, fall-through for every reserved subroute, for an unverified slug, for a D1 failure, and for a non-GET method.
- Made the build gate real in the deploy path: `.github/workflows/d1-static-publish.yaml` now runs Node 22 (was 20) and `docs/operations/MANUAL_SETUP_CHECKLIST.md` sets `NODE_VERSION=22`, so `schema:check` executes its migration-backed assertions instead of taking its SKIP path.
- Documentation: provider record gains a build-gate row and a Node-requirement note; the tracker closes D.2b and adds D.3b; the parity matrix §1b closes the two remaining rows; the handoff plan gains a dated "progress against this plan" section.

Verification: 18 `*:check` scripts pass, `astro:check` 0 errors / 5 hints, `pnpm run build` green with `assets:check`. The new fixture was proved able to fail by regressing the directory link and observing the assertion.

## 2026-09-26 — Directory/detail contract and Astro/Pages handoff (documentation only)

- Added `docs/operations/ASTRO_CLOUDFLARE_BRAND_PUBLISH_PLAN.md`: reviewed route matrix, current build and theme inputs, provider setup sequence, repeatable published/unpublished and legacy-slug proof, CSS/asset checks, preview/production acceptance, rollback, and per-site rebuild loop.
- Updated `CODEBASE.md`, `docs/README.md`, `docs/architecture/FRANCHISE_NETWORK_CONTEXT.md`, `docs/architecture/FRANCHISOR_BUILD_PLAN.md`, `docs/data/SHARED_DATA_CONTRACT.md`, `docs/product/FRANCHISOR_PARITY_MATRIX.md`, and `docs/product/NETWORK_MEMBERSHIP_PROGRESS.md` to distinguish Franchisor directory `/peluang-usaha/` from brand detail `/usaha/{slug}`, correct superseded review claims, and link the handoff.
- Updated `docs/operations/MANUAL_SETUP_CHECKLIST.md` and `docs/operations/PROVIDER_BOUNDARY_RECORD.md` to point deployment work to that handoff. Added `.context/session-20260926-1524.md` for the review record. No application code, provider setting, D1 row, or deployment changed.
- A fresh anonymous production HTTP check on 2026-09-26 confirmed the legacy directory at `/auth-config` and the soft-404 for an unknown URL; recorded exact title/canonical/byte evidence in `docs/operations/PROVIDER_BOUNDARY_RECORD.md` and the tracker. This read-only check did not establish a Pages deployment.


## 2026-09-26 (latest) — Review decisions implemented (`02f486d`)

Implements the answers recorded in the independent re-review, and the fixes they implied. No D1, secret, migration, or provider change; nothing was written to the shared database.

- `functions/_profile-owner-review.js` exports `OWNER_PROFILE_FIELDS` with `pic_name` and `email_contact` added, and `functions/_dashboard-schemas.js` builds the review-approval allowlist from it plus `EDITABLE_LISTING_FIELD_DEFS` — a `franchisor_profile` proposal could previously never be approved, because the schema enumerated listing fields only while the handler accepted `profile_*` names. `js/dashboard-review.js` labels those profile fields instead of falling back to the first listing field.
- `functions/_profile-account.js` no longer writes a published brand's `pic_name`/`email_contact` directly; account identity applies immediately and a published brand's contact becomes an owner review proposal. `js/profile-page.js` reports that outcome to the user.
- `functions/dashboard-data.js` gates the whole claim queue to admins, matching the new-brand queue, because it carries claimant NIB, HAKI, and contact fields.
- `functions/_form-submit-franchisor.js` makes the claim-path `franchisor_profiles` insert share the claimability predicate, so an unavailable claim commits no orphan profile.
- Added `scripts/check-dashboard-sql.ts` and the `schema:check` script, which `build:astro` now runs: it loads the 39 real shared migrations into `node:sqlite`, prepares every dashboard read-model statement against them (the duplicate-join regression), and proves the 0035/0039 triggers abort a second decision, a parallel claim, and a claim on an owned listing. It SKIPs by design when `node:sqlite` or the sibling migration chain is absent.
- Documentation updated to match: `docs/forms/CLAIM_TRANSITION_MATRIX.md` (the July-handler warning is no longer true), `docs/data/SHARED_DATA_CONTRACT.md` (account-versus-brand-contact, admin-only queues, all-or-nothing submission batches), `docs/product/FRANCHISOR_PARITY_MATRIX.md` (§1b per-finding state), and `docs/product/NETWORK_MEMBERSHIP_PROGRESS.md` (fix round and verification table).

Decision-races finding deliberately **not** "fixed" by adding `AND status = 'pending'`, on the reviewer's reasoning that a bare predicate can turn the update into a silent zero-row success; the triggers stay the authority and are now proven by the new check. Same fixes mirrored in `Franchisee.id` `0498f62`. A TypeScript `as` cast was briefly introduced in the JavaScript module `functions/_dashboard-schemas.js` and removed in both repositories after the Franchisee.id checks caught it.

## 2026-09-26 — Independent re-review of `27a783c`

- Expanded `docs/product/ROLLOUT_CODE_REVIEW_2026-09-26.md` with a disposable published-row build result and bounded answers for profile-proposal approval, account/public-contact writes, claim decision concurrency, orphan profiles, and staff access to claimant evidence. Updated `docs/product/NETWORK_MEMBERSHIP_PROGRESS.md` to distinguish local `/usaha/{slug}` build proof from deployment and signed-in acceptance.
- Added `.context/session-20260926-1229.md` for the cross-harness handoff. No application code, D1 rows, provider settings, or production deployment changed.

## 2026-09-26 — Independent rollout code review feedback

- Added `docs/product/ROLLOUT_CODE_REVIEW_2026-09-26.md` with R1–R4 evidence and acceptance checks for the Franchisor `/usaha/{slug}` generated route, CSV/bridge producer paths, publication-row gate status, and the stale provider-record poller note.
- Updated `docs/product/NETWORK_MEMBERSHIP_PROGRESS.md`, `docs/product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md`, `docs/product/FRANCHISOR_PARITY_MATRIX.md`, `docs/operations/PROVIDER_BOUNDARY_RECORD.md`, `CODEBASE.md`, and `docs/README.md` to route the implementing harness to the review and distinguish local code checks from published-brand and production proof.
- Added `.context/session-20260926-franchisor-review.md` as the cross-harness continuation snapshot. No application code, D1 row, or production deployment changed in this review.

All notable repository file changes are recorded here.

## 2026-09-26 (later) — Cross-repo follow-up D.4 closed

Authorized cross-repo change, recorded here and in the owning repository so another harness can review it.

- `../Franchisee.id` commit `87a4d73` maps `site_franchisor_id` to `https://franchisor.id/usaha/{slug}` in its own `functions/_premium.js`, adds a `checkPerSiteCanonicalFamilies()` guard to `scripts/check-premium-lifecycle.ts`, and records the decision in `docs/architecture/PREMIUM_MONETIZATION_PLAN.md`, `CHANGELOG.md`, and `.context/session-20260926-0634.md`. No schema, secret, or D1 change; all 15 of that repository's `*:check` scripts pass.
- Updated `docs/product/NETWORK_MEMBERSHIP_PROGRESS.md` (D.4 → done, with the commit and guard), `docs/product/FRANCHISOR_PARITY_MATRIX.md` (canonical family row closed), `docs/data/SHARED_DATA_CONTRACT.md`, and `docs/architecture/FRANCHISE_NETWORK_CONTEXT.md` to record that both `_premium.js` copies now agree and are guarded on each side.

Still open from that repository's findings, recorded so it is not lost: its `scripts/d1-static-publish-poller.mjs` needs the same table/column/ordering correction applied here in `eb94f7d`, and the `d1_migrations` ledger still lacks rows for 0034–0036 and 0039.

## 2026-09-26 — Gate 0 audits and Gate 1 ownership parity

Executed Gates 0 and 1 of `docs/product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md` (continued from the 2026-09-25 planning review into this date). No D1 migration, secret, or live-provider change was made, and no row was written to the shared database — all live access was read-only.

### Audit artifacts (new)

- Added `docs/product/FRANCHISOR_PARITY_MATRIX.md`: feature-by-feature parity matrix against the current Franchisee.id authority, the read-only live D1 evidence snapshot, and the publish-queue reconciliation finding.
- Added `docs/operations/PROVIDER_BOUNDARY_RECORD.md`: Pages project, branch, domain, D1/R2 bindings, Clerk, publisher and dispatcher state with `pass` / `fail` / `not verified`, the anonymous route check, and the soft-404 catch-all finding.
- Added `docs/product/LEGACY_BRAND_MATCH.md`: 34/34 legacy `/usaha/*` brands matched to canonical `franchises.id` with zero writes.
- Added `docs/product/NETWORK_MEMBERSHIP_PROGRESS.md`: Unicode-status rollout tracker covering Gates 0–5.

### Gate 1 ownership and membership parity (runtime)

- Added `functions/_profile-owner-review.js`: `queueOwnerReview` and `reviewedProfileStatements`, ported with `SITE_FRANCHISOR_ID`.
- Rewrote `functions/_form-submit-franchisor.js`: existing-brand claims are now guarded `pending` rows that never touch `owner_user_id`; new brands are private `pending_review` rows that are ownerless, draft-published, and carry a `franchise_submission_reviews` record.
- Added `findExistingBrands` and aligned `findClaimSource` to the guarded form in `functions/_form-submit-utils.js`.
- Routed published owner listing and profile edits through review proposals in `functions/_profile-franchisor-actions.js`, and published media uploads in `functions/profile-upload.js`.
- Added `handleReviewBrandSubmission` and extended `handleReviewEditSuggestion` and `handleReviewClaim` with staleness, evidence, and conflict guards in `functions/_dashboard-actions.js`; registered `review_brand_submission` in `functions/_dashboard-schemas.js` and `functions/dashboard-data.js`; added the brand-submission and owner-proposal review queues in `functions/_dashboard-queries.js`.
- Moved the franchisor brand canonical to the `/usaha/{slug}` family in `functions/_premium.js`, `functions/_form-submit-franchisor.js`, `functions/_form-submit-test-actions.js`, and the brand-detail links in `_dashboard-queries.js`, `_dashboard-outreach-queries.js`, `_dashboard-utils.js`, `_profile-read-model.js`, `_profile-recommendations.js`, and `_ocr-enrichment-review.js`.

### Client surfaces

- Added brand-submission review rendering and submission in `js/dashboard-review.js`, wired `js/dashboard-admin.js`, and added the panel to `src/components/dashboard/DashboardReviewPanel.astro`.
- Surfaced pending-review status to owners in `js/profile-page.js` and corrected the listing panel copy in `js/profile-franchisor.js`; moved brand-detail links to `/usaha/` in `js/profile-analytics.js`, `js/profile-leads.js`, `js/profile-franchisee.js`, `js/dashboard-ocr-results.js`, and `js/dashboard-ocr-jobs.js`.

### Publish queue

- Corrected `scripts/d1-static-publish-poller.mjs`: it read the nonexistent `site_publish_requests` table, `published_today`, and `last_error`. It now reads `site_rebuild_requests`, `daily_publish_count`, writes `error_message`, orders the FIFO queue by `created_at, id` instead of coercing a TEXT id to a number, and treats any explicit direct mode as direct.

### Tests and build

- Added `scripts/check-ownership-contract.ts` and the `ownership:check` script; it gates `build:astro` so the pre-0035 write shapes and the queue-table divergence cannot return.
- Repaired two pre-existing stale assertions in `scripts/check-state-transitions.ts` (verified failing at the previous HEAD) and extended it to guard the queue producer/consumer table agreement.

### Documentation

- Updated `docs/product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md` and `FRANCHISOR_USER_JOURNEYS.md` with Unicode gate markers, a tracker link, and a status column on the acceptance matrix.
- Recorded the `/usaha/{slug}` brand URL family decision and the soft-404 finding in `docs/architecture/FRANCHISE_NETWORK_CONTEXT.md` and `docs/data/SHARED_DATA_CONTRACT.md`; added the multi-tab and stale draft policy to `docs/forms/AUTO_SAVE.md`.
- Updated `AGENTS.md`, `CODEBASE.md`, and `docs/README.md` to route to the new artifacts; added `.context/session-20260926-0611.md`.

## 2026-09-25 — Franchise Network membership plan and context refresh

- Added `docs/product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md` and `docs/product/FRANCHISOR_USER_JOURNEYS.md` for the one-brand annual membership, four-site exposure, current trust/deployment gaps, release gates, recovery paths, and controlled acceptance.
- Updated `AGENTS.md`, `CODEBASE.md`, `README.md`, `docs/README.md`, `docs/architecture/FRANCHISE_NETWORK_CONTEXT.md`, `docs/architecture/FRANCHISOR_BUILD_PLAN.md`, `docs/data/SHARED_DATA_CONTRACT.md`, and `docs/operations/MANUAL_SETUP_CHECKLIST.md` to route agents to the current network contract and distinguish July code from live production.
- Updated `docs/forms/CLAIM_TRANSITION_MATRIX.md` to reflect current pending/conflict rules and label Franchisor's old handler unaligned; linked `docs/forms/AUTO_SAVE.md`, `docs/data/FRANCHISE_FIELD_DICTIONARY.md`, `docs/architecture/OCR_PROVIDER_STRATEGY.md`, and `docs/architecture/R2_D1_MIGRATION_RUNBOOK.md` to the current journey.
- Linked `ARTICLE_CATALOG.md`, `TOPICAL_AUTHORITY.md`, `docs/PORT_MANIFEST.md`, `js/technical_comparison.md`, `js/symbols_inventory.md`, and `css/form-franchise/CSS_USAGE_MAP.md` to the current product context while preserving their historical/detail roles; `SUGGESTION.md` now records the evidenced P0 ownership/live-route gap.
- Added `.context/session-20260925-1913.md`; this `CHANGELOG.md` entry records the change. No runtime code, schema, secret, or live payment state changed.

## 2026-07-25

### Operator global-research foundation

- Added `GLOBAL_RESEARCH.md` with 20 direct-source evidence records, exact 19/19 topic-family coverage, 12 legal/financial/sector/offer gates, and refresh triggers shared with the buyer-side franchise research family.
- Updated `CODEBASE.md` and `docs/README.md` to register the research artifact as the constrained bridge from the frozen catalog to separately authorized outlining and drafting.
- Added a legacy-law/financial-claim reconciliation suggestion to `SUGGESTION.md`.
- Added `.context/session-20260725-2350.md` with research validation, current-law changes, and the remaining project-specific gates.

## 2026-07-23

### Operator topical-authority plan

- Added `TOPICAL_AUTHORITY.md` after auditing the hybrid Astro/Cloudflare and legacy WordPress-export route model, all sitemap children, 70 sitemap page URLs, 34 legacy brand pages, application surfaces, and the shared Franchise Network boundary.
- Added `ARTICLE_CATALOG.md` with 19 parent topics and 114 distinct operator-facing briefs, six per topic, including explicit intent, exclusions, evidence formats, related IDs, priority, waves, an anti-cannibalization register, and a matching coverage ledger.
- Defined Franchisor.id as the network-owner, seller, and operator knowledge surface while preserving Franchisee.id as an independent buyer-facing domain; excluded location-swapped briefs and thin city filter pages.
- Added current official Indonesian source and qualified-review gates for franchise regulation, STPW/licensing, trademarks/IP, financial claims, tax, competition, privacy, safety, and international expansion.
- Updated `README.md`, `CODEBASE.md`, and `docs/README.md` to index the authority artifacts.
- Refreshed the current build evidence after the 2026-07-23 production build again fetched zero published Franchisor rows, generated 12 Astro pages, and validated all 4,887 deployed files.
- Added `.context/session-20260723-2337.md` with audit, validation, build-impact, and handoff evidence.

## 2026-07-22

### Documentation freshness reconciliation

- Reconciled all 21 pre-existing repository Markdown files with the completed Franchisor runtime port, current D1/Clerk/R2/Astro architecture, dashboard-managed Cloudflare deployment model, and 2026-07-22 verification evidence.
- Updated root guidance and status in `AGENTS.md`, `README.md`, `CODEBASE.md`, `SUGGESTION.md`, and this changelog.
- Updated architecture/data/operations references in `docs/README.md`, `docs/architecture/FRANCHISE_NETWORK_CONTEXT.md`, `docs/architecture/FRANCHISOR_BUILD_PLAN.md`, `docs/architecture/OCR_PROVIDER_STRATEGY.md`, `docs/architecture/R2_D1_MIGRATION_RUNBOOK.md`, `docs/data/FRANCHISE_FIELD_DICTIONARY.md`, `docs/data/SHARED_DATA_CONTRACT.md`, `docs/forms/AUTO_SAVE.md`, `docs/forms/CLAIM_TRANSITION_MATRIX.md`, and `docs/operations/MANUAL_SETUP_CHECKLIST.md`.
- Marked `docs/PORT_MANIFEST.md` and the two earlier `.context/` records as historical evidence so they cannot override current-state documentation.
- Rebuilt `css/form-franchise/CSS_USAGE_MAP.md`, `js/symbols_inventory.md`, and `js/technical_comparison.md` around the active form-01–10 runtime, D1-backed submission path, Astro production build, Franchisor theme, and clearly isolated legacy generators.
- Removed stale references to nonexistent local documents, an unconfigured OCR schedule, an unverified installed secret, and the obsolete static/Sheets migration state.
- Added `.context/session-20260722-0602.md` as the documentation-refresh handoff and validation record.

### Adapted application runtime

- Ported the Astro/Cloudflare application runtime from Franchisee.id and adapted site ownership to `site_franchisor_id`, public URLs to `franchisor.id`, and operator-facing identity/copy where site-specific.
- Preserved the existing Franchisor WordPress-exported public content and added a non-overwriting legacy-to-`dist` bridge.
- Added D1-backed directory/detail generation, Cloudflare Pages Functions, profile/dashboard, claims, proposals, Premium lifecycle, analytics, contacts, OCR, assets, publishing queues, and verification scripts.
- Added `css/franchisor-theme.css` and applied it after the ported application styles. It uses the existing Franchisor red/ink palette (`#cf322e`, `#a9201c`, `#1c0d0a`), DM Sans/Lexend typography, and existing Franchisor logo assets rather than presenting Franchisee styling.
- Added Franchisor-specific Pages publishing and manual-only Premium email workflows. The email schedule is intentionally omitted to avoid duplicate network lifecycle messages.
- Added pnpm/Astro/TypeScript/Wrangler configuration and shared D1/R2 bindings. No `migrations/` directory was copied because Franchisee.id remains the shared migration owner.
- Removed the inherited browser-side Clerk publishable-key fallback and added explicit runtime configuration for Clerk shared-tenant satellite domains.
- Replaced the legacy static `login/index.html` with the functional network-auth route while retaining its Franchisor presentation layer.
- Added the exact file-level creation/update inventory in `docs/PORT_MANIFEST.md`; that manifest is the authoritative expansion of every path covered by this changelog entry.

### Documentation and operations

- Added `README.md` with local build and documentation entry points.
- Updated `CODEBASE.md`, `docs/README.md`, and `docs/architecture/FRANCHISOR_BUILD_PLAN.md` to describe the implemented hybrid application and remaining provider-side launch gates.
- Added `docs/operations/MANUAL_SETUP_CHECKLIST.md` with explicit Cloudflare Pages, D1, R2, Clerk satellite, DNS, GitHub Actions, email, OCR, and Google Contacts steps.
- Added adapted shared-contract references for the field dictionary, claims, autosave, OCR, and R2/D1 operations; each retains Franchisee.id as the upstream migration/contract authority where applicable.
- Recorded local verification and handoff context in `.context/session-20260722-0523.md`.
- Expanded `docs/operations/MANUAL_SETUP_CHECKLIST.md` with a click-by-click, dashboard-only Astro deployment procedure, exact build fields, encrypted-secret flow, binding setup, deployment-log checks, and browser asset verification.

### Deployment asset hardening

- Added `scripts/check-built-assets.mjs` and the `assets:check` package script. Production builds now crawl every deployed HTML file plus reachable CSS dependencies and fail on missing or case-mismatched local stylesheets, scripts, images, fonts, or nested assets.
- Updated `package.json` so asset validation runs automatically after Astro generation and the legacy static bridge.
- Updated `scripts/copy-legacy-static.mjs` to remove obsolete, unavailable WordPress server-runtime scripts and an unused LatePoint stylesheet from retained static output.
- Removed obsolete runtime/style references from `login/index.html`, `daftar/index.html`, `customer-cabinet/index.html`, both HTML templates, and the Astro profile page.
- Corrected broken legacy image references in `projects/index.html` and `services/index.html` to point at existing exported files.
- Replaced the unavailable Owl video-control image reference in `wp-content/plugins/unlimited-elements-for-elementor/assets_libraries/owl-carousel-new/assets/owl.carousel.css` with a native Franchisor-red background.
- Added `wp-content/plugins/wpforms-lite/assets/pro/images/times-solid-white.svg` for a stylesheet dependency retained by visible legacy forms.
- Removed `pages_build_output_dir` from `wrangler.toml` and `wrangler.example.toml` so dashboard Git integration remains the production source of truth and bindings/secrets stay editable through the Cloudflare web UI.

### Added

- `AGENTS.md` with repository instructions and shared-network invariants.
- `CODEBASE.md` with the legacy inventory, target architecture, identifiers, and implementation references.
- `docs/README.md` as the documentation entry point and upstream-source record.
- `docs/architecture/FRANCHISE_NETWORK_CONTEXT.md` with the cross-site product, data, identity, and publishing model.
- `docs/architecture/FRANCHISOR_BUILD_PLAN.md` with a phased migration and acceptance plan.
- `docs/data/SHARED_DATA_CONTRACT.md` with required D1 read/write and publication rules.
- `SUGGESTION.md` for non-committed platform and migration ideas.
- `.context/session-20260722-0429.md` as the initial Franchisor context handoff.

## 2026-07-25 17:54 (Asia/Jakarta)

### Added

- `ARTICLE-GUIDE.md`: repository-local one-article-at-a-time writing instructions.
- `artikel/*.md` (114 files): source-constrained article outlines appointed by `ARTICLE_CATALOG.md`.
- `.context/session-20260725-1754.md`: recorded this bounded handoff session.

### Changed

- `ARTICLE_CATALOG.md`: assigned unique historical CMS publication dates.
- `AGENTS.md`: appended the managed repository-local article workflow without replacing existing rules.
- `CODEBASE.md`: recorded the outline-only article handoff and publication boundary.
- `CHANGELOG.md`: recorded every path class changed by this handoff.

### Removed

- None.
