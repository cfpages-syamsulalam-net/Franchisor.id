# Franchisor.id documentation

**Latest implementation review:** [2026-09-28 recent-code audit](operations/RECENT_CODE_AUDIT_2026-09-28.md). It covers account/brand removal, Premium expiry, and setup-document drift; its release checks supersede older “fixed” labels for those paths.

Current implementing-harness handoff: Franchisor's directory is `/peluang-usaha/` and brand details are `/usaha/{slug}`; Franchisee uses `/peluang-usaha/` for both its directory and detail family. Read the [Astro/Cloudflare brand publishing plan](operations/ASTRO_CLOUDFLARE_BRAND_PUBLISH_PLAN.md), [rollout code review](product/ROLLOUT_CODE_REVIEW_2026-09-26.md), and [progress tracker](product/NETWORK_MEMBERSHIP_PROGRESS.md) before Gate 2 or a published-brand pilot. The earlier review findings have code fixes, but their production acceptance gates remain open.

## Start here for current network work

Read [one membership, four sites](product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md) and [Franchisor user journeys](product/FRANCHISOR_USER_JOURNEYS.md) before the July port documents. They record the 2026-09-25 gap between the repository's adapted app and the live legacy domain, the current Franchisee ownership safeguards, the one-brand membership contract, and launch gates. Use [network context](architecture/FRANCHISE_NETWORK_CONTEXT.md), [shared data contract](data/SHARED_DATA_CONTRACT.md), and [deployment checklist](operations/MANUAL_SETUP_CHECKLIST.md) for their narrower responsibilities. Historical manifests and session notes are evidence of past work, not current production acceptance.

**Gate 0–1 execution record (2026-09-26):** [rollout progress tracker](product/NETWORK_MEMBERSHIP_PROGRESS.md), [parity matrix](product/FRANCHISOR_PARITY_MATRIX.md), [provider boundary record](operations/PROVIDER_BOUNDARY_RECORD.md), [legacy brand match](product/LEGACY_BRAND_MATCH.md). Read the tracker first; it is the canonical status surface and links every gate step to its evidence.

Editorial research, image plans, progress trackers, and `artikel/*.md` outlines remain separate, managed source/task packets. Their absence of a repeated membership summary does not make them current product authority; an agent reads `AGENTS.md` and this index first.

Start here after reading the root `AGENTS.md`.

## Current status

The D1/Clerk/Astro/Pages Functions runtime is implemented and locally verified. Custom domains and the Pages deployment are **live**: `franchisor.id` and `www` both resolve, with `www` 301-ing to the apex. Clerk is the one axis still mid-migration — `franchisor.id` currently runs as a **satellite of `franchisee.id`**, and step `0.12` replaces that with its own Clerk application, joined to the sibling by verified email through `user_identities`. `MANUAL_SETUP_CHECKLIST.md` §3 is authoritative and deliberately distinguishes the live runtime from the design of record. Live smoke-test status — including what has **not** been run — is recorded at the top of [the provider boundary record](operations/PROVIDER_BOUNDARY_RECORD.md).

## Core documents

- `../CODEBASE.md` — current repository inventory, target structure, stable identifiers, and reference paths.
- `../TOPICAL_AUTHORITY.md` — audited Franchisor/operator knowledge universe, existing-route decisions, evidence standards, and bounded first cluster.
- `../ARTICLE_CATALOG.md` — 114 distinct briefs with intent, scope boundaries, evidence formats, links, priority, and publication waves.
- `../GLOBAL_RESEARCH.md` — project-wide pre-writing evidence foundation with direct official sources, exact topic coverage, grounded facts, applicability limits, gates, and refresh triggers.
- `architecture/FRANCHISE_NETWORK_CONTEXT.md` — the complete cross-site architecture and product boundary distilled from Franchisee.id.
- `data/SHARED_DATA_CONTRACT.md` — required D1 read/write, publication, identity, and asset contracts.
- `architecture/FRANCHISOR_BUILD_PLAN.md` — phased implementation plan and acceptance criteria.
- `operations/MANUAL_SETUP_CHECKLIST.md` — exact Cloudflare, Clerk, GitHub, DNS, and optional-provider actions required before production launch.
- `PORT_MANIFEST.md` — file-level record of the application port and adaptations.
- `../SUGGESTION.md` — ideas that are useful but not part of the current committed scope.
- `../CHANGELOG.md` — repository documentation and code changes.
- `../.context/` — timestamped working-session handoffs.

Additional focused references:

- `forms/CLAIM_TRANSITION_MATRIX.md` and `forms/AUTO_SAVE.md` — current claim and browser-draft behavior.
- `architecture/OCR_PROVIDER_STRATEGY.md` and `architecture/R2_D1_MIGRATION_RUNBOOK.md` — OCR/R2 behavior and shared migration ownership.
- `data/FRANCHISE_FIELD_DICTIONARY.md` — review-facing field normalization contract.
- `../css/form-franchise/CSS_USAGE_MAP.md` — form stylesheet ownership.
- `../js/symbols_inventory.md` and `../js/technical_comparison.md` — current browser runtime and legacy-generator boundaries.

## Upstream context reviewed

This documentation was produced after reading all 185 tracked Markdown files in the sibling `../Franchisee.id` repository: 54 core documents and 131 timestamped session records. The most authoritative upstream sources were:

- `../Franchisee.id/AGENTS.md`
- `../Franchisee.id/CODEBASE.md`
- `../Franchisee.id/docs/architecture/TECH_STACK_DECISIONS.md`
- `../Franchisee.id/docs/architecture/D1_STATIC_PUBLISH_STRATEGY.md`
- `../Franchisee.id/docs/architecture/CLERK_SETUP.md`
- `../Franchisee.id/docs/architecture/PREMIUM_MONETIZATION_PLAN.md`
- `../Franchisee.id/docs/forms/FRANCHISOR_PROGRESSIVE_FORM_PLAN.md`
- `../Franchisee.id/docs/architecture/INTERNATIONAL_FRANCHISOR_POLICY.md`
- `../Franchisee.id/docs/data/FRANCHISE_FIELD_DICTIONARY.md`
- `../Franchisee.id/migrations/0001_initial_network_schema.sql`

The many upstream session files are useful historical evidence, but they are not copied here. This repository should maintain its own concise session history from this point forward.

## Current implementation note

The application runtime has now been ported and adapted. Franchisee.id remains a historical implementation reference and the current shared D1 migration owner; its visual identity is not the Franchisor design source. New application routes load `css/franchisor-theme.css`, which derives its palette, typography, and logos from the existing Franchisor.id export.

If an upstream document conflicts with this repository's documentation, verify the current code and migration state before changing anything. Record the resolution in both repositories when it affects the shared network contract.

## Freshness and authority

For current behavior, use this order: deployed schema/runtime code, repository code and package scripts, `CODEBASE.md` plus the focused contract document, then timestamped session records. `docs/PORT_MANIFEST.md` and `.context/` are historical evidence; they do not override later code or current-state documentation.
