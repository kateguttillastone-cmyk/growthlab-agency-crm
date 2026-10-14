/* Pose data-theme et data-motion sur <html> avant l'affichage (pas de clignotement). Fichier servi par l'application : compatible
   avec la politique de sécurité (aucun script en ligne). Mêmes clés que src/lib/theme.ts. */
(() => {
  const root = document.documentElement;
  let theme = "system";
  let motion = "";
  try {
    theme = localStorage.getItem("gac-theme") || "system";
    motion = localStorage.getItem("gac-motion") || "";
  } catch {
    // stockage indisponible : thème du système
  }
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
  root.setAttribute("data-theme", theme === "dark" || (theme !== "light" && systemDark) ? "dark" : "light");
  if (motion === "reduced") root.setAttribute("data-motion", "reduced");
})();
