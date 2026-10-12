# 13 — Dossier de départ pour le design (maquettes et système de design)

| | |
|---|---|
| **Usage** | À joindre tel quel à la demande de maquettes et de système de design. |
| **Source de la charte** | `legacy/source-artifact.html` (ancienne version), lignes 5 à 99 : variables CSS, polices, ombres, rayons. |
| **Captures** | `docs/design/captures/` : 10 écrans à 1 360 px et 5 écrans à 390 px, données **fictives**. Elles montrent la **structure** actuelle ; la finition visuelle est à concevoir. |
| **Décisions prises** | Quatre chantiers sont tous à faire : **charte de l'ancienne version conservée**, **mobile**, **mode sombre**, **Kanban**. |

## 1. Charte à conserver : violet et blanc de l'ancienne version

Le design repart de cette charte. Il peut l'affiner (hiérarchie, cohérence, états), **pas la remplacer**.

### 1.1 Couleurs, thème clair

| Rôle | Variable d'origine | Valeur |
|---|---|---|
| Fond de page | `--bg` | `#F7F5FF` |
| Surface (cartes) | `--surface` | `#FFFFFF` |
| Surface secondaire | `--surface-2` | `#F4F1FF` |
| Texte | `--ink` | `#210B2C` |
| Texte atténué | `--muted` | `#6B6280` |
| Traits, bordures | `--line` | `#EAE5F8` |
| **Accent (violet)** | `--accent` | `#5B3FE0` |
| Texte sur accent | `--accent-ink` | `#FFFFFF` |
| Accent doux | `--accent-soft` | `#BC96E6` |
| Soleil (avatar, repère chaud) | `--sun` | `#FFD166` |
| Succès / fond | `--good` / `--good-bg` | `#1E9E5A` / `#E7F7EE` |
| Critique / fond | `--critical` / `--critical-bg` | `#D6455A` / `#FBEAEC` |
| Avertissement / fond | `--warning` / `--warning-bg` | `#966A0B` / `#FFF3D9` |
| Information / fond | `--info` / `--info-bg` | `#0E7C86` / `#DFF7F5` |
| Violet 2 / fond | `--violet2` / `--violet2-bg` | `#7C3AED` / `#F1E9FE` |
| Ardoise / fond | `--slate` / `--slate-bg` | `#475569` / `#E7E9EE` |
| Rose / fond | `--pink` / `--pink-bg` | `#BE185D` / `#FCE7F3` |
| Graphiques 1 à 4 | `--chart-1..4` | `#5B3FE0`, `#1E9E7A`, `#C97A16`, `#4D8FE0` |
| Barre latérale | `--sidebar-bg` → `--sidebar-bg-2` | dégradé `#2A1B66` → `#221656` |
| Texte de barre latérale / atténué | `--sidebar-ink` / `--sidebar-muted` | `#EFEBFF` / `#B3A4EE` |

Forme : rayon `16 px` ; ombres `0 1px 3px rgba(33,11,44,.06), 0 8px 24px -16px rgba(44,31,115,.24)` (carte) et `0 18px 40px -20px rgba(44,31,115,.28)` (surélevé). Repères de marque : pastille « GAC » en dégradé `accent → accent-soft` (rayon 10 px), avatar en dégradé `sun → #F2A65A`, barres d'entonnoir en dégradé `accent → accent-soft`.

### 1.2 Mode sombre (déjà défini dans l'ancienne version)

| Rôle | Valeur sombre |
|---|---|
| Fond / surface / surface 2 | `#170F24` / `#20172F` / `#261C3A` |
| Texte / atténué / traits | `#F1EDFB` / `#B2A6D6` / `#392A54` |
| Accent / texte sur accent | `#9C8CFF` / `#170F24` |
| Succès | `#3FCB86` sur `#123423` |
| Critique | `#F0748A` sur `#3A1620` |
| Avertissement | `#F0C15C` sur `#3A2E10` |
| Information | `#4DD9D1` sur `#0E3A3A` |
| Violet 2 | `#B794F6` sur `#2E1F4A` |
| Ardoise | `#A3AEBF` sur `#2A3140` |
| Rose | `#F472B6` sur `#3A1530` |
| Graphiques | `#9C8CFF`, `#3FCB86`, `#E0982E`, `#79A9F5` |
| Ombres | `0 1px 3px rgba(0,0,0,.3), 0 8px 24px -16px rgba(0,0,0,.5)` ; `0 18px 40px -20px rgba(0,0,0,.55)` |

L'ancienne version suivait la préférence du système et acceptait un forçage (`data-theme="light|dark"`). À conserver, avec un **sélecteur visible** (clair, sombre, système).

### 1.3 Étiquettes (pastilles) de l'ancienne version

Qualification : **Chaud** = succès, **Tiède** = avertissement, **Froid** = surface 2 + atténué. Validation : **Validé** = succès, **En attente** = surface 2 + accent, **Rejeté** = critique. Statut d'appel : **NRP** = violet 2, **PB NUMERO** = ardoise, **REPONDEUR** = information, **BARRAGE** = rose. Forme : pastille arrondie, 11,5 px, gras. **À étendre** (non définis dans l'ancienne version, aujourd'hui improvisés) : statut d'e-mail (Envoyé, Délivré, Ouvert, Bounce, Désinscrit), file d'appel (À appeler, Injoignable, RDV fixé, Répondu, Pas intéressé), contrôle d'adresse (valide, mal formée, sans serveur, jetable), exclusion (rebond, désinscription, plainte, manuelle). **Ne jamais dépendre de la couleur seule : toujours un texte.**

### 1.4 Typographie

Ancienne version : **Plus Jakarta Sans** (400 à 800) pour le texte, **JetBrains Mono** (500, 600) pour les chiffres (indicateurs, compteurs, entonnoirs). Corps 14,5 px, interligne 1,45. Voir §7 pour l'hébergement des polices.

## 2 bis. Mise à jour : système de design étape 1 intégré dans l'application

Le système de design validé (canevas « GAC Pilot — Système de design », étape 1) est **intégré** : feuille de variables et de
composants (`apps/web/src/styles/gac-ds.css`, copie à remplacer par chaque nouvelle version), polices **embarquées** (Plus Jakarta
Sans, JetBrains Mono), **thème clair / sombre / système** mémorisé, barre latérale par rôle sur ordinateur, **barre inférieure et
feuille « Plus »** sur mobile, boutons, champs, alertes, pastilles de statut aux couleurs du système, barres d'entonnoir aux
couleurs de la charte. Vérifié sous la **même politique de sécurité que le serveur** (aucune violation) et sur ordinateur et mobile.
Les mises en page des écrans restent celles d'origine jusqu'aux maquettes des étapes 2 et 3.

## 2. État actuel de l'application (ce que le designer verra sur les captures)

| Point | Constat |
|---|---|
| Palette | Reprise de **quelques valeurs** : accent `#5B3FE0`, fond `#F7F5FF`, traits `#EAE5F8`, texte `#210B2C`, barre latérale `#2A1B66`→`#221656`. Les autres couleurs (succès, critique, étiquettes) sont **encore improvisées**. |
| Polices | Polices du système (Plus Jakarta Sans et JetBrains Mono **absentes**). |
| Mode sombre | **Absent**. |
| Barres d'entonnoir | S'affichent en **vert et gris par défaut** du navigateur : la couleur d'accent n'est pas appliquée. À remplacer par les barres en dégradé de l'ancienne version. |
| Mobile | Aucun débordement horizontal (mesuré), mais **la barre latérale s'empile au-dessus du contenu** et occupe un quart de l'écran ; sur la page E-mails, le panneau de relecture s'affiche **tout en bas**, sous la liste : un clic sur un e-mail ne montre rien sans défiler. |
| Icônes, logo, états vides | Aucun (texte seul). |
| Densité | Tableaux larges sur ordinateur, pas d'adaptation en cartes sur mobile. |

## 3. Écrans existants

Rôles : **L** lecteur, **A** agent, **R** responsable, **Adm** administrateur (chaque rôle inclut les précédents). Chaque écran doit être conçu dans ses **4 états** : chargement, vide, erreur, accès refusé.

| Écran | Rôle min. | But | Éléments clés | Mobile |
|---|---|---|---|---|
| Connexion | tous | entrer | e-mail, mot de passe, erreurs, verrouillage après échecs | oui |
| Tableau de bord | L | piloter | période (toute, 7/30/90 j, dates), 6 indicateurs, 3 entonnoirs, leads prioritaires, derniers leads | lecture |
| Leads | L | trouver et suivre | vues rapides, recherche, filtres, tri, tableau, pagination, **fiche latérale** (infos, historique, édition selon rôle) | oui, en cartes |
| Appels | A | appeler | un prospect à la fois, numéro cliquable, 7 issues en un clic, note, « Passer », onglets À appeler / À rappeler, filtres ville et qualification | **priorité absolue** (téléphone) |
| E-mails | R | relire, valider, envoyer | file, onglets, éditeur objet/corps, **aperçu fidèle**, avertissements, validation unitaire et groupée (simuler puis confirmer), contrôle d'adresses, **carte d'envoi planifié** (état, plafond, pause, test), tableau par version du prompt | oui |
| Import | Adm | charger un CSV | choix du fichier, simulation, rapport, confirmation | secondaire |
| Utilisateurs | Adm | comptes | liste, création, rôle, désactivation, mot de passe | secondaire |
| Journal d'audit | Adm | traçabilité | tableau filtrable | secondaire |
| Mon profil | tous | mot de passe | formulaire | oui |

Navigation actuelle : barre latérale (Tableau de bord, Leads, Appels, E-mails, Utilisateurs, Import, Journal d'audit, Mon profil) ; les entrées s'adaptent au rôle.

## 4. Écrans à concevoir (décidés : « tous à faire »)

| Écran | Origine | Notes de conception |
|---|---|---|
| **Pipeline en Kanban** | feuille de route, phase 3 ; vue « pipeline » de l'ancienne version | Colonnes = étapes du pipeline (Contacté, RDV programmé, …, Gagné, Perdu) ; carte = lead (nom, qualification, valeur, responsable). **Déplacement au glisser-déposer ET au clavier** (obligatoire). Échec d'enregistrement : la carte revient à sa colonne avec un message (CA-07). Valeur des deals et packs : champs prévus mais **jamais renseignés à ce jour** : prévoir l'état « aucune valeur ». Sur mobile : colonnes en onglets ou liste groupée. |
| **Sourcing** | phase 5 ; vue « sourcing » de l'ancienne version | Lancer une recherche (critères), suivre les exécutions (état, coût estimé, erreurs), résultat. |
| **Actions groupées sur les leads** | phase 2, non livré | Sélection de lignes, barre d'actions (qualification, responsable, étape), motif **simuler puis confirmer**. |
| **Vues enregistrées, export CSV, choix du responsable** | phase 2, non livré | À intégrer à la liste des leads. |
| **Adresses exclues** | manque détecté | Liste (adresse, motif, date, note), recherche, ajout manuel. L'API existe, pas d'écran. |
| **Réglages** | manque détecté | Signature, agenda, mention d'opposition, horaires et plafond d'envoi, adresse de test : aujourd'hui des variables serveur, à rendre modifiables avec garde-fous. |
| **Contacts** | vue « contacts » de l'ancienne version | À décider : vue par personne en plus de la vue par lead. |
| **Création manuelle d'un lead** | manque détecté | Aujourd'hui, seul l'import crée des leads. |
| **Relances d'e-mails (séquences)** | prévu, non commencé | Plusieurs messages par lead. |
| **Premier lancement** | manque détecté | Base vide : guider vers l'import. |
| **Notifications** | transversal | Confirmation d'une action, échec, envoi à vérifier (incertain). |

## 5. Mobile : exigences

- **Appels** : à concevoir **d'abord pour le téléphone** : numéro en grand et cliquable, issues accessibles au pouce, suivant automatique, tenir dans un écran sans défiler.
- **Menu** : remplacer l'empilement par un menu compact (tiroir ou barre inférieure) ; ne jamais occuper le haut de l'écran.
- **Tableaux** (Leads, journal, utilisateurs) : adaptation en **cartes** ou colonnes réduites avec détail à l'ouverture.
- **E-mails** : relecture en **deux temps** (liste, puis écran de relecture plein écran avec retour), au lieu d'un panneau sous la liste.
- Zones tactiles d'au moins 44 px ; aucun défilement horizontal (vérifié aujourd'hui : à conserver).

## 6. Composants à spécifier (avec tous leurs états)

Bouton (primaire, secondaire, danger ; normal, survol, focus, actif, désactivé, chargement) · champ, liste déroulante, zone de texte, case, interrupteur · onglets · pastilles (§1.3) · carte, indicateur (KPI) · barre d'entonnoir · tableau (en-tête fixe, tri, ligne survolée, ligne sélectionnée, cartes sur mobile) · pagination · fiche latérale / tiroir · alerte (erreur, avertissement, succès, information) · bandeaux d'état (envoi en pause, envoi à vérifier) · **motif « simuler puis confirmer »** (validation groupée, import) · **aperçu d'e-mail** (en-tête, paragraphes, agenda ajouté automatiquement, pied d'opposition) · carte Kanban · état vide · chargement (squelettes) · menu et avatar · sélecteur de thème · notifications.

## 7. Contraintes techniques (non négociables)

1. **Aucune ressource tierce** : la politique de sécurité du serveur bloque les polices, icônes et images hébergées ailleurs. Les polices (Plus Jakarta Sans, JetBrains Mono) devront être **embarquées** dans l'application (paquets `@fontsource/*`) ; les icônes en **SVG intégré**.
2. **Aucun style en ligne** dans le code : le design est livré sous forme de **variables** (couleurs, espacements, rayons, ombres, typographie) que l'on branche dans `apps/web/src/index.css` (bloc `@theme` de Tailwind 4). Prévoir les deux thèmes.
3. **Accessibilité** : contraste WCAG AA vérifié pour **chaque paire** texte/fond (y compris pastilles et mode sombre), navigation complète au clavier, focus visible, étiquette sur chaque champ, tableaux avec légende, messages d'erreur annoncés, aucune information portée par la couleur seule.
4. **Langue** : interface en français (dates `JJ/MM/AAAA`, nombres `1 234`).
5. **Rôles** : un lecteur ne voit pas les boutons d'écriture ; prévoir les variantes par rôle.
6. **Volumes** : environ 2 000 leads ; tableaux denses, recherche et filtres rapides.
7. **Cible technique** : React 19, Tailwind 4, navigateurs récents.

## 8. Livrables attendus du designer

1. Système de design : variables clair et sombre (partir du §1), échelle typographique, espacements, rayons, ombres, icônes, composants du §6 dans tous leurs états.
2. Maquettes **ordinateur et mobile**, thèmes clair **et** sombre, des écrans du §3 et du §4 (par ordre : Appels, E-mails, Leads, Tableau de bord, Kanban, puis le reste).
3. Parcours à valider : traiter 20 appels sans quitter l'écran ; relire et valider un lot d'e-mails ; déplacer un lead dans le Kanban au clavier ; première utilisation (base vide).
4. Fichier de variables prêt à coller dans `index.css`, et liste des polices et icônes utilisées.

## 9. Critères de réception

- Les couleurs de §1 sont reprises ou **justifiées** (écart motivé par le contraste ou la hiérarchie).
- Chaque paire texte/fond du thème clair et du thème sombre atteint le contraste AA.
- Chaque écran existe en version mobile, et le menu ne bloque plus le contenu.
- Les motifs risqués (confirmation, pause, libération d'un envoi incertain) sont distincts visuellement des actions courantes.
- Le design se réalise sans ressource externe ni style en ligne.

## 10. Annexe : captures fournies (`docs/design/captures/`)

Ordinateur (1 360 px) : `pc-01-connexion`, `pc-02-tableau-de-bord`, `pc-03-leads`, `pc-04-fiche-lead`, `pc-05-appels`, `pc-06-emails-relecture`, `pc-07-import`, `pc-08-utilisateurs`, `pc-09-audit`, `pc-10-profil`. Mobile (390 px) : `mobile-01-connexion`, `mobile-02-tableau-de-bord`, `mobile-03-leads`, `mobile-04-appels`, `mobile-05-emails`.
