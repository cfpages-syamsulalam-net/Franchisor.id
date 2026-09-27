# Franchisor.id codebase

**Current URL and build review, 2026-09-26:** Franchisor.id uses `/peluang-usaha/` for the directory and category/city/capital discovery, and `/usaha/{slug}` for each brand detail and its no-trailing-slash canonical. Franchisee.id uses `/peluang-usaha/` for its directory and `/peluang-usaha/{slug}` for its brand detail. [Rollout review R1–R4](docs/product/ROLLOUT_CODE_REVIEW_2026-09-26.md) found an earlier mismatch; `27a783c` aligned the generated detail route, metadata/links, CSV import, and optional bridge. A disposable published-row build proved one new `/usaha/{slug}` route locally. A repeatable fixture, existing-slug precedence, real redirects, and deployed Pages responses remain open. Keep the 34 legacy `/usaha/*` pages until generated replacements are verified. The [Astro and Cloudflare handoff](docs/operations/ASTRO_CLOUDFLARE_BRAND_PUBLISH_PLAN.md) names the remaining steps.

## Current network boundary — 2026-09-25

The repository contains a July adaptation of Franchisee's Astro/Pages app, while the live Franchisor domain still served legacy HTML at `/auth-config`, `/profil/`, `/dashboard/`, and `/premium/` in an anonymous 2026-09-25 check. The app's presence in Git is not live acceptance. The July claim handler used to assign ownership during submit; Gate 1 replaced it with the current pending claim, private new-brand review, and owner-edit review contract guarded by shared D1 migrations `0035`–`0039`. Start with [the membership rollout plan](docs/product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md) and [user journeys](docs/product/FRANCHISOR_USER_JOURNEYS.md); verify current deployed behavior before advertising paid network exposure.

**2026-09-26 update:** Gates 0 and 1 of that plan are complete in code. The July handlers have been replaced by the current pending-claim, private `pending_review` new-brand, and owner-edit review-proposal contracts, guarded by `pnpm run ownership:check` in the build chain. Gate 2 (live deployment) is not started — the domain is a soft-404 catch-all that answers every unknown URL with HTTP 200 and the legacy directory page. Read [the progress tracker](docs/product/NETWORK_MEMBERSHIP_PROGRESS.md), [the parity matrix](docs/product/FRANCHISOR_PARITY_MATRIX.md), [the provider boundary record](docs/operations/PROVIDER_BOUNDARY_RECORD.md), and [the legacy brand match](docs/product/LEGACY_BRAND_MATCH.md). Brand pages use `https://franchisor.id/usaha/{slug}`.

Last reviewed: 2026-09-26. The implementation inventory below includes 2026-07-23 baseline facts; use the rollout tracker for current gate status.

## Current state

This repository is now a hybrid Franchisor application: the existing WordPress/Elementor static export remains the public legacy layer, while Astro, Cloudflare Pages Functions, D1 snapshot generation, shared authentication, operator profile/dashboard, Premium, proposal, OCR, and publishing modules have been adapted from the mature Franchisee.id implementation.

Implemented on 2026-07-22:

- 89 HTML files.
- 38 top-level route directories with HTML content.
- 34 legacy brand detail pages under `usaha/`.
- WordPress assets under `wp-content/` and `wp-includes/`.
- Legacy public routes including `peluang-usaha/`, `direktori-franchise/`, `pendaftaran/`, `daftar-outlet/`, `login/`, categories, articles, and brand pages.
- `package.json`, pnpm lockfile, Astro 5, TypeScript, Cloudflare adapter, and Wrangler configuration.
- `src/` routes and components for the generated directory/detail pages and authenticated operator surfaces.
- Cloudflare Pages Functions under `functions/`, scoped to `site_franchisor_id` where site ownership matters.
- D1 snapshot generation plus a non-overwriting legacy copy step that produces `dist/`.
- Shared D1 and R2 bindings; this repository intentionally has no independent `migrations/` directory.
- Franchisor-specific application theming in `css/franchisor-theme.css` using the existing site's red/ink palette, DM Sans/Lexend typography, and existing logo files.
- Explicit runtime Clerk configuration with optional shared-tenant satellite support and no embedded key fallback.
- GitHub workflows for Franchisor-scoped static publication and manual-only Premium email dispatch.
- Deployment and provider setup instructions in `docs/operations/MANUAL_SETUP_CHECKLIST.md`.
- A production asset crawler that validates every deployed HTML file and reachable CSS dependency.
- `TOPICAL_AUTHORITY.md` and `ARTICLE_CATALOG.md`, which plan 19 operator-facing topics and 114 distinct article briefs without changing application routes or publishing content.
- `GLOBAL_RESEARCH.md`, which maps 20 direct-source franchise-network evidence records and 12 explicit gates across all 19 topics without authorizing outlines, drafts, publication, advice, or commercial claims.

The existing home page still describes Franchisor.id as a directory of franchise and business opportunities. New application surfaces are operator/franchisor-facing while retaining public discovery. The shared database had zero published `site_franchisor_id` rows when verified again on 2026-07-23, so that build's generated directory was correctly empty. Re-query D1 before relying on this count later.

## Target architecture

```text
                         shared identity tenant
                                 |
                         D1 authorization/roles
                                 |
Franchisee.id  -----+            v             +-----  Franchisor.id
(buyer-facing)      +----  franchise_db  -------+      (operator-facing)
                    |       canonical data       |
other sites  -------+   per-site publications ---+------ future network sites
                                  |
                           franchise-assets R2
```

Each site owns its routes, visual design, SEO intent, build, deploy, and per-site publication records. The network owns canonical franchise data, identities, roles, entitlements, audit history, and shared assets.

## Stable identifiers

| Purpose | Value |
| --- | --- |
| Franchisor site ID | `site_franchisor_id` |
| Franchisor domain | `franchisor.id` |
| Network role label | `franchisor` |
| D1 binding | `franchise_db` |
| D1 database ID | `812cd8ac-edd0-45d9-981f-c9a15358317b` |
| Cloudflare account alias | `franchise-network` |
| Cloudflare account ID | `0ba63b7f0096bc267a93fe5c80b1f571` |
| R2 binding convention | `FRANCHISE_ASSETS` |
| R2 bucket | `franchise-assets` |

## Shared identity across two Clerk applications — 2026-09-27

Each network site has its **own Clerk application**, so the same person receives a different Clerk user id on
each site, while brand ownership, roles and premium orders all key on the shared `users.id`. Clerk's own answer
to that is satellite domains, which require a paid plan for production; D1 owns the link instead, which matches
this network's existing rule that D1 is authoritative and a valid Clerk session alone grants nothing.

The design, with the reason each part exists — most of these were defects found by testing, not preferences:

| Decision | Reason |
| --- | --- |
| `user_identities` holds one row per linked Clerk identity, and `users.clerk_user_id` is the **home identity that is never overwritten** | An earlier resolver rewrote `clerk_user_id` on a verified-email match, so with two applications the column flip-flopped between them and `getD1UserByClerkId` missed half the time |
| Linking is matched on the incoming Clerk user's **verified email** | It is the only identifier the two applications share, and `email_role_grants` already worked this way |
| Identity resolution **never writes `status`** | A previous revision forced `status = 'active'`, so a suspended or deleted account reinstated itself — roles and email role grants included — simply by signing in |
| An email matching more than one user **refuses to link**, logs `user_identities.link_ambiguous`, and creates a separate account | With two people on one address the linker cannot tell them apart, and the wrong choice hands over that person's brand, roles and premium. `idx_users_primary_email_unique` (0044) now prevents the state arising; the refusal is the fail-closed backstop the shared data contract requires |
| `markD1UserDeleted` revokes the **identity**, retiring the user only when no un-revoked identity remains | Deleting the account in one Clerk application must not delete the person for the other site |
| `getD1UserByClerkId`'s legacy fallback applies only to users with **no identity rows at all** | The plain fallback matched `users.clerk_user_id` — the home identity — so a revoked identity still resolved through it and quietly re-admitted the access revocation was meant to cut off |
| Status and membership are **append-only timelines**; the newest `effective_at` wins, tie-broken by `recorded_at` | Nothing recorded when or why a status changed. Timestamps are written at millisecond precision because `CURRENT_TIMESTAMP` is second-granular, so two events in the same second ordered arbitrarily and "newest wins" was not deterministic |
| A premium user is **downgraded, never deleted** | Status is a timeline, so history survives and any site can read what the member's status was at a point in time |

Functions in `functions/_clerk-auth.js`: `upsertD1User` (resolve by identity → link by verified email → create),
`linkIdentity`, `revokeIdentity`, `listUserIdentities`, `recordUserStatusEvent`, `getCurrentUserStatus`,
`recordMembershipEvent`, `getCurrentMembership`, `assertActiveD1User`. Migrations 0040–0044 own the schema.
Gates: `pnpm run auth:status:check` and `pnpm run resolver:parity:check`, both inside `build:astro`.

**This file exists as two hand-maintained copies, one per site, and they have already drifted once in a way that
let a suspended account reinstate itself here.** Change both repositories in the same commit: the parity check
compares the `upsertD1User` body and the exported surface, and fails if they diverge.

## Application structure

The repository now has this hybrid shape:

```text
Franchisor.id/
├── AGENTS.md
├── TOPICAL_AUTHORITY.md
├── ARTICLE_CATALOG.md
├── GLOBAL_RESEARCH.md
├── CODEBASE.md
├── CHANGELOG.md
├── package.json
├── astro.config.mjs
├── wrangler.toml
├── src/
│   ├── components/
│   ├── lib/
│   ├── pages/
│   └── shared/
├── functions/             # Cloudflare Pages Functions
├── scripts/
├── css/franchisor-theme.css
├── docs/
│   ├── architecture/
│   └── data/
├── .context/
├── usaha/                 # legacy brand URLs during transition
├── wp-content/            # legacy assets during transition
└── dist/                  # generated; do not hand-edit or commit unless policy changes
```

The Astro build uses this bridge approach now: it builds D1-backed pages, then copies legacy static content into `dist` without overwriting routes owned by Astro. `dist/` and generated snapshots are build artifacts and must not be hand-edited.

## Reference implementation in Franchisee.id

The sibling `../Franchisee.id` repository is mature and contains useful patterns, but many constants and flows are site-specific.

High-value references:

- `wrangler.toml`: shared D1 and R2 bindings.
- `astro.config.mjs`: static Astro build baseline.
- `scripts/build-d1-franchise-pages.ts`: D1 snapshot and static page generation.
- `scripts/copy-legacy-static.mjs`: legacy-to-Astro bridge.
- `scripts/d1-static-publish-poller.mjs`: site-scoped rebuild queue processing.
- `functions/_premium.js`: Premium Network site identifiers and canonical URL rules.
- `functions/_site-publish-queue.js`: rebuild queue writes.
- `functions/_clerk-auth.js`: Clerk identity plus D1 authorization pattern.
- `src/lib/shared-schemas.ts` and `functions/_shared-schemas.js`: shared validation concepts.
- `.github/workflows/d1-static-publish.yaml`: scheduled publication/deploy pattern.
- `migrations/`: authoritative shared D1 history for now.

The runtime was copied as an implementation baseline and then adapted. Shared network constants intentionally still contain all four network sites and `assets.franchisee.id` remains the current shared R2 hostname. Franchisor-owned code uses `site_franchisor_id`, `franchisor.id`, operator-facing copy, and the Franchisor visual layer. Future changes must preserve that separation.

## Build and verification

- Install: `pnpm install --frozen-lockfile`
- Static/type diagnostics: `pnpm run astro:check`
- Production build: `pnpm run build`
- Asset routing: the production build finishes with `scripts/check-built-assets.mjs`, which rejects missing/case-mismatched local dependencies before `dist` can be deployed.
- Feature checks are exposed as the `*:check` scripts in `package.json`.
- Last verified on 2026-07-23: Astro check returned 0 errors and 5 non-blocking hints; the build generated 12 Astro pages, fetched zero published Franchisor rows, and validated 4,887 deployed files. The 15 feature-contract checks last passed on 2026-07-22.
- Do not start the development server unless the user explicitly asks.

The build requires Cloudflare credentials to fetch the remote D1 snapshot. Production bindings and secrets are documented in `docs/operations/MANUAL_SETUP_CHECKLIST.md`.

## Known migration risks

- Existing legacy `/usaha/*` pages may collide with generated `/usaha/{slug}` output for the same slug; prove Astro output wins in `dist` and on Pages before retiring a legacy page.
- Old sitemap and canonical entries must not advertise both old and new URLs as primary.
- Functional `/login/`, `/daftar/`, `/profil/`, `/dashboard/`, and related application routes exist in code, but production auth/write behavior remains unverified until Cloudflare and Clerk are configured.
- Re-importing the 34 legacy brand pages as new brands could duplicate canonical D1 records.
- Copying Franchisee migrations into this repo would create split-brain schema ownership.
- Shared identity does not mean cross-domain cookies; each origin needs explicit Clerk configuration.
- A Premium Network subscription does not make a page live by itself; a published per-site row and successful Franchisor build are both required.

See `docs/architecture/FRANCHISOR_BUILD_PLAN.md` for the implementation sequence.

<!-- BEGIN MANAGED LOCAL ARTICLE HANDOFF MAP -->
## Repository-local article writing handoff

- `ARTICLE_CATALOG.md` appoints historical CMS publication dates for 114 planned articles.
- `artikel/` contains 114 constrained Markdown writing packets; these are outlines, not published pages.
- `ARTICLE-GUIDE.md` and the managed block in `AGENTS.md` instruct one-file-at-a-time expansion.
- The eventual public route contract is `/artikel/[slug].html`; no HTML, sitemap, deployment, or D1 publication state is changed by this handoff.
<!-- END MANAGED LOCAL ARTICLE HANDOFF MAP -->
