export interface SiteSignals {
  cms: string | null;
  isEcommerce: boolean;
  hasGtm: boolean;
  hasGa4: boolean;
  hasMetaPixel: boolean;
  hasGoogleAds: boolean;
  /** Balise « viewport » : le site s'adapte au mobile. */
  hasViewport: boolean;
  hasSsl: boolean;
}

const CMS_RULES: Array<[string, RegExp]> = [
  ["Shopify", /cdn\.shopify\.com|myshopify\.com|Shopify\.theme/i],
  ["WooCommerce", /woocommerce/i],
  ["WordPress", /\/wp-content\/|\/wp-includes\/|content=["']WordPress/i],
  ["Wix", /static\.wixstatic\.com|wix\.com\/|content=["']Wix/i],
  ["Squarespace", /squarespace\.com|static1\.squarespace/i],
  ["PrestaShop", /prestashop/i],
  ["Magento", /Magento|\/static\/version\d+\//i],
  ["Webflow", /webflow\.com|data-wf-site/i],
  ["Joomla", /content=["']Joomla|\/media\/jui\//i],
  ["Drupal", /content=["']Drupal|\/sites\/default\/files\//i],
  ["Jimdo", /jimdo(?:cdn|free)\.com/i],
];
const SHOP_CMS = new Set(["Shopify", "WooCommerce", "PrestaShop", "Magento"]);

/** Signaux d'un site déduits de sa page d'accueil. Rien n'est inventé : une détection ratée donne « non » ou « aucun CMS ». */
export function analyzeHtml(html: string, finalUrl: string): SiteSignals {
  const head = html.slice(0, 400_000);
  const cms = CMS_RULES.find(([, re]) => re.test(head))?.[0] ?? null;
  const shop =
    (cms !== null && SHOP_CMS.has(cms)) ||
    /add[-_ ]to[-_ ]cart|ajouter au panier|\/panier\b|\/cart\b/i.test(head);
  return {
    cms,
    isEcommerce: shop,
    hasGtm: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i.test(head),
    hasGa4: /gtag\/js\?id=G-|["']G-[A-Z0-9]{8,}["']/i.test(head),
    hasMetaPixel: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*["']init["']/i.test(head),
    hasGoogleAds: /googleadservices\.com|["']AW-\d{6,}["']/i.test(head),
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(head),
    hasSsl: finalUrl.startsWith("https://"),
  };
}
