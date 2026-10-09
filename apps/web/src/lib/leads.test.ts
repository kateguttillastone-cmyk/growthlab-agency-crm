import { describe, expect, it } from "vitest";
import {
  activePreset,
  contactName,
  displayPhone,
  filtersFromParams,
  formatNumber,
  PRESETS,
  toQueryString,
  triState,
} from "./leads";

describe("filtres de leads dans l'adresse", () => {
  it("relit les filtres valides et ignore tout le reste", () => {
    const f = filtersFromParams(
      new URLSearchParams("qualification=Chaud&stage=Brûlant&sort=password&order=asc&q=plomb&x=1"),
    );
    expect(f).toEqual({ qualification: "Chaud", order: "asc", q: "plomb" });
  });

  it("accepte « none » pour les filtres qui le permettent", () => {
    expect(filtersFromParams(new URLSearchParams("stage=none&service=none"))).toEqual({ stage: "none" });
  });

  it("écrit une chaîne de requête sans valeurs vides, avec la pagination en plus", () => {
    expect(
      toQueryString({ q: "a b", qualification: "Chaud", service: undefined }, { limit: 50, offset: 100 }),
    ).toBe("q=a+b&qualification=Chaud&limit=50&offset=100");
  });

  it("reconnaît la vue rapide active, quels que soient le tri et la recherche", () => {
    const toCall = PRESETS.find((p) => p.id === "to-call");
    expect(activePreset({ ...toCall?.filters, sort: "company", q: "x" })).toBe("to-call");
    expect(activePreset({})).toBe("all");
    expect(activePreset({ segment: "no_website" })).toBeNull();
  });
});

describe("affichage", () => {
  it("numéros, nombres et états", () => {
    expect(displayPhone("+33123456789")).toBe("01 23 45 67 89");
    expect(displayPhone("+442079460958")).toBe("+442079460958");
    expect(displayPhone(null)).toBe("—");
    expect(formatNumber(null)).toBe("—");
    expect(triState(null)).toBe("Non mesuré");
    expect(triState(false)).toBe("Non");
    expect(contactName({ firstName: "Ana", lastName: null })).toBe("Ana");
    expect(contactName(null)).toBe("");
  });
});

import { describeEvent, safeUrl } from "./leads";

describe("liens issus des données", () => {
  it("n'accepte que http et https", () => {
    expect(safeUrl("https://exemple.fr/a")).toBe("https://exemple.fr/a");
    expect(safeUrl("exemple.fr")).toBe("https://exemple.fr/");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(safeUrl("  ")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});

describe("historique", () => {
  it("décrit un changement, automatique ou non", () => {
    expect(describeEvent({ type: "imported", data: null })).toBe("Importé depuis l'ancienne base");
    expect(describeEvent({ type: "field_changed", data: { field: "comment", from: null, to: "ok" } })).toBe(
      "Commentaire : — → ok",
    );
    expect(
      describeEvent({
        type: "stage_changed",
        data: { field: "stage", from: "Contacté", to: "Perdu", auto: true, reason: "statut d'appel « PI »" },
      }),
    ).toBe("Étape : Contacté → Perdu (automatique : statut d'appel « PI »)");
  });
});
