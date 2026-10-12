export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const KEY = "gac-theme";
export const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Clair",
  dark: "Sombre",
  system: "Système",
};

export function isPreference(v: unknown): v is ThemePreference {
  return v === "system" || v === "light" || v === "dark";
}

/** Thème appliqué : le choix explicite, sinon la préférence du système. */
export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

/** Préférence mémorisée dans ce navigateur (jamais bloquant : le stockage peut être indisponible). */
export function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return isPreference(v) ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(pref, systemPrefersDark());
}

export function setPreference(pref: ThemePreference): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // stockage indisponible (navigation privée) : le choix vaut pour cette page seulement
  }
  applyTheme(pref);
}

/** Applique le thème au démarrage et suit le système tant que la préférence est « Système ». */
export function initTheme(): void {
  applyTheme(readPreference());
  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (readPreference() === "system") applyTheme("system");
    });
  }
}
