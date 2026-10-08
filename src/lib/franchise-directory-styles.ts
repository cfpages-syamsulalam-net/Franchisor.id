export const FRANCHISE_DIRECTORY_STYLES = `<style id="franchise-directory-generated-css">
.franchise-directory-controls {
  max-width: 1200px;
  margin: 0 auto 16px;
  padding: 14px;
  border: 1px solid #e4e4e4;
  background: #ffffff;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
}
.franchise-directory-intro {
  max-width: 1200px;
  margin: 0 auto 14px;
  padding: 14px 16px;
  border-left: 4px solid #cf322e;
  background: #fff7f6;
  color: #303030;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
}
.franchise-directory-intro p {
  margin: 0 0 8px;
  color: #303030;
  font-size: 15px;
  line-height: 1.6;
}
.franchise-directory-intro p:last-child {
  margin-bottom: 0;
}
.fr-owner-cta {
  max-width: 1200px;
  margin: 18px auto 0;
  padding: 16px 18px;
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(207, 50, 46, 0.38);
  background: #161616;
  color: #ffffff;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
}
.fr-owner-cta__content {
  max-width: 720px;
}
.fr-owner-cta__eyebrow {
  display: inline-flex;
  margin-bottom: 8px;
  color: #cf322e;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.fr-owner-cta h2 {
  margin: 0 0 5px;
  color: #ffffff;
  font-size: 20px;
  line-height: 1.25;
}
.fr-owner-cta p {
  margin: 0;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  line-height: 1.5;
}
.fr-owner-cta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
.fr-owner-cta__primary,
.fr-owner-cta__secondary {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 12px;
  border-radius: 0;
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
  text-decoration: none !important;
}
.fr-owner-cta__primary {
  border: 1px solid #cf322e;
  background: #cf322e;
  color: #ffffff !important;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.fr-owner-cta__primary:hover {
  background: #b72825;
  border-color: #b72825;
  color: #ffffff !important;
}
.fr-owner-cta__secondary {
  border: 1px solid rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff !important;
}
.franchise-directory-control-row {
  display: grid;
  grid-template-columns: minmax(220px, 1.5fr) repeat(3, minmax(150px, 1fr)) auto;
  gap: 10px;
  align-items: end;
}
.franchise-directory-controls label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #2b2b2b;
  font-size: 12px;
  font-weight: 700;
}
.franchise-directory-controls input,
.franchise-directory-controls select {
  min-height: 40px;
  width: 100%;
  border: 1px solid #d6d6d6;
  border-radius: 4px;
  padding: 8px 10px;
  background: #ffffff;
  color: #111111;
  font: inherit;
}
.franchise-directory-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.franchise-directory-actions button,
.franchise-directory-actions a {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  text-decoration: none !important;
}
.franchise-directory-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #111111;
  background: #111111;
  color: #ffffff;
  cursor: pointer;
}
.franchise-directory-actions button i {
  font-size: 11px;
}
.franchise-directory-actions a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #dedede;
  background: #f7f7f7;
  color: #111111 !important;
}
.franchise-directory-actions a i {
  font-size: 11px;
}
.franchise-directory-quicklinks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.franchise-directory-quicklinks a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #e4e4e7;
  border-radius: 999px;
  padding: 6px 12px;
  background: #f4f4f5;
  color: #3f3f46 !important;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none !important;
  transition: all 0.2s ease;
}
.franchise-directory-quicklinks a i {
  font-size: 11px;
  color: #71717a;
  transition: color 0.2s ease;
}
.franchise-directory-quicklinks a:hover {
  background: #e4e4e7;
  color: #18181b !important;
}
.franchise-directory-quicklinks a:hover i {
  color: #cf322e;
}
.franchise-directory-quicklinks a.is-active {
  background: #cf322e;
  border-color: #cf322e;
  color: #ffffff !important;
}
.franchise-directory-quicklinks a.is-active i {
  color: #ffffff !important;
}
.franchise-directory-result-count {
  margin: 10px 0 0;
  color: #4d4d4d;
  font-size: 13px;
  font-weight: 600;
}
.franchise-directory-empty {
  display: none;
  max-width: 1200px;
  margin: 0 auto 18px;
  padding: 20px;
  border: 1px solid #e4e4e7;
  border-left: 4px solid #cf322e;
  background: #ffffff;
  color: #3f3f46;
  gap: 6px;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}
.franchise-directory-empty strong {
  color: #17120a;
  font-size: 17px;
}
.franchise-directory-empty span {
  font-size: 13px;
  line-height: 1.45;
}
.franchise-directory-empty a {
  width: fit-content;
  min-height: 36px;
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background: #111111;
  color: #ffffff !important;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none !important;
}
.franchise-css-placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  overflow: hidden;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
}
.franchise-css-placeholder span {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #cf322e;
  font-size: 22px;
  font-weight: 800;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.franchise-css-placeholder small {
  position: relative;
  z-index: 1;
  display: block;
  max-width: calc(100% - 32px);
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  text-transform: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-css-placeholder {
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
}
.category-css-placeholder span {
  color: #cf322e;
  background: #ffffff;
  border: 1px solid #e2e8f0;
}
#uc_post_grid_elementor_d0f4a5f .ue_p_title {
  pointer-events: auto !important;
}
.elementor-2184 .elementor-element.elementor-element-19b8c8c {
  --padding-top: 72px !important;
  --padding-bottom: 44px !important;
  --padding-left: 16px !important;
  --padding-right: 16px !important;
}
.elementor-2184 .elementor-element.elementor-element-19b8c8c .elementor-heading-title {
  font-size: 38px;
  line-height: 1.15;
}
.elementor-2184 .elementor-element.elementor-element-9hd9if8 {
  display: none !important;
}
.elementor-2184 .elementor-element.elementor-element-00e75dc {
  --padding-top: 20px !important;
  --padding-bottom: 56px !important;
  --padding-left: 16px !important;
  --padding-right: 16px !important;
}
#uc_post_grid_elementor_d0f4a5f .uc-items-wrapper {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
  gap: 20px !important;
  align-items: stretch;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_grid_style_one_item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_grid_style_one_item:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.07);
}
#uc_post_grid_elementor_d0f4a5f .uc_post_grid_style_one_image {
  display: block;
  flex: 0 0 auto;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_image {
  width: 100%;
  height: auto !important;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  background: #ffffff;
  border: 0 !important;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_image img {
  width: 100%;
  height: 100% !important;
  padding: 10px;
  object-fit: contain !important;
  object-position: center !important;
  transform: none !important;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_image_overlay {
  display: none;
}
#uc_post_grid_elementor_d0f4a5f .franchise-css-placeholder {
  min-height: 0;
}
#uc_post_grid_elementor_d0f4a5f .uc_content {
  min-width: 0;
  flex: 1 1 auto;
  padding: 16px !important;
  background: #ffffff !important;
}
#uc_post_grid_elementor_d0f4a5f .uc_content_inner,
#uc_post_grid_elementor_d0f4a5f .uc_content-info-wrapper {
  min-width: 0;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_title,
#uc_post_grid_elementor_d0f4a5f .uc_post_title a,
#uc_post_grid_elementor_d0f4a5f .uc_post_title a > * {
  font-size: 16px !important;
  line-height: 1.25 !important;
}
#uc_post_grid_elementor_d0f4a5f .ue-meta-data {
  gap: 6px !important;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_text {
  min-height: 36px;
  margin-top: 7px !important;
  display: -webkit-box;
  overflow: hidden;
  color: #555555 !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
#uc_post_grid_elementor_d0f4a5f .uc_more_btn,
#uc_post_grid_elementor_d0f4a5f .uc_more_btn .uc_btn_txt,
.uc_more_btn,
.uc_more_btn .uc_btn_txt {
  background-color: #cf322e !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  font-weight: 700 !important;
  text-decoration: none !important;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}
#uc_post_grid_elementor_d0f4a5f .uc_more_btn:hover,
#uc_post_grid_elementor_d0f4a5f .uc_more_btn:hover .uc_btn_txt,
.uc_more_btn:hover,
.uc_more_btn:hover .uc_btn_txt {
  background-color: #b72825 !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
}
#uc_post_grid_elementor_d0f4a5f .uc_more_btn {
  margin-top: 12px !important;
  padding: 9px 14px !important;
  font-size: 12px !important;
  line-height: 1.2 !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
}
#uc_post_grid_elementor_d0f4a5f,
#uc_post_grid_elementor_d0f4a5f .uc-items-wrapper,
#uc_post_grid_elementor_d0f4a5f .uc_post_grid_style_one_wrap,
#uc_post_grid_elementor_d0f4a5f .uc_post_grid_style_one_item,
#uc_post_grid_elementor_d0f4a5f .uc_content,
#uc_post_grid_elementor_d0f4a5f .uc_content_inner,
#uc_post_grid_elementor_d0f4a5f .uc_post_title {
  overflow: visible !important;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_grid_style_one_item {
  position: relative;
}
#uc_post_grid_elementor_d0f4a5f .uc_post_grid_style_one_item:has(.franchise-status-badge:hover),
#uc_post_grid_elementor_d0f4a5f .uc_post_grid_style_one_item:has(.franchise-status-badge:focus-within) {
  z-index: 20;
}
.franchise-card-title {
  display: flex !important;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  color: #111111 !important;
  line-height: 1.24;
  text-decoration: none !important;
}
.franchise-card-title:hover {
  color: #cf322e !important;
}
.franchise-status-badge {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  padding: 0;
  border-radius: 50%;
  font-size: 11px;
  line-height: 1;
  flex: 0 0 22px;
  cursor: help;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.franchise-status-badge:hover,
.franchise-status-badge:focus-within {
  z-index: 30;
  transform: scale(1.1);
}
.franchise-status-verified {
  color: #0f5132;
  background: #d1f1dc;
  border: 1px solid rgba(15, 81, 50, 0.28);
}
.franchise-status-premium {
  color: #cf322e;
  background: #fde8e8;
  border: 1px solid rgba(207, 50, 46, 0.3);
}
.franchise-status-unclaimed {
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
}
.franchise-status-badge i {
  font-size: 11px;
  line-height: 1;
}
.franchise-card-facts {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}
.franchise-fact-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 4px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
  font-size: 11px;
  line-height: 1.2;
  cursor: help;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.franchise-fact-chip:hover {
  border-color: #cbd5e1;
  background: #f1f5f9;
}
.franchise-fact-chip i {
  color: #cf322e;
  font-size: 10px;
}
.franchise-fact-chip span {
  color: #64748b;
}
.franchise-fact-chip strong {
  font-weight: 700;
  color: #0f172a;
}
.fr-save-opportunity-wrap--card {
  position: absolute;
  left: 10px;
  top: 8px;
  z-index: 12;
}
.fr-save-opportunity-button--card {
  width: 36px !important;
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  border: 1px solid rgba(17, 17, 17, 0.12) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12) !important;
  color: #cf322e !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.2s ease !important;
}
.fr-save-opportunity-button--card i {
  color: #cf322e !important;
  -webkit-text-fill-color: #cf322e !important;
  font-size: 13px !important;
  transition: color 0.18s ease !important;
}
.fr-save-opportunity-button--card:hover,
.fr-save-opportunity-button--card:focus-visible {
  background: #cf322e !important;
  border-color: #cf322e !important;
  color: #ffffff !important;
  box-shadow: 0 6px 16px rgba(207, 50, 46, 0.35) !important;
}
.fr-save-opportunity-button--card:hover i,
.fr-save-opportunity-button--card:focus-visible i {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
}
.fr-save-opportunity-button--card.is-saved {
  background: #137333 !important;
  border-color: #137333 !important;
  color: #ffffff !important;
}
.fr-save-opportunity-button--card.is-saved i {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
}
.fr-compare-wrap--card {
  position: absolute;
  left: 52px;
  top: 8px;
  z-index: 6;
}
.fr-compare-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(17, 17, 17, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #111111;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}
.fr-compare-button i {
  color: #111111;
  transition: color 0.18s ease;
}
.fr-compare-button:hover,
.fr-compare-button:focus-visible {
  background: #cf322e;
  border-color: #cf322e;
  color: #ffffff !important;
  box-shadow: 0 6px 16px rgba(207, 50, 46, 0.35);
}
.fr-compare-button:hover i,
.fr-compare-button:focus-visible i {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
}
.fr-compare-button--card {
  width: 36px;
  height: 36px;
  padding: 0;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
}
.fr-compare-button--card span {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.fr-compare-button--detail {
  min-height: 42px;
  padding: 8px 13px;
}
.fr-compare-button.is-added {
  background: #cf322e;
  color: #ffffff !important;
}
.fr-compare-button.is-added i {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
}
.fr-compare-floating {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 90;
  display: none;
  align-items: center;
  gap: 8px;
  padding: 10px 13px;
  border: 1px solid #111111;
  background: #111111;
  color: #ffffff !important;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
  font-size: 13px;
  font-weight: 900;
  text-decoration: none !important;
}
.fr-compare-floating.is-visible {
  display: inline-flex;
}
.fr-site-promo-bar {
  position: sticky;
  top: 0;
  z-index: 80;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 9px 16px;
  background: #111111;
  color: #ffffff;
  font-family: "DM Sans", Arial, sans-serif;
  font-size: 14px;
  font-weight: 800;
}
.fr-site-promo-bar a {
  color: #ffffff !important;
  background: #cf322e;
  padding: 5px 9px;
  border-radius: 3px;
  text-decoration: none !important;
  transition: background-color 0.2s ease;
}
.fr-site-promo-bar a:hover {
  background: #b72825;
  color: #ffffff !important;
}
@media (max-width: 980px) {
  .fr-owner-cta {
    align-items: flex-start;
    flex-direction: column;
  }
  .fr-owner-cta__actions {
    justify-content: flex-start;
  }
  .franchise-directory-control-row {
    grid-template-columns: 1fr 1fr;
  }
  .franchise-directory-search {
    grid-column: 1 / -1;
  }
  .franchise-directory-actions {
    grid-column: 1 / -1;
  }
}
@media (max-width: 640px) {
  .elementor-2184 .elementor-element.elementor-element-19b8c8c {
    --padding-top: 48px !important;
    --padding-bottom: 30px !important;
  }
  .elementor-2184 .elementor-element.elementor-element-19b8c8c .elementor-heading-title {
    font-size: 30px;
  }
  .elementor-2184 .elementor-element.elementor-element-00e75dc {
    --padding-top: 14px !important;
    --padding-bottom: 40px !important;
    --padding-left: 12px !important;
    --padding-right: 12px !important;
  }
  #uc_post_grid_elementor_d0f4a5f .uc-items-wrapper {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  .fr-owner-cta__actions {
    width: 100%;
  }
  .fr-owner-cta__primary,
  .fr-owner-cta__secondary {
    flex: 1 1 150px;
  }
  .fr-owner-cta h2 {
    font-size: 18px;
  }
  .franchise-directory-controls {
    padding: 12px;
  }
  .franchise-directory-control-row {
    grid-template-columns: 1fr;
  }
}
.fr-tooltip {
  font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: 1.45 !important;
  letter-spacing: 0.01em !important;
  background: #1e293b !important;
  color: #f8fafc !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25) !important;
  padding: 8px 12px !important;
  border-radius: 6px !important;
}
.fr-tooltip strong,
.fr-tooltip b {
  font-weight: 600 !important;
  color: #ffffff !important;
}
</style>`;
