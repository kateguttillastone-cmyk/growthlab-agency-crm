/* Pose data-theme et data-motion sur <html> avant l'affichage (pas de clignotement). Fichier servi par l'application : compatible
   avec la politique de sécurité (aucun script en ligne). Mêmes clés que src/lib/theme.ts. */
(function () {
  var root = document.documentElement;
  var theme = "system";
  var motion = "";
  try {
    theme = localStorage.getItem("gac-theme") || "system";
    motion = localStorage.getItem("gac-motion") || "";
  } catch (e) {}
  var dark = theme === "dark" || (theme !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.setAttribute("data-theme", dark ? "dark" : "light");
  if (motion === "reduced") root.setAttribute("data-motion", "reduced");
})();
