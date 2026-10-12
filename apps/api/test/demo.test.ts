import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { companies, contacts, emailMessages, leads, suppressions } from "../src/db/schema";
import { applyDemo } from "../src/demo/apply";
import { buildDemo, plusAddress, toInternational } from "../src/demo/data";
import { createTestApp, createUser, login, resetDb, type TestApp, withOrigin } from "./helpers";

describe("données de démonstration", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t));

  // Adresses et numéros fictifs : le test n'utilise jamais de coordonnées réelles.
  const demo = () =>
    buildDemo({
      emails: ["boite-a@exemple.test", "boite-b@exemple.test"],
      phones: ["0612345678", "0345125754"],
    });

  it("décline les adresses et reconnaît les numéros français et malgaches", () => {
    expect(plusAddress("Boite.A@Exemple.Test", "lumiere")).toBe("boite.a+lumiere@exemple.test");
    expect(plusAddress("boite+ancien@exemple.test", "x")).toBe("boite+x@exemple.test");
    expect(toInternational("0612345678")).toBe("+33612345678");
    expect(toInternational("0345125754")).toBe("+261345125754");
    expect(() => toInternational("12")).toThrow();
  });

  it("n'envoie qu'aux adresses fournies et reste cohérent", async () => {
    await createUser(t, "ADMIN");
    await applyDemo(t.db, demo(), { reset: false });
    const all = await t.db.select({ email: contacts.email }).from(contacts);
    expect(all.length).toBeGreaterThan(15);
    for (const c of all)
      expect(c.email === null || /^boite-[ab]\+[a-z]+@exemple\.test$/.test(c.email)).toBe(true);
    const mails = await t.db.select().from(emailMessages);
    expect(
      mails.filter((m) => m.validation === "Pas Validé" && m.status === null).length,
    ).toBeGreaterThanOrEqual(5);
    expect(mails.some((m) => m.sendingAt && m.status === null)).toBe(true);
    expect((await t.db.select().from(suppressions)).length).toBeGreaterThanOrEqual(3);
    const phones = (await t.db.select({ p: companies.phone }).from(companies)).map((c) => c.p);
    expect(new Set(phones)).toEqual(new Set(["+33612345678", "+261345125754"]));
  });

  it("refuse d'écraser une base non vide sans --reset, puis la vide proprement", async () => {
    await applyDemo(t.db, demo(), { reset: false });
    await expect(applyDemo(t.db, demo(), { reset: false })).rejects.toThrow(/déjà des leads/);
    await applyDemo(t.db, demo(), { reset: true });
    expect(await t.db.$count(leads)).toBe(demo().leads.length);
  });

  it("les écrans en tirent parti : file d'appel, pipeline et tableau de bord", async () => {
    const admin = await createUser(t, "ADMIN");
    await applyDemo(t.db, demo(), { reset: false });
    const cookie = await login(t, admin.email);
    const get = async (url: string) =>
      (await t.app.inject({ method: "GET", url, headers: withOrigin(cookie) })).json();
    const board = await get("/pipeline");
    expect(board.stages.filter((s: { count: number }) => s.count > 0).length).toBeGreaterThanOrEqual(7);
    expect(board.unstaged).toBe(1);
    expect((await get("/leads?callState=%C3%80%20appeler&hasPhone=true")).total).toBeGreaterThan(10);
    const dash = await get("/dashboard");
    expect(JSON.stringify(dash).length).toBeGreaterThan(50);
  });
});
