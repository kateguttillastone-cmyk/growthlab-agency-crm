import { describe, expect, it } from "vitest";
import { applyMotion, isPreference, readPreference, readReducedMotion, resolveTheme } from "./theme";

describe("thème", () => {
  it("un choix explicite l'emporte, « système » suit le système", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("n'accepte que les trois préférences connues", () => {
    expect(isPreference("dark")).toBe(true);
    expect(isPreference("sepia")).toBe(false);
    expect(isPreference(null)).toBe(false);
  });

  it("retombe sur « système » quand le stockage est indisponible", () => {
    expect(readPreference()).toBe("system");
  });

  it("réduire les animations : faux par défaut, applicable sans stockage", () => {
    expect(readReducedMotion()).toBe(false);
    expect(() => applyMotion(true)).not.toThrow();
  });
});
