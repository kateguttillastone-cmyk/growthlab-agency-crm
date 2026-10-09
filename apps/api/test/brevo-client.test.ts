import { describe, expect, it } from "vitest";
import { brevoSender, type OutgoingMail } from "../src/mail/brevo";

const mail = (over: Partial<OutgoingMail> = {}): OutgoingMail => ({
  to: "dest@exemple.fr",
  from: { name: "Equipe", email: "equipe@exemple.fr" },
  subject: "Objet",
  html: "<p>Bonjour</p>",
  text: "Bonjour",
  headers: {},
  tags: [],
  ...over,
});

/** fetch fictif : mémorise la requête et renvoie la réponse voulue. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("client Brevo", () => {
  it("n'envoie ni « headers » ni « tags » quand ils sont vides (Brevo les refuse : « headers is blank »)", async () => {
    const f = fakeFetch(201, { messageId: "<id@brevo>" });
    const r = await brevoSender("cle-test", 1000, f.impl).send(mail());
    expect(r).toEqual({ kind: "sent", messageId: "<id@brevo>" });
    const body = JSON.parse(String(f.calls[0]?.init.body));
    expect(body).not.toHaveProperty("headers");
    expect(body).not.toHaveProperty("tags");
    expect(body).toMatchObject({
      sender: { email: "equipe@exemple.fr" },
      to: [{ email: "dest@exemple.fr" }],
    });
  });

  it("transmet les en-têtes et étiquettes quand ils existent, et la clé dans l'en-tête api-key", async () => {
    const f = fakeFetch(201, { messageId: "<id@brevo>" });
    await brevoSender("cle-test", 1000, f.impl).send(
      mail({ headers: { "List-Unsubscribe": "<mailto:a@b.fr>" }, tags: ["gac"] }),
    );
    const body = JSON.parse(String(f.calls[0]?.init.body));
    expect(body.headers).toEqual({ "List-Unsubscribe": "<mailto:a@b.fr>" });
    expect(body.tags).toEqual(["gac"]);
    const sentHeaders = (f.calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(sentHeaders["api-key"]).toBe("cle-test");
  });

  it("classe les réponses : refus définitif, panne à réessayer, réponse illisible = incertain, sans fuite de la clé", async () => {
    const send = (status: number, body: unknown) =>
      brevoSender("cle-secrete-xyz", 1000, fakeFetch(status, body).impl).send(mail());
    expect(await send(400, { message: "headers is blank" })).toEqual({
      kind: "rejected",
      permanent: true,
      reason: "Brevo 400 : headers is blank",
    });
    expect(await send(401, { message: "Key not found" })).toMatchObject({
      kind: "rejected",
      permanent: true,
    });
    expect(await send(429, {})).toMatchObject({ kind: "rejected", permanent: false });
    expect(await send(503, "")).toMatchObject({ kind: "rejected", permanent: false });
    expect(await send(201, "pas du json")).toMatchObject({ kind: "uncertain" });
    const all = JSON.stringify([await send(400, { message: "x" }), await send(201, "")]);
    expect(all).not.toContain("cle-secrete-xyz");
  });

  it("un échec réseau ou un délai dépassé est incertain", async () => {
    const boom = (async () => {
      throw Object.assign(new Error("x"), { name: "TimeoutError" });
    }) as unknown as typeof fetch;
    expect(await brevoSender("k", 10, boom).send(mail())).toEqual({
      kind: "uncertain",
      reason: "délai dépassé",
    });
    const cut = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await brevoSender("k", 10, cut).send(mail())).toEqual({
      kind: "uncertain",
      reason: "coupure réseau",
    });
  });
});
