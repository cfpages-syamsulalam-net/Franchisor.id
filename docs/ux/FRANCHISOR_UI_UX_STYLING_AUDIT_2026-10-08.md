# Audit UI/UX & Styling Franchisor.id — 8 Oktober 2026

Dokumen audit visual, hierarki, aksesibilitas (WCAG 1.4.3), dan konsistensi styling untuk seluruh portal Franchisor.id sesuai metodologi `ui-ux-audit`.

## 1. Ringkasan Eksekutif & Temuan Kritis

Audit ini merespons empat masalah utama yang diidentifikasi pada sistem visual Franchisor.id:
1. **Aksesibilitas Kontras Tombol (WCAG 1.4.3 Failure)**: Teks gelap (`#111111` / `#1c0d0a`) di atas tombol merah (`#cf322e`) pada tombol direktori (`.uc_more_btn`), sticky claim button (`.fr-claim-sticky__button`), owner CTA primary (`.fr-owner-cta__primary`), filter aktif, dan promo bar menghasilkan rasio kontras 2.2:1–2.3:1 (di bawah batas minimum WCAG AA 4.5:1).
2. **Keterbacaan Logo Footer pada Latar Belakang Gelap**: Footer (`footer#colophon`) menggunakan latar belakang hitam pekat (`#000000`). Logo default (`fr-logo-website-franchisor.id_.png`) memiliki teks kata "franchisor" berwarna hitam murni (`#000000`), sehingga pada footer gelap kata "franchisor" hilang total dan hanya menyisakan icon "fp" dan ".id" merah.
3. **Estetika Direktori & Kartu Usaha ("AI Slop" / Gradient Tacky)**: Placeholder gambar kartu dan kategori menggunakan gradien radial-linear diagonal merah-hitam gelap (`rgba(207,50,46,0.24)` + `#111111` ke `#cf322e`) dengan kotak monogram 64x64 berbingkai tebal yang terkesan sintetis/template AI. Lebar kolom kartu `minmax(210px, 1fr)` terlalu sempit sehingga judul patah canggung dan tata letak terkesan sesak.
4. **Residu Warna Kuning Warisan Franchisee.id**: Banner klaim (`.disclaimer-box`), pil filter cepat (`.franchise-directory-quicklinks a`), empty state direktori (`.franchise-directory-empty`), tab cards detail, dan buyer tools masih membawa warna kuning (`#fff3cd`, `#fff8d7`, `#fff9df`, border `#e3d083`) dari Franchisee.id yang bertabrakan dengan palet identitas Franchisor.id (merah, hitam arang, abu-abu netral, dan putih).

---

## 2. Matriks Temuan & Tindakan Perbaikan

| Kode | Area / Komponen | Masalah Ditemukan & Bukti Kode | Tingkat Keparahan | Tindakan Perbaikan & Solusi Desain | Status |
|---|---|---|---|---|---|
| **ST-01** | Directory Card CTA (`.uc_more_btn`) | Variabel Elementor `--e-global-color-astglobalcolor1: #cf322e` dan `--e-global-color-astglobalcolor2: #000000` membuat teks tombol "Info Franchise" hitam di atas merah (kontras 2.3:1). | Kritis | Berikan aturan eksplisit: `.uc_more_btn, .uc_more_btn .uc_btn_txt { background-color: #cf322e !important; color: #ffffff !important; }` dan hover `#b72825`. | Selesai |
| **ST-02** | Sticky Claim Button (`.fr-claim-sticky__button`) | `src/lib/franchise-detail-styles.ts:414` mendefinisikan `color: #111111 !important;` pada `background: #cf322e;`. | Kritis | Ubah menjadi `color: #ffffff !important;` dengan hover darken `#b72825`. | Selesai |
| **ST-03** | Owner CTA Primary (`.fr-owner-cta__primary`) | `src/lib/franchise-directory-styles.ts:87` dan `detail-styles.ts:761` mendefinisikan `color: #111111 !important;` pada `background: #cf322e;`. | Kritis | Ubah menjadi `color: #ffffff !important;`. | Selesai |
| **ST-04** | Detail Actions Hover/Focus | `.fr-save-opportunity-button--detail:hover`, `.fr-compare-button--detail:hover/.is-added` mendefinisikan `background: #cf322e !important; color: #111111 !important;` di `detail-styles.ts:202`. | Tinggi | Ubah warna teks dan icon saat hover/active menjadi `color: #ffffff !important;`. | Selesai |
| **ST-05** | Directory Quicklinks Active | Pil filter aktif `.franchise-directory-quicklinks a.is-active` di `directory-styles.ts:167` memiliki `background: #cf322e; border-color: #c28d00; color: #111111 !important;`. | Tinggi | Ubah menjadi `background: #cf322e; border-color: #cf322e; color: #ffffff !important;`. | Selesai |
| **ST-06** | Site Promo Bar CTA | `.fr-site-promo-bar a` di `directory-styles.ts:517` dan `detail-styles.ts:1157` memiliki `background: #cf322e; color: #111111 !important;`. | Tinggi | Ubah menjadi `color: #ffffff !important;`. | Selesai |
| **ST-07** | Buyer CTA Banner | `.fr-buyer-cta` di `directory-content-styles.ts:76-78` memiliki `background: #cf322e; color: #111111;`. | Sedang | Ubah menjadi `background: #cf322e; color: #ffffff;` sehingga heading dan teks deskripsi putih bersih. | Selesai |
| **ST-08** | Footer Dark Logo | `templates/peluang-usaha-tpl.html:700` dan `detail-franchise-tpl.html:982` memuat logo teks hitam di footer hitam `#000000`. Kata "franchisor" tidak terbaca. | Kritis | Buat varian logo `fr-logo-website-franchisor.id-white-text.png` (icon `fp` merah, teks `franchisor` putih, `.id` merah) dan pasang di seluruh footer gelap. | Selesai |
| **ST-09** | Card Image Placeholder | `.franchise-css-placeholder` dan `.category-css-placeholder` menggunakan gradien diagonal gelap sci-fi dan kotak kaku ("AI slop"). | Sedang | Ganti dengan kartu korporat tenang: latar batu/slate halus `#f8fafc`, badge monogram putih membulat ber-shadow halus, inisial merah brand `#cf322e`, teks penjelas `#64748b`. | Selesai |
| **ST-10** | Card Grid Layout & Spacing | Grid `minmax(210px, 1fr)` di `directory-styles.ts:279` membuat kartu terlalu sempit dan padat. | Sedang | Perlebar min-width menjadi `minmax(260px, 1fr)` dengan `gap: 20px`, tambahkan `border-radius: 8px`, hover transition, dan satukan latar kartu menjadi `#ffffff`. | Selesai |
| **ST-11** | Unclaimed Disclaimer Notice | `.disclaimer-box` di `detail-franchise-tpl.html:105` dan `detail-styles.ts:23` berwarna kuning `#fff3cd` / `#ffeeba` / teks coklat `#856404`. | Sedang | Ubah ke palet Franchisor.id: kotak peringatan netral-merah elegan `background: #fef2f2; border: 1px solid #fee2e2; border-left: 4px solid #cf322e; color: #374151; strong color: #991b1b; icon: #cf322e`. | Selesai |
| **ST-12** | Directory Quicklinks Yellow Residue | `.franchise-directory-quicklinks a` menggunakan `#fff8d7` dan border `#e3d083` (kuning Franchisee.id). | Sedang | Ubah pil filter menjadi netral modern: `background: #f4f4f5; border: 1px solid #e4e4e7; color: #3f3f46;` dengan hover `#e4e4e7`. | Selesai |
| **ST-13** | Directory Empty State Yellow Residue | `.franchise-directory-empty` menggunakan `#fff9df` dan border `#e3d083`. | Rendah | Ganti dengan kartu netral elegan: `background: #ffffff; border: 1px solid #e4e4e7; border-left: 4px solid #cf322e; color: #18181b;`. | Selesai |
| **ST-14** | Buyer Tools Yellow Residue | `css/franchise-buyer-tools.css` menggunakan pil kuning `#fff8d7` dan kotak kosong `#fff8d7`. Nav hover ketiadaan teks putih. | Sedang | Ganti link grid dan empty state menjadi netral slate; pastikan nav hover memiliki `color: #ffffff !important;`. | Selesai |

---

## 3. Panduan Token Desain Franchisor.id

Untuk mencegah regresi styling pada sesi mendatang:
- **Warna Utama (Primary Brand)**: `#cf322e` (Franchisor Red), Dark hover: `#b72825` / `#a9201c`.
- **Warna Teks di Atas Tombol Merah**: **Selalu `#ffffff` (Putih Murni)**. Jangan pernah menggunakan `#111111` atau `#000000` di atas latar belakang merah.
- **Warna Latar Gelap (Dark Surface)**: `#000000` (Footer), `#111111` / `#161616` (Header bar / Dark Card).
- **Warna Logo pada Latar Gelap**: Gunakan `fr-logo-website-franchisor.id-white-text.png` (icon merah, teks putih, domain merah).
- **Warna Peringatan / Disclaimer Unclaimed**: Gunakan `background: #fef2f2; border-left: 4px solid #cf322e;` dengan teks abu-abu gelap `#374151` dan judul `#991b1b`. Hindari warna kuning `#fff3cd` yang merupakan token Franchisee.id.
- **Placeholder Kartu Listing**: Gunakan latar `#f8fafc` dengan monogram badge putih bulat dan inisial `#cf322e`. Hindari gradien sci-fi atau efek neon.
