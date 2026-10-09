import type { ImportReport } from "@gac/shared";
import { describe, expect, it } from "vitest";
import { formatBytes, nothingNew, reportRows, sortedWarnings } from "./imports";

const base = (over: Partial<ImportReport> = {}): ImportReport => ({
  dryRun: true,
  rows: 10,
  skipped: 1,
  companies: { created: 0, existing: 9 },
  contacts: { created: 0, existing: 5 },
  leads: { created: 0, existing: 9 },
  emailMessages: { created: 0, existing: 0 },
  suppressions: { created: 0, existing: 0 },
  warnings: {},
  ...over,
});

describe("rapport d'import", () => {
  it("formate les tailles de fichier", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(3_321_799)).toBe("3,2 Mo");
    expect(formatBytes(20_480)).toBe("20 Ko");
  });

  it("détecte un fichier déjà importé", () => {
    expect(nothingNew(base())).toBe(true);
    expect(nothingNew(base({ leads: { created: 1, existing: 8 } }))).toBe(false);
    expect(nothingNew(base({ suppressions: { created: 2, existing: 0 } }))).toBe(false);
  });

  it("liste les effectifs et trie les anomalies par fréquence", () => {
    expect(reportRows(base()).map((r) => r.label)[2]).toBe("Leads");
    expect(sortedWarnings(base({ warnings: { b: 1, a: 1, c: 5 } }))).toEqual([
      ["c", 5],
      ["a", 1],
      ["b", 1],
    ]);
  });
});
