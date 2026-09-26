# Infrastructure reference — franchisor.id

Standalone infrastructure record for the Franchisor.id deployment. Verified against the live Cloudflare API on
2026-09-26, not transcribed from earlier notes. Where a value can drift, the read command is given so it can be
re-checked rather than trusted.

Companion documents: `FRANCHISE_NETWORK_CONTEXT.md` (how the sites relate and what they share),
`R2_D1_MIGRATION_RUNBOOK.md` (schema changes), `../operations/PROVIDER_BOUNDARY_RECORD.md` (deployment
boundary and blocker history), `../data/SHARED_DATA_CONTRACT.md` (what each site may read and write).

## 1. Where everything lives

| Thing | Value |
| --- | --- |
| Cloudflare account | `0ba63b7f0096bc267a93fe5c80b1f571` — "Syamsulalam.net@gmail.com's Account", reached as the `franchise-network` alias in the `cfman` token store |
| Zone | `franchisor.id`, id `7a0825f27d97411202c629affed15517` |
| Nameservers | `damon.ns.cloudflare.com`, `kami.ns.cloudflare.com` |
| Pages project | `franchisor-id`, id `866cd8f9-e5bc-4d73-a253-a96a0d161f7e`, subdomain `franchisor-id-9ar.pages.dev` |
| Source repository | `https://github.com/cfpages-syamsulalam-net/Franchisor.id`, branch `main` |
| D1 database | `franchise_db`, id `812cd8ac-edd0-45d9-981f-c9a15358317b` — **shared with `franchisee.id`** |
| R2 bucket | `franchise-assets` — **shared with `franchisee.id`** |
| Worker | the shared premium email worker (see `_premium-email-worker.js`) |

The account holds 30 Pages projects. `franchisee-id`, `franchise_db` and `franchise-assets` all live in it,
which is why this site must too.

## 2. Why this account and not another — the binding constraint

Cloudflare Pages bindings are **account-scoped**. A project can only bind a D1 or R2 resource that lives in its
own account. The build-time D1 REST query can cross accounts with a token; a runtime `env.franchise_db` cannot.

Because `franchisor.id` and `franchisee.id` read the **same** database at runtime, they must live in the same
Cloudflare account, and therefore share nameservers. The GitHub organisation is a separate axis — it is a
marker for which account hosts a project, not a mechanism. See `OPERATIONS/PROJECTS/FRANCHISEE_ACCESS.md` in
the hub for the organisation↔account map.

## 3. DNS

| Type | Name | Proxied | Content |
| --- | --- | --- | --- |
| CNAME | `franchisor.id` | yes | `franchisor-id-9ar.pages.dev` |
| CNAME | `www.franchisor.id` | yes | `franchisor-id-9ar.pages.dev` |
| MX ×3 | `franchisor.id` | no | `route1/2/3.mx.cloudflare.net` (Email Routing) |
| TXT | `franchisor.id` | no | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT | `cf2024-1._domainkey.franchisor.id` | no | DKIM |
| TXT | `franchisor.id` | no | Ahrefs site verification |

Both hostnames use a **flattened apex CNAME** to the Pages project, which is the shape Pages expects; a stale
`A` record left from a previous host is the usual cause of a custom domain stuck at `pending`.

Read: `GET /zones/{zone_id}/dns_records?per_page=100`.

## 4. Pages project configuration

**Build** — these belong to the project's `build_config` object, **not** to `deployment_configs`:

| Setting | Value |
| --- | --- |
| `build_command` | `pnpm run build` |
| `destination_dir` | `dist` |
| `root_dir` | `""` (repository root) |
| `compatibility_date` | `2026-06-16` |
| `compatibility_flags` | none |
| Production branch | `main` |

> **Trap:** sending `build_command` / `destination_dir` / `root_dir` inside `deployment_configs` is accepted and
> **silently ignored** — the PATCH returns `success: true` and the fields read back empty. This happened during
> setup. Set them at the top level of the project object.

**Variables** — set identically for **Production and Preview**:

| Variable | Type | Value / source |
| --- | --- | --- |
| `NODE_VERSION` | plain | `22` (needed by `node:sqlite` for `schema:check`) |
| `PNPM_VERSION` | plain | `10.34.1` |
| `CLOUDFLARE_ACCOUNT_ID` | plain | `0ba63b7f0096bc267a93fe5c80b1f571` |
| `CLOUDFLARE_D1_DATABASE_ID` | plain | `812cd8ac-edd0-45d9-981f-c9a15358317b` |
| `CLOUDFLARE_API_TOKEN` | **secret** | a token with D1 read, used by the build's D1 REST query |
| `CLERK_*` (7 values) | plain | satellite-era values — **superseded**; see §7 |

> **Trap — this caused a real outage.** Cloudflare returns `secret_text` values as **empty strings**. A
> read-merge-write PATCH of `deployment_configs` therefore writes each secret back as `""` and destroys it.
> Deployment `74cdc080` failed with `No Cloudflare token found … and CLOUDFLARE_API_TOKEN is not set` for
> exactly this reason. **Never round-trip `deployment_configs` from a GET into a PATCH** — supply the complete
> map with known values, or PATCH only the keys being changed. A restored secret cannot verify itself, because
> the value is write-only; prove it by running a build that needs it.

**Bindings** — Production **and** Preview:

| Binding | Type | Target |
| --- | --- | --- |
| `franchise_db` | D1 | `812cd8ac-edd0-45d9-981f-c9a15358317b` |
| `FRANCHISE_ASSETS` | R2 | `franchise-assets` |

Unlike `franchisee-id`, whose preview environment has no variables or bindings at all, this project sets both
in both environments. Do not assume the sibling's preview environment reflects its production one.

**Custom domains:** `franchisor.id` and `www.franchisor.id`, both `active` with `ssl=active`.

Read: `GET /accounts/{account_id}/pages/projects/franchisor-id`.

## 5. Edge redirect: www → apex

| | |
| --- | --- |
| Ruleset | `33ad9567295941f9ba0c0bd1d9cac715`, phase `http_request_dynamic_redirect`, version 1, one rule |
| Rule ref | `www_to_apex_franchisor_id`, enabled |
| Expression | `http.host eq "www.franchisor.id"` |
| Action | 301 → `concat("https://franchisor.id", http.request.uri.path)`, `preserve_query_string: true` |
| Page Rules | none (deliberately — they are the legacy mechanism) |

This is a **Redirect Rule** (Cloudflare's docs call the feature "Single Redirects"). The token scope required
is **Zone → Single Redirect → Edit**, shown as **Dynamic URL Redirects → Write** in newer token UI. Cache,
Config, Origin, Transform, Custom Error and HTTP DDoS rule types **cannot** change a hostname.

Verified live: `www/`, `www/usaha/abo-meatshop`, `www/peluang-usaha/` and `www/usaha/abo-meatshop/?x=1` each
answer 301 with path and query intact, and `curl -L` reaches 200 in exactly one hop — no loop. The apex is
unaffected. This completed the last item of `MANUAL_SETUP_CHECKLIST.md` §4.

Read: `GET /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint`.

## 5b. Shared D1 and the migration ledger

The database is **shared with `franchisee.id`** (`franchise_db`, id `812cd8ac-edd0-45d9-981f-c9a15358317b`), and
the canonical migration chain lives in that sibling repository (`../Franchisee.id/migrations`). This repository
has no `migrations/` directory, by design.

**What `d1_migrations` is, and why it matters.** It is not a database feature — it is **Wrangler's bookkeeping
table** (`id`, `name`, `applied_at`). `wrangler d1 migrations apply` reads it to decide which files to run, so a
migration whose objects exist but whose ledger row is missing gets **re-run** on the next apply. The database
works perfectly well either way; the ledger only governs what the tooling does next. Which is why it is worth
keeping honest and not worth fearing.

**Reconciled 2026-09-27.** The ledger was missing rows for 0034–0036 and 0039 while their objects were live.
Every object was verified present in the database **first** — `operation_events_retention`, the three claim
guards, `idx_franchises_brand_match`, the four brand-review guards, the 0038-recreated review-decision trigger,
and `guard_owner_edit_review_decision` — and only then were the rows inserted, by filename, with explicit ids
matching the migration numbers. The ledger now has **no gaps across ids 1–40**. This mattered: 0038 contains
`DROP TRIGGER IF EXISTS`, so a blind re-run would have briefly dropped a live guard.

**Applying a migration without re-running old ones.** `0040_user_identities.sql` was applied through the D1 REST
API (`POST /accounts/{id}/d1/database/{id}/query`), one statement at a time, taking the SQL straight from the
committed file and refusing any statement that did not begin with `create table`, `create index` or `insert`.
That bypasses `wrangler apply` entirely, so nothing already applied is ever re-run, and it keeps the change
purely additive.

**Applied so far:** `0040_user_identities.sql` — the `user_identities` table, its two indexes, and four
backfilled identity rows (one per existing user). Nothing was deleted or updated by it.

**Rules for future schema changes here:** verify an object exists before recording its ledger row; never record
a row for a migration whose objects are absent; and prefer the REST API under a statement allowlist over a bulk
apply whenever the ledger has ever been behind.

## 6. Deployment history worth knowing

| Deployment | Commit | Outcome |
| --- | --- | --- |
| `8588ba9d` | `d028dea` | first successful production deployment |
| `f9fd9747` | `2dd0702` | legacy brand pages emitted flat, `usaha/{slug}.html` |
| `65a63096` | `68c1fd8` | real 404 added (`dist/404.html`) |
| `74cdc080` | `7ddd575` | **FAILED** — the `deployment_configs` PATCH erased `CLOUDFLARE_API_TOKEN` (§4) |
| `684707f3` | `7ddd575` | recovery; token restored and proven by a green build |

Read: `GET /accounts/{account_id}/pages/projects/franchisor-id/deployments?per_page=5`, and the build log at
`…/deployments/{id}/history/logs` (`result.data[]`, each `{ts, line}`). **Read the log rather than inferring
from status** — a build-time gate can `SKIP` and exit 0, as `schema:check` does here.

## 7. Clerk

Two applications, one per site, sharing one D1. This replaced the paid-satellite design:

| | `franchisee.id` | `franchisor.id` |
| --- | --- | --- |
| Clerk application | existing (primary) | own, separate, free instance |
| Publishable key / secret key | its own | its own — **not shared** |
| `CLERK_APP_KEY` | `franchisee_id` | `franchisor_id` |
| `/clerk-webhook` signing secret | its own endpoint | its own endpoint (**per-endpoint, cannot be shared**) |
| `CLERK_IS_SATELLITE` | unset | `false` |
| `CLERK_DOMAIN`, `CLERK_SIGN_IN_URL`, `CLERK_SIGN_UP_URL`, `CLERK_ALLOWED_REDIRECT_ORIGINS`, `CLERK_SATELLITE_AUTO_SYNC` | unset | **removed** — the seven values currently on the Pages project exist only for the satellite design |

Identity is reconciled in D1, not by Clerk: a shared `user_identities` table lets one `users` row be reached
through either application, matched on the **verified email**. Design, risks and status:
`~/.commandcode/plans/franchisor-id-two-clerk-apps-shared-d1.md`. Why the satellite route was deferred:
Clerk requires a paid plan for production satellite domains.

**This is the section an operator opens when someone cannot sign in** — check which application the person is
using, then which identity rows that user has.

## 8. Things that must not be done

- **Do not round-trip `deployment_configs`** (§4). It silently destroys secrets.
- **Do not delete the `users` row** to erase someone. `franchise_submission_reviews.applicant_user_id` is
  `NOT NULL` with no `ON DELETE`, so the delete is refused; several other tables would cascade destructively.
- **Do not hard-delete a `franchises` row.** It cascades into 20 tables, destroying premium orders, payment
  confirmations and the ownership provenance itself.
- **Do not add cache rules on the custom domain.** Cloudflare's own guidance: it can serve stale assets and
  break redirects and Functions. Purge instead if assets look stale after a deploy.
- **Do not add a catch-all `_redirects` rule.** The existing file is deliberately explicit so it cannot
  intercept `/css/`, `/js/`, `/_astro/`, `/clerk/`, `/wp-content/` or `/wp-includes/`.
- **Do not remove `dist/404.html`.** Without a top-level 404 file, Pages assumes a single-page application and
  answers *every* unmatched path with the root document and HTTP 200 — which is exactly what this site did
  before `68c1fd8`. A build gate in `check-built-assets.mjs` now fails if the file disappears.
- **Do not emit legacy brand pages as `usaha/{slug}/index.html`.** The directory shape makes Pages 308 the
  canonical `/usaha/{slug}` to the slash form. A build gate asserts the flat form for all 34 brands.

## 9. Verification recipes

```bash
# Canary on the deployment host first, so a custom-domain problem is not mistaken for a build problem.
curl -s -o /dev/null -w "%{http_code} %{redirect_url} %{size_download}\n" https://franchisor-id-9ar.pages.dev/

# Expected contract on the apex:
#   /                       200
#   /peluang-usaha/         200   (the Astro directory)
#   /usaha/{slug}           200   (flat legacy page, no trailing-slash redirect)
#   /usaha/{slug}/          308   -> /usaha/{slug}
#   /auth-config            200   JSON
#   /usaha/does-not-exist   404   (the not-found page, 1631 bytes)
#   www.{any path}          301   -> the apex equivalent, one hop

# Prove two URLs serve the same bytes (the soft-404 test): compare SHA-256, and do it on the *.pages.dev
# host, because a proxied hostname rewrites mailto: links so bytes differ while the page is identical.
```

**Distinguishing failure modes:** if `*.pages.dev` serves 200 but the custom domain returns 403, the build is
fine and hostname attachment or DNS is the problem. If a build succeeds but a gate "passed", read the log —
it may have skipped.

## 10. Change log for this document

- 2026-09-26 — created from live API reads. Records the account/zone/project/DNS/binding inventory, the
  `config → deployment_configs` and secret round-trip traps, the www→apex redirect rule and its required token
  scope, the deployment history including the failed `74cdc080`, both Clerk applications, and the list of
  actions that must not be taken.
