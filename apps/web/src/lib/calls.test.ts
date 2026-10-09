import { describe, expect, it } from "vitest";
import { callQueueQuery, currentOf, telHref } from "./calls";

describe("file d'appel (interface)", () => {
  it("requête : à appeler avec téléphone, jamais-appelés d'abord", () => {
    const p = new URLSearchParams(
      callQueueQuery("to-call", { city: " lyon ", qualification: "" }, { limit: 50 }),
    );
    expect(p.get("callState")).toBe("À appeler");
    expect(p.get("hasPhone")).toBe("true");
    expect(p.get("sort")).toBe("calls");
    expect(p.get("city")).toBe("lyon");
    expect(p.has("qualification")).toBe(false);
    expect(
      new URLSearchParams(callQueueQuery("callback", { city: "", qualification: "Chaud" })).get("callState"),
    ).toBe("Répondu");
  });

  it("lien tel: sûr", () => {
    expect(telHref("+33123456789")).toBe("tel:+33123456789");
    expect(telHref("04 11 22 33 44")).toBe("tel:0411223344");
    expect(telHref("javascript:alert(1)")).toBeNull();
    expect(telHref(null)).toBeNull();
    expect(telHref("12")).toBeNull();
  });

  it("prospect courant = premier non passé", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(currentOf(items, [])?.id).toBe("a");
    expect(currentOf(items, ["a"])?.id).toBe("b");
    expect(currentOf(items, ["a", "b", "c"])).toBeNull();
  });
});
