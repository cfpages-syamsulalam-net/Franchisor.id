export const FRANCHISE_DETAIL_STYLE_ID = "franchise-detail-generated-css";

export function renderFranchiseDetailStyles() {
  return `<style id="${FRANCHISE_DETAIL_STYLE_ID}">
.hfe-post-info a,
.hfe-post-info-item,
.hfe-post-info__terms-list-item,
.elementor-widget-post-info-widget a {
  color: #111111 !important;
}
.hfe-post-info-item,
.hfe-post-info__terms-list-item {
  background: transparent !important;
  border: 0 !important;
  padding: 0 !important;
  text-decoration: none !important;
}
.hfe-post-info-item:hover,
.hfe-post-info__terms-list-item:hover {
  background: transparent !important;
  color: #111111 !important;
}
.disclaimer-box {
  background: #fef2f2 !important;
  border: 1px solid #fee2e2 !important;
  border-left: 4px solid #cf322e !important;
  border-radius: 6px !important;
  color: #374151 !important;
}
.disclaimer-box strong {
  color: #991b1b !important;
  font-weight: 700 !important;
}
.disclaimer-box i {
  color: #cf322e !important;
}
.ast-breadcrumbs {
  margin: 8px auto 10px;
  max-width: 1200px;
  padding: 0 20px;
  font-size: 12px;
  color: #82786a;
}
.ast-breadcrumbs-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.trail-browse {
  color: #9a8f7d;
  font-weight: 500;
}
.trail-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.trail-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #7a6f61;
}
.trail-item:not(:last-child)::after {
  content: "/";
  color: #c4b9a8;
}
.trail-item a {
  color: #756b55 !important;
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
  text-decoration: none !important;
}
.trail-item a:hover {
  background: transparent;
  color: #111111 !important;
  text-decoration: underline !important;
  text-underline-offset: 3px;
}
.trail-item span {
  color: #6b6256;
}
.elementor-element-19b8c8c {
  display: none !important;
}
.franchise-detail-title-row {
  display: block;
  max-width: 100%;
  text-align: center;
}
.franchise-detail-title-row h1 {
  margin: 0 !important;
  font-size: clamp(32px, 7vw, 68px) !important;
  line-height: 1.03 !important;
}
.franchise-detail-quickfacts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: stretch;
  margin-top: 12px;
}
.franchise-detail-quickfact {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  min-width: 92px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(17, 17, 17, 0.56);
  color: #ffffff;
  backdrop-filter: blur(8px);
}
.franchise-detail-quickfact small {
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
}
.franchise-detail-quickfact strong {
  color: #ffffff;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
}
.entry-content > .elementor,
.entry-content > .elementor > .e-con,
.elementor-element.e-con-boxed {
  --container-default-padding-top: 12px;
  --container-default-padding-bottom: 12px;
}
.elementor-widget-theme-post-featured-image img,
.elementor-widget-image img.attachment-large {
  max-height: 286px;
  object-fit: cover;
}
.elementor-element.elementor-widget-theme-post-featured-image,
.elementor-element.elementor-widget-image {
  margin-bottom: 10px !important;
}
.elementor-element-f6c9163,
.elementor-element-37c2875,
.elementor-element-a331762 {
  display: none !important;
}
.franchise-info-heading-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 18px;
}
.franchise-info-heading-copy {
  flex: 1 1 360px;
  min-width: 0;
}
.franchise-info-kicker {
  display: inline-flex;
  margin-bottom: 6px;
  color: #8d1c18;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.franchise-info-heading-row h1 {
  margin: 0 !important;
  color: #111111 !important;
  font-size: clamp(34px, 6vw, 64px) !important;
  line-height: 1.02 !important;
}
.franchise-detail-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 0;
}
.franchise-detail-actions .fr-save-opportunity-button--detail,
.franchise-detail-actions .fr-compare-button--detail {
  position: relative;
  width: 38px;
  min-width: 38px;
  height: 38px;
  min-height: 38px;
  justify-content: center;
  padding: 0 !important;
  border-radius: 999px !important;
  border: 1px solid rgba(17, 17, 17, 0.18) !important;
  background: #111111 !important;
  color: #cf322e !important;
  box-shadow: 0 10px 20px rgba(17, 17, 17, 0.14);
}
.franchise-detail-actions .fr-save-opportunity-button--detail i,
.franchise-detail-actions .fr-compare-button--detail i {
  color: #cf322e !important;
}
.franchise-detail-actions .fr-save-opportunity-button--detail:hover,
.franchise-detail-actions .fr-save-opportunity-button--detail:focus,
.franchise-detail-actions .fr-compare-button--detail:hover,
.franchise-detail-actions .fr-compare-button--detail:focus,
.franchise-detail-actions .fr-compare-button--detail.is-added {
  background: #cf322e !important;
  color: #ffffff !important;
  transform: translateY(-1px);
}
.franchise-detail-actions .fr-save-opportunity-button--detail:hover i,
.franchise-detail-actions .fr-save-opportunity-button--detail:focus i,
.franchise-detail-actions .fr-compare-button--detail:hover i,
.franchise-detail-actions .fr-compare-button--detail:focus i,
.franchise-detail-actions .fr-compare-button--detail.is-added i {
  color: #ffffff !important;
}
.franchise-detail-actions .fr-save-opportunity-label,
.franchise-detail-actions .fr-compare-button--detail span {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(0 0 0 0) !important;
  white-space: nowrap !important;
}
.franchise-info-panel {
  display: grid;
  grid-template-columns: minmax(160px, 240px) minmax(0, 1fr);
  gap: clamp(14px, 3vw, 26px);
  align-items: start;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.franchise-info-brand-card {
  display: grid;
  gap: 10px;
  width: 100%;
  max-width: 240px;
}
.franchise-info-logo-card {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 240px;
  min-height: 160px;
  padding: 16px;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: #ffffff;
}
.franchise-info-logo-card img {
  width: min(100%, 210px) !important;
  height: auto !important;
  max-height: 150px !important;
  object-fit: contain !important;
}
.franchise-info-logo-placeholder {
  min-height: 140px !important;
  aspect-ratio: 4 / 3;
}
.franchise-info-social {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  justify-content: center;
}
.franchise-info-social a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(17, 17, 17, 0.12);
  border-radius: 999px;
  background: #ffffff;
  color: #111111 !important;
  text-decoration: none !important;
  box-shadow: 0 8px 18px rgba(17, 17, 17, 0.08);
}
.franchise-info-social a:hover,
.franchise-info-social a:focus {
  background: #111111;
  color: #cf322e !important;
  transform: translateY(-1px);
}
.franchise-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.franchise-info-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: #ffffff;
}
.franchise-info-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: #111111;
  color: #cf322e;
}
.franchise-info-item__body {
  min-width: 0;
}
.franchise-info-item small {
  display: block;
  margin-bottom: 2px;
  color: #70685b;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.franchise-info-item strong {
  display: block;
  color: #111111;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.franchise-info-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  color: #9a7b00;
  cursor: help;
}
.franchise-info-value--link,
.franchise-info-value--contact {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #111111 !important;
  font: inherit;
  text-align: left;
  text-decoration: none !important;
  cursor: pointer;
}
.franchise-info-value--link strong,
.franchise-info-value--contact strong {
  color: inherit;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-decoration-color: rgba(207, 50, 46, 0.75);
  text-underline-offset: 3px;
}
.franchise-info-value--link:hover,
.franchise-info-value--link:focus,
.franchise-info-value--contact:hover,
.franchise-info-value--contact:focus {
  color: #8d1c18 !important;
}
.franchise-info-value--contact i {
  color: #8d1c18;
  font-size: 12px;
}
.fr-claim-sticky {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-top: 2px solid #cf322e;
  background: #ffffff;
  box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.08);
}
.fr-claim-sticky__copy {
  flex: 1;
  min-width: 240px;
  color: #374151;
}
.fr-claim-sticky__copy strong {
  display: block;
  color: #111111;
  font-weight: 900;
}
.fr-claim-sticky__copy span {
  display: block;
  color: #52525b;
  font-size: 13px;
}
.fr-claim-sticky__copy span strong {
  display: inline;
}
.fr-claim-sticky__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 10px 18px;
  border-radius: 999px;
  background: #cf322e;
  color: #ffffff !important;
  font-size: 13px;
  font-weight: 900;
  text-decoration: none !important;
  box-shadow: 0 8px 18px rgba(207, 50, 46, 0.28);
  transition: background-color 0.2s ease, transform 0.2s ease;
}
.fr-claim-sticky__button:hover,
.fr-claim-sticky__button:focus {
  background: #b72825;
  color: #ffffff !important;
  transform: translateY(-1px);
}
.franchise-css-placeholder {
  position: relative;
  width: 100%;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  overflow: hidden;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 6px;
  color: #18181b;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
}
.franchise-css-placeholder span {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #cf322e;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.franchise-css-placeholder small {
  position: relative;
  z-index: 1;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}
.franchise-detail-image-placeholder {
  min-height: 138px;
  aspect-ratio: 300 / 138;
}
.e-n-tabs {
  width: 100%;
  margin-top: 18px;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.e-n-tabs-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-end;
  width: 100%;
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
}
.e-n-tab-title {
  position: relative;
  display: inline-flex !important;
  gap: 8px;
  align-items: center;
  cursor: pointer;
  border: 0 !important;
  background: #f4f4f5 !important;
  color: #52525b !important;
  margin-bottom: 0 !important;
  padding: 11px 16px 12px !important;
  border-radius: 4px !important;
  font-weight: 900 !important;
  text-transform: none !important;
}
.e-n-tab-title:hover,
.e-n-tab-title:focus {
  color: #111111 !important;
  background: #e4e4e7 !important;
}
.e-n-tab-title[aria-selected="true"] {
  z-index: 2;
  background: #111111 !important;
  color: #cf322e !important;
  box-shadow: none;
}
.e-n-tabs-content {
  width: 100%;
  margin-top: 8px;
  background: #ffffff;
  box-shadow: 0 16px 38px rgba(17, 17, 17, 0.07);
}
.e-n-tab-content {
  width: 100%;
  border: 0;
  background: #ffffff;
  padding: clamp(14px, 2vw, 22px);
  box-sizing: border-box;
}
.e-n-tab-content:not(.e-active) {
  display: none !important;
}
.fr-detail-tab-block {
  display: grid;
  gap: 12px;
}
.fr-detail-tab-block h3 {
  display: inline-flex;
  gap: 9px;
  align-items: center;
  margin: 0;
  color: #111111;
  font-size: clamp(20px, 2.5vw, 28px);
  line-height: 1.2;
}
.fr-detail-tab-block h3 i {
  color: #cf322e;
}
.fr-detail-tab-block p {
  margin: 0;
  color: #4b5563;
  line-height: 1.7;
}
.fr-detail-copy p + p {
  margin-top: 8px;
}
.fr-detail-tab-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.fr-detail-tab-card {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 12px;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fbfbfa;
}
.fr-detail-tab-card > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: #111111;
  color: #cf322e;
}
.fr-detail-tab-card small {
  display: block;
  margin-bottom: 2px;
  color: #70685b;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.fr-detail-tab-card strong {
  display: block;
  color: #111111;
  font-size: 15px;
  font-weight: 900;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.fr-detail-tab-note {
  padding: 12px 14px;
  border: 1px solid #fee2e2;
  border-left: 4px solid #cf322e;
  border-radius: 6px;
  background: #fef2f2;
  color: #374151;
  line-height: 1.6;
}
.fr-detail-tab-note strong {
  color: #991b1b;
}
.franchise-contact-block ul {
  margin: 12px 0 0 0;
  padding: 0;
  list-style: none;
}
.franchise-contact-block li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #eeeeee;
}
.franchise-contact-block li span {
  color: #555555;
  font-weight: 700;
}
.franchise-contact-block li i {
  width: 16px;
  margin-right: 6px;
  color: #cf322e;
}
.franchise-contact-block a {
  color: #1d4f91 !important;
  font-weight: 700;
  text-decoration: none !important;
}
.franchise-contact-block a:hover {
  color: #cf322e !important;
}
.franchise-whatsapp-claim-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 2px;
  padding: 3px 7px;
  border: 1px solid rgba(18, 140, 126, 0.28);
  border-radius: 4px;
  background: #e8f7ef;
  color: #075e54 !important;
  font-size: 12px;
  line-height: 1.3;
}
.franchise-whatsapp-claim-link i {
  width: auto;
  margin-right: 0;
  color: #128c7e;
}
.franchise-whatsapp-claim-link:hover,
.franchise-whatsapp-claim-link:focus {
  background: #d7f0e4;
  color: #064c45 !important;
}
.franchise-contact-note {
  margin-top: 14px;
  padding: 10px 12px;
  border-left: 4px solid #cf322e;
  border-radius: 4px;
  background: #fef2f2;
  color: #374151;
}
.fr-premium-lead-panel {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 14px;
  padding: 14px;
  border: 1px solid #fee2e2;
  border-left: 4px solid #cf322e;
  border-radius: 6px;
  background: #fff7f6;
}
.fr-premium-eyebrow {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  margin-bottom: 6px;
  color: #991b1b;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}
.fr-premium-lead-panel h2 {
  margin: 0 0 6px;
  color: #111111;
  font-size: 22px;
}
.fr-premium-lead-panel p {
  margin: 0;
  color: #4b5563;
}
.fr-owner-cta {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  margin: 24px 0 0;
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid rgba(207, 50, 46, 0.38);
  background:
    radial-gradient(circle at 88% 16%, rgba(207, 50, 46, 0.22), transparent 30%),
    linear-gradient(135deg, #111111 0%, #353535 100%);
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
  margin: 0 0 8px;
  color: #ffffff;
  font-size: clamp(22px, 3vw, 32px);
  line-height: 1.12;
}
.fr-owner-cta p {
  margin: 0;
  color: rgba(255, 255, 255, 0.82);
  font-size: 15px;
  line-height: 1.65;
}
.fr-owner-cta__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
.fr-owner-cta__primary,
.fr-owner-cta__secondary {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 11px 16px;
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
.fr-premium-lead-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.fr-premium-action,
.fr-proposal-download,
.fr-proposal-direct-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  border-radius: 4px;
  padding: 10px 14px;
  font-weight: 800;
  line-height: 1;
  text-decoration: none !important;
}
.fr-premium-action {
  border: 1px solid #111111;
  background: #111111;
  color: #ffffff !important;
  cursor: pointer;
  font: inherit;
}
.fr-premium-action.is-whatsapp {
  border-color: #128c7e;
  background: #128c7e;
}
.fr-premium-action.is-secondary,
.fr-proposal-direct-link {
  border: 1px solid #dedede;
  background: #ffffff;
  color: #111111 !important;
}
.fr-premium-tab-block h3 {
  margin: 0 0 8px;
  color: #111111;
  font-size: 22px;
}
.fr-premium-tab-block p {
  color: #4b5563;
}
.fr-premium-gallery,
.fr-proposal-pages {
  display: grid;
  gap: 0;
}
.fr-premium-gallery {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.fr-premium-gallery figure,
.fr-proposal-page {
  margin: 0;
  background: #ffffff;
}
.fr-premium-gallery img,
.fr-proposal-page img {
  display: block;
  width: 100%;
  height: auto;
}
.fr-premium-gallery img {
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.fr-premium-video-link a {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: #1d4f91 !important;
  font-weight: 800;
  text-decoration: none !important;
}
.fr-proposal-tab {
  position: relative;
}
.fr-proposal-head {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}
.fr-proposal-stage {
  position: relative;
  overflow: hidden;
  border: 1px solid #eeeeee;
  background: #ffffff;
}
.fr-proposal-reader {
  display: grid;
  gap: 8px;
}
.fr-proposal-overlaybar {
  position: absolute;
  top: 10px;
  right: 10px;
  left: 10px;
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.fr-proposal-reader.is-pointer-active .fr-proposal-overlaybar,
.fr-proposal-stage:focus-within .fr-proposal-overlaybar,
.fr-proposal-reader.is-downloading .fr-proposal-overlaybar {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.fr-proposal-download {
  position: relative;
  overflow: hidden;
  border: 1px solid #b42318;
  background: #b42318;
  color: #ffffff;
  cursor: pointer;
  white-space: nowrap;
}
.fr-proposal-download > i,
.fr-proposal-download > span:not(.fr-proposal-download-progress) {
  position: relative;
  z-index: 1;
}
.fr-proposal-download:disabled {
  cursor: wait;
}
.fr-proposal-download-progress {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 0;
  width: var(--proposal-progress, 0%);
  background: rgba(255, 255, 255, 0.24);
  transition: width 0.2s ease;
}
.fr-proposal-download.is-loading .fr-proposal-download-progress {
  animation: frProposalProgress 1.1s ease-in-out infinite;
}
.fr-proposal-status {
  max-width: min(360px, 100%);
  padding: 8px 10px;
  border: 1px solid rgba(17, 17, 17, 0.1);
  background: rgba(255, 255, 255, 0.92);
  color: #374151;
  font-size: 12px;
  font-weight: 700;
}
.fr-proposal-status[hidden] {
  display: none !important;
}
.fr-proposal-status.is-error {
  border-color: rgba(180, 35, 24, 0.28);
  background: #fff5f5;
  color: #b42318;
}
.fr-proposal-page {
  padding: 10px;
}
.fr-proposal-page:not(.is-active) {
  display: none;
}
.fr-proposal-navigation {
  position: absolute;
  inset: 52px 0 0;
  z-index: 3;
  pointer-events: none;
}
.fr-proposal-hit {
  position: absolute;
  top: 0;
  bottom: 0;
  -webkit-tap-highlight-color: transparent;
  appearance: none;
  display: flex;
  gap: 8px;
  align-items: center;
  width: 50%;
  border: 0;
  background: transparent;
  color: transparent;
  font: inherit;
  font-weight: 800;
  box-shadow: none;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, background 0.18s ease;
}
.fr-proposal-hit-prev {
  left: 0;
  justify-content: flex-start;
  padding-left: 18px;
}
.fr-proposal-hit-next {
  right: 0;
  justify-content: flex-end;
  padding-right: 18px;
}
.fr-proposal-hit:hover,
.fr-proposal-hit:active,
.fr-proposal-hit:focus {
  border: 0;
  color: transparent;
  box-shadow: none;
  outline: none;
}
.fr-proposal-reader.is-pointer-active.is-pointer-prev .fr-proposal-hit-prev,
.fr-proposal-reader.is-pointer-active.is-pointer-next .fr-proposal-hit-next,
.fr-proposal-hit:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
.fr-proposal-reader.is-pointer-active.is-pointer-prev .fr-proposal-hit-prev,
.fr-proposal-hit-prev:focus-visible {
  background: linear-gradient(90deg, rgba(17, 17, 17, 0.28), rgba(17, 17, 17, 0));
}
.fr-proposal-reader.is-pointer-active.is-pointer-next .fr-proposal-hit-next,
.fr-proposal-hit-next:focus-visible {
  background: linear-gradient(270deg, rgba(17, 17, 17, 0.28), rgba(17, 17, 17, 0));
}
.fr-proposal-hit i,
.fr-proposal-hit span {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.82);
  color: #ffffff;
  opacity: 0;
  transform: translateX(0);
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.fr-proposal-reader.is-pointer-active.is-pointer-prev .fr-proposal-hit-prev i,
.fr-proposal-reader.is-pointer-active.is-pointer-prev .fr-proposal-hit-prev span,
.fr-proposal-reader.is-pointer-active.is-pointer-next .fr-proposal-hit-next i,
.fr-proposal-reader.is-pointer-active.is-pointer-next .fr-proposal-hit-next span,
.fr-proposal-hit:focus i,
.fr-proposal-hit:focus span {
  opacity: 1;
}
.fr-proposal-hit-prev:hover i,
.fr-proposal-hit-prev:focus i {
  transform: translateX(-2px);
}
.fr-proposal-hit-next:hover i,
.fr-proposal-hit-next:focus i {
  transform: translateX(2px);
}
.fr-proposal-hit:disabled {
  cursor: not-allowed;
  pointer-events: none;
}
.fr-proposal-counter {
  justify-self: center;
  color: #5f574c;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}
.fr-proposal-page figcaption {
  padding-top: 8px;
  color: #6b7280;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
@keyframes frProposalProgress {
  0% {
    width: 18%;
  }
  50% {
    width: 74%;
  }
  100% {
    width: 96%;
  }
}
.fr-premium-faq {
  display: grid;
  gap: 10px;
}
.fr-premium-faq article {
  border: 1px solid #eeeeee;
  padding: 14px;
  background: #ffffff;
}
.fr-premium-faq h4 {
  margin: 0 0 6px;
  color: #111111;
  font-size: 16px;
}
.fr-premium-faq p {
  margin: 0;
}
.fr-premium-muted {
  color: #6b7280;
  font-weight: 700;
}
.fr-compare-button {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(17, 17, 17, 0.16);
  border-radius: 999px;
  padding: 8px 13px;
  background: #ffffff;
  color: #111111;
  font-family: Lexend, "DM Sans", Arial, sans-serif;
  font-weight: 800;
  cursor: pointer;
}
.fr-compare-button.is-added {
  background: #cf322e;
  color: #ffffff !important;
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
.fr-brand-contact-floats {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 99;
  display: grid;
  gap: 8px;
  justify-items: end;
}
.fr-brand-contact-float {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-height: 42px;
  border-radius: 999px;
  padding: 9px 14px;
  background: #ffffff;
  color: #111111 !important;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none !important;
  box-shadow: 0 8px 24px rgba(17, 17, 17, 0.18);
}
.fr-brand-contact-float.is-whatsapp i {
  color: #128c7e;
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
@media (max-width: 720px) {
  .franchise-detail-title-row {
    text-align: center;
  }
  .franchise-detail-title-row h1 {
    font-size: clamp(28px, 12vw, 44px) !important;
  }
  .franchise-detail-quickfacts {
    position: sticky;
    top: 0;
    z-index: 40;
    flex-wrap: nowrap;
    margin: 10px -4px 0;
    padding: 6px 4px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .franchise-detail-quickfact {
    min-width: 104px;
    flex: 0 0 auto;
  }
  .franchise-info-heading-row {
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .franchise-info-heading-row h1,
  .franchise-info-heading-copy {
    flex-basis: 100%;
  }
  .franchise-info-panel {
    grid-template-columns: 1fr;
  }
  .franchise-info-logo-card {
    max-width: 280px;
    margin: 0 auto;
  }
  .franchise-info-brand-card {
    max-width: 280px;
    margin: 0 auto;
  }
  .franchise-info-grid {
    grid-template-columns: 1fr;
  }
  .e-n-tabs-heading {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .e-n-tab-title {
    flex: 0 0 auto;
  }
  .fr-detail-tab-cards {
    grid-template-columns: 1fr;
  }
  .fr-claim-sticky {
    justify-content: center;
    text-align: center;
    padding: 10px 12px;
  }
  .fr-owner-cta,
  .fr-premium-lead-panel,
  .fr-proposal-head {
    align-items: stretch;
    flex-direction: column;
  }
  .fr-owner-cta__actions,
  .fr-premium-lead-actions {
    justify-content: stretch;
  }
  .fr-owner-cta__primary,
  .fr-owner-cta__secondary,
  .fr-premium-action,
  .fr-proposal-download {
    width: 100%;
  }
}
</style>`;
}
