# Audit automatique de l'interface

`scripts/audit-ui.mjs` parcourt toutes les pages, pour chaque rôle, en thème clair et sombre, de 360 à 1920 px, et signale :

- une page qui défile en largeur ;
- des éléments qui sortent de l'écran sans zone de défilement ;
- des barres de défilement imbriquées (page + zone, ou plusieurs zones en même temps) ;
- une fin de page masquée par la barre de navigation du bas (mobile) ;
- des erreurs de console.

Il ouvre aussi les panneaux dépliables (filtres, actions groupées, suivi de l'envoi, nouvelle recherche).

## Lancer l'audit

Sur une base de **démonstration** (jamais de données réelles), avec l'API et le front démarrés et Playwright installé :

```bash
AUDIT_BASE=http://localhost:5173 \
AUDIT_ACCOUNTS='[{"role":"ADMIN","email":"…","password":"…"},{"role":"VIEWER","email":"…","password":"…"}]' \
node scripts/audit-ui.mjs
```

Les comptes passent par l'environnement : aucun secret n'est stocké dans le dépôt. Sortie : « Aucun défaut d'affichage détecté » (code 0) ou la liste des défauts (code 1).
Un compte par rôle suffit à couvrir les écrans ; l'audit complet dure plusieurs minutes (lancer un processus par compte en parallèle).

## Exceptions volontaires

- Le Pipeline défile colonne par colonne : ses zones de défilement ne sont pas comptées.
- Le menu latéral peut défiler sur un écran de moins de 800 px de haut ; son pied (thème, profil) reste fixe.
