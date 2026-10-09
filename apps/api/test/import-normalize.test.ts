import { describe, expect, it } from "vitest";
import {
  extractCityAndPostalCode,
  nameKey,
  normalizeCountry,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeService,
  parseCheckbox,
  parseFrDate,
  parseFrDateTime,
  parseInteger,
} from "../src/import/normalize";

describe("normalisation des données de l'ancienne base", () => {
  it("domaines : retire protocole, www, chemin, paramètres et port", () => {
    expect(normalizeDomain("https://www.Exemple.fr/contact?a=1")).toBe("exemple.fr");
    expect(normalizeDomain("http://exemple.fr:8080/")).toBe("exemple.fr");
    expect(normalizeDomain("exemple.fr")).toBe("exemple.fr");
    expect(normalizeDomain("pas un site")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
  });

  it("téléphones : national → +33 ; international conservé ; le reste refusé", () => {
    expect(normalizePhone("01 23 45 67 89")).toBe("+33123456789");
    expect(normalizePhone("+33 1 23 45 67 89")).toBe("+33123456789");
    expect(normalizePhone("0033123456789")).toBe("+33123456789");
    expect(normalizePhone("33123456789")).toBe("+33123456789");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("e-mails : minuscules et format vérifié", () => {
    expect(normalizeEmail("  Jean.Dupont@Exemple.FR ")).toBe("jean.dupont@exemple.fr");
    expect(normalizeEmail("pas-un-email")).toBeNull();
    expect(normalizeEmail("a@b.c")).toBeNull();
  });

  it("clés de nom : sans accents ni ponctuation", () => {
    expect(nameKey("  Électricité  Dupont & Fils ")).toBe("electricite dupont fils");
    expect(nameKey(null)).toBe("");
  });

  it("dates françaises", () => {
    expect(parseFrDate("21/9/2026")).toBe("2026-09-21");
    expect(parseFrDate("31/2/2026")).toBeNull();
    expect(parseFrDate("2026-09-21")).toBeNull();
    expect(parseFrDateTime("24/9/2026 3:05pm", "-04:00")?.toISOString()).toBe("2026-09-24T19:05:00.000Z");
    expect(parseFrDateTime("24/9/2026 12:10am", "-04:00")?.toISOString()).toBe("2026-09-24T04:10:00.000Z");
    expect(parseFrDateTime("24/9/2026 12:10pm", "-04:00")?.toISOString()).toBe("2026-09-24T16:10:00.000Z");
    expect(parseFrDateTime("n'importe quoi", "-04:00")).toBeNull();
  });

  it("entiers : strictement numériques", () => {
    expect(parseInteger("355000")).toBe(355000);
    expect(parseInteger("11-20")).toBeNull();
    expect(parseInteger("")).toBeNull();
    expect(parseInteger("99999999999")).toBeNull();
  });

  it("cases à cocher : vrai / faux si mesuré / inconnu sinon", () => {
    expect(parseCheckbox("checked", false)).toBe(true);
    expect(parseCheckbox("", true)).toBe(false);
    expect(parseCheckbox("", false)).toBeNull();
  });

  it("pays", () => {
    expect(normalizeCountry("Fra")).toBe("FR");
    expect(normalizeCountry("France")).toBe("FR");
    expect(normalizeCountry("")).toBe("FR");
    expect(normalizeCountry("Belgique")).toBe("Belgique");
  });

  it("services : 25 formulations libres → 3 services", () => {
    const google = [
      "Google Ads",
      "Google Ads (Search)",
      "Google Ads (Shopping/PMax)",
      "Google Ads + mise en place du tracking",
      "Google Ads Search + Tracking",
      "Google Ads Shopping / Performance Max + Mise en place du tracking",
      "Google Ads géré",
    ];
    for (const raw of google) expect(normalizeService(raw, true).service).toBe("Google Ads");
    expect(normalizeService("Google Ads", true).detail).toBeNull();
    expect(normalizeService("Google Ads (Search) + Mise en place du tracking", true).detail).toBe(
      "Google Ads (Search) + Mise en place du tracking",
    );
    expect(normalizeService("Création de site", false).service).toBe("Création de site");
    expect(normalizeService("Création / refonte de site", true).service).toBe("Refonte de site");
    expect(normalizeService("Création / Refonte de site", false).service).toBe("Création de site");
    expect(normalizeService("SEO complet", true)).toEqual({ service: null, detail: "SEO complet" });
    expect(normalizeService("", true)).toEqual({ service: null, detail: null });
  });
});

describe("ville et code postal déduits de l'adresse", () => {
  it("adresse type Google Maps", () => {
    expect(extractCityAndPostalCode("12 rue des Lilas, 44000 Nantes")).toEqual({
      postalCode: "44000",
      city: "Nantes",
    });
    expect(extractCityAndPostalCode("3 av. de la République, 75011 Paris, France")).toEqual({
      postalCode: "75011",
      city: "Paris",
    });
    expect(extractCityAndPostalCode("Zone artisanale, 13090 Aix-en-Provence")).toEqual({
      postalCode: "13090",
      city: "Aix-en-Provence",
    });
  });
  it("adresse type LinkedIn : code postal seul", () => {
    expect(
      extractCityAndPostalCode("3, Rue Ledru-Rollin, St.-Maur-des-Fossés, Île-de-France 94100, FR"),
    ).toEqual({ postalCode: "94100", city: null });
  });
  it("adresse absente ou sans code postal", () => {
    expect(extractCityAndPostalCode("")).toEqual({ postalCode: null, city: null });
    expect(extractCityAndPostalCode("quelque part")).toEqual({ postalCode: null, city: null });
  });
});
