# GAC Pilot — Livraison du système de design (étape 3)

Version 1 · validée le 12/10/2026 · cible : React 19, Tailwind 4, navigateurs récents.

## Fichiers

| Fichier | Rôle | Où le mettre |
|---|---|---|
| `gac-theme.css` | Variables clair, sombre et système, liaison aux utilitaires Tailwind (`@theme inline`), animations, base | `apps/web/src/gac-theme.css`, importé dans `index.css` |
| `gac-components.css` | Facultatif : les classes des maquettes (`btn`, `pill`, `card`, `table`, `kcard`…) branchées sur les mêmes variables | `apps/web/src/gac-components.css` |
| `fonts.ts` | Import des polices embarquées | `apps/web/src/fonts.ts`, importé en tête de `main.tsx` |
| `theme-init.js` | Pose `data-theme` et `data-motion` sur `<html>` avant l'affichage (pas de flash) | `apps/web/public/theme-init.js`, chargé dans `<head>` |
| `Icon.tsx` | Les 64 icônes en SVG intégré, typées | `apps/web/src/components/Icon.tsx` |
| `contrastes.csv` | Les 52 paires texte / fond vérifiées, dans les deux thèmes | documentation |

## Intégration en 5 étapes

1. `npm i @fontsource/plus-jakarta-sans @fontsource/jetbrains-mono`
2. `apps/web/src/index.css` :
   ```css
   @import "tailwindcss";
   @import "./gac-theme.css";
   @import "./gac-components.css" layer(components); /* facultatif */
   ```
3. En tête de `main.tsx` : `import "./fonts";`
4. Dans `index.html`, avant la feuille de style : `<script src="/theme-init.js"></script>` (fichier servi par l'application : compatible avec une politique de sécurité qui interdit les scripts en ligne).
5. Sélecteur de thème (Mon profil) : `window.gacSetPreference("gac-theme", "light" | "dark" | "system")` ; animations : `window.gacSetPreference("gac-motion", "full" | "reduced" | "system")`.

Vérifié : le fichier compile avec Tailwind 4.3 (`bg-surface`, `text-ink`, `dark:bg-surface-2`, `shadow-card`, `animate-rise`…), et `Icon.tsx` passe la vérification TypeScript stricte.

## Ce qui change par rapport aux valeurs par défaut de Tailwind

| Utilitaire | Tailwind par défaut | GAC Pilot |
|---|---|---|
| `text-xs` | 12 px | 11,5 px (pastilles) |
| `text-sm` | 14 px | 13 px |
| `text-base` | 16 px | 14,5 px (charte) |
| `text-xl` | 20 px | 22 px |
| `text-2xl` | 24 px | 28 px |
| `rounded-sm` / `md` / `lg` / `xl` | 4 / 6 / 8 / 12 px | 6 / 10 / 16 / 22 px |
| Nouveaux | — | `text-md`, `text-num`, `text-dial`, `shadow-card`, `shadow-raised`, `shadow-overlay`, `ease-standard`, `ease-enter`, `ease-exit`, `animate-rise`, `animate-enter-right`… |

La palette par défaut de Tailwind reste disponible ; pour n'autoriser que les couleurs du système, décommentez `--color-*: initial;` dans `gac-theme.css`.

## Sans style en ligne : trois cas à connaître

- **Barres d'entonnoir** (largeur selon la donnée) : un `<svg>` avec `<rect width="41%">` (attribut, pas style), ou une variable posée par une classe générée. Le chiffre reste écrit à côté.
- **Barre de temps des notifications** : animation `animate-progress` (pas de largeur calculée).
- **Colonnes du Kanban** : défilement natif (`overflow-x-auto`), aucune transformation calculée.

## Couleurs : variable, utilitaire, rôle

| Variable | Utilitaires | Clair | Sombre | Rôle | Origine |
|---|---|---|---|---|---|
| `--gac-bg` | `bg-bg` `text-bg` `border-bg` | `#F7F5FF` | `#170F24` | Fond de page | charte |
| `--gac-surface` | `bg-surface` `text-surface` `border-surface` | `#FFFFFF` | `#20172F` | Cartes, tableaux, tiroirs, menus | charte |
| `--gac-surface-2` | `bg-surface-2` `text-surface-2` `border-surface-2` | `#F4F1FF` | `#261C3A` | Zones secondaires, survol, piste des barres, champs désactivés | charte |
| `--gac-overlay` | `bg-overlay` `text-overlay` `border-overlay` | `rgba(33, 11, 44, .45)` | `rgba(6, 3, 12, .62)` | Voile sous tiroir et feuille mobile | nouveau |
| `--gac-ink` | `bg-ink` `text-ink` `border-ink` | `#210B2C` | `#F1EDFB` | Texte principal, titres | charte |
| `--gac-muted` | `bg-muted` `text-muted` `border-muted` | `#6B6280` | `#B2A6D6` | Texte secondaire, aides, espaces réservés | charte |
| `--gac-line` | `bg-line` `text-line` `border-line` | `#EAE5F8` | `#392A54` | Séparateurs décoratifs uniquement | charte |
| `--gac-line-strong` | `bg-line-strong` `text-line-strong` `border-line-strong` | `#8D84A6` | `#7C6BA6` | Contour des champs, cases, boutons secondaires (3:1) | nouveau |
| `--gac-accent` | `bg-accent` `text-accent` `border-accent` | `#5B3FE0` | `#9C8CFF` | Action courante, liens, onglet actif | charte |
| `--gac-accent-hover` | `bg-accent-hover` `text-accent-hover` `border-accent-hover` | `#4A2FCB` | `#B3A6FF` | Survol de l’action courante | nouveau |
| `--gac-accent-active` | `bg-accent-active` `text-accent-active` `border-accent-active` | `#3C24A8` | `#C7BDFF` | Appui sur l’action courante | nouveau |
| `--gac-accent-ink` | `bg-accent-ink` `text-accent-ink` `border-accent-ink` | `#FFFFFF` | `#170F24` | Texte posé sur l’accent | charte |
| `--gac-accent-soft` | `bg-accent-soft` `text-accent-soft` `border-accent-soft` | `#BC96E6` | `#6F5BD9` | Dégradés de marque uniquement | charte (sombre : nouveau) |
| `--gac-accent-bg` | `bg-accent-bg` `text-accent-bg` `border-accent-bg` | `#EEEAFF` | `#2E2457` | Sélection, filtre actif, pastille « À appeler » | nouveau |
| `--gac-focus` | `bg-focus` `text-focus` `border-focus` | `#5B3FE0` | `#B3A6FF` | Anneau de focus (2 px, décalé de 2 px) | nouveau |
| `--gac-confirm` | `bg-confirm` `text-confirm` `border-confirm` | `#210B2C` | `#F1EDFB` | Bouton de confirmation d’une action risquée | nouveau |
| `--gac-confirm-ink` | `bg-confirm-ink` `text-confirm-ink` `border-confirm-ink` | `#FFFFFF` | `#170F24` | Texte du bouton de confirmation | nouveau |
| `--gac-danger` | `bg-danger` `text-danger` `border-danger` | `#C02F47` | `#F0748A` | Bouton destructeur | ajusté |
| `--gac-danger-hover` | `bg-danger-hover` `text-danger-hover` `border-danger-hover` | `#A6243A` | `#F590A2` | Survol du bouton destructeur | nouveau |
| `--gac-danger-ink` | `bg-danger-ink` `text-danger-ink` `border-danger-ink` | `#FFFFFF` | `#170F24` | Texte du bouton destructeur | nouveau |
| `--gac-good` | `bg-good` `text-good` `border-good` | `#1E9E5A` | `#3FCB86` | Succès : graphique (icône, point, barre) | charte |
| `--gac-good-ink` | `bg-good-ink` `text-good-ink` `border-good-ink` | `#137A45` | `#3FCB86` | Succès : texte | ajusté |
| `--gac-good-bg` | `bg-good-bg` `text-good-bg` `border-good-bg` | `#E7F7EE` | `#123423` | Succès : fond | charte |
| `--gac-critical` | `bg-critical` `text-critical` `border-critical` | `#D6455A` | `#F0748A` | Critique : graphique | charte |
| `--gac-critical-ink` | `bg-critical-ink` `text-critical-ink` `border-critical-ink` | `#B3263D` | `#F0748A` | Critique : texte | ajusté |
| `--gac-critical-bg` | `bg-critical-bg` `text-critical-bg` `border-critical-bg` | `#FBEAEC` | `#3A1620` | Critique : fond | charte |
| `--gac-warning` | `bg-warning` `text-warning` `border-warning` | `#966A0B` | `#F0C15C` | Avertissement : graphique | charte |
| `--gac-warning-ink` | `bg-warning-ink` `text-warning-ink` `border-warning-ink` | `#85600A` | `#F0C15C` | Avertissement : texte | ajusté |
| `--gac-warning-bg` | `bg-warning-bg` `text-warning-bg` `border-warning-bg` | `#FFF3D9` | `#3A2E10` | Avertissement : fond | charte |
| `--gac-info` | `bg-info` `text-info` `border-info` | `#0E7C86` | `#4DD9D1` | Information : graphique | charte |
| `--gac-info-ink` | `bg-info-ink` `text-info-ink` `border-info-ink` | `#0B6C75` | `#4DD9D1` | Information : texte | ajusté |
| `--gac-info-bg` | `bg-info-bg` `text-info-bg` `border-info-bg` | `#DFF7F5` | `#0E3A3A` | Information : fond | charte |
| `--gac-violet` | `bg-violet` `text-violet` `border-violet` | `#7C3AED` | `#B794F6` | Violet 2 : graphique et texte | charte |
| `--gac-violet-ink` | `bg-violet-ink` `text-violet-ink` `border-violet-ink` | `#7C3AED` | `#B794F6` | Violet 2 : texte | charte |
| `--gac-violet-bg` | `bg-violet-bg` `text-violet-bg` `border-violet-bg` | `#F1E9FE` | `#2E1F4A` | Violet 2 : fond | charte |
| `--gac-slate` | `bg-slate` `text-slate` `border-slate` | `#475569` | `#A3AEBF` | Ardoise : graphique et texte | charte |
| `--gac-slate-ink` | `bg-slate-ink` `text-slate-ink` `border-slate-ink` | `#475569` | `#A3AEBF` | Ardoise : texte | charte |
| `--gac-slate-bg` | `bg-slate-bg` `text-slate-bg` `border-slate-bg` | `#E7E9EE` | `#2A3140` | Ardoise : fond | charte |
| `--gac-pink` | `bg-pink` `text-pink` `border-pink` | `#BE185D` | `#F472B6` | Rose : graphique et texte | charte |
| `--gac-pink-ink` | `bg-pink-ink` `text-pink-ink` `border-pink-ink` | `#BE185D` | `#F472B6` | Rose : texte | charte |
| `--gac-pink-bg` | `bg-pink-bg` `text-pink-bg` `border-pink-bg` | `#FCE7F3` | `#3A1530` | Rose : fond | charte |
| `--gac-chart-1` | `bg-chart-1` `text-chart-1` `border-chart-1` | `#5B3FE0` | `#9C8CFF` | Graphique, série 1 | charte |
| `--gac-chart-2` | `bg-chart-2` `text-chart-2` `border-chart-2` | `#1E9E7A` | `#3FCB86` | Graphique, série 2 | charte |
| `--gac-chart-3` | `bg-chart-3` `text-chart-3` `border-chart-3` | `#C97A16` | `#E0982E` | Graphique, série 3 | charte |
| `--gac-chart-4` | `bg-chart-4` `text-chart-4` `border-chart-4` | `#4D8FE0` | `#79A9F5` | Graphique, série 4 | charte |
| `--gac-sidebar-bg` | `bg-sidebar-bg` `text-sidebar-bg` `border-sidebar-bg` | `#2A1B66` | `#1C1342` | Barre latérale, haut du dégradé ; barre inférieure mobile (bas) | charte (sombre : nouveau) |
| `--gac-sidebar-bg-2` | `bg-sidebar-bg-2` `text-sidebar-bg-2` `border-sidebar-bg-2` | `#221656` | `#150E33` | Barre latérale, bas du dégradé ; barre inférieure mobile | charte (sombre : nouveau) |
| `--gac-sidebar-ink` | `bg-sidebar-ink` `text-sidebar-ink` `border-sidebar-ink` | `#EFEBFF` | `#EFEBFF` | Texte de la barre latérale | charte |
| `--gac-sidebar-muted` | `bg-sidebar-muted` `text-sidebar-muted` `border-sidebar-muted` | `#B3A4EE` | `#B3A4EE` | Texte atténué de la barre latérale | charte |
| `--gac-sidebar-active` | `bg-sidebar-active` `text-sidebar-active` `border-sidebar-active` | `#3A2C7C` | `#2F2560` | Élément de menu courant | nouveau |
| `--gac-sidebar-line` | `bg-sidebar-line` `text-sidebar-line` `border-sidebar-line` | `rgba(239, 235, 255, .14)` | `rgba(239, 235, 255, .12)` | Séparateurs de la barre latérale | nouveau |
| `--gac-sun` | `bg-sun` `text-sun` `border-sun` | `#FFD166` | `#FFD166` | Avatar, compteurs de menu, icône du menu courant | charte |
| `--gac-sun-2` | `bg-sun-2` `text-sun-2` `border-sun-2` | `#F2A65A` | `#F2A65A` | Avatar, fin du dégradé | charte |
| `--gac-sun-ink` | `bg-sun-ink` `text-sun-ink` `border-sun-ink` | `#210B2C` | `#210B2C` | Texte posé sur le soleil (fixe) | nouveau |
| `--gac-paper` | `bg-paper` `text-paper` `border-paper` | `#FFFFFF` | `#FFFFFF` | Aperçu d’e-mail : papier (fixe) | nouveau |
| `--gac-paper-ink` | `bg-paper-ink` `text-paper-ink` `border-paper-ink` | `#210B2C` | `#210B2C` | Aperçu d’e-mail : texte (fixe) | nouveau |
| `--gac-paper-muted` | `bg-paper-muted` `text-paper-muted` `border-paper-muted` | `#6B6280` | `#6B6280` | Aperçu d’e-mail : texte atténué (fixe) | nouveau |
| `--gac-paper-line` | `bg-paper-line` `text-paper-line` `border-paper-line` | `#EAE5F8` | `#EAE5F8` | Aperçu d’e-mail : traits (fixe) | nouveau |

## Typographie

| Variable | Utilitaire | Taille / interligne | Emploi |
|---|---|---|---|
| `--gac-text-xs` | `text-xs` | 11,5 / 16 px | pastilles, compteurs, surtitres |
| `--gac-text-sm` | `text-sm` | 13 / 18 px | aides, légendes, libellés, en-têtes de tableau |
| `--gac-text-base` | `text-base` | 14,5 / 21 px | corps (charte) |
| `--gac-text-md` | `text-md` | 16 / 24 px | champs et corps sur mobile |
| `--gac-text-lg` | `text-lg` | 18 / 26 px | titres de carte |
| `--gac-text-xl` | `text-xl` | 22 / 28 px | titres de section, titre de page mobile |
| `--gac-text-2xl` | `text-2xl` | 28 / 34 px | titres de page ordinateur |
| `--gac-text-num` | `text-num` | 30 / 36 px | valeurs d’indicateur (mono) |
| `--gac-text-dial` | `text-dial` | 34 / 40 px | numéro à appeler (mono) |

## Polices

| Famille | Graisses | Emploi | Paquet | Licence |
|---|---|---|---|---|
| Plus Jakarta Sans | 400, 500, 600, 700, 800 | Tout le texte de l'interface | `@fontsource/plus-jakarta-sans` | SIL Open Font License 1.1 |
| JetBrains Mono | 500, 600 | Chiffres : indicateurs, compteurs, numéros de téléphone, dates, heures, versions | `@fontsource/jetbrains-mono` | SIL Open Font License 1.1 |

Repli : `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` et `ui-monospace, "SFMono-Regular", Menlo, monospace`. Seuls les sous-ensembles utiles sont téléchargés par le navigateur (`unicode-range`) ; le sous-ensemble latin couvre é, è, ç, œ, « » et l'espace fine insécable.

## Icônes (64)

`<Icon name="phone" />` : décorative à côté d'un texte. `<Icon name="close" label="Fermer la fiche" />` : seule. Tailles 16, 20 (défaut), 24.

| Nom | Libellé | Groupe |
|---|---|---|
| `dashboard` | Tableau de bord | Navigation |
| `leads` | Leads | Navigation |
| `phone` | Appels | Navigation |
| `mail` | E-mails | Navigation |
| `pipeline` | Pipeline | Navigation |
| `sourcing` | Sourcing | Navigation |
| `contacts` | Contacts | Navigation |
| `ban` | Adresses exclues | Navigation |
| `users` | Utilisateurs | Navigation |
| `upload` | Import | Navigation |
| `audit` | Journal d'audit | Navigation |
| `settings` | Réglages | Navigation |
| `user` | Mon profil | Navigation |
| `menu` | Menu | Navigation |
| `more` | Plus | Navigation |
| `logout` | Se déconnecter | Navigation |
| `user-plus` | Créer un compte | Navigation |
| `search` | Rechercher | Actions |
| `filter` | Filtrer | Actions |
| `sort` | Trier | Actions |
| `plus` | Ajouter | Actions |
| `edit` | Modifier | Actions |
| `trash` | Supprimer | Actions |
| `download` | Exporter (CSV) | Actions |
| `close` | Fermer, rejeter | Actions |
| `check` | Valider | Actions |
| `arrow-left` | Retour | Actions |
| `chevron-right` | Ouvrir, suivant | Actions |
| `chevron-down` | Déplier, liste | Actions |
| `send` | Envoyer | Actions |
| `pause` | Mettre en pause | Actions |
| `play` | Reprendre | Actions |
| `simulate` | Simuler | Actions |
| `grip` | Déplacer (poignée) | Actions |
| `refresh` | Réessayer | Actions |
| `copy` | Copier | Actions |
| `external` | Ouvrir ailleurs | Actions |
| `no-answer` | Ne répond pas | Issues d'appel |
| `voicemail` | Répondeur | Issues d'appel |
| `gatekeeper` | Barrage secrétaire | Issues d'appel |
| `callback` | À rappeler | Issues d'appel |
| `wrong-number` | Mauvais numéro | Issues d'appel |
| `not-interested` | Pas intéressé | Issues d'appel |
| `meeting` | RDV fixé | Issues d'appel |
| `skip` | Passer | Issues d'appel |
| `note` | Note | Issues d'appel |
| `success` | Succès | États, données, thème |
| `error` | Erreur | États, données, thème |
| `warning` | Avertissement | États, données, thème |
| `info` | Information | États, données, thème |
| `lock` | Accès refusé | États, données, thème |
| `clock` | Planifié | États, données, thème |
| `spinner` | Chargement | États, données, thème |
| `eye` | Ouvert, aperçu | États, données, thème |
| `bounce` | Rebond | États, données, thème |
| `pin` | Ville, adresse | États, données, thème |
| `star` | Note Google | États, données, thème |
| `globe` | Site web | États, données, thème |
| `euro` | Valeur du deal | États, données, thème |
| `calendar` | Période, date | États, données, thème |
| `inbox` | Rien à traiter | États, données, thème |
| `sun` | Thème clair | États, données, thème |
| `moon` | Thème sombre | États, données, thème |
| `monitor` | Thème du système | États, données, thème |

## Contrastes vérifiés (WCAG 2.2, AA)

Seuils : 4,5:1 pour tout texte, 3:1 pour les contours de champs, l'anneau de focus et les éléments graphiques. Résultat : **52 paires × 2 thèmes, 0 échec**.

| Groupe | Paire | Texte / fond | Clair | Sombre | Seuil |
|---|---|---|---|---|---|
| Texte courant | Texte principal sur fond de page | `--gac-ink` / `--gac-bg` | 16,94 | 16,14 | 4,5 |
| Texte courant | Texte principal sur surface | `--gac-ink` / `--gac-surface` | 18,28 | 14,9 | 4,5 |
| Texte courant | Texte principal sur surface 2 | `--gac-ink` / `--gac-surface-2` | 16,43 | 13,93 | 4,5 |
| Texte courant | Texte principal sur sélection | `--gac-ink` / `--gac-accent-bg` | 15,54 | 12,11 | 4,5 |
| Texte courant | Texte atténué sur fond de page | `--gac-muted` / `--gac-bg` | 5,28 | 8,24 | 4,5 |
| Texte courant | Texte atténué sur surface | `--gac-muted` / `--gac-surface` | 5,7 | 7,61 | 4,5 |
| Texte courant | Texte atténué sur surface 2 (pastille neutre, touche de raccourci, champ désactivé) | `--gac-muted` / `--gac-surface-2` | 5,12 | 7,12 | 4,5 |
| Accent et actions | Lien sur fond de page | `--gac-accent` / `--gac-bg` | 6,02 | 6,73 | 4,5 |
| Accent et actions | Lien, onglet, bouton discret sur surface | `--gac-accent` / `--gac-surface` | 6,5 | 6,21 | 4,5 |
| Accent et actions | Pastille « En attente » | `--gac-accent` / `--gac-surface-2` | 5,84 | 5,81 | 4,5 |
| Accent et actions | Pastille « À appeler », filtre actif | `--gac-accent` / `--gac-accent-bg` | 5,52 | 5,05 | 4,5 |
| Accent et actions | Bouton principal | `--gac-accent-ink` / `--gac-accent` | 6,5 | 6,73 | 4,5 |
| Accent et actions | Bouton principal, survol | `--gac-accent-ink` / `--gac-accent-hover` | 8,2 | 8,68 | 4,5 |
| Accent et actions | Bouton principal, appui | `--gac-accent-ink` / `--gac-accent-active` | 10,45 | 10,75 | 4,5 |
| Accent et actions | Bouton de confirmation | `--gac-confirm-ink` / `--gac-confirm` | 18,28 | 16,14 | 4,5 |
| Accent et actions | Bouton destructeur | `--gac-danger-ink` / `--gac-danger` | 5,62 | 6,7 | 4,5 |
| Accent et actions | Bouton destructeur, survol | `--gac-danger-ink` / `--gac-danger-hover` | 7,16 | 8,31 | 4,5 |
| Accent et actions | Message d’erreur sous un champ | `--gac-critical-ink` / `--gac-surface` | 6,44 | 6,18 | 4,5 |
| Accent et actions | Avertissement sous un champ | `--gac-warning-ink` / `--gac-surface` | 5,71 | 10,19 | 4,5 |
| Pastilles et alertes | Ton succès | `--gac-good-ink` / `--gac-good-bg` | 4,86 | 6,55 | 4,5 |
| Pastilles et alertes | Ton critique | `--gac-critical-ink` / `--gac-critical-bg` | 5,54 | 5,75 | 4,5 |
| Pastilles et alertes | Ton avertissement | `--gac-warning-ink` / `--gac-warning-bg` | 5,19 | 7,91 | 4,5 |
| Pastilles et alertes | Ton information | `--gac-info-ink` / `--gac-info-bg` | 5,49 | 7,22 | 4,5 |
| Pastilles et alertes | Ton violet 2 | `--gac-violet-ink` / `--gac-violet-bg` | 4,84 | 6,08 | 4,5 |
| Pastilles et alertes | Ton ardoise | `--gac-slate-ink` / `--gac-slate-bg` | 6,24 | 5,81 | 4,5 |
| Pastilles et alertes | Ton rose | `--gac-pink-ink` / `--gac-pink-bg` | 5,14 | 5,96 | 4,5 |
| Pastilles et alertes | Corps d’alerte, fond succès | `--gac-ink` / `--gac-good-bg` | 16,48 | 11,84 | 4,5 |
| Pastilles et alertes | Corps d’alerte, fond critique | `--gac-ink` / `--gac-critical-bg` | 15,74 | 13,87 | 4,5 |
| Pastilles et alertes | Corps d’alerte, fond avertissement | `--gac-ink` / `--gac-warning-bg` | 16,6 | 11,56 | 4,5 |
| Pastilles et alertes | Corps d’alerte, fond information | `--gac-ink` / `--gac-info-bg` | 16,33 | 10,83 | 4,5 |
| Navigation et marque | Texte de barre, haut du dégradé | `--gac-sidebar-ink` / `--gac-sidebar-bg` | 12,44 | 14,74 | 4,5 |
| Navigation et marque | Texte de barre, bas et barre inférieure | `--gac-sidebar-ink` / `--gac-sidebar-bg-2` | 13,66 | 15,75 | 4,5 |
| Navigation et marque | Élément courant | `--gac-sidebar-ink` / `--gac-sidebar-active` | 9,83 | 11,58 | 4,5 |
| Navigation et marque | Texte atténué de barre, haut | `--gac-sidebar-muted` / `--gac-sidebar-bg` | 6,54 | 7,75 | 4,5 |
| Navigation et marque | Texte atténué de barre, bas et barre inférieure | `--gac-sidebar-muted` / `--gac-sidebar-bg-2` | 7,18 | 8,28 | 4,5 |
| Navigation et marque | Compteur de menu, initiales d’avatar | `--gac-sun-ink` / `--gac-sun` | 12,68 | 12,68 | 4,5 |
| Navigation et marque | Icône du menu courant (soleil) sur l’élément courant | `--gac-sun` / `--gac-sidebar-active` | 7,95 | 9,37 | 3 |
| Aperçu d’e-mail | Texte de l’e-mail | `--gac-paper-ink` / `--gac-paper` | 18,28 | 18,28 | 4,5 |
| Aperçu d’e-mail | Texte atténué de l’e-mail | `--gac-paper-muted` / `--gac-paper` | 5,7 | 5,7 | 4,5 |
| Graphiques et contours (3:1) | Contour de champ sur surface | `--gac-line-strong` / `--gac-surface` | 3,51 | 3,68 | 3 |
| Graphiques et contours (3:1) | Contour de champ sur fond de page | `--gac-line-strong` / `--gac-bg` | 3,25 | 3,99 | 3 |
| Graphiques et contours (3:1) | Contour de champ sur surface 2 | `--gac-line-strong` / `--gac-surface-2` | 3,15 | 3,44 | 3 |
| Graphiques et contours (3:1) | Anneau de focus sur fond | `--gac-focus` / `--gac-bg` | 6,02 | 8,68 | 3 |
| Graphiques et contours (3:1) | Anneau de focus sur surface | `--gac-focus` / `--gac-surface` | 6,5 | 8,01 | 3 |
| Graphiques et contours (3:1) | Icône succès | `--gac-good` / `--gac-surface` | 3,45 | 8,24 | 3 |
| Graphiques et contours (3:1) | Icône critique | `--gac-critical` / `--gac-surface` | 4,32 | 6,18 | 3 |
| Graphiques et contours (3:1) | Icône avertissement | `--gac-warning` / `--gac-surface` | 4,81 | 10,19 | 3 |
| Graphiques et contours (3:1) | Icône information | `--gac-info` / `--gac-surface` | 4,95 | 9,93 | 3 |
| Graphiques et contours (3:1) | Graphique 1 | `--gac-chart-1` / `--gac-surface` | 6,5 | 6,21 | 3 |
| Graphiques et contours (3:1) | Graphique 2 | `--gac-chart-2` / `--gac-surface` | 3,37 | 8,24 | 3 |
| Graphiques et contours (3:1) | Graphique 3 | `--gac-chart-3` / `--gac-surface` | 3,34 | 7,1 | 3 |
| Graphiques et contours (3:1) | Graphique 4 | `--gac-chart-4` / `--gac-surface` | 3,32 | 7,19 | 3 |

Hors calcul, par conception : éléments désactivés (exemptés par WCAG, gardés à 5,1:1), dégradé décoratif des entonnoirs (la valeur est toujours écrite), séparateurs `--gac-line` (jamais seuls porteurs d'information).

## Étape 4 (13/10/2026) — compléments

- `gac-theme.css` : jetons `--gac-brand`, `--gac-brand-hover`, `--gac-brand-ink` (violet fixe pour un bouton posé sur une surface inversée) ; `--gac-text-xs` passe à 12 px (aucun texte sous 12 px).
- `gac-components.css` : section 20 « Compléments étape 4 » (barre d'outils de page, état en une ligne, pied de barre latérale, bande de statuts, enregistrement, boîte de dialogue à conséquences, sections repliables, choix à conséquences, progression, opérations longues, note de l'IA, signaux du site, tableau défilant, sélection mobile, zone de dépôt, créneaux, issues d'appel, Kanban défilant, panneau, file de relecture…). Chaque composant est montré sur la planche « E4 · A5 Composants ajoutés ».
- `Icon.tsx` : 7 icônes ajoutées (sparkle, bell, undo, wifi-off, eye-off, keyboard, briefcase).
- `contrastes-etape4.csv` : paires nouvelles, toutes AA.
- Densité : poser `density-work` (écrans quotidiens) ou `density-admin` (administration) sur le conteneur de page ; les gabarits des maquettes (`.review`, `.calls`, `.admin-grid`…) se réécrivent en utilitaires Tailwind.
