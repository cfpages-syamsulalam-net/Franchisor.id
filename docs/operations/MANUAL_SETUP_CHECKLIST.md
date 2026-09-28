# Franchisor.id deployment and integration checklist

Use the [Astro/Cloudflare brand publishing plan](ASTRO_CLOUDFLARE_BRAND_PUBLISH_PLAN.md) with this provider checklist. The directory must resolve at `/peluang-usaha/` and individual brand pages at `/usaha/{slug}`; verify both the Franchisor theme and local CSS/assets on the deployed SHA before changing the production domain.

> This checklist records the July launch procedure. On 2026-09-25 an anonymous request to the production `/auth-config` returned legacy HTML, and protected routes returned legacy pages. Current provider settings and deployments must be re-audited; do not assume every step below is still undone or that a 200 response proves the adapted app is live. Follow [the membership rollout gates](../product/NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md) and [the controlled journeys](../product/FRANCHISOR_USER_JOURNEYS.md) before charging or onboarding a brand.

Last updated: 2026-07-22

The code is built and locally verified. The steps below require access to Cloudflare, Clerk, GitHub, and any optional providers, so they must be completed manually before the production application features can work.

Verification baseline from 2026-07-22: Astro check had 0 errors and 5 non-blocking hints, all 15 feature-contract checks passed, Astro generated 12 pages, and `assets:check` validated 4,887 deployed files. Re-run the build for the commit being deployed; these counts are evidence for that snapshot, not a substitute for the deployment log.

Never paste secret keys into this repository, Markdown, a public issue, or a client-side variable. Use encrypted Cloudflare or GitHub secrets.

## 1. Deploy Astro through the Cloudflare web UI (no terminal deployment)

Before starting, review, commit, and push this work to `cfpages-syamsulalam-net/Franchisor.id` on the GitHub `main` branch. Deployment itself is performed entirely in the Cloudflare dashboard:

1. Sign in to the Cloudflare dashboard and select the account that owns `franchisor.id` and the shared D1/R2 resources.
2. Open **Workers & Pages**.
3. Select **Create application**.
4. Select the **Pages** tab.
5. Select **Import an existing Git repository** (the current UI may label this **Connect to Git**).
6. Select **GitHub**. The repository now lives in the `cfpages-syamsulalam-net` organization, whose GitHub organization name is Syamsul's marker for the Cloudflare account that hosts it (`me@syamsulalam.net`, the `franchise-network` account) — that is why the repository was transferred there on 2026-09-26. The **cloudflare-workers-and-pages** GitHub App is already installed on that organization with access to **all** repositories, so no additional grant is required. If the repository does not appear in the picker, the App installation's repository access is the thing to check.
7. Choose `cfpages-syamsulalam-net/Franchisor.id`, then select **Begin setup**.
8. In **Set up builds and deployments**, enter exactly:

   | Dashboard field | Value |
   | --- | --- |
   | Project name | `franchisor-id` |
   | Production branch | `main` |
   | Framework preset | `Astro` (or `None`; the explicit fields below are authoritative) |
   | Build command | `pnpm run build` |
   | Build output directory | `dist` |
   | Root directory (advanced) | leave blank, meaning repository root |

9. Expand **Environment variables (advanced)** and add these non-secret build variables:

   | Name | Value |
   | --- | --- |
   | `NODE_VERSION` | `22` (Node 22+ so the build's `schema:check` runs its real migration-backed assertions instead of taking its SKIP path; Node 20 has no `node:sqlite`) |
   | `PNPM_VERSION` | `10.34.1` |
   | `CLOUDFLARE_ACCOUNT_ID` | `0ba63b7f0096bc267a93fe5c80b1f571` |
   | `CLOUDFLARE_D1_DATABASE_ID` | `812cd8ac-edd0-45d9-981f-c9a15358317b` |

10. The build also needs `CLOUDFLARE_API_TOKEN` to read the remote D1 snapshot. If the setup screen offers **Encrypt**, enter the token and select **Encrypt**. If it only offers a plain variable, do not store the token there: allow the initial build to fail, open the newly created project, then add it as an encrypted secret using step 12 and retry the deployment from **Deployments**.
11. Select **Save and Deploy**. Cloudflare will install pnpm dependencies from `pnpm-lock.yaml`, run the Astro build, validate every reachable local asset, upload `dist`, and deploy the Pages Functions from `functions/`.
12. After the project exists, open **Settings → Variables and Secrets → Add**, set `CLOUDFLARE_API_TOKEN`, select **Encrypt**, and save it for both Production and Preview. Never save this token as a plain variable.
13. If the first build failed because the encrypted token was not available yet, open **Deployments**, select the failed deployment, and use **Retry deployment**. If that action is not displayed in your account UI, open its failed GitHub check, select **Details**, then **Rerun**; no terminal is required.
14. In the successful deployment's **View details → Build log**, confirm the end of the log includes `Built asset check passed`. Then select the generated `https://franchisor-id.pages.dev` URL.

Cloudflare's official [Astro dashboard guide](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/), [Git integration guide](https://developers.cloudflare.com/pages/get-started/git-integration/), and [build configuration reference](https://developers.cloudflare.com/pages/configuration/build-configuration/) describe this flow. Do not choose dashboard **Direct Upload**: Cloudflare documents that it does not support Pages Functions. Git integration also gives automatic production deployments from `main` and preview deployments for pull requests.

This repository deliberately omits `pages_build_output_dir` from `wrangler.toml`. That keeps the Cloudflare dashboard—not the Wrangler file—as the production configuration source, so bindings and secrets remain editable in the web UI. The D1/R2 entries in `wrangler.toml` are retained for local tooling only. Cloudflare explains this source-of-truth behavior in its [Pages Functions configuration guide](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

## 2. Bind the shared Cloudflare resources

In **Workers & Pages → franchisor-id → Settings → Bindings**, configure both Production and Preview:

| Type | Binding | Resource |
| --- | --- | --- |
| D1 | `franchise_db` | database ID `812cd8ac-edd0-45d9-981f-c9a15358317b` |
| R2 | `FRANCHISE_ASSETS` | bucket `franchise-assets` |

Cloudflare documents Pages bindings and their Production/Preview scopes in [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/).

Web UI clicks for each environment:

1. Open **Workers & Pages → franchisor-id → Settings → Bindings → Add**.
2. Choose **D1 database binding**, enter variable name `franchise_db`, and select the existing `franchise_db` database. Save.
3. Select **Add** again, choose **R2 bucket binding**, enter variable name `FRANCHISE_ASSETS`, and select `franchise-assets`. Save.
4. Repeat for Preview if the dashboard presents Production and Preview separately. Do not create a new database or bucket.
5. Open the next deployment's **View details → Functions** and confirm both bindings are listed before testing authenticated writes/uploads.

Add these build/runtime variables:

| Variable | Value or purpose | Secret? |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | `0ba63b7f0096bc267a93fe5c80b1f571` | No |
| `CLOUDFLARE_D1_DATABASE_ID` | `812cd8ac-edd0-45d9-981f-c9a15358317b` | No |
| `CLOUDFLARE_API_TOKEN` | Least-privilege token for D1 read and any intended Pages deployment | Yes |
| `FRANCHISE_ASSETS_PUBLIC_BASE_URL` | `https://assets.franchisee.id` while the network keeps the existing shared asset hostname | No |
| `R2_PUBLIC_BASE_URL` | Same shared asset base URL | No |

The `assets.franchisee.id` hostname is intentionally shared infrastructure, not accidental Franchisee branding. Change it only after a replacement R2 custom domain is configured and all network consumers are migrated.

## 2A. CSS and static-asset routing guarantees

Cloudflare uploads the contents of `dist` as the URL root. Therefore `/css/franchisor-theme.css` must exist at `dist/css/franchisor-theme.css`, `/js/auth-clerk.js` at `dist/js/auth-clerk.js`, and `/wp-content/...` at the same path under `dist/wp-content/...`.

The build enforces that layout:

- Astro creates `dist/_astro/` and copies `public/_redirects` to `dist/_redirects`.
- `scripts/copy-legacy-static.mjs` copies `css/`, `js/`, `wp-content/`, `wp-includes/`, functional legacy HTML, and other retained static files without overwriting Astro-owned routes.
- The same script copies the pinned Clerk browser bundle into `dist/clerk/`.
- `pnpm run assets:check` runs automatically at the end of `pnpm run build`. It crawls every deployed HTML file and every CSS file those pages actually load, then fails the Cloudflare build if a local stylesheet, script, image, font, or nested CSS asset is missing or has the wrong letter case.
- `public/_redirects` contains only explicit page redirects; it has no catch-all rewrite that could intercept `/css/`, `/js/`, `/_astro/`, `/clerk/`, `/wp-content/`, or `/wp-includes/`. Do not add a catch-all redirect without extending the asset test first. Cloudflare notes that `_redirects` rules run before static asset responses in its [redirect documentation](https://developers.cloudflare.com/pages/configuration/redirects/).

After the first successful web-UI deployment, open these URLs directly in Opera to confirm they return content rather than a Cloudflare HTML error page:

- `https://franchisor-id.pages.dev/css/franchisor-theme.css`
- `https://franchisor-id.pages.dev/js/auth-clerk.js`
- `https://franchisor-id.pages.dev/wp-content/uploads/2025/10/fr-logo-website-franchisor.id_.png`
- `https://franchisor-id.pages.dev/clerk/clerk.browser.js`

Then open the Pages URL, press `Ctrl+Shift+I`, select **Network**, enable **Disable cache**, and reload. Filter by `CSS`, then `JS`, then `Img`; all local requests should be `200`/`304`, with no `404`, redirect loop, or response whose content type is HTML for a CSS/JS URL. Cloudflare serves uploaded Pages assets from its cache and maps `index.html` files to extensionless page routes as described in [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## 3. Configure this site's own Clerk application

**Design of record, 2026-09-28: two separate Clerk applications, joined by verified email through
`user_identities` in the shared D1.**

**Be careful to distinguish that from the live runtime.** Until plan step `0.12` is completed, `franchisor.id` is
still a **Clerk satellite of `franchisee.id`**, and the satellite variables are still doing the work. This section
is how you move to the two-application design; it is not a description of what is switched on right now. The
satellite instructions further down are **historical and must not be followed** — following the old version of
this section configures the wrong thing.

Why the change: a Clerk **satellite** needs a **paid plan**, and it shares one application's user ids. Two free
applications plus `user_identities` give the same shared login without the paid plan. The resolver matches on
**verified email**, not on a Clerk user id, which is what makes a brand claimed or a role granted on either site
recognized on both. The trade-off, recorded rather than hidden: linking depends on a **verified** address, and
someone who registers on each site with a *different* address ends up with two accounts.

In the Clerk Dashboard, for **this site's own** application:

### A. Application basics (done — keys already stored)

1. ~~Create the application~~ — **done.** Free plan; this is the `u3kwrfeaf9l7` instance. Its publishable key, secret key and `CLERK_APP_KEY=franchisor_id` are already on the Pages project (production).
2. ~~DNS~~ — **done 2026-09-29.** All 8 CNAMEs live (`accounts`, `clerk`, `clk`/`clk2`, `clkmail`, `clkmail2`, `pdk1`/`pdk2`), verified 8/8. Record ids in `INFRASTRUCTURE.md` §3.

### B. Sign-in methods and URLs (needs doing)

3. **Authentication methods** — in the dashboard under *User & Authentication → Email, Phone, Username*: enable **email/password**, and enable **email verification by code** for sign-up. The code reads `form_identifier_not_found` to turn first login into registration — without verification-by-code the linker cannot trust the address it matches on.
4. **Google SSO** — under *Social Connections*, enable **Google**. The login screen offers Google first because it arrives already verified, which is exactly what makes cross-site linking work. If staff use dashboard outreach contact saving, add the `https://www.googleapis.com/auth/contacts` scope to the Google connection **and** enable the Google People API in the Google Cloud project behind that OAuth connection — staff must log in again with Google after the scope is added.
5. **Account linking for verified emails** — enable it, so a person who first registers with email/password can later use Google with the same email **on the same Clerk account**. Without this, one human gets two Clerk user ids inside one application and the D1 link sees two strangers.
6. **Allowed URLs** — add, exactly:
   - `https://franchisor.id`
   - `https://franchisor.id/login/`
   - `https://franchisor.id/sso-callback/` — hidden technical callback for Google OAuth, not a login page; the code navigates here after Google returns
   - any Cloudflare Pages preview domain used for testing
   - the local dev URL when testing with Wrangler

### C. Authorized parties (needs doing — paste back to me)

7. `CLERK_AUTHORIZED_PARTIES` still holds the satellite-era value on the Pages project. Re-set it to exactly:
   `https://franchisor.id,https://www.franchisor.id`
   The server passes this to `verifyToken` as the audience check — while it names the wrong parties, sessions minted for this app fail verification and nobody can sign in. **Paste me the value you set** so the doc records what is live; I will set it on production myself.

### D. Webhook endpoint (needs doing — paste back to me)

8. Create the endpoint: *Webhooks → Add Endpoint*, URL `https://franchisor.id/clerk-webhook`, subscribing to exactly `user.created`, `user.updated`, and `user.deleted`. Nothing else — the handler ignores other types, and each extra subscription is noise in the audit log.
9. Copy **that endpoint's** Signing Secret (starts `whsec_`) and **paste it back to me** — signing secrets are per-endpoint and I have no way to read them. I will store it as `CLERK_WEBHOOK_SIGNING_SECRET` on production. Do not paste the franchisee endpoint's secret: a copied value verifies nothing and every webhook fails with `WEBHOOK_VERIFICATION_OR_SYNC_FAILED` while looking configured.

### E. Domain and sender verification (needs doing — click through)

10. In the application's *Domains / Email* area, run Verify on the domain and on both senders (`clkmail`, `clkmail2`). DNS existing is the prerequisite, not the proof — only the dashboard's green check plus a real delivered email counts.

**What to paste back to me when done:** the `CLERK_AUTHORIZED_PARTIES` value you set (C), the new endpoint's `whsec_…` signing secret (D), and confirmation that the domain plus both senders show verified (E). With those three I finish step 18/19 myself and we run plan §7 scenarios 1–3.

### F. Variable table (state after the above)

| Variable | Value | Secret? |
| --- | --- | --- |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | **this application's** publishable key | No |
| `CLERK_SECRET_KEY` | **this application's** secret key | Yes |
| `CLERK_WEBHOOK_SIGNING_SECRET` | this site's own webhook endpoint secret | Yes |
| `CLERK_AUTHORIZED_PARTIES` | `https://franchisor.id,https://www.franchisor.id` | No |
| `USER_BLOCK_SALT` | the salt every blocked-address hash derives from. **Must be identical on both sites**, because a block created on one has to be recognised on the other. **Set once and do not rotate it while `user_blocks` has rows** — every stored hash derives from it, so rotating silently unblocks everyone. Missing while blocks exist, sign-in is **refused** rather than allowed | Yes |
| `CLERK_IS_SATELLITE`, `CLERK_DOMAIN`, `CLERK_SIGN_IN_URL`, `CLERK_SIGN_UP_URL`, `CLERK_ALLOWED_REDIRECT_ORIGINS`, `CLERK_SATELLITE_AUTO_SYNC` | ~~satellite-era values~~ — **removed 2026-09-28 from production.** Do not set them for the two-application design | — |

The application deliberately has no embedded Clerk-key fallback: missing configuration makes login unavailable
rather than silently using the wrong domain's settings.

**Three resolver facts worth knowing, because getting them wrong looks like "signed in but my brand is missing":**

- Resolution is by `user_identities`, keyed on `(provider, clerk_user_id)`. `users.clerk_user_id` is only the
  **home** identity and is never overwritten by a second application.
- Linking needs a **verified** primary email, and **refuses to guess** when one address matches two people — it
  gives them separate accounts and logs `user_identities.link_ambiguous` rather than merging them.
- The block check **fails closed**: if the salt is missing or the lookup errors, sign-in is refused rather than
  permitted, because that guard runs before any identity link or user insert.

### Historical — the satellite design, superseded 2026-09-28

Kept for chronology only. **Do not follow it.**

Until 2026-09-28 this section instructed: use one shared Clerk instance for both sites; add `franchisor.id` as a
**satellite domain** (Clerk requires a paid plan for production satellites); set `CLERK_IS_SATELLITE=true`,
`CLERK_DOMAIN=franchisor.id`, and point `CLERK_SIGN_IN_URL`/`CLERK_SIGN_UP_URL` at
`https://franchisee.id/login/`; and it warned **against** creating a separate application because
"`_clerk-auth.js` resolves users from the shared D1 with `SELECT … FROM users WHERE clerk_user_id = ?`" — so a
brand claimed on one site would not be recognised on the other.

That query no longer exists. The resolver reads `user_identities`, which is exactly what makes two separate
applications work, so the reason for avoiding one has gone. The satellite values were removed from the Pages
project; if you find them set, they are residue, not configuration.

## 4. Connect the production domain

Status 2026-09-26: **all three steps are done.** Both domains are attached and report `active` with `ssl=active`, `https://franchisor.id/` returns 200, and `www` now 301s to the apex.

1. ✅ In the Cloudflare Pages project, add `franchisor.id` and `www.franchisor.id` as custom domains. (Done via the API; the apex record had to be corrected in DNS before Pages would activate them.)
2. ✅ Confirm both show Active and that HTTPS works.
3. ✅ Choose one canonical host. The application uses `https://franchisor.id`; `www` is redirected with a zone **Redirect Rule** (Single Redirect, phase `http_request_dynamic_redirect`) — `http.host eq "www.franchisor.id"` → 301 `concat("https://franchisor.id", http.request.uri.path)`, query preserved. Verified live with path and query intact, landing in one hop with no loop. Needs the **Zone → Single Redirect → Edit** token scope (`Dynamic URL Redirects → Write` in newer token UI) — not Cache, Config, Origin, Transform, Page or Custom Error rules, none of which can change the host.
4. Do not change legacy route redirects until their SEO migration is verified.

## 5. Configure GitHub Actions

In **GitHub repository → Settings → Secrets and variables → Actions**, add:

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `PAGES_DEPLOY_HOOK_FRANCHISOR_ID`
- `PREMIUM_EMAIL_WORKER_SECRET` only if this repository is chosen to dispatch lifecycle email manually

Variables:

- `CLOUDFLARE_ACCOUNT_ID=0ba63b7f0096bc267a93fe5c80b1f571`
- `CLOUDFLARE_D1_DATABASE_ID=812cd8ac-edd0-45d9-981f-c9a15358317b`
- `PAGES_PROJECT_NAME=franchisor-id`
- `FRANCHISOR_SITE_URL=https://franchisor.id`

Create the deploy hook in the Cloudflare Pages project, then save its URL only in `PAGES_DEPLOY_HOOK_FRANCHISOR_ID`. GitHub documents this UI and secret handling in [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

The copied Premium email workflow is intentionally manual-only. Do not schedule it in both Franchisee.id and Franchisor.id, or users may receive duplicate lifecycle messages. If Franchisor.id becomes the sole scheduler, first disable the schedule in Franchisee.id, then add the schedule here in a separate reviewed change.

## 6. Optional integrations

Configure only the features you intend to enable:

| Feature | Variables/secrets | Required external action |
| --- | --- | --- |
| Premium email | `RESEND_API_KEY`, `PREMIUM_EMAIL_FROM`, `PREMIUM_EMAIL_REPLY_TO`, `PREMIUM_EMAIL_WORKER_SECRET` | Verify the sending domain/address in Resend. |
| OCR | `OCR_KEY` for encrypted provider credentials; `OCR_SECRET`, `OCR_WORKER_URL`, and `OCR_WORKER_DAILY_CAP` only when using the protected worker/external scheduler | Use stable random secrets of at least 32 bytes. No OCR schedule is configured in this repository. |
| Google Contacts | `GOOGLE_CONTACTS_CLIENT_ID`, `GOOGLE_CONTACTS_CLIENT_SECRET`, `GOOGLE_CONTACTS_REDIRECT_URI`, `GOOGLE_CONTACTS_TOKEN_KEY` | Add `https://franchisor.id/google-contacts-callback` as an authorized redirect URI in Google Cloud. |
| Legacy Sheets fallback | `G_CLIENT_EMAIL`, `G_PRIVATE_KEY`, `G_SHEET_ID` | Enable only while a documented legacy consumer remains. |

## 7. First-deploy verification

After deployment, verify without exposing secret values:

1. `https://franchisor.id/auth-config` returns `configured: true`, `isSatellite: true`, and no secret key.
2. `/login/`, `/daftar/`, `/profil/`, `/dashboard/`, `/premium/`, and `/peluang-usaha/` render with Franchisor branding.
3. Sign in and confirm `/auth-sync` creates or updates the same network user record rather than a duplicate identity.
4. Confirm unauthorized methods return `405` and protected endpoints return `401`/`403` as appropriate.
5. Upload one disposable test asset and confirm its object is in `franchise-assets` and its public URL resolves.
6. Trigger one Franchisor-scoped publication rebuild and confirm only the Franchisor Pages project deploys.
7. Confirm legacy public pages still resolve and use the intended canonical host.

The shared database contained zero published rows for `site_franchisor_id` when checked on 2026-07-22. Therefore that snapshot's empty generated Franchisor directory was expected. Re-check current D1 state during launch; do not mass-copy Franchisee publication rows. Publish through the normal Premium/admin workflow so each `franchise_site_publications` row is explicit and auditable.
