# Shared data contract

> Current membership and journey contracts: [rollout plan](../product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md) and [user journeys](../product/FRANCHISOR_USER_JOURNEYS.md). This file's July baseline must be reconciled with the current Franchisee migration head before Franchisor writes are enabled.

## Ownership and membership additions — 2026-09-25

- One Premium Network subscription belongs to one canonical `franchise_id`; an account with two brands needs two entitlements unless an explicit discount changes order pricing. Reuse the shared order/subscription lifecycle; never create a Franchisor-only membership silo.
- Existing-brand claim submit creates a pending claim and does not set `owner_user_id`, expose owner leads, or alter public content. New-brand submit creates a private ownerless `pending_review` application. Admin approval requires independent evidence; rejection and stale decisions cannot publish or claim a brand.
- A published owner's public contact, listing, and media changes enter a review proposal. The previous public value remains until admin approval and successful site rebuild. Franchisee migrations `0035`–`0039` own the deployed guard chain; Franchisor's older submit/profile handlers require parity.
- Payment approval, entitlement, publication row, rebuild queue, completed deploy, and verified public URL are separate states. Model each in owner and admin views. A subscription cannot prove a page is live.
- One canonical brand can have site-specific content and SEO intent. Every public read remains scoped to that site's explicit `published` projection; no mass copy of Franchisee publication rows is allowed.
- **Brand-page URL family (2026-09-25):** franchisor.id uses `https://franchisor.id/usaha/{slug}` for legacy and new brands; the other three network sites keep `/peluang-usaha/{slug}/`. See §Canonical URLs and SEO.

Additional write rules added 2026-09-26 (`02f486d` here, `0498f62` in the owner repository):

- **Account identity and public brand contact are separate writes.** Saving an account name/e-mail updates `users` and `franchisee_profiles` immediately, but for a **published** brand the linked `franchisor_profiles.pic_name`/`email_contact` change becomes an owner review proposal; the live page keeps its values until an admin approves. An unpublished profile may still be written directly. Do not reintroduce a direct brand-contact write on the account path.
- **Both review queues are admin-only.** `getPendingClaims` and `getPendingBrandSubmissions` are gated by `isAdmin(auth)` in `dashboard-data.js`, because both carry applicant NIB, HAKI, and contact fields while claim and brand decisions are admin-only. A staff-facing aggregate must be a separate minimal query.
- **Submission batches must be all-or-nothing on availability.** The claim path's `franchisor_profiles` insert shares the claimability predicate (`owner_user_id IS NULL AND status = 'unclaimed' AND source_sheet = 'UNCLAIMED'`) with the claim insert, so an unavailable claim commits no orphan profile. Fix forward, never with a post-commit cleanup delete.

Last updated: 2026-07-22

This document is the minimum contract Franchisor.id must obey when reading or writing Franchise Network data. It summarizes the deployed design; the authoritative migration SQL currently lives in `../Franchisee.id/migrations/`.

## Site identity

```ts
export const SITE_ID = "site_franchisor_id";
export const SITE_DOMAIN = "franchisor.id";
export const SITE_ROLE = "franchisor";
```

These literals are centralized in the implemented site configuration. Do not reintroduce scattered or conflicting copies.

## Core entity relationship

```text
network_sites (1) ----< franchise_site_publications >---- (1) franchises
                              site-scoped projection             |
                                                               +---- franchisor_profiles
                                                               +---- franchise_packages
                                                               +---- franchise_assets
                                                               +---- franchise_locations
                                                               +---- leads
```

The publication table has unique constraints for `(franchise_id, site_id)` and `(site_id, slug)`. Therefore one canonical brand has at most one publication per site, and a slug cannot identify two brands on the same site.

## Required public-read rules

- Bind queries to `site_franchisor_id`; never accept an arbitrary public `site_id` parameter for this site's normal pages.
- Require `publication_status = 'published'`.
- Exclude canonical states that are archived or suspended.
- Use the publication slug and canonical URL for Franchisor URLs.
- Treat missing optional fields as absent data, not as zero or fabricated claims.
- Validate database rows before rendering.
- Escape untrusted rich text or pass it through an approved sanitizer.
- Avoid exposing private contact data unless the field is explicitly public.

## Required write rules

- Authenticate the caller and authorize the action in D1.
- Validate request payloads with Zod-compatible schemas.
- Normalize phone numbers, URLs, country codes, money, percentages, and ranges consistently with the shared field dictionary.
- Prefer parameterized D1 statements and grouped/batched writes where atomic consistency is needed.
- Use `source_site_id = 'site_franchisor_id'` for records created from this site where the schema supports attribution.
- Never insert a new canonical franchise until existing brands have been checked by stable ID, normalized name, source identifiers, and relevant contact/company evidence.
- Append `audit_events` for material changes.
- Enqueue rebuilds for all site projections affected by the change: any update to canonical brand data (`franchises`) or company profile data (`franchisor_profiles`) must query `franchise_site_publications` for all `published` sites and fan out rebuild requests to each of them (see [Cross-Site Brand Sync Design](../architecture/CROSS_SITE_BRAND_SYNC_DESIGN.md)).
- Return actionable errors without database internals or credentials.

## Publication state

At minimum, site code must preserve these publication concepts:

- `franchise_id`
- `site_id`
- `slug`
- `canonical_url`
- `publication_status`
- `is_primary`
- first-published and update timestamps

Publication eligibility, publication status, and deploy completion are different states:

```text
subscription/entitlement eligible
              |
              v
publication row created or updated
              |
              v
publication_status = published
              |
              v
site rebuild queued -> built -> deployed
```

UI and APIs should not describe a page as live until the site publication and deployment state support that claim.

## Canonical URLs and SEO

**Decision 2026-09-25 — franchisor.id has its own brand-page family.** Franchisor.id keeps `https://franchisor.id/usaha/{slug}` for legacy and new brand details; its directory remains `/peluang-usaha/`, including category, city, and capital discovery. `/usaha/` is not the directory. Franchisee.id uses `/peluang-usaha/` for both its directory and `/peluang-usaha/{slug}` brand details. Franchise.id and Waralaba.id retain their documented `/peluang-usaha/{slug}/` detail family. Each site has one canonical detail URL per brand.

Verified against production on 2026-09-25: `/usaha/{slug}` and `/usaha/{slug}/` return the real brand page, while `/peluang-usaha/{slug}` returns the domain's **soft-404 catch-all** (HTTP 200 with the directory home page). Because that catch-all answers every unknown URL with 200, route status alone can never prove a brand page exists.

The Franchisee Premium helper used to format every site as:

```text
https://franchisor.id/peluang-usaha/{slug}/
```

Both copies now map `site_franchisor_id` to `https://franchisor.id/usaha/{slug}`: this repository's `functions/_premium.js`, and `../Franchisee.id/functions/_premium.js` as of 2026-09-26 (`87a4d73`). That cross-repo change matters because Premium activation writes `franchise_site_publications.canonical_url` for all four sites from whichever dashboard runs the approval. It is guarded on both sides — `premium:lifecycle:check` in the owner repository and `ownership:check` here — so the two copies cannot drift apart silently.

The generated detail route moved to `src/pages/usaha/[slug].astro` in `27a783c`; `src/pages/peluang-usaha/index.astro` remains the directory. Still open: a repeatable published/unpublished and existing-slug build check; deployed route precedence; retirement of the 34 legacy `/usaha/*` pages only after replacement pages exist; one authoritative sitemap; the soft-404; and `/usaha/pisang-molen-m-a` → `/usaha/pisang-molen-ma`. The deprecated `/peluang-usaha/{slug}` detail page is currently a `noindex` meta refresh, not an HTTP 301. Track D.2–D.3 in `../product/NETWORK_MEMBERSHIP_PROGRESS.md` and follow the [Astro/Cloudflare handoff](../operations/ASTRO_CLOUDFLARE_BRAND_PUBLISH_PLAN.md).

Cross-domain pages should have distinct audience value. `is_primary` and `canonical_url` must be used intentionally; do not automatically point every page at Franchisee.id or self-canonicalize duplicates without an SEO decision.

## Identity and roles

Expected network roles include:

- `franchisee`
- `franchisor`
- `admin`
- `staff`

Roles may be network- or site-scoped. D1 is authoritative. A valid Clerk session alone does not grant an administrative or brand-owner action.

Resource authorization should check both role and ownership/assignment. For example, a `franchisor` may edit a franchise only when its profile or an approved claim connects that user to the franchise.

### One D1 user, many Clerk identities — 2026-09-27

Each network site has its own Clerk application, so one person holds a different Clerk user id on each site.
`user_identities` is what makes them one person in D1. Rules that follow from that, each with its reason:

- **`users.clerk_user_id` is the home identity and is never overwritten.** It records the first identity ever
  linked. Rewriting it on a verified-email match made the column flip-flop between two applications, and
  `getD1UserByClerkId` then missed whichever identity was not currently stored.
- **Identity resolution never writes `status`.** A suspended or deleted account stays that way whichever site it
  signs in through. Access is an administrator's decision, not a side effect of a successful login.
- **A second identity is linked by the incoming Clerk user's verified email**, and the link is recorded
  (`link_basis`, `email_at_link`, `verified_email`, `app_key`). A link onto a row holding `admin` or `staff`
  raises `user_identities.link_privileged` so it is visible even though it is not blocked.
- **A conflicting identity fails closed.** If more than one user row matches the verified email, nothing is
  linked: a separate account is created and `user_identities.link_ambiguous` is logged, because with two people
  on one address the linker cannot tell them apart and the wrong choice hands over their brand and roles.
  `idx_users_primary_email_unique` (migration 0044) prevents the state arising in the first place.
- **Deleting one Clerk account revokes that identity only**; the shared user is retired solely when no
  un-revoked identity remains, so one site's deletion does not delete the person for the other site.
- **Status and membership are append-only timelines** (`user_status_events`, `user_membership_events`).
  Current value = the greatest `effective_at`, tie-broken by `recorded_at`. Timestamps carry milliseconds,
  because `CURRENT_TIMESTAMP` is second-granular and two events in one second would order arbitrarily.
- **A premium user is downgraded, never deleted.** History is what lets any site state what a member's status
  was at a point in time.
- **Erasure is `user_blocks`, not a row delete.** A hard delete of a `users` row is refused by
  `franchise_submission_reviews.applicant_user_id` (NOT NULL, no ON DELETE) and would cascade destructively
  elsewhere, so erasure anonymises and leaves the block tombstone.

`pnpm run auth:status:check` and `pnpm run resolver:parity:check` enforce these in both repositories; the second
compares the two hand-maintained copies of `functions/_clerk-auth.js` and fails if they diverge.

## Premium Network contract

The currently named Premium sites are:

```ts
[
  "site_franchisee_id",
  "site_franchise_id",
  "site_franchisor_id",
  "site_waralaba_id",
]
```

Premium activation can create missing publication rows for those sites. It must not create duplicate canonical franchises. Cancellation or expiry must follow the documented lifecycle rules and retain auditability rather than deleting business history.

## Rebuild queue contract

Writers enqueue site-specific rebuild requests. A Franchisor publisher must:

- query only `site_id = 'site_franchisor_id'`;
- deduplicate equivalent pending requests;
- update the matching site publish state;
- mark success only after its deployment trigger or fallback completes;
- leave retryable failures visible for another attempt;
- never acknowledge Franchisee.id or another domain's requests.

## Schema change protocol

1. Inspect the current migration head and deployed D1 schema in Franchisee.id.
2. Write a forward-only migration in the owner repository.
3. Add validation/backfill and compatibility checks.
4. Apply and verify it through the established Cloudflare account context.
5. Update shared contracts and consumers in both repositories.
6. Roll out readers before writers when compatibility requires it.

Do not add a Franchisor-only table to the shared database without considering naming, ownership, access, retention, audit, and effects on every network consumer.
