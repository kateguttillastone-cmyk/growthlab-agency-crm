#!/usr/bin/env node
/**
 * Audit d'interface : débordements horizontaux, barres de défilement parasites, contenu masqué par la barre
 * du bas, erreurs de console. Il parcourt chaque page, par rôle, thème et taille d'écran, dans plusieurs états
 * (fiche ouverte, panneaux dépliés…) et liste ce qui sort des limites.
 *
 * Prérequis : l'application tourne (API + web) sur une base de DÉMONSTRATION, et Playwright est installé.
 * Aucun secret dans le dépôt : les comptes passent par l'environnement.
 *
 *   AUDIT_BASE=http://localhost:5173 \
 *   AUDIT_ACCOUNTS='[{"role":"ADMIN","email":"…","password":"…"},{"role":"VIEWER","email":"…","password":"…"}]' \
 *   node scripts/audit-ui.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:5173";
const ACCOUNTS = JSON.parse(process.env.AUDIT_ACCOUNTS ?? "[]");
if (ACCOUNTS.length === 0) {
  console.error("AUDIT_ACCOUNTS est vide : fournissez au moins un compte (voir l'en-tête du script).");
  process.exit(2);
}

const VIEWPORTS = [
  [360, 640],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 820],
  [1920, 1080],
];
const THEMES = ["light", "dark"];
const PAGES = [
  "/",
  "/leads",
  "/pipeline",
  "/emails",
  "/calls",
  "/sourcing",
  "/users",
  "/suppressions",
  "/settings",
  "/import",
  "/audit",
  "/audit-requests",
  "/profile",
  "/leads/new",
];

/** États à ouvrir sur certaines pages (clics tolérants : un bouton absent est ignoré). */
const STATES = {
  "/leads": [["Plus de filtres"], ["Vues"], ["Actions groupées"]],
  "/emails": [["Suivi de l'envoi"], ["Validation groupée"]],
  "/sourcing": [["Nouvelle recherche"]],
};

const measure = () => {
  const vw = innerWidth;
  const vh = innerHeight;
  const out = { hOverflow: document.documentElement.scrollWidth - vw, vScrollers: [], clipped: [] };
  const scrolls = (e) => {
    const c = getComputedStyle(e);
    return (
      (c.overflowY === "auto" || c.overflowY === "scroll") &&
      e.scrollHeight > e.clientHeight + 1 &&
      e.clientHeight > 0
    );
  };
  for (const e of document.querySelectorAll("body *")) {
    // le menu latéral peut défiler sur écran très peu haut ; le Pipeline défile volontairement colonne par colonne
    if (e.closest("nav.sidebar") && vh < 800) continue;
    if (e.closest("[aria-label^='Étape']") || e.querySelector("[aria-label^='Étape']")) continue;
    if (scrolls(e))
      out.vScrollers.push(
        `${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 2).join(".")}`,
      );
  }
  if (document.documentElement.scrollHeight > vh + 1) out.vScrollers.unshift("(page)");
  // éléments visibles qui dépassent à droite sans être dans une zone qui défile en largeur
  for (const e of document.querySelectorAll("body *")) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.right <= vw + 1) continue;
    let p = e.parentElement;
    let inside = false;
    while (p) {
      const c = getComputedStyle(p);
      if (c.overflowX === "auto" || c.overflowX === "scroll" || c.overflowX === "hidden") {
        inside = true;
        break;
      }
      p = p.parentElement;
    }
    if (!inside && getComputedStyle(e).position !== "fixed")
      out.clipped.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}`);
  }
  // fin de page cachée par la barre du bas (mobile)
  const bar = document.querySelector("nav.bottombar");
  const main = document.querySelector("main");
  out.hiddenByBar = false;
  if (bar && main && getComputedStyle(bar.parentElement).display !== "none") {
    scrollTo(0, document.documentElement.scrollHeight);
    const last = [...main.querySelectorAll("*")]
      .filter(
        (x) =>
          x.getBoundingClientRect().height > 0 &&
          !x.closest("details:not([open]) > :not(summary)") &&
          !x.closest(".sr-only"),
      )
      .pop();
    if (last) out.hiddenByBar = last.getBoundingClientRect().bottom > bar.getBoundingClientRect().top + 1;
  }
  return out;
};

const problems = [];
const browser = await chromium.launch();
for (const acc of ACCOUNTS) {
  for (const theme of THEMES) {
    for (const [w, h] of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        colorScheme: theme,
        hasTouch: w < 768,
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      page.on(
        "console",
        (m) =>
          m.type() === "error" &&
          !m.text().includes("401") &&
          !m.text().includes("403") &&
          errs.push(m.text()),
      );
      await page.goto(`${BASE}/login`);
      await page
        .getByLabel(/e-mail|adresse/i)
        .first()
        .fill(acc.email);
      await page.getByLabel("Mot de passe", { exact: true }).fill(acc.password);
      await page.getByRole("button", { name: /se connecter/i }).click();
      await page.waitForTimeout(900);
      for (const path of PAGES) {
        await page.goto(BASE + path);
        await page.waitForTimeout(700);
        const denied = await page.getByText("Accès refusé").count();
        if (denied) continue;
        const steps = [[]].concat(STATES[path] ?? []);
        for (const step of steps) {
          for (const label of step) {
            await page
              .getByRole("button", { name: label, exact: true })
              .first()
              .click({ timeout: 800 })
              .catch(() => {});
          }
          await page.waitForTimeout(250);
          const m = await page.evaluate(measure);
          const where = `${acc.role} ${theme} ${w}×${h} ${path}${step.length ? ` [${step.join(" > ")}]` : ""}`;
          if (m.hOverflow > 0) problems.push(`${where} : la page défile en largeur de ${m.hOverflow} px`);
          if (m.clipped.length)
            problems.push(`${where} : éléments hors écran ${[...new Set(m.clipped)].slice(0, 4).join(", ")}`);
          // plus d'une zone qui défile en même temps = barres imbriquées (la page + une zone d'écran sont tolérées)
          const inner = m.vScrollers.filter((s) => s !== "(page)");
          if (inner.length > 1 && w >= 768)
            problems.push(
              `${where} : ${inner.length} zones défilent en même temps (${inner.slice(0, 3).join(" | ")})`,
            );
          if (
            inner.length > 0 &&
            m.vScrollers.includes("(page)") &&
            w >= 1024 &&
            path !== "/leads" &&
            path !== "/audit" &&
            path !== "/users"
          )
            problems.push(`${where} : barre de page ET barre de zone (${inner[0]})`);
          if (m.hiddenByBar) problems.push(`${where} : fin de page masquée par la barre du bas`);
        }
      }
      if (errs.length)
        problems.push(
          `${acc.role} ${theme} ${w}×${h} : erreurs de console ${[...new Set(errs)].slice(0, 2).join(" / ")}`,
        );
      await ctx.close();
    }
  }
}
await browser.close();
const unique = [...new Set(problems)];
console.log(
  unique.length === 0
    ? "Aucun défaut d'affichage détecté."
    : `${unique.length} défaut(s) :\n- ${unique.join("\n- ")}`,
);
process.exit(unique.length === 0 ? 0 : 1);
