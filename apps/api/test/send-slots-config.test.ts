import { describe, expect, it } from "vitest";
import { maskSecretPaths } from "../src/app";
import { loadConfig } from "../src/config";
import { inSlot, nextSlotStart, parisClock, parseSlots } from "../src/mail/slots";
import { testEnv } from "./helpers";

const slots = parseSlots("mon@14:00,tue@09:00,wed@09:00,thu@09:00");

describe("créneaux d'envoi", () => {
  it("refuse un créneau mal écrit ou vide", () => {
    expect(() => parseSlots("lundi@14h")).toThrow(/créneau/);
    expect(() => parseSlots("mon@25:00")).toThrow(/créneau/);
    expect(() => parseSlots("")).toThrow(/vide/);
  });

  it("ouvre le créneau de son début à la fin de la fenêtre (heure de Paris, été et hiver)", () => {
    // mardi 14 juillet 2026, 09:00 à Paris = 07:00 UTC (heure d'été)
    expect(inSlot(new Date("2026-07-14T06:59:00Z"), slots, 120)).toBe(false);
    expect(inSlot(new Date("2026-07-14T07:00:00Z"), slots, 120)).toBe(true);
    expect(inSlot(new Date("2026-07-14T08:59:00Z"), slots, 120)).toBe(true);
    expect(inSlot(new Date("2026-07-14T09:00:00Z"), slots, 120)).toBe(false);
    // mardi 13 janvier 2026, 09:00 à Paris = 08:00 UTC (heure d'hiver)
    expect(inSlot(new Date("2026-01-13T07:59:00Z"), slots, 120)).toBe(false);
    expect(inSlot(new Date("2026-01-13T08:00:00Z"), slots, 120)).toBe(true);
  });

  it("ferme le vendredi, le week-end et le lundi matin", () => {
    expect(inSlot(new Date("2026-07-17T07:30:00Z"), slots, 120)).toBe(false); // vendredi
    expect(inSlot(new Date("2026-07-18T07:30:00Z"), slots, 120)).toBe(false); // samedi
    expect(inSlot(new Date("2026-07-13T07:30:00Z"), slots, 120)).toBe(false); // lundi 09:30
    expect(inSlot(new Date("2026-07-13T12:30:00Z"), slots, 120)).toBe(true); // lundi 14:30
  });

  it("calcule l'heure à Paris et le prochain créneau", () => {
    expect(parisClock(new Date("2026-07-14T07:05:00Z"))).toEqual({ day: 2, minutes: 9 * 60 + 5 });
    expect(nextSlotStart(new Date("2026-07-17T10:00:00Z"), slots)?.toISOString()).toBe(
      "2026-07-20T12:00:00.000Z",
    );
  });
});

describe("configuration de l'envoi", () => {
  const prod = {
    SEND_MODE: "prod",
    APP_ORIGIN: "https://crm.exemple.fr",
    BREVO_API_KEY: "cle-de-test-non-reelle",
    BREVO_WEBHOOK_SECRET: "w".repeat(32),
    UNSUBSCRIBE_SECRET: "u".repeat(40),
    SEND_TEST_RECIPIENT: "test@exemple.fr",
    MAIL_FROM_ADDRESS: "equipe@exemple.fr",
  };

  it("est désactivé par défaut", () => {
    const c = loadConfig(testEnv());
    expect(c.SEND_MODE).toBe("off");
    expect(c.SEND_DAILY_CAP).toBe(50);
  });

  it("le mode prod exige clé, secrets, adresse de test et expéditeur choisi", () => {
    expect(() => loadConfig(testEnv({ SEND_MODE: "prod" }))).toThrow(/BREVO_API_KEY/);
    expect(() => loadConfig(testEnv({ ...prod, MAIL_FROM_ADDRESS: "" }))).toThrow(/MAIL_FROM_ADDRESS/);
    expect(() => loadConfig(testEnv({ ...prod, UNSUBSCRIBE_SECRET: "court" }))).toThrow();
    expect(() => loadConfig(testEnv({ ...prod, APP_ORIGIN: "http://localhost:5173" }))).toThrow(/https/);
    expect(() => loadConfig(testEnv({ ...prod, SEND_SLOTS: "bientôt" }))).toThrow(/créneau/);
    expect(loadConfig(testEnv(prod)).SEND_MODE).toBe("prod");
  });
});

describe("journaux", () => {
  it("masque les jetons secrets des adresses", () => {
    expect(maskSecretPaths("/webhooks/brevo/abcdef123456?x=1")).toBe("/webhooks/brevo/…?x=1");
    expect(maskSecretPaths("/unsubscribe/YWJj.sig")).toBe("/unsubscribe/…");
    expect(maskSecretPaths("/leads?q=a")).toBe("/leads?q=a");
  });
});
