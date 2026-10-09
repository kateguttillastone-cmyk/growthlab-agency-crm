# 07 — Feuille de route

Ordre de construction du nouveau GAC Pilot. Chaque phase se termine par une version **déployée** et utilisable ;
on ne commence pas la suivante tant que les critères d'acceptation ne sont pas vérifiés. Les identifiants renvoient au
[PRD](02_product_requirements_document.md). Aucune durée n'est promise : elles dépendent de l'équipe disponible.

## Phase 1 — Socle ✅ (ce dépôt)

Livré : monorepo pnpm, API Fastify/Drizzle, PostgreSQL + migrations, comptes nominatifs et rôles, sessions serveur,
verrouillage et limitation de débit, journal d'audit, `/health`, interface (connexion, utilisateurs, audit, profil), Docker
(dev et production), CI (lint, types, tests sur vraie base, build, images, contrôle des secrets, migrations à jour),
déploiement automatique `dev` / `main`, sauvegarde, restauration, retour arrière, documentation.

À faire **une fois, côté serveur et GitHub** (pas dans le code) : [docs/08-deploiement.md](08-deploiement.md).

## Phase 2 — Leads ✅ (livrée)

Livré : modèle `companies` / `contacts` / `leads` / `email_messages` / `suppressions` / `lead_events`
([06](06-modele-donnees.md)) ; **import rejouable de l'export CSV d'Airtable**, en ligne de commande **et par l'interface** (menu Import : simulation,
rapport sans donnée personnelle, confirmation, empreinte du fichier, journal d'audit ; doublons fusionnés, 57 adresses exclues) ; API `GET /leads` (pagination, tri, 11 filtres, recherche texte), `GET /leads/facets`,
`GET /leads/:id`, `PATCH /leads/:id` (droits **par champ et par rôle**, historique, règle « le statut d'appel ne fait jamais
reculer le pipeline ») ; écran **Leads** (vues rapides, filtres dans l'adresse, tri accessible, fiche latérale, historique).

Mesuré sur les 1 971 leads réels (environnement de test, hors VPS) : liste, filtres et recherche en 4 à 12 ms.
Détails et chiffres : [11](11-analyse-export-airtable.md).

**Reste de la phase 2** (non livré) : actions groupées sur les lignes filtrées, vues enregistrées par utilisateur,
grille éditable en place, export CSV, choix du responsable (liste des utilisateurs pour les responsables).

> **Priorités revues d'après les données réelles ([11](11-analyse-export-airtable.md)).** Le Kanban et la valeur des deals
> n'ont aucun usage à ce jour (0 ligne renseignée) ; l'équipe a besoin de **(1) la file d'appel de 783 prospects**, **(2) la
> relecture de 363 e-mails**, **(3) la fiabilisation des adresses** (7,1 % de rebonds, 10 désinscrits). Ordre conseillé :
> phase 4 (e-mails) avant le Kanban, et dans la phase 3 la file d'appel avant le tableau de bord.

## Phase 3 — File d'appel, pipeline et dashboard (EXG-F-010..014, EXG-F-050..056)

- **File d'appel (réalisée : page « Appels »)** : prochain prospect à appeler (« À appeler », trié par zone et qualification), enregistrement de l'issue en
  deux clics, relances 1 et 2 ; l'étape du pipeline suit **sans jamais reculer** (déjà implémenté côté API).
- Kanban accessible (glisser-déposer **et** clavier), valeur des deals, packs issus de la table `packs` — à n'entreprendre
  que si l'équipe s'en sert (aucun usage à ce jour).
- KPI et entonnoirs calculés en SQL sur la période choisie (**réalisé** : `GET /dashboard`, page d'accueil : 6 indicateurs, entonnoirs qualification / secteurs / pipeline, leads chauds à valider, 8 derniers leads ; période : toute / 7 / 30 / 90 jours / personnalisée, sur la date de détection). Les statistiques Brevo (EXG-F-015) viendront avec le lot 4c.

**Acceptation** : CA-02, CA-06, CA-07 du PRD passent en test automatisé ; un commercial traite 20 prospects de la file sans quitter l'écran
(vérifié dans Chromium sur des données fictives pour la file d'appel).

*Règles de la file d'appel* : le résultat de l'appel va dans la première case libre (appel, relance 1, relance 2) ; rendez-vous,
refus, mauvais numéro et « à rappeler » sortent de « À appeler » ; absence de réponse, répondeur et barrage y restent jusqu'à
3 essais, puis « Injoignable » ; l'étape du pipeline ne recule jamais ; la note s'ajoute au commentaire sans l'effacer. Tout est décidé
sur l'état verrouillé du lead (`POST /leads/:id/call`) : deux appels simultanés ne s'écrasent pas.

## Phase 4 — E-mails (EXG-F-042..047, EXG-A-020..024, EXG-A-043) — **prioritaire**

Découpée en trois lots livrables séparément : **4a relecture et validation** (réalisée : page « E-mails », aperçu rendu par
l'API, validation unitaire et groupée avec simulation, statistiques par version du prompt, aucun envoi), **4b fiabilité des
adresses** (réalisée : contrôle de syntaxe, adresses jetables et DNS du domaine, validation interdite sur adresse inutilisable), **4c envoi planifié** (Brevo, créneaux, plafond, webhooks). Le lot 4c ne démarre qu'avec une clé Brevo, une adresse
d'expéditeur et le texte d'opposition fournis par l'équipe, d'abord en `SEND_MODE=test`, jamais en même temps que la chaîne n8n.

*Pourquoi d'abord : 665 e-mails sont déjà partis à de vrais prospects, 7,1 % ont rebondi, 10 personnes se sont désinscrites, et
520 nouveaux e-mails attendent d'être relus. Chaque envoi supplémentaire sans contrôle aggrave le risque pour la réputation de
l'expéditeur.*

- Validation unitaire et en masse (une requête SQL, transactionnelle) ; aperçu **rendu par l'API** (un seul gabarit).
- File d'envoi pg-boss : créneaux (lundi 14 h, mardi–jeudi 9 h, Paris), anti-doublon par contrainte, `SEND_MODE=test|prod`.
- Brevo : envoi, webhooks de statuts (délivré, ouvert, rebond, désinscription, plainte), table `suppressions`.
- Mention d'opposition dans chaque email, adresse d'expéditeur dédiée, plafond quotidien configurable.
- **Vérification des adresses avant envoi** (fournisseur de vérification, ou à défaut contrôle MX) : 47 des 665 adresses ont rebondi.
- **Contrôle systématique de `suppressions`** (déjà alimentée par l'import avec 57 adresses) avant tout envoi.
- Statuts de retour de Brevo (délivré, ouvert, rebond, désinscription, plainte) écrits en base par webhook.

**Acceptation** : CA-13 (créneaux), un test qui lance **10 workers concurrents** sur le même message et vérifie un seul envoi,
un test de désinscription qui bloque tout envoi ultérieur, et un envoi réel de bout en bout vers une boîte de test.

## Phase 5 — Sourcing et scoring (EXG-F-040..041, EXG-A-001..010, EXG-F-091)

- `sourcing_runs` : état, coût estimé, erreurs ; appel Apify avec suivi d'état (plus d'attente fixe).
- Enrichissement (technos, SEO) puis scoring par l'API Anthropic avec **sortie structurée** (schéma Zod partagé) ; prompt
  versionné dans le dépôt ; jeu d'évaluation pour comparer deux versions du prompt.
- Catalogue unique (packs, qualifications) injecté dans le prompt ; `Pack`, segment et services secondaires enregistrés.
- Plafonds de coût par jour et par utilisateur.

**Acceptation** : un sourcing de 20 leads se termine avec un état visible, aucun doublon, aucune clé dans les journaux ;
CA-12 passe.

## Phase 6 — Durcissement (EXG-NF-009, EXG-NF-013)

Tests de bout en bout (Playwright : connexion, validation d'email, Kanban), audit d'accessibilité (axe), tests de charge
(k6) rejoués avant chaque changement de taille de serveur, double authentification (TOTP), supervision et alertes,
sauvegarde en continu (WAL) si le scénario de croissance l'exige.

## En parallèle, dès maintenant : sécuriser le workflow n8n actuel

Tant que l'ancien système tourne, ces points sont **urgents** et indépendants du nouveau code
([10 §2](10-sortie-airtable-n8n.md)) : rotation des clés exposées, mode d'envoi test/production, authentification de
`search-leads`, garde anti double envoi.

## Décisions à valider avant la phase 2

1. Durée de conservation des données de prospects et procédure d'effacement (RGPD).
2. Objectifs de performance chiffrés (temps d'affichage, nombre d'utilisateurs simultanés).
3. Règle de non-recul de l'étape du pipeline.
4. Périmètre des rôles : un `AGENT` voit-il tous les leads ou seulement les siens ?
5. Conserver ou non l'accès direct aux données par un outil de type tableur (NocoDB/Baserow) après la sortie d'Airtable.
