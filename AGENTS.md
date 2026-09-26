# Franchisor.id repository instructions

## Current network context (2026-09-25)

Before planning or changing membership, identity, ownership, public listings, Premium, leads, publication, or dashboard behavior, read `docs/product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md`, `docs/product/FRANCHISOR_USER_JOURNEYS.md`, `docs/architecture/FRANCHISE_NETWORK_CONTEXT.md`, and `docs/data/SHARED_DATA_CONTRACT.md`. These documents distinguish the current Franchisor repository port, the shared Franchisee platform, and production behavior. The live Franchisor domain still served legacy HTML for protected routes at the 2026-09-25 review; reverify before claiming deployment. Franchisee's current pending claim, private new-brand, and owner-edit review contracts supersede this repository's older July handlers for target behavior. Do not enable Franchisor write routes until they are aligned and tested against the deployed shared D1 guards.

**Gate status:** Gates 0 and 1 are complete in code as of 2026-09-26 — read `docs/product/NETWORK_MEMBERSHIP_PROGRESS.md` for the live status of every gate step, and `docs/product/FRANCHISOR_PARITY_MATRIX.md` for the ownership/write-path parity evidence. Claims are pending-only, new brands are private `pending_review` until an admin decision, and published owner edits become review proposals; `pnpm run ownership:check` gates the build so those shapes cannot regress. Gate 2 is not started: the domain answers every unknown URL with HTTP 200 and the legacy directory page (a soft-404 catch-all), so route status alone never proves a page exists. Franchisor.id brand pages use their own canonical family, `https://franchisor.id/usaha/{slug}`, for legacy and new brands; the other network sites keep `/peluang-usaha/{slug}/`.

Do not delete the legacy `/usaha/*` files while `site_franchisor_id` has zero published rows: they are currently the only working brand pages on this domain.

**Deployment placement (2026-09-26).** The Franchisor Pages project must be created in the `franchise-network` Cloudflare account (`0ba63b7f0096bc267a93fe5c80b1f571`) — the one holding `franchise_db`, `franchise-assets` and `franchisee-id` — because Cloudflare bindings are account-scoped and the Functions need `env.franchise_db` at runtime. This repository was **transferred to the `cfpages-syamsulalam-net` organisation** on 2026-09-26 so the org name matches that account: Syamsul uses the `cfpages-*` organization name as his marker for which Cloudflare account hosts a project, since he hosts many. The marker is a convention, not a mechanism. Every `cfpages-*` organization belongs to Syamsul and is never a third party. The Pages project `franchisor-id` now exists and is deployed, and both custom domains are active with `www` 301-ing to the apex. See `docs/operations/PROVIDER_BOUNDARY_RECORD.md` §6 and `docs/architecture/INFRASTRUCTURE.md`.

**Infrastructure reference.** The verified inventory — Cloudflare account, zone and DNS, Pages build config, variables, bindings, custom domains, the www→apex redirect rule and its required token scope, deployment history, both Clerk applications, and the traps that have already caused incidents here — lives in `docs/architecture/INFRASTRUCTURE.md`. Read it before changing anything in Cloudflare, and read its "things that must not be done" section first.

**Identity changes are gated.** `functions/_clerk-auth.js` exists as two hand-maintained copies, one per site, and they have already drifted once in a way that let a suspended account reinstate itself here. `pnpm run auth:status:check` and `pnpm run resolver:parity:check` both run inside `build:astro`; the second compares the `upsertD1User` body and the exported surface of both copies. If you change the resolver, change both repositories in the same commit.

Managed `artikel/*.md` outlines, `ARTICLE-GUIDE.md`, `ARTICLE_PROGRESS.md`, `GLOBAL_RESEARCH.md`, and `IMAGE_CATALOG.md` are editorial evidence and task packets. Read the network context above for product state; preserve those editorial artifacts instead of copying product architecture into every article.

Read this file first, then `CODEBASE.md` and `docs/README.md` before making substantial changes.

## Product boundary

Franchisor.id is the franchisor/operator-facing member of the Franchise Network. It is a separate site, repository, deployment, domain, presentation layer, and SEO surface from Franchisee.id. It is not a separate business-data silo.

The sites share the Cloudflare D1 database `franchise_db`. A franchise brand is represented once in the canonical `franchises` table. Per-domain visibility, slug, canonical URL, primary-site status, and publication state belong in `franchise_site_publications`.

The invariant for this repository is:

```text
site_id = site_franchisor_id
domain  = franchisor.id
role    = franchisor
```

Public Franchisor pages must only render records whose Franchisor publication row is `published`. Never duplicate a `franchises` row merely to show it on this domain.

## Sources of truth

- Shared network context: `docs/architecture/FRANCHISE_NETWORK_CONTEXT.md`
- Franchisor delivery plan: `docs/architecture/FRANCHISOR_BUILD_PLAN.md`
- Shared data rules: `docs/data/SHARED_DATA_CONTRACT.md`
- Current repository map: `CODEBASE.md`
- Documentation index: `docs/README.md`
- Production deployment and launch gates: `docs/operations/MANUAL_SETUP_CHECKLIST.md`
- Historical implementation reference: sibling repository `../Franchisee.id`

The Franchisee.id repository currently owns the shared D1 migration history. Do not create an independent or conflicting D1 migration chain here. Until migration ownership is moved to a dedicated shared package or infrastructure repository, shared schema changes must be designed and applied through Franchisee.id, then documented here.

Do not blindly copy Franchisee-specific constants or UI. In particular, replace `site_franchisee_id`, `franchisee.id`, buyer-oriented copy, and Franchisee-specific routes with Franchisor equivalents where appropriate.

## Engineering conventions

- Use TypeScript for new application and build code.
- Validate trust boundaries with Zod: requests, environment values, database result shapes, and imported data.
- Use Astro 5.x with the Cloudflare adapter unless a later documented decision replaces it.
- Use `pnpm`; do not introduce npm or Yarn lockfiles.
- Keep code modular. If a file approaches 500 lines, split it by responsibility.
- Use actionable, user-facing error messages. Do not expose infrastructure jargon in public copy.
- Preserve submitted form data when validation, authentication, or network failures interrupt a flow.
- Do not start a development server unless the user asks for one.
- Do not commit secrets, cookies, tokens, local database exports, or credentials.

## Identity and authorization

Use the same Clerk tenant as the network when feasible so one person has one network identity. Configure each Franchisor origin, redirect URL, and webhook explicitly; do not assume browser cookies are shared between domains.

Clerk proves identity. D1 remains authoritative for roles and permissions. Every server-side protected action must re-check D1 authorization. Expected roles include `franchisee`, `franchisor`, `admin`, and `staff`.

## Data and publishing rules

- Shared D1 binding: `franchise_db`
- Shared D1 database ID: `812cd8ac-edd0-45d9-981f-c9a15358317b`
- Cloudflare account alias: `franchise-network`
- Franchisor network site ID: `site_franchisor_id`
- Shared R2 binding convention: `FRANCHISE_ASSETS`
- Shared R2 bucket: `franchise-assets`

For public reads, join `franchises` to `franchise_site_publications`, scope by `site_franchisor_id`, require `publication_status = 'published'`, and exclude archived or suspended canonical rows.

For Franchisor-origin writes, use `source_site_id = 'site_franchisor_id'` where that field exists, append an `audit_events` record, and enqueue rebuild requests for every affected site. A Premium Network entitlement may make a listing eligible for multiple sites, but each site still needs its own publication row and successful deployment.

## Working agreements

- Preserve existing legacy URLs until a redirect/canonical migration is documented and verified.
- Keep Cloudflare Pages production configuration in the dashboard. This repository deliberately omits `pages_build_output_dir`; the D1/R2 entries in `wrangler.toml` are for local tooling.
- Keep `pnpm run assets:check` at the end of the production build so broken or case-mismatched local asset routes fail before deployment.
- Treat the current WordPress-export HTML as legacy input, not as the future data model.
- Before modifying shared behavior, inspect the corresponding implementation and current docs in `../Franchisee.id`.
- Update `CODEBASE.md` when architecture or important paths change.
- Record every repository file creation, update, move, or deletion in `CHANGELOG.md`.
- Record important technical decisions in the relevant architecture document.
- End substantial sessions with a timestamped `.context/session-YYYYMMDD-HHmm.md` snapshot.
- Keep future ideas in `SUGGESTION.md`; do not silently expand the requested scope.
- Verify changes in proportion to risk and report any checks that could not be run.

<!-- BEGIN MANAGED ARTICLE WORKFLOW -->
## Repository-local article workflow

- Article work is local to this repository. Do not inspect, edit, or borrow content from another project.
- Before editing anything under `artikel/`, read `ARTICLE-GUIDE.md` completely and then open only the one article file explicitly assigned by the user.
- Treat the assigned `artikel/[slug].md` file as the complete task packet. Preserve its article ID, slug, parent topic, publication date, `editorial_backfill` basis, intent, scope boundary, evidence gates, and final route.
- Preserve the assigned root-domain reader community and opening salutation. Use `Sobat`, `Kawan`, or `Teman [root domain]` naturally at a few warranted conversational pivots, not in every paragraph.
- Expand the existing outline in place. Do not create a second draft, change another article, regenerate the catalog, or perform portfolio-wide work.
- Cite original source links embedded in the assigned outline. Never cite `GLOBAL_RESEARCH.md`, `ARTICLE-GUIDE.md`, or another article as evidence.
- Do not invent facts, numbers, standards clauses, prices, project experience, quotations, test results, product performance, legal duties, or Syamsul's personal experience.
- Use only internal routes listed in the assigned outline unless a route is verified from this repository. A planned sibling article is not live until its status says so.
- Do not hydrate HTML, deploy, edit sitemaps, submit to GSC, or push Git unless the user explicitly asks for that later stage.
- If the assigned file contains an unresolved consequential evidence gate, write within the safe boundary or leave a visible `[NEEDS ...]` marker for review; never fill the gap by guessing.
<!-- END MANAGED ARTICLE WORKFLOW -->

<!-- BEGIN MANAGED ARTICLE IMAGE WORKFLOW -->
## Repository-local article image workflow

- `IMAGE_CATALOG.md` is the coordinator inventory; the exact assignment for a writer is copied into the assigned `artikel/[slug].md`.
- Do not make the lower-capability writer load the full image catalog. Its assigned outline is the compact authoritative packet.
- Use only the exact local relative URL or approved external hotlink embedded in the assigned image plan. Do not browse for, download, generate, or substitute another image.
- Never use a logo, favicon, header/hero/banner, icon, tracking asset, plugin/theme asset, WordPress thumbnail derivative, or ambiguous filename as article media.
- Image selection in this stage is based on repository path, filename, and source metadata only. Do not invent visible details, people, brands, conditions, project location, or performance from an image.
- Keep the specified placement, alt-text brief, caption, source link, creator, license, and attribution. External images without complete provenance must not be published.
- Do not describe a repository asset or stock image as Syamsul's project, client, installation, result, or case study.
- If an assigned URL is unavailable or its license metadata changes, leave `[NEEDS IMAGE REVIEW]` and continue the prose within scope; do not guess a replacement.
<!-- END MANAGED ARTICLE IMAGE WORKFLOW -->

<!-- BEGIN ARTICLE PROGRESS REVIEW RULE -->
## Article progress and non-destructive review

- Read `ARTICLE_PROGRESS.md` before drafting, reviewing, correcting, or accepting any article.
- Reviewers do not delete, rename, or rewrite article prose merely because an article fails review. They update only the matching tracker row to `⚠️ Needs correction`, add a concise actionable note, and record the review date unless a separate explicit correction assignment authorizes prose changes.
- A later article corrector retains the article and its history, uses the recorded note, marks `🛠️ Correction in progress`, then `🟡 Corrected; re-review needed`. Only a fresh independent reviewer may return the row to `✅ Accepted and pushed`.
- Never erase useful earlier notes. Tracker edits must preserve article IDs, titles, and paths from `ARTICLE_CATALOG.md`.
- Tracker status does not by itself prove publication or acceptance; receipts, Git history, remote parity, and the portfolio ledger remain authoritative.
<!-- END ARTICLE PROGRESS REVIEW RULE -->
