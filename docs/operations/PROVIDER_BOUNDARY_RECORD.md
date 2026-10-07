# Franchisor.id provider and deployment boundary record (Gate 0)

Next verification sequence: [Astro/Cloudflare brand publishing plan](ASTRO_CLOUDFLARE_BRAND_PUBLISH_PLAN.md). It preserves `/peluang-usaha/` as the directory and `/usaha/{slug}` as the brand detail family while checking D1 builds, theme/assets, and deployment identity. The dated production observations below remain historical until a fresh Pages deployment is verified.

**Fresh anonymous HTTP check, 2026-09-26:** `/auth-config` returned HTTP 200 with the legacy directory title, 333,850 bytes, and canonical `/`; `/peluang-usaha/` returned its directory title, 339,459 bytes, and canonical `/peluang-usaha`; `/usaha/abo-meatshop` returned its brand title, 319,640 bytes, and canonical `/usaha/abo-meatshop`; `/this-does-not-exist-20260926/` returned HTTP 200 with the same legacy directory title, 333,850 bytes, and canonical `/`. This confirms the soft-404 and legacy public surface still exist at the checked time. It does not identify the Pages project or prove whether any preview deployment exists.

**2026-09-26 correction:** The poller defect described later in §5 was fixed locally in `eb94f7d`: `scripts/d1-static-publish-poller.mjs` now reads `site_rebuild_requests`, and its local tests passed. Actual GitHub workflow execution, Pages bindings, deploy hook, and production publication remain **not verified**. See [rollout code review R4](../product/ROLLOUT_CODE_REVIEW_2026-09-26.md); keep the historical finding for chronology, not as a current code blocker.

> ## ✅ Two-Application Clerk Architecture Live (Updated 2026-10-07)
>
> The previous satellite design has been fully replaced and step **`0.12` is completed and verified live on production**:
> - Dedicated free Clerk production instance `u3kwrfeaf9l7` configured for `franchisor.id`.
> - All 8 DNS records live (`clerk.franchisor.id` frontend API, `accounts.franchisor.id`, `clkmail.franchisor.id` + DKIM).
> - Production Cloudflare Pages variables set: `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_APP_KEY=franchisor_id`, `CLERK_WEBHOOK_SIGNING_SECRET`, `USER_BLOCK_SALT`, `CLERK_AUTHORIZED_PARTIES=https://franchisor.id,https://www.franchisor.id`.
> - Obsolete satellite variables (`CLERK_IS_SATELLITE`, `CLERK_DOMAIN`, `CLERK_SIGN_IN_URL`, `CLERK_SIGN_UP_URL`, `CLERK_ALLOWED_REDIRECT_ORIGINS`, `CLERK_SATELLITE_AUTO_SYNC`) removed from production.
> - Live `/auth-config` returns `{"publishableKey":"pk_live_...","configured":true,"isSatellite":false}`.
> - Live `/clerk-webhook` returns 400 Svix signature missing, verifying Svix validation is enforcing signing secret with D1 binding.
> - Google SSO verified authenticatable on live FAPI (`https://clerk.franchisor.id/v1/environment`).
> - Live production routes (`/login/`, `/sso-callback/`, `/profil/`, `/dashboard/`, `/premium/`) serve application UI.
> - Refer to `docs/architecture/INFRASTRUCTURE.md` and `docs/operations/MANUAL_SETUP_CHECKLIST.md` for current operational reference.




Recorded 2026-09-25 (Asia/Jakarta). Gate 0.2 artifact of [the rollout plan](../product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md): identify the Pages project, production branch, domain mapping, D1/R2 bindings, Clerk settings, GitHub publisher, email dispatcher and deployment SHA **without copying secrets**. Status key: ✅ pass · ❌ fail · ⬜ not verified (needs a dashboard or signed-in session).

Every row below is either verified evidence, a named blocker, or explicitly `not verified`. Route status 200 is never treated as readiness.

## 1. Anonymous production route check (2026-09-25)

Method: `GET https://franchisor.id<path>` with no session, no cookies, redirects not followed; recorded status, `Content-Type`, byte length, and `<title>`.

| Route | Status | Content-Type | Bytes | Title | Reading |
| --- | --- | --- | --- | --- | --- |
| `/` | 200 | text/html | 333814 | Direktori Franchise & Peluang Usaha Terlengkap di Indonesia | Legacy directory home |
| `/auth-config` | 200 | **text/html** | 333814 | same legacy title | ❌ Must be a safe JSON response. Currently the legacy HTML fallback |
| `/profil/` | 200 | text/html | 333814 | same legacy title | ❌ Legacy fallback, not the application |
| `/dashboard/` | 200 | text/html | 333814 | same legacy title | ❌ Legacy fallback, not the application |
| `/premium/` | 200 | text/html | 333814 | same legacy title | ❌ Legacy fallback, not the Premium page |
| `/daftar/` | 200 | text/html | 333814 | same legacy title | ❌ Legacy fallback, not the registration flow |
| `/login/` | 200 | text/html | 228577 | Login - Franchisor.id | Legacy login page (distinct size from the fallback) |
| `/usaha/abo-meatshop/` | 200 | text/html | 319638 | Abo Meatshop - Franchisor.id | ✅ Legacy brand page resolves |
| `/peluang-usaha/` | 200 | text/html | 339449 | Cari Franchise / Peluang Usaha - Franchisor.id | Legacy directory listing resolves |
| `/robots.txt` | 200 | text/plain | 115 | — | ⚠️ Declares `Sitemap: https://wp.codev.id/sitemap_index.xml` — a stale legacy sitemap host, not this domain |

Five distinct routes returning the identical 333,814-byte document is conclusive evidence of a legacy catch-all: the ported Astro application and its Pages Functions are **not** serving production. This reproduces the 2026-09-25 review finding and means Gate 2 has not been started, not merely incomplete.

**Soft-404 catch-all:** a deliberately nonexistent path (`/this-does-not-exist-12345/`) also returns **200** with the same 333,814-byte directory home page and `canonical='/'`. The origin therefore answers **every** unknown URL with a 200. Consequences: (a) route status is worthless as a readiness signal on this domain — only content signature and byte length distinguish a real page from the fallback; (b) `/peluang-usaha/{slug}` returns 200 but is **not** a brand page, it is this fallback; (c) this is a real SEO defect that Gate 4 must resolve alongside the legacy redirect map, because soft-404s let crawlers index unlimited nonexistent URLs.

**Verified brand-detail family:** `/usaha/{slug}` and `/usaha/{slug}/` both serve the real brand page (`Abo Meatshop` 319,638 bytes, `Codero` 322,496 bytes), and those pages declare `<link rel="canonical" href="/usaha/{slug}">` — no trailing slash. That matches this site's `trailingSlash: "never"` build and is the family the amended decision adopts for legacy **and** new brands. `/usaha/` itself (no slug) falls through to the catch-all, so there is no `/usaha/` index page today.

## 2. Release identity

| Item | Value | Status |
| --- | --- | --- |
| Repository | `https://github.com/cfpages-syamsulalam-net/Franchisor.id.git` | ✅ confirmed from `.git/config` |
| Production branch | `main` | ✅ confirmed (`docs/operations/MANUAL_SETUP_CHECKLIST.md`, workflow guard `github.ref_name == github.event.repository.default_branch`) |
| Local HEAD at audit | `8dfadf9a94a01edf3f6bd8888f66b533b4334761` | ✅ this is the release commit for the Gate 1 change set |
| Deployed SHA | unknown | ⬜ anonymous checks cannot read the deployed commit; requires the Pages dashboard |
| Pages project name | `franchisor-id` | ⬜ matches `wrangler.toml` `name`, the poller allowlist, and the manual checklist; not verified in the dashboard |
| Pages production domain | `franchisor.id`, `www.franchisor.id` | ⬜ domain resolves and serves the legacy export, so DNS is pointed somewhere valid; the Pages project mapping itself is unverified |
| Pages deploy mode | hook (expected) | ⬜ `site_publish_state` row for `site_franchisor_id` does not exist yet, so the live `publish_mode` is unset |

## 3. Bindings

| Binding | Expected | Status |
| --- | --- | --- |
| D1 | `franchise_db` → `812cd8ac-edd0-45d9-981f-c9a15358317b` | ✅ the database exists, is reachable, and holds the shared schema (verified read-only this session). Whether the *Pages project* declares the binding is ⬜ |
| R2 | `FRANCHISE_ASSETS` → `franchise-assets` | ⬜ not verified from here |
| `assets.franchisee.id` public base | shared R2 hostname by design | ⬜ not verified |
| `pages_build_output_dir` | deliberately absent | ✅ confirmed absent from both TOML files (dashboard remains the production config source) |
| `CLOUDFLARE_API_TOKEN` | Pages build secret | ⬜ not verified |

## 4. Identity (Clerk)

| Item | Expected | Status |
| --- | --- | --- |
| Tenant | dedicated free Clerk application `u3kwrfeaf9l7` (`franchisor.id`), joined via shared D1 `user_identities` | ✅ verified live 2026-10-07 |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | configured in Pages | ✅ verified live (`pk_live_...`) |
| `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` | set as secrets | ✅ set in Pages production |
| `CLERK_AUTHORIZED_PARTIES` | `https://franchisor.id,https://www.franchisor.id` | ✅ set in Pages production |
| `CLERK_APP_KEY` | `franchisor_id` | ✅ set in Pages production |
| Webhook `/clerk-webhook` | `user.created\|updated\|deleted` | ✅ live and enforcing Svix verification |
| Cross-domain sign-in by identity | one Clerk identity per site ↔ one D1 user | ✅ resolver implemented and parity-checked; live browser acceptance pending |


Local code does enforce the safe pattern — `functions/_clerk-auth.js` verifies the bearer token against `CLERK_AUTHORIZED_PARTIES`, resolves roles from D1 (`user_roles`), and treats admin/staff as supersets. Clerk proves identity; D1 authorizes. That is ✅ at the code level and ⬜ at the deployment level.

## 5. Publisher and dispatcher

| Item | Value | Status |
| --- | --- | --- |
| Publish workflow | `.github/workflows/d1-static-publish.yaml`, cron `7,37 * * * *`, `SITE_ID=site_franchisor_id` | ✅ code present and site-scoped |
| Workflow repo guard | `GITHUB_REPOSITORY: cfpages-syamsulalam-net/Franchisor.id` | ✅ matches |
| Queue consumer | `scripts/d1-static-publish-poller.mjs` | ✅ code fixed in `eb94f7d` — reads `site_rebuild_requests`, `site_publish_state.daily_publish_count`, writes `error_message`, orders FIFO by `created_at, id`; local tests pass. ⬜ the real GitHub workflow run, deploy hook and production Pages wiring remain unverified. The original `site_publish_requests` defect stays in §3 for chronology, not as a current code blocker |
| `PAGES_DEPLOY_HOOK_FRANCHISOR_ID` | GitHub secret | ⬜ not verified; the local poller no longer blocks it, but no real hook invocation has been observed |
| Direct-deploy fallback | `pnpm run build:astro` + `wrangler pages deploy dist` | ⬜ not verified; its workflow step now runs Node 22 so the `schema:check` gate is real there |
| Build gate | `pnpm run build` runs `ownership:check` then `schema:check` before the D1 snapshot | ⬜ `schema:check` needs Node 22+ (`node:sqlite`) and the sibling `Franchisee.id/migrations` chain; without either it prints SKIP and exits 0, so a green build alone does not prove the schema assertions ran. Set `NODE_VERSION=22` for the Pages build, as the setup checklist now does, to make the gate real in production too |
| Premium email dispatcher | `.github/workflows/premium-email-worker.yaml`, `workflow_dispatch` **only** | ✅ correctly manual-only, matching the "one scheduler" rule; the other repository owns scheduling |
| `PREMIUM_EMAIL_WORKER_SECRET`, `RESEND_API_KEY` | secrets | ⬜ not verified |

Single-dispatcher rule: the rollout plan requires naming the active dispatcher and disabling duplicate scheduled Premium emails across repositories. Franchisor's workflow has no `schedule:` trigger, which satisfies its half; confirm the active scheduler lives in Franchisee.id before enabling sending.

## 6. Blockers and next actions

**Repository moved to match the hosting marker — 2026-09-26.** Syamsul uses the GitHub organization name as his own marker for which Cloudflare account hosts a project, because he hosts many: `cfpages-syamsulalam-net` means the `me@syamsulalam.net` account (the `franchise-network` account, `0ba63b7f…`), and `cfpages-admtravelbos` means the `admtravelbos@gmail.com` account. Franchisor.id must be hosted in `franchise-network` (see below), so the repository was transferred from `cfpages-admtravelbos` to `cfpages-syamsulalam-net` so the marker tells the truth. The old URL redirects. Updated in the same commit: `package.json`, `.github/workflows/d1-static-publish.yaml` (`GITHUB_REPOSITORY`), `scripts/d1-static-publish-poller.mjs` (the `REPOS` allowlist key), and the poller test fixture.

**Which Cloudflare account, and why.** The Pages project **must** be created in the **`franchise-network`** account (`0ba63b7f0096bc267a93fe5c80b1f571`), the same one that holds `franchise_db`, `franchise-assets` and the `franchisee-id` project. Cloudflare bindings are account-scoped: a project can only bind D1/R2 resources in its own account. The build's D1 *REST* query can cross accounts with a token, but a *runtime* `env.franchise_db` / `env.FRANCHISE_ASSETS` cannot — and the Functions depend on both (`_clerk-auth.js`, `profile-data.js`, `dashboard-data.js`, `form-submit.js`, and the `/peluang-usaha/[slug]` redirect). A project in any other account would deploy a public directory and then fail every authenticated call.

This is forced, not preferred: Franchisor.id and Franchisee.id share one database, so they must share one Cloudflare account and therefore one set of nameservers. Their identity separation can be organisational only, unless Franchisor.id is given its own D1 — which would break the shared-platform contract.

The organization name is a **marker, not a mechanism**: it does not itself determine where a project deploys, it just makes placement legible at a glance. That legibility is the reason for the move above, not a technical requirement.

**Gate 2 cannot pass** until all of the following are done by an operator with dashboard access, in this order:

1. ✅ **DONE 2026-09-26.** Project `franchisor-id` created (id `866cd8f9-e5bc-4d73-a253-a96a0d161f7e`, subdomain `franchisor-id-9ar.pages.dev`), Git-integrated to `cfpages-syamsulalam-net/Franchisor.id` on `main`, `build_config` = `pnpm run build` → `dist`, root at the repository root. Created through the API rather than the dashboard, so the settings are exact.
2. ✅ **DONE 2026-09-26.** `franchise_db` and `FRANCHISE_ASSETS` bindings set for **both** Production and Preview, copied verbatim from the working `franchisee-id` project.
3. ✅ **DONE 2026-09-26.** Build variables set for both environments: `NODE_VERSION=22`, `PNPM_VERSION=10.34.1`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID` as plain text, and `CLOUDFLARE_API_TOKEN` as an encrypted `secret_text`. ⬜ The Clerk variables are still unset, which is why `/auth-config` reports `configured: false`; their values are Syamsul's to supply.
4. Configure `franchisor.id` as a Clerk satellite of the shared tenant, add the DNS CNAME, wait for verification, add the allowed redirect origins, and create the `/clerk-webhook` endpoint with its three events.
5. Map `franchisor.id` and `www.franchisor.id` as custom domains with HTTPS active, apex canonical, `www` redirected to apex.
6. Add the GitHub secrets/variables and create the Pages Deploy Hook; store its URL only in the secret.
7. Run one Franchisor-scoped rebuild end to end and confirm the poller's deploy hook actually fires and the row is marked deployed. The local table/column defect is already fixed in `eb94f7d`; what remains unverified is real workflow execution, not the code.
8. Reconcile the `d1_migrations` ledger (§2 of the parity matrix).

Success signals to record after each step: `/auth-config` returns JSON with `configured: true`, `isSatellite: true`, and no secret; `/profil/`, `/dashboard/`, `/premium/`, `/daftar/` render the application rather than the 333,814-byte legacy document; unauthorized API methods return 405 and protected endpoints 401/403; one disposable asset uploads to `franchise-assets` and resolves publicly; one Franchisor-scoped rebuild triggers **only** the Franchisor Pages project.

Until then, this release is `locally validated`, never `deployed`.

## 7. First live deployment and what it proves — 2026-09-26

Deployment `8588ba9d-95c7-4950-9422-97eee771f159`, environment `production`, canonical, commit `d028dea7f599840df28bf2461e8502c92e52a3fd`, branch `main`, `commit_dirty=false`. Stage `deploy/success`. Build log line: `Built asset check passed for 5001 deployed files; all local HTML/CSS asset references resolve with exact casing.` Site: `https://franchisor-id-9ar.pages.dev`.

**Confirmed working (anonymous, no auth):**

| Check | Result |
| --- | --- |
| `/auth-config` | ✅ **156 bytes of JSON** — `{"publishableKey":"","configured":false,"isSatellite":false,…}`. Previously the legacy directory document; the Functions are live and the documented "JSON, never the legacy HTML" signal now holds |
| `/dashboard/` | ✅ 58,400 bytes — the application, not the legacy document |
| `/profil/` | ✅ 2,923 bytes — the application |
| `/premium/` | ✅ 8,684 bytes — the application |
| `/peluang-usaha/` | ✅ 273,474 bytes — the Astro directory page |
| Build pipeline | ✅ `ownership:check` and `schema:check` ran inside the Pages build without failing, at `NODE_VERSION=22` |

**Findings from that deployment, and what has since happened to each:**

1. ✅ **FIXED 2026-09-26 (`68c1fd8`).** Unknown URLs now answer a real **404** with a page-not-found document. The explanation below is kept in full because this is the clearest worked example of the trap in the portfolio, and it is now cited by `KNOWLEDGE/KNOWLEDGE-CLOUDFLARE-PAGES.md` §1.

   **What it means.** When a visitor or a crawler requests a URL that does not exist, the server should reply `404 Not Found` and a "page not found" page. This site instead replies **`200 OK`** with the full homepage. The server is asserting, for every possible URL, "this page exists and here it is."

   **Proof, measured on the unproxied host so nothing is rewritten** (`franchisor-id-9ar.pages.dev`; the zone-proxied host rewrites `mailto:` links, which changes bytes without changing the page):

   | Request | Status | Bytes | SHA-256 (first 16) |
   | --- | --- | --- | --- |
   | `/` | 200 | 331,549 | `675B68D1A8D220DD` |
   | `/usaha/tidak-ada-brand-ini-sama-sekali` | 200 | 331,549 | `675B68D1A8D220DD` |
   | `/sebarang-junk-url` | 200 | 331,549 | `675B68D1A8D220DD` |

   Byte-identical, same title (`Direktori Franchise & Peluang Usaha Terlengkap di Indonesia`), all `200`. Even `/tidak-ada-file-ini-sama-sekali.html` — a plainly missing static file — returns 200. A genuine miss and the homepage are indistinguishable to any client.

   **Why it matters.**
   - **Search engines.** Every junk or dead URL is a valid page as far as a crawler is concerned, so an unbounded set of URLs reads as duplicate content of the homepage, and dead URLs cannot be retired from the index. Search engines may also classify real pages as soft-404s once the pattern is established.
   - **Users.** Someone following an expired link to a brand page lands on the directory homepage with no "not found" signal — it looks like the site ignored their request.
   - **Operators.** Real breakage is invisible. A brand page that has genuinely disappeared cannot be told apart from a typo, so monitoring and the "did my published page go live?" question both become unanswerable from status codes.

   **Why it happens here.** There is **no `404.html` in `dist/` and no `src/pages/404.astro`** in the source, and no catch-all `_redirects` rule, no `functions/_middleware.js`, and no `functions/[[path]].js` were found. So there is no not-found response to serve and the root document ends up standing in for one. The `/peluang-usaha/[slug].js` handler that was added for this rollout deliberately falls through on an unverified slug, and its fall-through target is that same root document — so it behaves exactly as designed while still contributing to this symptom.

   **How it was fixed and verified.** `src/pages/404.astro` now emits `dist/404.html`, so Pages stops assuming an SPA and serves it with a genuine 404 status; the page carries `noindex` and deliberately no canonical. `check-built-assets.mjs` fails the build when `dist/404.html` is absent — proven able to fail by removing the file and observing the exact assertion — because losing it silently reinstates the SPA behaviour. Verified live on commit `68c1fd8` / deployment `65a63096`, on both the unproxied host and the custom domain: `/usaha/tidak-ada-brand-ini-sama-sekali`, `/sebarang-junk-url`, `/peluang-usaha/tidak-ada-juga-ini` and `/tidak-ada-file-ini-sama-sekali.html` all return **404** with the 1,631-byte not-found page, while `/`, `/peluang-usaha/` and `/usaha/abo-meatshop` still return 200 and `/usaha/abo-meatshop/` still 308s to the canonical. The build is now 13 pages / 5,002 deployed files with `assets:check`, `published:check`, `directory:check` and `ownership:check` all green.
2. ✅ **FIXED 2026-09-26 (`2dd0702`).** Legacy brand URLs no longer 308-redirect to a trailing slash. The 34 legacy pages were exported as `usaha/<slug>/index.html`, so Cloudflare answered `/usaha/<slug>` with a 308 to the slash form while the declared canonical family is `/usaha/{slug}` — meaning every legacy brand served from a URL that contradicted its own canonical. `copy-legacy-static.mjs` now emits those pages flat as `usaha/<slug>.html`, which is also where the Astro-generated brand pages already land (`trailingSlash: "never"`, `build.format: "preserve"`), so the two sources collide on one path and the existing no-overwrite rule still lets the generated page win. Verified live on deployment `f9fd9747` (commit `2dd0702`): `/usaha/abo-meatshop` → **200** (was 308), `/usaha/abo-meatshop/` → **308 to `/usaha/abo-meatshop`** (the correct direction now), `/usaha/al-arashy-tour-travel` → 200. Flattening was proven safe first: the legacy HTML contains **zero** relative asset references (`href`/`src` starting with `../`), so moving it up one directory level cannot break asset resolution. A new gate in `check-built-assets.mjs` fails the build if any brand in the source tree lacks a flat page or if the directory form reappears — it reads the source tree, so it cannot go stale.

Both findings are now closed, each behind a build-enforced regression guard: the flat-page assertion for the trailing-slash defect and the `dist/404.html` assertion for the SPA fallback, both in `check-built-assets.mjs`.

## 8. Custom domains and runtime variables — state at 2026-09-26

**Custom domains.** ✅ **Active as of 2026-09-26.** `franchisor.id` and `www.franchisor.id` are both attached to the Pages project and both report `status=active` with `ssl=active`. `https://franchisor.id/` returns **200**, and the trailing-slash fix is confirmed on the real domain: `/usaha/abo-meatshop` → 200, `/usaha/abo-meatshop/` → 308 back to the canonical. The earlier `pending` state was caused by the apex record in the zone not being the record Pages expected; Syamsul corrected the DNS and both hostnames activated without further API work.

✅ **DONE 2026-09-26 — `www` now redirects to the apex.** A zone-level **Redirect Rule** (Single Redirect) issues a 301 from `http.host eq "www.franchisor.id"` to `concat("https://franchisor.id", http.request.uri.path)` with the query string preserved. Verified live: `https://www.franchisor.id/`, `/usaha/abo-meatshop`, `/peluang-usaha/` and `/usaha/abo-meatshop/?x=1` all answer **301** to the apex equivalent with path and query intact, and following them lands on 200 in exactly **one** hop — no redirect loop. The apex is unaffected: `/` 200, `/usaha/abo-meatshop` 200, `/usaha/abo-meatshop/` 308 to the canonical, unknown URLs 404. `MANUAL_SETUP_CHECKLIST.md` §4 step 3 is now met.

Diagnostics kept for the record (DNS read is 403 for this token, so these came from public resolution via 1.1.1.1). They are what identified the problem before it was fixed:

| Probe | Result | Reading |
| --- | --- | --- |
| `franchisor.id` A | `172.67.203.56`, `104.21.52.194` | resolves to Cloudflare-proxied anycast — the apex is behind Cloudflare |
| `franchisee.id` A (working control) | `104.21.4.227`, `172.67.132.144` | same class of address, so the address shape is not the differentiator |
| `https://franchisee.id/` | **200** | a working Pages custom domain in the same account |
| `https://franchisor.id/` | **403** | proxied, cert valid, but not routed to the Pages hostname |
| `www.franchisor.id` | **does not resolve** | Cloudflare did not auto-create the record |
| `_cf-custom-hostname.franchisor.id` TXT | absent | Pages is not waiting on a TXT challenge, so this is not a verification-record problem |

**Prime suspect:** the apex record present in the zone is not the record Pages expects for this project — most likely an `A` record left from before the domain was repointed, rather than a `CNAME` to `franchisor-id-9ar.pages.dev` (Cloudflare flattens an apex CNAME, and that is the shape Pages custom domains normally auto-create). This token cannot confirm or fix it: `GET`/`POST` on `/zones/{id}/dns_records` and `/zones/{id}/rulesets` all return **403**, i.e. the token is Pages/D1/Workers-scoped with no Zone DNS or Zone Rules access.

**How this was finished.** Syamsul corrected the apex DNS himself, which activated both custom domains, then granted the two token scopes required. The redirect was created through the API as a zone ruleset in phase `http_request_dynamic_redirect` (ruleset `33ad9567295941f9ba0c0bd1d9cac715`, rule ref `www_to_apex_franchisor_id`, `enabled: true`) — **not** via Page Rules, which is the legacy mechanism and was left at zero rules. The permission that was actually needed is **Zone → Single Redirect → Edit** (shown as **Dynamic URL Redirects → Write** in newer token UI). An earlier version of this record asked for "Zone → Rules → Edit", which is **not a real Cloudflare permission group** and was simply wrong; the correct categories and the ones that cannot do this at all (Cache, Config, Origin, Transform, Custom Error, HTTP DDoS managed) are mapped in `KNOWLEDGE/KNOWLEDGE-CLOUDFLARE-PAGES.md` §8.

**Runtime variables — and why they cannot simply be copied from `franchisee-id`.** Syamsul's proposal was to make this project's variables "the same" as `franchisee-id`, on the reasoning that Franchisee.id already holds them. Two independent reasons that does not work:

1. **The values are unreadable.** Cloudflare returns every `secret_text` variable with an **empty value** (`len=0`); only `plain_text` values come back. Verified by reading both projects. There is no API path that copies a secret from one Pages project to another, so each secret must be re-supplied. The names are readable; the values are write-only.
2. **The two sets are not the same, and copying would be wrong for several entries.** `franchisee-id` holds 14 variables; the Franchisor code reads roughly 35. The Clerk **satellite** set has no counterpart on `franchisee-id` at all — `CLERK_PUBLISHABLE_KEY`, `CLERK_DOMAIN`, `CLERK_IS_SATELLITE`, `CLERK_SATELLITE_AUTO_SYNC`, `CLERK_SIGN_IN_URL`, `CLERK_SIGN_UP_URL`, `CLERK_ALLOWED_REDIRECT_ORIGINS`, `CLERK_AUTHORIZED_PARTIES` — so copying the existing list verbatim would still leave `/auth-config` reporting `configured: false`.

Entries that must be **site-specific rather than copied**:

| Variable | Why it must differ |
| --- | --- |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Clerk signing secrets are issued **per webhook endpoint**; the new `/clerk-webhook` endpoint has its own. A copied value would fail signature verification |
| `GOOGLE_CONTACTS_REDIRECT_URI` | Used as `env.GOOGLE_CONTACTS_REDIRECT_URI \|\| ${origin}/google-contacts-callback`. It auto-derives correctly per origin, and the `franchisee-id` value would send the OAuth callback to the **wrong domain** — best left unset |
| `PREMIUM_EMAIL_FROM`, `PREMIUM_EMAIL_REPLY_TO` | Brand-facing sender addresses; reusing Franchisee.id's would send Franchisor mail from the other brand |
| `CLERK_DOMAIN`, `CLERK_*_URL`, `*_ORIGINS`, `*_PARTIES` | Franchisor.id's own satellite identity |

Safe to reuse verbatim (shared provider resources): `FRANCHISE_ASSETS_PUBLIC_BASE_URL` / `R2_PUBLIC_BASE_URL` — they are read as `env.FRANCHISE_ASSETS_PUBLIC_BASE_URL || env.R2_PUBLIC_BASE_URL` and name the one shared R2 asset host, correct for both sites; `RESEND_API_KEY`; `OCR_KEY`, `OCR_SECRET`; `GOOGLE_CONTACTS_CLIENT_ID/_SECRET/_TOKEN_KEY`; `G_PRIVATE_KEY`; `PREMIUM_EMAIL_WORKER_SECRET` if the same worker serves both sites. `CLERK_SECRET_KEY` is the shared tenant secret and is reusable because this site is a satellite of the same tenant.

Nothing was guessed into place: a half-set Clerk configuration would make `/auth-config` claim `configured: true` while sign-in still failed, which is worse than an honest `configured: false`. `/auth-config` currently reports `configured: false`, and that is the accurate state.

## 9. Runtime variables set, a self-inflicted outage, and the satellite decision — 2026-09-26

**Non-secret Clerk variables are now set** for both Production and Preview, using the values `MANUAL_SETUP_CHECKLIST.md` §3 prescribes:

| Variable | Value set |
| --- | --- |
| `CLERK_IS_SATELLITE` | `true` |
| `CLERK_DOMAIN` | `franchisor.id` |
| `CLERK_SIGN_IN_URL` | `https://franchisee.id/login/` |
| `CLERK_SIGN_UP_URL` | `https://franchisee.id/login/?mode=register` |
| `CLERK_AUTHORIZED_PARTIES` | `https://franchisor.id,https://www.franchisor.id` |
| `CLERK_ALLOWED_REDIRECT_ORIGINS` | `https://franchisor.id,https://www.franchisor.id` |
| `CLERK_SATELLITE_AUTO_SYNC` | `true` — the seamless option; reversible to `false` |

Live proof after deployment `684707f3` (commit `7ddd575`), `GET /auth-config`:

```
{"publishableKey":"","configured":false,"isSatellite":true,"domain":"franchisor.id",
 "signInUrl":"https://franchisee.id/login/","signUpUrl":"https://franchisee.id/login/?mode=register",
 "allowedRedirectOrigins":["https://franchisor.id","https://www.franchisor.id"],"satelliteAutoSync":true}
```

`configured` is still `false` because `configured` is `Boolean(publishableKey)` and the publishable key has not been supplied yet. That is correct, not a defect.

### ⚠️ A read-merge-write PATCH destroyed the build token — do not repeat this

**What happened.** To add the Clerk variables I read `deployment_configs`, merged my new keys, and PATCHed the whole map back. Cloudflare returns `secret_text` values as **empty strings**, so the read produced `CLOUDFLARE_API_TOKEN = ""` and writing it back **erased the real token**. The next build failed with `Error: No Cloudflare token found for cfman account "franchise-network" and CLOUDFLARE_API_TOKEN is not set` — deployment `74cdc080`, stage `build/failure`. Production was never down: Pages kept serving the last good deployment throughout.

**The rule.** Never round-trip `deployment_configs` from a `GET` into a `PATCH`. Secret values are write-only, so a round trip silently writes them back empty. Supply the **complete** `env_vars` map with known values for every key, or PATCH only the keys you are changing. Reading the map to "merge safely" is exactly the operation that causes the loss.

**Recovery.** Re-sent the complete map with the real token plus every plain-text value, then deployed to prove it: deployment `684707f3` → `deploy/success`, which is only possible if the D1 read succeeded.

### The Clerk account question — create a satellite domain, not a new account

Syamsul said he would "create the clerk account". That must not be a **new Clerk account or instance**. `MANUAL_SETUP_CHECKLIST.md` §3 already specifies the design: use the **same Clerk instance as Franchisee.id** and add `franchisor.id` under **Domains → Satellites**. Two reasons this is not a preference:

1. **The shared database keys identity on the Clerk user id.** `functions/_clerk-auth.js` resolves users with `SELECT … FROM users WHERE clerk_user_id = ?` against the **shared** D1. A separate Clerk instance issues a different user id for the same human, so a brand claimed or a role granted on Franchisee.id would not be recognized on Franchisor.id. `_clerk-auth.js` does carry an email-match fallback that backfills `clerk_user_id` (lines ~264–273), which softens but does not remove the problem.
2. **The checklist says so explicitly.** §3 line 139: creating a separate Franchisor Clerk application "gives separate Clerk identities and therefore does not satisfy seamless shared network login without an explicit account-linking design."

Note also, from the same section: Clerk requires a **paid plan** for production satellite domains. If the current plan cannot do it, that is a real decision (upgrade, or accept separate identities plus account-linking work) — not something to route around silently.

Still outstanding on this axis: `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (from the shared instance and the satellite domain), and `CLERK_WEBHOOK_SIGNING_SECRET` for the new `/clerk-webhook` endpoint.

### `schema:check` still SKIPs inside the Pages build

The build log shows `SKIP dashboard SQL check: shared migrations not found at ../Franchisee.id/migrations (a skip is not a pass)`. Moving the deploy path to Node 22 removed the *runtime* reason it skipped, but a second reason remains: the sibling `Franchisee.id` repository is not present in the Pages build sandbox, so the 39 shared migrations cannot be loaded there. The gate therefore runs for real only where the sibling checkout exists — locally or in CI with both repos. Do not read a green Pages build as proof that the dashboard SQL was validated.
