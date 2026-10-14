import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { companies } from "../db/schema";
import { analyzeHtml } from "./analyze";
import type { SiteFetcher } from "./safe-fetch";

const FRESH_DAYS = 30;

/**
 * Analyse la page d'accueil du site d'une entreprise et enregistre ce qui s'y voit (CMS, SSL, mobile, suivi, e-commerce).
 * Une valeur déjà connue (import, saisie) n'est jamais écrasée ; une analyse de moins de 30 jours n'est pas refaite.
 * Un site injoignable est noté « unreachable » : c'est une information pour la qualification, pas une erreur.
 */
export async function enrichCompany(
  db: Db,
  fetcher: SiteFetcher,
  companyId: string,
  now = new Date(),
): Promise<"analyzed" | "fresh" | "no_website"> {
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!c?.domain) return "no_website";
  if (c.siteCheckedAt && now.getTime() - c.siteCheckedAt.getTime() < FRESH_DAYS * 86_400_000) return "fresh";

  // https d'abord ; à défaut http (le site n'a alors pas de certificat valable : c'est un défaut à signaler)
  let res = await fetcher(`https://${c.domain}/`);
  if (!res || res.status >= 400) {
    const plain = await fetcher(`http://${c.domain}/`);
    res = plain && plain.status < 400 ? plain : null;
  }
  if (!res || res.status >= 400) {
    await db
      .update(companies)
      .set({ siteStatus: "unreachable", siteCheckedAt: now })
      .where(eq(companies.id, companyId));
    return "analyzed";
  }
  const s = analyzeHtml(res.html, res.url);
  await db
    .update(companies)
    .set({
      siteStatus: "ok",
      siteCheckedAt: now,
      cms: c.cms ?? s.cms,
      isEcommerce: c.isEcommerce ?? s.isEcommerce,
      hasGtm: c.hasGtm ?? s.hasGtm,
      hasGa4: c.hasGa4 ?? s.hasGa4,
      hasMetaPixel: c.hasMetaPixel ?? s.hasMetaPixel,
      hasGoogleAds: c.hasGoogleAds ?? s.hasGoogleAds,
      hasSsl: c.hasSsl ?? s.hasSsl,
      hasViewport: c.hasViewport ?? s.hasViewport,
      updatedAt: now,
    })
    .where(eq(companies.id, companyId));
  return "analyzed";
}
