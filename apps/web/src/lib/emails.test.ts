import { describe, expect, it } from "vitest";
import { bulkFilter, nextAfter, queueQuery } from "./emails";

const base = { tab: "review" as const, q: "", qualification: "", promptVersion: "" };

describe("file de relecture", () => {
  it("à relire : non validés, avec adresse, non envoyés, plus chauds d'abord", () => {
    const p = new URLSearchParams(queueQuery(base, { limit: 25 }));
    expect(p.get("validation")).toBe("Pas Validé");
    expect(p.get("hasEmail")).toBe("true");
    expect(p.get("emailStatus")).toBe("none");
    expect(p.get("sort")).toBe("qualification");
    expect(p.get("limit")).toBe("25");
  });

  it("validés : jamais ceux déjà envoyés", () => {
    const p = new URLSearchParams(queueQuery({ ...base, tab: "validated" }));
    expect(p.get("validation")).toBe("Validé");
    expect(p.get("emailStatus")).toBe("none");
  });

  it("ajoute recherche, qualification et version de prompt, sans valeurs vides", () => {
    const p = new URLSearchParams(
      queueQuery({ ...base, q: " alpha ", qualification: "Chaud", promptVersion: "v4" }),
    );
    expect(p.get("q")).toBe("alpha");
    expect(p.get("qualification")).toBe("Chaud");
    expect(p.get("promptVersion")).toBe("v4");
    expect(new URLSearchParams(queueQuery(base)).has("q")).toBe(false);
  });

  it("le filtre groupé ne contient que les critères choisis", () => {
    expect(bulkFilter(base)).toEqual({});
    expect(bulkFilter({ ...base, qualification: "Chaud", promptVersion: "v4" })).toEqual({
      qualification: "Chaud",
      promptVersion: "v4",
    });
  });

  it("choisit l'élément suivant, sinon le précédent", () => {
    expect(nextAfter(["a", "b", "c"], "a")).toBe("b");
    expect(nextAfter(["a", "b", "c"], "c")).toBe("b");
    expect(nextAfter(["a"], "a")).toBeNull();
    expect(nextAfter(["a", "b"], "z")).toBe("a");
  });
});
