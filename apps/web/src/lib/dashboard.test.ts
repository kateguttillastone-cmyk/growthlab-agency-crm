import { describe, expect, it } from "vitest";
import { dashboardQuery, euros, percent } from "./dashboard";

describe("tableau de bord (interface)", () => {
  it("requête de période", () => {
    expect(dashboardQuery("30", "", "")).toBe("period=30");
    expect(dashboardQuery("custom", "2026-10-01", "2026-10-09")).toBe(
      "period=custom&from=2026-10-01&to=2026-10-09",
    );
    expect(dashboardQuery("custom", "", "2026-10-09")).toBeNull();
    expect(dashboardQuery("custom", "2026-10-10", "2026-10-09")).toBeNull();
  });
  it("pourcentage sans division par zéro", () => {
    expect(percent(1, 4)).toBe("25 %");
    expect(percent(0, 0)).toBe("—");
  });
  it("montant en euros", () => {
    expect(euros(1500).replace(/\s/g, " ")).toMatch(/1 500 €/);
  });
});
