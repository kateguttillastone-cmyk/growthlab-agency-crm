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

## Phase 2 — Leads (EXG-F-020..035, EXG-F-090)

- Modèle `companies` / `contacts` / `leads` / `enrichments` / `lead_events` ([06](06-modele-donnees.md)).
- Import unique depuis Airtable (script reproductible et rejouable, rapport d'écarts) — [10](10-sortie-airtable-n8n.md).
- Liste des leads **paginée, triée et filtrée côté serveur** ; recherche plein texte ; segments par service ; fiche lead.
- Édition en place avec liste blanche de champs par rôle ; historique de chaque modification.
- Interface : grille accessible (virtualisée), vues enregistrées par utilisateur.

**Acceptation** : 50 000 leads synthétiques, p95 de la liste (page de 50, deux filtres) sous le seuil convenu (à fixer avec
les utilisateurs) mesuré par k6 sur le VPS de test ; aucun champ « lecture seule » modifiable par l'API ; l'import rejoué
deux fois ne crée aucun doublon.

## Phase 3 — Pipeline et dashboard (EXG-F-010..014, EXG-F-050..056)

- Kanban accessible (glisser-déposer **et** clavier), règle statut d'appel → étape **sans recul** d'une étape plus avancée
  (décision à valider, [02 EXG-F-054]), valeur des deals, packs issus de la table `packs`.
- KPI et entonnoirs calculés en SQL sur la période choisie.

**Acceptation** : critères CA-02, CA-06, CA-07 du PRD passent en test automatisé.

## Phase 4 — Emails (EXG-F-042..047, EXG-A-020..024, EXG-A-043)

- Validation unitaire et en masse (une requête SQL, transactionnelle) ; aperçu **rendu par l'API** (un seul gabarit).
- File d'envoi pg-boss : créneaux (lundi 14 h, mardi–jeudi 9 h, Paris), anti-doublon par contrainte, `SEND_MODE=test|prod`.
- Brevo : envoi, webhooks de statuts (délivré, ouvert, rebond, désinscription, plainte), table `suppressions`.
- Mention d'opposition dans chaque email, adresse d'expéditeur dédiée, plafond quotidien configurable.

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
