# Demande à Claude Design : étape 4, cohérence et ergonomie de GAC Pilot

*À coller dans Claude Design, avec le dossier `captures/` joint (35 images) et le fichier `rapport-audit.md`.
Le canevas à mettre à jour est « GAC Pilot — Système de design » (https://claude.ai/artifact/NMn7dj5CuTNAb613cKceJK).*

---

## 1. Mission

GAC Pilot est le CRM de prospection de GrowthLab Agency (agence web française, équipe de 2 à 6 personnes). L'application est **fonctionnelle et déployée**
d'après votre maquette de l'étape 2. En l'utilisant avec des données réalistes, nous avons relevé **61 points** de cohérence et d'usage
(12 prioritaires), dont **27 sont des écarts entre votre maquette et ce qui a été intégré**, et **29 sont des limites de la conception elle-même**.

**Ce que nous vous demandons :**

1. Relire le rapport d'audit et les captures.
2. **Mettre à jour la maquette** pour résoudre les problèmes, **sans changer l'identité visuelle** (voir §2).
3. Pour chaque écran modifié : planches ordinateur (1440) et mobile (390), thèmes clair et sombre, et **tous les états** (§5).
4. Nous signaler vos **choix**, vos **questions** et les points où vous n'êtes pas d'accord avec l'audit.

Ce que nous **ne** demandons **pas** : un nouveau style, une nouvelle charte, un autre système de composants. Le système de design de l'étape 1 est **la référence** ;
il peut être **complété** (nouveaux composants, variantes) mais pas remplacé.

## 2. Ce qui est figé

- **Identité** : violet et blanc de l'ancienne version, barre latérale sombre dégradée, typographie, rayons, ombres, pastilles : tels que dans `gac-ds.css`.
- **Thèmes** : clair, sombre, système ; **réduction des animations** respectée (section « Mouvement » du système).
- **Langue** : tout est en **français** (libellés, erreurs, vides). Les identifiants techniques ne sont jamais le texte principal (voir §4.1).
- **Accessibilité** : libellés visibles sur tous les champs, `role="alert"` pour les erreurs, tableaux avec légende et en-têtes, focus visible, cibles ≥ 44 px sur mobile, contrastes de la planche « Contrastes vérifiés ».
- **Contraintes d'intégration** (elles s'imposent à ce que vous dessinez) :
  - **aucune ressource externe** (polices, images, scripts) ; les polices sont embarquées ;
  - **aucun style en ligne** : tout passe par des classes et des variables du système ;
  - **pas de bibliothèque de composants tierce** : les composants sont ceux de `gac-ds.css` ;
  - un écran doit pouvoir s'écrire avec **le CSS du système + de petits ajouts** ; si vous créez un composant, **ajoutez-le à la planche Composants** et au fichier `gac-ds.css`.
- **Rôles** : Lecteur < Agent (« Commercial ») < Responsable < Administrateur. Les droits sont vérifiés par le serveur ; l'interface **masque ou grise** ce qui n'est pas permis (indiquez-le sur chaque écran).
- **Actions risquées = « simuler puis confirmer »** : modification groupée de leads, import, lancement d'une recherche payante, changement de la cadence d'envoi.
  Toute nouvelle action risquée doit suivre ce motif.

## 3. Pièces jointes et lecture des captures

Chaque ligne du rapport (`rapport-audit.md`, §4) cite une capture. Nommage : `d-` ordinateur 1440 px, `m-` mobile 390 px, `s-` thème sombre.

| Capture | Écran | Lien avec le rapport |
|---|---|---|
| `d-01`, `m-01` | Connexion | C-1 |
| `d-02`, `m-02`, `s-01` | Tableau de bord | D-1 à D-5 |
| `d-03`, `m-03`, `s-03` | Pipeline | PL-1 à PL-5 |
| `d-04`, `d-05`, `d-06`, `m-04`, `m-05`, `m-06` | Leads : liste, actions groupées, fiche, filtres | L-1 à L-9, T-2, T-3 |
| `d-07` | Nouveau lead | N-1 |
| `d-08`, `m-07` | Appels | A-1 à A-4 |
| `d-09`, `d-10`, `m-08`, `m-09`, `s-02` | E-mails | E-1 à E-9 |
| `d-12`, `m-10` | Sourcing | S-1 à S-5 |
| `d-13`, `m-14` | Adresses exclues | X-1 |
| `d-14`, `m-11` | Réglages | R-1 à R-4 |
| `d-15`, `m-13` | Utilisateurs | U-1 à U-4 |
| `d-16` | Import | I-1 |
| `d-17` | Journal d'audit | AU-1 |
| `d-18`, `m-15` | Mon profil | PR-1 |
| `m-12` | Menu « Plus » (mobile) | §6 du rapport |

Les données sont **fictives** (26 prospects, 3 utilisateurs de démonstration). Elles ressemblent aux données réelles : noms d'artisans, villes de Savoie et du Rhône, numéros français.

## 4. Principes transverses à définir (avant les écrans)

Ces points reviennent sur plusieurs écrans : **les trancher une fois** dans le système évite de les redessiner à chaque planche.

### 4.1 Deux niveaux de densité
- **Écrans de travail quotidien** (E-mails, Leads, Sourcing, Appels, Pipeline) : denses, pilotables au clavier, actions à portée de main.
- **Écrans d'administration** (Réglages, Utilisateurs, Journal, Import, Adresses exclues) : plus aérés, garde-fous visibles, jamais de code technique comme texte principal.
Proposez une règle (espacement, taille de texte, largeur de contenu) pour chaque niveau. *(rapport : T-8, §6.1)*

### 4.2 Barre d'outils de page
Définir **une** structure : titre, actions principales (1 principale, ≤ 2 secondaires), filtres, état global. Aujourd'hui chaque écran range ses actions différemment.
Définir aussi la place du **bouton de thème** (ajout hors maquette, aujourd'hui seul en haut à droite) : proposez une meilleure place (pied de barre latérale, barre du haut avec le titre…). *(T-1)*

### 4.3 Quel statut montrer où
Un lead porte quatre notions : **qualification** (Chaud, Tiède, Froid, à qualifier), **étape** (9 valeurs), **état d'appel** (À appeler, Répondu, Injoignable…, plus le dernier résultat), **état d'e-mail** (validation puis envoi).
Définir **pour la liste, la carte, la fiche et le Kanban** quelles notions s'affichent, sous quelle forme (pastille, texte, icône), et lesquelles sont secondaires. Traduire les libellés techniques d'appel
(`A RAP`, `BARRAGE SECRETAIRE`, `PB NUMERO`, `NRP`, `PI`). *(T-2, L-6)*

### 4.4 Modèle d'enregistrement
Aujourd'hui trois modèles coexistent : enregistrement **immédiat** au changement (listes de la fiche lead), bouton **Enregistrer** par champ (notes), bouton **Enregistrer** global (Réglages, Profil).
Choisir **un modèle par type d'écran** et dessiner : retour visible (« Enregistré »), erreur, annulation, **perte de modifications** à la fermeture. *(L-7, R-2)*

### 4.5 Actions destructives ou à risque
Définir : bouton, confirmation (qui dit les **conséquences**), annulation possible ou non, journal. Cas réels : désactiver un compte, rejeter un e-mail, passer un prospect en « Pas intéressé », exclure une adresse,
modifier des centaines de leads, lancer une recherche payante, libérer un envoi au résultat incertain. *(A-3, U-2, E-8)*

### 4.6 Opérations longues et coûteuses
Aucun état dessiné pour ce qui dure 5 à 60 secondes : qualification et rédaction par IA, recherche de prospects (1 à 5 minutes), analyse d'un site. Dessiner : en cours (avec progression si connue), terminé, échec, plafond atteint, annulation. *(E-9, S-3, S-5)*

### 4.7 Tableaux et mobile
Règle de passage **tableau → cartes** (à partir de quelle largeur), colonnes prioritaires, en-tête collant, ligne cliquable (zone et feedback), actions de ligne, **sélection groupée** (barre d'actions apparaissant à la sélection),
pagination. Appliquée à Leads, Utilisateurs, Journal, Adresses exclues, Sourcing. *(L-4, L-5, U-3, T-9)*

### 4.7 bis Formats de données
Téléphone (français et **international**, p. ex. `+261 34 51 257 54`), dates, montants, nombres, absence de valeur (« — » avec raison, jamais 0). *(T-3)*

## 5. États à fournir pour chaque écran modifié

Normal · **vide** (premier lancement) · **chargement** (squelette seulement si > 300 ms) · **erreur** (message utile + « Réessayer ») · **accès refusé** (selon le rôle) · **formulaire en erreur** (messages sous les champs) · **succès** (toast 6 s) ·
et, selon l'écran : **opération en cours**, **plafond atteint**, **hors ligne**. Mobile et ordinateur, clair et sombre.

## 6. Briefs par écran (dans l'ordre de priorité)

Pour chacun : le **problème**, ce que l'on attend de vous, les **faits à respecter** (ce que le serveur sait faire) et les **questions** ouvertes.

### 6.1 E-mails (P1) : `d-09`, `d-10`, `m-08`, `m-09`
- **Problèmes** : E-1, E-2, E-3, E-4, E-5, E-7, E-8, E-9.
- **Attendu** : une relecture qui tient en un écran sur ordinateur (liste · éditeur · aperçu, actions fixées en bas du panneau) ; le parcours mobile **« deux temps »** de votre maquette précédente (liste, puis écran plein avec retour, Aperçu / Modifier) ; un **premier e-mail présélectionné** ;
  l'**état d'envoi en une ligne** en haut avec accès au détail ; les panneaux d'administration (planification, fiabilité des adresses, validation groupée, résultats par version) **hors du chemin** de la relecture (onglets, volet ou page dédiée : à vous de proposer).
- **Faits** : un e-mail rédigé est « Pas Validé » jusqu'à validation par une personne ; une adresse jetable, inutilisable ou exclue **empêche la validation** (à expliquer, pas seulement griser) ; la validation groupée est « simuler puis confirmer » **et annulable** après coup ;
  un envoi au **résultat incertain** ne repart jamais seul : une personne choisit « Non parti : le remettre dans la file » (renvoi possible) ou « Bien parti : le marquer comme envoyé » (jamais renvoyé).
  **Dessinez ce choix avec les conséquences de chaque bouton.**
- **Nouveau (à dessiner)** : bouton « Qualifier et rédiger l'e-mail (IA) » (≈ 10 s, plafond quotidien), « Réécrire » avec une consigne libre (la proposition **n'est pas enregistrée** tant qu'on ne valide pas), **version du prompt** affichée.
- **Questions** : la file doit-elle regrouper par entreprise ? Faut-il un mode « relecture rapide » au clavier (valider / rejeter / suivant) ?

### 6.2 Leads (P1) : `d-04` à `d-06`, `m-04` à `m-06`
- **Problèmes** : L-1 à L-9, T-2, T-3, T-5.
- **Attendu** : filtres (4 visibles + « Plus de filtres N », comme dans votre maquette) ; **vues enregistrées** en menu ; **barre d'actions groupées** apparaissant à la sélection, avec simulation **nommant les leads concernés** ; **sélection possible sur mobile** ;
  en-tête collant ; ligne entière cliquable (le téléphone reste un lien d'appel distinct, clairement séparé) ; **fiche latérale** repensée : en-tête avec actions rapides (appeler, écrire, **qualifier par IA**), sections repliables, modèle d'enregistrement du §4.4, historique et e-mail accessibles sans longue descente.
- **Faits** : modification groupée jusqu'à 500 lignes cochées ou tous les leads d'un filtre (5 000 au plus), droits **champ par champ** (l'agent ne peut pas changer la qualification) ; export CSV réservé aux responsables ; la fiche affiche aujourd'hui coordonnées, qualification, suivi commercial, e-mail, historique.
  **Nouveau** dans la fiche : signaux d'analyse du site (CMS, SSL, adapté au mobile, suivi publicitaire), source, qualification par IA avec sa raison.
- **Questions** : quelles colonnes sont prioritaires sur 1280 px ? Une vue « Kanban dans Leads » est-elle utile ou le Pipeline suffit-il ?

### 6.3 Appels (P1 pour l'usage futur ; le chantier est reporté mais la maquette doit être juste) : `d-08`, `m-07`
- **Problèmes** : A-1 à A-4.
- **Attendu** : ordinateur : raccourcis **1 à 7 et P** avec le composant `.kbd`, file à venir, issues fixées à droite, annulation 5 s ; mobile : **tout dans un écran sans défiler** (numéro en grand, issues sous le pouce, note repliée par défaut), **sans que la barre basse masque quoi que ce soit** ;
  **hiérarchie des issues** (positive, neutre, définitive) pour éviter les erreurs.
- **Faits** : « Ne répond pas », « Répondeur », « Barrage secrétaire » **laissent le prospect dans la file** (3 essais puis « Injoignable ») ; « À rappeler » le sort de la file ; « Mauvais numéro » le classe injoignable ; « Pas intéressé » le **perd** ; « RDV fixé » le passe en « RDV programmé ».
  L'annulation n'existe pas encore côté serveur.

### 6.4 Pipeline (P1) : `d-03`, `m-03`, `s-03`
- **Problèmes** : PL-1 à PL-5.
- **Attendu** : colonnes dont **chacune défile seule**, en-têtes collants, glisser-déposer **et** clavier (poignée, Espace, flèches, Entrée) comme dans votre maquette ; la **rangée de raccourcis** vers une étape ; carte compacte (nom, ville, qualification ; le reste en second plan) ;
  échec d'enregistrement : la carte revient avec un message. Mobile : une étape à la fois avec déplacement par feuille « Déplacer vers… ».
- **Faits** : neuf étapes ; une étape **ne recule jamais** automatiquement sous l'effet d'un appel mais se déplace librement à la main ; les leads **sans étape** sont hors tableau (compteur à afficher).

### 6.5 Réglages (P1 pour les créneaux) : `d-14`, `m-11`
- **Problèmes** : R-1 à R-4.
- **Attendu** : onglets (Contenu des e-mails · Envoi · Adresse de test · **Sourcing et IA**) ; **créneaux jour par jour** (case, heure de début, durée) ; bandeau « N modifications non enregistrées » ; **simulation en trois étapes** pour les changements d'envoi avec effets chiffrés (comme dans votre maquette) ;
  carte « Gérés par le serveur » qui explique pourquoi ils ne sont pas modifiables ici.
- **Faits** : plafond quotidien recommandé 50 (réputation du domaine) ; créneaux en heure de Paris ; **modifiable seulement par un administrateur** (les responsables lisent) ; chaque changement est journalisé.
- **Nouveau (Sourcing et IA)** : plafond de dépense par jour (€), résultats max par recherche, plafond d'appels à l'IA par jour, qualification automatique oui/non, modèle d'IA ; état « clé manquante ».

### 6.6 Sourcing (P2) : `d-12`, `m-10`
- **Problèmes** : S-1 à S-5.
- **Attendu** : distinguer avertissement et résultat (couleurs et icônes) ; hiérarchie de la **simulation** (coût, doublons probables, budget restant) ; **barre de progression** ; **qualification des leads trouvés** (« 12 trouvés · 9 qualifiés par l'IA · 3 en cours ») ; erreurs du fournisseur traduites en langage métier avec la marche à suivre ;
  lien « Voir les leads » **propre à la recherche**.
- **Faits** : deux sources (Google Maps : établissement et standard, **sans contact ni e-mail** ; LinkedIn : décideurs avec e-mail validé) ; seuls les numéros français sont gardés ; les doublons sont écartés ; la recherche peut être annulée (le coût engagé reste dû).

### 6.7 Utilisateurs, Journal d'audit, Import, Adresses exclues, Nouveau lead, Connexion, Profil (P2)
- **Utilisateurs** (U-1 à U-4) : liste d'abord, création en volet ; **pastille d'état** ; actions regroupées (menu « … ») ; **confirmation avec conséquences** pour désactiver ; cartes sur mobile.
- **Journal** (AU-1) : filtres (période, action, utilisateur, objet), **libellé français** au-dessus du code, colonne **Utilisateur**, détail dans la fiche latérale, export CSV, regroupement ou masquage du bruit (connexions).
  *Fait* : le journal enregistre action, objet, adresse IP et des données libres ; un « avant / après » **n'existe aujourd'hui que pour certaines actions** : dessiner l'écran, **nous indiquerons ce qui doit être enregistré en plus**.
- **Import** (I-1) : zone de dépôt, **quatre étapes** visibles (Choisir, Simuler, Relire le rapport, Confirmer), rapport chiffré lisible ; le fichier n'est jamais conservé ; rejouable sans doublon.
- **Adresses exclues** (X-1) : pastille de motif (désinscription, rebond, plainte, manuel), **lead lié**, filtres cliquables. **Décision à prendre avec nous** : retrait d'une exclusion (§7).
- **Nouveau lead** (N-1) : groupes Entreprise · Contact · Suivi, facultatifs marqués, **doublon probable signalé avant création** (même site ou même téléphone), « Ouvrir la fiche » / « Créer quand même ».
- **Connexion** (C-1) : marque, **essais restants**, **compte à rebours** du blocage (5 échecs), retour à la page d'origine, afficher/masquer le mot de passe.
- **Profil** (PR-1) : mention « mémorisé pour ce compte, sur tous vos appareils » ; afficher/masquer.

### 6.8 Tableau de bord (P2) : `d-02`, `m-02`
- D-1 à D-5 : indicateurs cliquables (liste filtrée correspondante), « Secteurs » (les 6 premiers + « voir tout »), hauteurs de cartes adaptées, raccourcis d'action, accord des textes (« 1 RDV programmé »).

### 6.9 Navigation globale
- **Barre latérale** : l'ordre et le regroupement actuels (Pilotage · Prospection · Administration) vous conviennent-ils ? Où placer **Sourcing** et **Pipeline** sur mobile (aujourd'hui dans « Plus ») ?
  Proposez les destinations de la barre basse **par rôle** : Responsable (E-mails, Leads, Sourcing, Bord) ≠ Agent (Appels, Leads, Bord…).
- **Notifications** (cloche) : reportées ; dessinez seulement l'**emplacement** et l'état « aucune ».

## 7. Décisions à trancher avec nous (ne les devinez pas)

1. **Retirer une adresse exclue** : votre maquette l'autorise (confirmation + raison). L'application l'interdit **volontairement** (l'opposition d'une personne doit être respectée). Proposez les deux variantes ; nous choisirons.
2. **Qualification « Chaud »** des prospects Google Maps (effectif inconnu) : pouvez-vous dessiner l'affichage d'un prospect « qualifié sans effectif » (indice : nombre d'avis) ?
3. **Annulation d'un appel** (5 s) : à conserver dans le dessin ; le serveur sera complété.
4. **Priorité** : l'équipe n'a pas encore de commerciaux ; les écrans **E-mails, Leads, Sourcing, Pipeline** passent avant **Appels**.

## 8. Critères d'acceptation

Pour valider la nouvelle maquette, nous vérifierons :

- [ ] chaque constat **P1** du rapport a une réponse visible (planche ou justification d'un refus) ;
- [ ] **aucun nouveau composant** n'est utilisé sans figurer dans les planches Composants ;
- [ ] toutes les pages en **clair et sombre**, **ordinateur et mobile**, avec leurs **états** (§5) ;
- [ ] un **parcours bout en bout** jouable pour : relire et valider un e-mail ; modifier plusieurs leads ; lancer une recherche de prospects ; régler les créneaux d'envoi ;
- [ ] **aucune dépendance externe** et **aucun style en ligne** nécessaires pour l'intégrer ;
- [ ] les **textes sont en français**, sans identifiant technique comme texte principal ;
- [ ] la **réduction des animations** est respectée pour toute nouvelle animation.

## 9. Ordre de travail proposé

1. **Lot A (fondations)** : principes du §4 (densité, barre d'outils, statuts, enregistrement, actions risquées, opérations longues, tableaux et mobile). Planches Composants mises à jour.
2. **Lot B (quotidien)** : E-mails, Leads (liste et fiche), Sourcing, Pipeline.
3. **Lot C (administration)** : Réglages, Utilisateurs, Journal, Import, Adresses exclues, Nouveau lead, Connexion, Profil, Tableau de bord.
4. **Lot D (reporté)** : Appels (ordinateur et mobile) et notifications.

Pour chaque lot, signalez ce qui **impose un changement côté serveur** (nous le construirons) : par exemple « avant / après » du journal, annulation d'un appel, état de progression de la qualification d'une recherche.
