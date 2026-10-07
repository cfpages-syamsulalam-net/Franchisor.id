# Legacy `/usaha/*` brand match (Gate 0.3)

Recorded 2026-09-25 (Asia/Jakarta). Gate 0.3 of [the rollout plan](NETWORK_MEMBERSHIP_ROLLOUT_PLAN.md) requires every retained legacy `/usaha/*` brand to be matched to a canonical `franchises.id` and a Franchisor publication row, with unmatched and ambiguous entries marked and **no duplicates imported**.

Method: 34 legacy directories under `usaha/`, matched read-only against the live `franchises` table by exact `slug` equality, then by normalized `brand_name` for leftovers. **Zero D1 writes were made.**

## Result

| Measure | Count |
| --- | --- |
| Legacy `/usaha/*` directories | 34 |
| Matched to a canonical `franchises.id` | 34 |
| — by exact `slug` equality | 33 |
| — by normalized brand name only | 1 |
| Ambiguous (multiple candidates) | 0 |
| Unmatched | 0 |
| Canonical duplicates created | 0 (no writes performed) |
| Existing `site_franchisor_id` publication rows | 0 |
| Canonical `slug` collisions on `franchises` | 0 |

## The 34 matched entries

| Legacy path | Canonical `franchises.id` | Canonical brand name | Match basis |
| --- | --- | --- | --- |
| `/usaha/abo-meatshop/` | `franchise_eafcb87db9acc9e9` | ABO MEATSHOP | exact slug |
| `/usaha/al-arashy-tour-travel/` | `franchise_4aaca3204ddfbc9c` | Al Arashy Tour & Travel | exact slug |
| `/usaha/arhamart/` | `franchise_0a5470d49684e4ec` | Arhamart | exact slug |
| `/usaha/atv-adventure-indonesia/` | `franchise_97958bcf59861829` | ATV Adventure Indonesia | exact slug |
| `/usaha/barokah-mulia-abdi/` | `franchise_fbd923360944ffe4` | BAROKAH MULIA ABDI | exact slug |
| `/usaha/best-meat-point/` | `franchise_59f3d8524ecb068c` | Best Meat Point | exact slug |
| `/usaha/codero/` | `franchise_669b4317403b4a04` | Codero | exact slug |
| `/usaha/coolio-barbershop/` | `franchise_b1bccf5392daa3c9` | COOLIO BARBERSHOP | exact slug |
| `/usaha/eastons-indonesia/` | `franchise_2750c4cb9d14980b` | Eastons Indonesia | exact slug |
| `/usaha/eden-everyday-english/` | `franchise_33a73983110c8523` | Eden Everyday English | exact slug |
| `/usaha/english-study-centre-esc/` | `franchise_8751ec99b692569b` | English Study Centre (ESC) | exact slug |
| `/usaha/eye-level/` | `franchise_618c32eb2c448ac7` | Eye Level | exact slug |
| `/usaha/fortunaclean/` | `franchise_f6e5ac5eb01d8ff3` | Fortunaclean | exact slug |
| `/usaha/ghanisa-aesthetic-indonesia/` | `franchise_d6df92dacae6ee4b` | Ghanisa Aesthetic Indonesia | exact slug |
| `/usaha/gorillaz/` | `franchise_cccc6426c01d09e1` | Gorillaz | exact slug |
| `/usaha/hydrophobic-lab/` | `franchise_369d51272cfa70bc` | Hydrophobic Lab | exact slug |
| `/usaha/keding/` | `franchise_bec7d160f4d6ef7d` | Keding | exact slug |
| `/usaha/layar-belajar/` | `franchise_6ea3c799bf75922b` | Layar Belajar | exact slug |
| `/usaha/lion-parcel/` | `franchise_eaaeddc04578b723` | Lion Parcel | exact slug |
| `/usaha/maxim/` | `franchise_239a35b767573a48` | Maxim | exact slug |
| `/usaha/mayur-fresh-mart/` | `franchise_068021d9ca95f1df` | Mayur Fresh Mart | exact slug |
| `/usaha/mitra-indonesia-cerdas/` | `franchise_1d82c2aa20a6e574` | Mitra Indonesia Cerdas | exact slug |
| `/usaha/multilink-indonesia/` | `franchise_a5cb0ae996b99eb8` | MULTILINK INDONESIA | exact slug |
| `/usaha/nayz-spot/` | `franchise_6cd4226b47220390` | Nayz Spot | exact slug |
| `/usaha/nec/` | `franchise_a593525a06522674` | NEC | exact slug |
| `/usaha/pisang-molen-m-a/` | `franchise_e0e0d7158556b97b` | Pisang Molen M.A | **normalized name** — canonical slug is `pisang-molen-ma` |
| `/usaha/rene-baby-shop/` | `franchise_7da7857c8e6e48fa` | RENE BABY SHOP | exact slug |
| `/usaha/rice-boyz/` | `franchise_81c0d20df8e1f311` | Rice Boyz | exact slug |
| `/usaha/rpx-outlet/` | `franchise_d10272fecb534d85` | RPX Outlet | exact slug |
| `/usaha/solophoto/` | `franchise_881c18783c45f4cf` | Solophoto | exact slug |
| `/usaha/sour-sally-yogulato/` | `franchise_99dcc26db51500be` | Sour Sally Yogulato | exact slug |
| `/usaha/topcoat/` | `franchise_5ccb895a86d99950` | Topcoat | exact slug |
| `/usaha/voss-air-minum/` | `franchise_f52e6907f5802c00` | Voss Air Minum | exact slug |
| `/usaha/xto-car-care/` | `franchise_303670d0919ccfdf` | XTO Car Care | exact slug |

All 34 canonical targets are `source_sheet = 'UNCLAIMED'`, `status = 'unclaimed'`, `owner_user_id IS NULL` — the correct pre-claim state that `guard_franchise_claim_pending` requires.

## Consequences

**Gate 0.3 / Gate 4.1 publication completed (2026-10-07):** In production Cloudflare D1 (`franchise_db`), 197 rows were populated in `franchise_site_publications` for `site_franchisor_id`, matching all 34 legacy brands and all 163 other canonical brands with canonical URLs `https://franchisor.id/usaha/{slug}` and `publication_status = 'published'`, achieving parity with `site_franchisee_id`.

**One slug divergence resolved:** The canonical slug `pisang-molen-ma` is generated natively into `dist/usaha/pisang-molen-ma.html`, alongside the preserved legacy path `dist/usaha/pisang-molen-m-a.html`.

**No Duplicate risk remains from this inventory.** The 34 legacy pages map one-to-one onto existing canonical rows, and `franchises.slug` has no collisions. Re-importing them would have created 34 duplicates; Gate 0 closes that hazard.

**`Kopi Coba` (`franchise_f23f5cf9ebd98647`) is the only `FRANCHISOR`-source row** (status `free`, `owner_user_id` NULL, created 2026-06-16) and is now published on both `site_franchisee_id` and `site_franchisor_id` (`is_primary = 1`).

