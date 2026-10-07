# Franchisor.id user journeys and acceptance

Reviewed 2026-09-25. This document describes the target experience and the evidence required to launch it; the Franchisor production domain still served legacy HTML for the protected routes at review time. Follow [the rollout plan](NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md) in gate order. The shared account, one-brand Premium membership, canonical data, and per-site publication rules are defined in [network context](../architecture/FRANCHISE_NETWORK_CONTEXT.md).

## Personas and entry points

| Person | Job | Entry | Safe next step |
| --- | --- | --- | --- |
| Operator exploring membership | Understand cost, benefit, term, included sites, and what must be ready. | Franchisor homepage, `/premium/`, an operator article, or a brand page. | Compare free and Premium, inspect sample site-specific pages, then sign in or register. |
| New brand representative | Register a genuinely new brand without accidental duplicate or premature publication. | Register/login → `/daftar/` → `/profil/`. | Search existing brands before entering details; submit private application; follow review status. |
| Existing brand representative | Claim an unclaimed listing through independent ownership review. | Existing brand page → claim → login/register → `/daftar/`. | See the exact listing, submit evidence, await admin decision; public values and leads remain with current state. |
| Approved owner | Improve brand profile and manage leads, site reach, membership, and renewal. | `/profil/` and its brand-specific tabs. | Complete readiness items, submit public edits for review, choose one brand for a Premium order, then track each site's status. |
| Network buyer | Find and contact a relevant brand on a site intended for that audience. | Public directory/detail, primarily Franchisee.id. | Compare sourced facts, save or inquire; see whether brand information is owner-confirmed. |
| Staff/admin | Review ownership and public edits, decide payment, recover publication failures. | Protected `/dashboard/` on the designated operations site. | Verify independent evidence, record decision, follow rebuild/deploy, and resolve failed states. |

One human may be both buyer and brand owner. The visible role picker and Clerk profile are navigation aids; every protected action checks D1 role **and** resource ownership. Account creation is not brand verification. A paid order is not a public page.

## Main journey: from interest to live network exposure

| Step | Owner sees and does | System transition and proof | If it cannot continue |
| --- | --- | --- | --- |
| 1. Understand offer | Sees one brand/year term, current base price, four named sites, what is included, and that publication needs review and deployment. Chooses a brand or starts registration. | No order or subscription is created by viewing an offer. | Explain which prerequisite is missing; keep an obvious path back to the offer and selected brand. |
| 2. Identify self | Signs in or registers with email/Google; Franchisor origin returns to the intended task. | Clerk identity maps to one D1 user; any franchisor role is D1-authorized. | Cancelled callback, expired session, role mismatch, or account linking keeps the draft and offers login/retry. |
| 3. Identify brand | Searches by name; selects an owned brand, claims an unclaimed listing, or applies for a genuinely new brand. | Stable canonical `franchises.id`; no duplicate brand created on another site. | Exact/ambiguous match presents safe choices; a managed or pending listing cannot be silently recast as new. |
| 4. Prove authority | New or claim applicant submits company/contact/evidence details. | Claim stays `pending` and new brand stays private `pending_review`; owner, public page, and leads remain unchanged. Admin records independent verification before approval. | Applicant sees pending/rejected reason and a correction/contact path; duplicate or competing submissions do not create ownership. |
| 5. Prepare listing | Approved owner reviews canonical facts, package/fees, support, public contact, media/proposal, and site-specific presentation. | Owner changes affecting a published page enter a review proposal; public values change only after approval and rebuild. | Show exact missing fields and reviewer status; preserve draft on network/auth failure. |
| 6. Order membership | Selects the exact brand and confirms one annual membership. Sees generated unique-code amount and payment method. | One order belongs to one brand; pending payment is distinct from active subscription. | Duplicate click/retry returns the existing valid order; failed upload/confirmation retains the order and shows retry. |
| 7. Payment decision | Uploads proof or confirms transfer; checks progress. | Admin verifies payment and records approval/rejection; only approval activates term and eligible site projections. | Rejection explains how to correct proof or contact support without treating payment as settled. |
| 8. Publish per site | Sees each named domain, readiness, queue, deployment, public URL, and next action. | Explicit site publication row + successful site-specific build/deploy. Public Franchisor read is scoped to `site_franchisor_id` and `published`. | One failed site is retryable and does not falsely mark the other sites live. No URL is labeled live until it resolves correctly. |
| 9. Receive value | Works inquiries in owner lead inbox; views actual measured views, saves, contact clicks, inquiries, and response actions. | Buyer inquiry is stored once, scoped to the selected brand and approved owner; events retain source site. | No activity is reported as zero with context, never as guaranteed traffic or ROI; unauthorized accounts see no private leads. |
| 10. Renew or expire | Sees term end, reminders, renewal order, and any grace or downgrade state. | Subscription renewal or expiry follows one shared lifecycle and updates affected site projections and rebuild queues. | An unpaid renewal never silently extends benefits; historical orders and analytics remain auditable. |

## Alternate journeys that must work

### Existing owner with multiple brands

Show a brand switcher with ownership evidence and a separate membership state per brand. Creating an order for brand A cannot activate brand B. Existing active orders must be recognized across both domains. An admin-configured multi-brand discount changes the payable order, not the entitlement unit.

### Buyer becomes a franchisor, or owner becomes a buyer

Add the second public role to the same D1 user only through the authorized role flow. Keep saved opportunities and inquiries attached to the buyer identity while brand editing remains limited to approved owner resources. Avoid a second Clerk account caused by cross-domain login.

### Claim overlaps a pending new-brand application

Brand matching must show that the name is already under review without exposing applicant contacts. Admin resolves identity and ownership before creating a second canonical row or public URL. A rejected application may be resubmitted as a fresh application, but the rejected decision cannot later be approved.

### Membership paid before listing is ready

The owner sees **membership active; page needs work** and the exact missing review/content steps. The release must decide whether the paid term starts at approval or public readiness and explain that choice before payment. Do not show a paid-but-unpublished URL as live.

### Partial network deployment

Display each site separately. A successful Franchisee deploy cannot clear a failed Franchisor queue. Retry only the affected site's publisher, retain the same canonical brand and subscription, and record the deployed SHA or equivalent proof for each live page.

## Controlled acceptance matrix

Use disposable accounts, brands, and an explicitly approved test payment method. Record `pass`, `fail`, or `not run` with release SHA and date; local code checks do not replace signed-in production evidence. Status key: ⬜ not run · ✅ pass · ⚠️ fail.

Status recorded 2026-09-25: every row is ⬜ **not run**. The franchisor application is not deployed (see the [provider boundary record](../operations/PROVIDER_BOUNDARY_RECORD.md)), so no scenario below can be exercised with a signed-in session yet. The Gate 1 code paths are covered by the local `ownership:check` contract instead, which is not a substitute. Tracker: [rollout progress](NETWORK_MEMBERSHIP_PROGRESS.md).

| Scenario | Expected evidence | Status |
| --- | --- | --- |
| Anonymous offer and protected route | Offer is readable; protected data remains unavailable; login returns to selected brand/action. | ⬜ |
| Same human on both domains | One D1 user resolved across both Clerk applications via verified email in `user_identities`; same brand, roles and settings accessible on both domains without relying on shared cookies. | 🔄 Ready for live scenario verification |
| New brand with exact/ambiguous existing match | No second canonical row; clear claim/view/pending choice, no applicant contact leak. | ⬜ |
| New brand private review | No owner or public page before evidenced admin approval; rejection releases name for a fresh application. | ⬜ |
| Existing claim with two applicants | Neither can edit listing or see leads while pending; admin approval grants one owner only; stale second approval fails. | ⬜ |
| Owner public edit and media | Old public value remains until admin review and site rebuild; rejected change leaves page untouched. | ⬜ |
| Wrong role and wrong owner | Server returns 401/403 and no private brand, lead, payment proof, or other user's order. | ⬜ |
| Order retry, proof failure, admin rejection | One valid order; recoverable confirmation; no active subscription or live claim from rejected payment. | ⬜ |
| Approved membership | One brand gets one term; four intended site projections are distinct; each queue/build/deploy completes or shows its own failure. | ⬜ |
| Lead and analytics | Buyer inquiry reaches only approved owner, source site is attributable, event counts have clear date/source definitions. | ⬜ |
| Renewal and expiry | Reminder, renewal payment, grace/downgrade, site visibility, and owner/admin views agree; no duplicate email scheduler. | ⬜ |
| SEO and mobile | Franchisor pages serve operator intent, old `/usaha/*` routes resolve intentionally, canonical/sitemap agree, and all key controls remain usable on narrow screens. | ⬜ |

Never test with a real brand claim, real customer payment, or unredacted personal lead. A release is ready for paid onboarding only after the trust, identity, payment, and all advertised publication paths pass on the actual production configuration.
