# Cross-Site Brand Content Synchronization & Rebuild Fan-Out Design

> Canonical design reference for multi-site brand content synchronization across the Franchise Network (`Franchisor.id`, `Franchisee.id`, `Waralaba.id`, `Franchise.id`).

---

## 1. Executive Summary & Core Principle

In the Franchise Network, brand data is structured on a strict **Headless Multi-Site Projection** architecture:

$$\text{One Canonical Franchise} \longleftrightarrow \text{Many Controlled Site Projections}$$

* **Content is Single-Source-of-Truth**: All brand attributes, descriptions, investment tiers, fees, royalties, contacts, and legal entity details are stored **once** in the shared Cloudflare D1 database (`franchise_db`). They are never duplicated across sites.
* **Projections are Site-Scoped**: The `franchise_site_publications` table does not store brand copy. It stores routing, URL slugs, canonical SEO tags, and publication visibility states per domain.
* **Edits Apply Globally**: When an owner edits their brand or company profile, the update applies immediately to the canonical D1 row (`franchises` or `franchisor_profiles`).
* **Static Rebuilds Must Fan Out**: Because public pages are statically generated (SSG) for performance and SEO, any mutation to canonical brand data must enqueue a rebuild request in `site_rebuild_requests` for **every published site in the network** where that brand appears.

---

## 2. D1 Schema Architecture: Content vs Projection

```text
+-------------------------------------------------------------+
|                      CANONICAL ENTITY                       |
|                                                             |
|   franchises (core brand, descriptions, investment, status)  |
|   franchisor_profiles (company name, NIB, HAKI, WhatsApp)   |
|   franchise_packages (tiers, investment details)            |
|   franchise_locations (outlets, head office)                |
|   franchise_assets (logos, cover photos, documents)         |
+-------------------------------------------------------------+
                               |
                               | (1-to-many relationship)
                               v
+-------------------------------------------------------------+
|                   DISTRIBUTION PROJECTIONS                  |
|                 franchise_site_publications                 |
|                                                             |
|   - franchise_id                                            |
|   - site_id ('site_franchisor_id', 'site_franchisee_id')    |
|   - slug ('abo-meatshop')                                   |
|   - canonical_url ('https://franchisor.id/usaha/...')       |
|   - publication_status ('published', 'draft', 'hidden')     |
|   - is_primary (1 if primary SEO authority, 0 otherwise)    |
+-------------------------------------------------------------+
```

### Why Separate `site_franchisee_id` and `site_franchisor_id`?
Separating site identities in `franchise_site_publications` is intentional and necessary for four architectural reasons:

1. **Distinct Domain URL Routing**:
   * `Franchisee.id`: Brand detail routes live under `/peluang-usaha/{slug}`.
   * `Franchisor.id`: Brand detail routes live under `/usaha/{slug}` (flat canonical HTML without trailing slash), while `/peluang-usaha/` is reserved for the directory.
   * Each site projection records its exact site-specific slug and canonical URL.
2. **SEO Canonicalization**:
   * Syndicating the same brand across multiple network domains risks duplicate content penalties.
   * `franchise_site_publications` records `is_primary` and `canonical_url` so sister sites can emit appropriate `<link rel="canonical">` headers pointing back to the primary domain.
3. **Network Syndication & Entitlement Tiers**:
   * Free/unclaimed listings are published on their origin domain.
   * Paid Premium Network members receive syndication across multiple network domains (`site_franchisee_id`, `site_franchisor_id`, `site_waralaba_id`, `site_franchise_id`).
   * The publication table manages which domains the brand is legally entitled to be published on.
4. **Independent Lifecycle & Suppression**:
   * A brand can be temporarily hidden (`publication_status = 'hidden'`) on one domain for specific compliance reasons without deleting the brand or delisting it from the rest of the network.

---

## 3. Static Site Generation (SSG) & Rebuild Lifecycle

Both `Franchisee.id` and `Franchisor.id` are Astro static sites hosted on Cloudflare Pages:

1. **Build Time**: `scripts/build-d1-franchise-pages.ts` runs during `pnpm run build`. It queries D1:
   ```sql
   SELECT f.*, p.slug, p.canonical_url, fp.*
   FROM franchise_site_publications p
   JOIN franchises f ON f.id = p.franchise_id
   LEFT JOIN franchisor_profiles fp ON fp.id = f.franchisor_profile_id
   WHERE p.site_id = ? AND p.publication_status = 'published'
     AND f.status NOT IN ('archived', 'suspended')
   ```
   and emits pre-rendered static HTML files (`usaha/{slug}.html` on Franchisor, `peluang-usaha/{slug}/index.html` on Franchisee).
2. **Runtime Mutation in D1**: When an owner edit is approved, D1 updates `franchises` or `franchisor_profiles`. However, the live HTML served to users remains unchanged until a site build executes.
3. **Rebuild Queue Polling**: Periodic GitHub Actions workflows run `scripts/d1-static-publish-poller.mjs` every 30 minutes:
   * It inspects `site_rebuild_requests` filtered by `site_id`.
   * If pending rebuild requests exist for that `site_id`, it triggers that site's Cloudflare Pages Deploy Hook (`PAGES_DEPLOY_HOOK_FRANCHISOR_ID` or `PAGES_DEPLOY_HOOK_FRANCHISEE_ID`).
   * Once built, it marks the rebuild requests as `deployed`.

---

## 4. The Multi-Site Rebuild Fan-Out Contract

### The Rule
> **Whenever canonical brand data or franchisor company profile data changes in D1, the backend MUST enqueue a rebuild request in `site_rebuild_requests` for EVERY published site in `franchise_site_publications` for that brand, plus the host site.**

### Required Helper Implementation (`functions/_site-publish-queue.js`)

```javascript
/**
 * Resolves all site IDs where a brand is actively published, ensuring the home site is included.
 */
export async function getPublishedSiteIdsForFranchise(db, franchiseId, homeSiteId = null) {
  const siteIds = new Set();
  if (homeSiteId) siteIds.add(homeSiteId);
  if (!franchiseId) return Array.from(siteIds);
  try {
    const rows = await db
      .prepare(
        `SELECT DISTINCT site_id FROM franchise_site_publications
         WHERE franchise_id = ? AND publication_status = 'published'`
      )
      .bind(franchiseId)
      .all();
    for (const row of rows.results || []) {
      if (row.site_id) siteIds.add(row.site_id);
    }
  } catch (_error) {
    // Fallback gracefully to homeSiteId
  }
  return Array.from(siteIds);
}

/**
 * Resolves all site IDs where any brand belonging to a franchisor profile is actively published.
 */
export async function getPublishedSiteIdsForProfile(db, profileId, homeSiteId = null) {
  const siteIds = new Set();
  if (homeSiteId) siteIds.add(homeSiteId);
  if (!profileId) return Array.from(siteIds);
  try {
    const rows = await db
      .prepare(
        `SELECT DISTINCT p.site_id FROM franchises f
         JOIN franchise_site_publications p ON p.franchise_id = f.id
         WHERE f.franchisor_profile_id = ? AND p.publication_status = 'published'`
      )
      .bind(profileId)
      .all();
    for (const row of rows.results || []) {
      if (row.site_id) siteIds.add(row.site_id);
    }
  } catch (_error) {
    // Fallback gracefully to homeSiteId
  }
  return Array.from(siteIds);
}

/**
 * Creates rebuild statements across an array of site IDs.
 */
export function fanoutSiteRebuildStatements(db, siteIds, options) {
  const uniqueSiteIds = [...new Set((siteIds || []).filter(Boolean))];
  return uniqueSiteIds.flatMap((siteId) => siteRebuildStatements(db, { ...options, siteId }));
}
```

### Mutating Operations Matrix

| Write Path | File | Former Scope | Fixed Scope |
| :--- | :--- | :--- | :--- |
| **Review Edit Suggestion** (`handleReviewEditSuggestion`) | `functions/_dashboard-actions.js` | `SITE_ID` only | All published sites in `franchise_site_publications` + `SITE_ID` |
| **Auto-Approved Edit** (`handleSuggestEdit`) | `functions/_dashboard-actions.js` | `SITE_ID` only | All published sites in `franchise_site_publications` + `SITE_ID` |
| **Profile Review Approval** (`reviewedProfileStatements`) | `functions/_profile-owner-review.js` | `SITE_FRANCHISOR_ID` only | All published sites across all owned brands |
| **Claim Approval** (`handleReviewClaim`) | `functions/_dashboard-actions.js` | `SITE_ID` only | All published sites in `franchise_site_publications` + `SITE_ID` |
| **Direct Owner Update** (`updateOwnedListing`) | `functions/_profile-franchisor-actions.js` | `SITE_FRANCHISOR_ID` only | All published sites in `franchise_site_publications` + `SITE_FRANCHISOR_ID` |
| **Location Updates** (`handleUpdateListingLocations`, `updateListingLocations`) | `_dashboard-actions.js`, `_profile-franchisor-actions.js` | Host site only | All published sites in `franchise_site_publications` + host site |
| **Brand Removal** (`removeOwnedBrand`) | `_profile-franchisor-actions.js` | Multi-site | Already compliant (queries previous publications) |
| **Premium Activation** (`handleReviewPremiumPayment`) | `_dashboard-actions.js` | Multi-site | Already compliant (`PREMIUM_NETWORK_SITE_IDS.flatMap`) |

---

## 5. Verification & Testing Standards

To prevent regression:
1. `check-dashboard-sql.ts`: Must verify that `getPublishedSiteIdsForFranchise` resolves all published sites against the SQLite in-memory test database and that fanout emits distinct `site_rebuild_requests` for each site.
2. In-memory integration assertions: Proves that when brand $B$ has published rows on both `site_franchisee_id` and `site_franchisor_id`, approving an edit queues pending requests for both site IDs.
