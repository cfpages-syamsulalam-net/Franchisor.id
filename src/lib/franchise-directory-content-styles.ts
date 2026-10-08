export const FRANCHISE_DIRECTORY_CONTENT_STYLES = `<style id="franchise-directory-content-css">
.fr-directory-hero-subheading {
  max-width: 760px;
  margin: 10px auto 0;
  color: #3f3f3f;
  font-family: "DM Sans", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  text-align: center;
}
.fr-category-guide__header {
  margin-bottom: 12px;
}
.fr-category-guide__header > span {
  display: block;
  margin-bottom: 4px;
  color: #6a5200;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}
.fr-category-guide__header h2 {
  margin: 0;
  color: #171717;
  font-size: 24px;
  line-height: 1.25;
}
.fr-category-decision-list {
  margin: 16px 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 18px;
  list-style: none;
}
.fr-category-decision-list li {
  min-width: 0;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 2px solid #cf322e;
}
.fr-category-decision-list strong {
  color: #171717;
  font-size: 14px;
}
.fr-category-decision-list span {
  color: #4f4f4f;
  font-size: 13px;
  line-height: 1.5;
}
.fr-category-related-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.fr-category-related-links a {
  min-width: 0;
  padding: 6px 12px;
  border: 1px solid #e4e4e7;
  border-radius: 4px;
  background: #ffffff;
  color: #3f3f46 !important;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  text-decoration: none !important;
  transition: all 0.2s ease;
}
.fr-category-related-links a:hover {
  background: #f4f4f5;
  border-color: #cf322e;
  color: #cf322e !important;
}
.fr-buyer-cta {
  margin-top: 16px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #cf322e;
  color: #ffffff;
}
.fr-buyer-cta > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.fr-buyer-cta strong {
  font-size: 15px;
}
.fr-buyer-cta span {
  font-size: 13px;
  line-height: 1.4;
}
.fr-buyer-cta a {
  min-height: 38px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 12px;
  background: #111111;
  color: #ffffff !important;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  text-align: center;
  text-decoration: none !important;
}
@media (max-width: 760px) {
  .fr-directory-hero-subheading {
    font-size: 14px;
  }
  .fr-category-guide__header h2 {
    font-size: 20px;
  }
  .fr-category-decision-list {
    grid-template-columns: 1fr;
  }
  .fr-buyer-cta {
    align-items: stretch;
    flex-direction: column;
  }
  .fr-buyer-cta a {
    width: 100%;
  }
}
</style>`;
