/** Version du prompt, enregistrée avec chaque e-mail rédigé : permet de comparer deux versions sur les résultats. */
export const PROMPT_VERSION = "v5-2026-10-13";

export interface LeadContext {
  company: {
    name: string;
    sector: string | null;
    employees: number | null;
    city: string | null;
    website: string | null;
    googleRating: number | null;
    googleReviews: number | null;
    organicTraffic: number | null;
    cms: string | null;
    isEcommerce: boolean | null;
    hasSsl: boolean | null;
    hasGoogleAds: boolean | null;
    hasGa4: boolean | null;
    hasMetaPixel: boolean | null;
  };
  contact: { firstName: string | null; lastName: string | null; jobTitle: string | null } | null;
}

const known = (v: unknown): string => (v === null || v === undefined ? "non mesuré" : String(v));
const yesNo = (v: boolean | null): string => (v === null ? "non mesuré" : v ? "oui" : "non");

export const SCORING_SYSTEM = `Tu es l'assistant commercial de GrowthLab Agency, une petite agence française qui aide les TPE et PME locales à obtenir plus de demandes grâce à leur site et à Google Ads.

Pour chaque prospect, tu fais deux choses : (1) le qualifier, (2) rédiger un premier e-mail de prospection court.

RÈGLES DE QUALIFICATION
- segment : « E-commerçant » si le site vend en ligne (e-commerce oui, ou CMS de vente en ligne), sinon « PME/TPE ».
- service d'entrée : UNIQUEMENT « Création de site » / « Refonte de site » (si le site est inaccessible, sans SSL, non adapté au mobile ou sans CMS) OU « Google Ads » (tous les autres cas). Ne propose jamais de SEO complet ni de publicité Meta. Une information « non mesuré » n'est jamais un défaut : en cas de doute, choisis « Google Ads ».
- qualification : « Chaud » (5 à 50 salariés et besoin clair), « Tiède » (1 à 5 salariés, ou 50 à 200 avec un bon besoin), « Froid » (200 salariés ou plus, ou site déjà bien optimisé). Effectif inconnu : « Tiède » au plus.
- qualificationReason : une phrase factuelle appuyée sur les données fournies, jamais inventée.

RÈGLES DE L'E-MAIL
- Français, vouvoiement, texte brut, 90 à 140 mots, paragraphes séparés par une ligne vide.
- Commence par « Bonjour {prénom}, » (ou « Bonjour, » sans prénom). Termine par une formule de politesse seule (« Bien cordialement, »). N'écris NI signature NI lien NI adresse NI numéro : ils sont ajoutés automatiquement.
- Un seul besoin, une seule question simple en fin de message (un échange de 15 minutes).
- Ne cite jamais les backlinks, les mots-clés, l'autorité de domaine. Ne cite le trafic organique que s'il est strictement supérieur à zéro.
- N'invente aucun chiffre, aucun résultat client, aucune promesse de classement. Appuie-toi seulement sur les données fournies (note et avis Google, secteur, ville, état du site).
- Ton sobre et humain, sans exclamation ni formule marketing, sans emoji.
- L'objet : 40 à 70 caractères, concret, sans majuscules inutiles ni point d'exclamation.`;

export function scoringUser(c: LeadContext): string {
  const k = c.company;
  const p = c.contact;
  return [
    "Données du prospect (certaines peuvent être « non mesuré ») :",
    `- Entreprise : ${k.name}`,
    `- Secteur : ${known(k.sector)}`,
    `- Salariés : ${known(k.employees)}`,
    `- Ville : ${known(k.city)}`,
    `- Site web : ${known(k.website)}`,
    `- Note Google : ${known(k.googleRating)} (${known(k.googleReviews)} avis)`,
    `- Trafic organique mensuel : ${known(k.organicTraffic)}`,
    `- CMS : ${known(k.cms)}`,
    `- E-commerce : ${yesNo(k.isEcommerce)}`,
    `- SSL : ${yesNo(k.hasSsl)}`,
    `- Publicité Google Ads détectée : ${yesNo(k.hasGoogleAds)}`,
    `- Google Analytics 4 : ${yesNo(k.hasGa4)}`,
    `- Pixel Meta : ${yesNo(k.hasMetaPixel)}`,
    `- Contact : ${p ? [p.firstName, p.lastName].filter(Boolean).join(" ") || "sans nom" : "aucun"}${p?.jobTitle ? `, ${p.jobTitle}` : ""}`,
    "",
    "Enregistre le résultat avec l'outil.",
  ].join("\n");
}

export const REWRITE_SYSTEM = `Tu réécris un e-mail de prospection de GrowthLab Agency selon la consigne de l'utilisateur.
Garde : français, vouvoiement, texte brut, paragraphes séparés par une ligne vide, formule de politesse finale seule, aucune signature, aucun lien, aucune promesse chiffrée inventée, aucune mention des backlinks, mots-clés ou autorité de domaine. Ne change pas les faits. L'objet reste concret (40 à 70 caractères).`;

export function rewriteUser(subject: string, body: string, instruction: string): string {
  return [
    "Consigne :",
    instruction,
    "",
    "Objet actuel :",
    subject,
    "",
    "Corps actuel :",
    body,
    "",
    "Enregistre l'e-mail réécrit avec l'outil.",
  ].join("\n");
}
