# GAC Pilot — CRM de prospection de GrowthLab Agency

Nouvelle version de GAC Pilot : une API TypeScript (Fastify) sur **PostgreSQL**, une interface React, déployées en
Docker Compose sur un VPS. Elle remplace progressivement l'ancienne application (Airtable + n8n + Netlify), conservée
dans [`legacy/`](legacy/) comme référence fonctionnelle.

## État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 1 — Socle | Monorepo, API Fastify, PostgreSQL + migrations, comptes nominatifs et rôles (ADMIN > MANAGER > AGENT > VIEWER), sessions serveur, verrouillage et limitation de débit, journal d'audit, `/health`, interface (connexion, utilisateurs, audit, profil), Docker, CI, déploiement automatique `dev`/`main`, sauvegardes, retour arrière | ✅ |
| 2 — Leads | Entreprises / contacts / leads, **import rejouable de l'export Airtable**, liste paginée et filtrée côté serveur (4 à 12 ms sur 1 971 leads), fiche, édition par rôle, historique | ✅ (reste : actions groupées, vues enregistrées) |
| 3 — Pipeline | Kanban, règle statut d'appel → étape, valeur des deals | à venir |
| 4 — Emails | Validation, aperçu rendu par l'API, envoi planifié avec anti-doublon, Brevo, statuts, liste de désinscription | à venir |
| 5 — Sourcing | Apify, enrichissement, scoring Claude (sortie structurée), suivi des exécutions | à venir |
| 6 — Tableaux de bord et durcissement | KPI, tests de bout en bout et de charge, 2FA, supervision | à venir |

Détail, critères d'acceptation et ordre : [docs/07-feuille-de-route.md](docs/07-feuille-de-route.md).

## Structure

```
apps/api         API Fastify + Drizzle (PostgreSQL) — auth, utilisateurs, audit, santé
apps/web         Interface React + Vite + Tailwind, servie par nginx en production
packages/shared  Schémas Zod, rôles et catalogue métier partagés entre l'API et l'interface
deploy/          Scripts du serveur : deploy.sh, backup.sh, restore.sh, Caddyfile, env.prod.example
docs/            Conception (01-05) et documentation du nouveau socle (06-11)
legacy/          Ancienne application (artifact HTML, build Netlify) — à ne plus modifier
```

## Démarrage

Prérequis : Node.js 22, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
docker compose up -d postgres                  # PostgreSQL 16 sur localhost:5432
cp .env.example apps/api/.env
pnpm db:migrate                                # applique les migrations
pnpm dev:api                                   # http://localhost:3001  (Swagger : /docs)
pnpm dev:web                                   # http://localhost:5173  (proxy /api -> API)
```

Compte initial : celui de `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (`admin@gac.local` / `ChangeMe-Please-123` dans
`.env.example`). **À changer hors développement.**

Pile complète en conteneurs : `docker compose up --build` → http://localhost:8080.
Si un port est déjà pris (message « ports are not available »), créez un fichier `.env` **à la racine** du dépôt
(il est ignoré par Git) : `WEB_PORT=8081`, et au besoin `API_PORT=3002` ou `POSTGRES_PORT=5433`. L'adresse à ouvrir
devient http://localhost:8081. Sous Windows, pour trouver le programme qui occupe un port :
`netstat -ano | findstr :8080` puis `tasklist /FI "PID eq <numéro>"` (ou `docker ps` si c'est un autre projet Docker).

## Dépannage (Docker)

| Symptôme | Cause probable | Solution |
|---|---|---|
| `getaddrinfo ENOTFOUND postgres` dans le journal de l'API | l'API ne trouve pas le service `postgres` : base arrêtée, ou conteneurs sur des réseaux Docker différents | `docker compose down` puis `docker compose up --build` ; vérifier `docker compose ps -a` et `docker network ls` ; l'API réessaie pendant 60 s (`DB_WAIT_SECONDS`) avant d'abandonner avec un message qui nomme l'hôte |
| `ECONNREFUSED` vers la base | la base démarre encore (premier lancement : initialisation) | attendre ; l'API réessaie seule |
| Anciennes données ou mot de passe qui ne change pas | le volume `pgdata` garde l'ancienne base | `docker compose down -v` (efface la base) |
| `ports are not available` / `Only one usage of each socket address` | le port 8080, 3001 ou 5432 est pris par un autre programme ou un autre projet Docker | fichier `.env` à la racine avec `WEB_PORT=8081` (ou `API_PORT`, `POSTGRES_PORT`), puis `docker compose up --build` |

## Qualité

```bash
pnpm lint          # Biome
pnpm typecheck     # TypeScript, tous les paquets
pnpm test          # shared + web + API (l'API a besoin d'une base PostgreSQL JETABLE)
pnpm build
```

Les tests de l'API tournent sur une **vraie base** : `DATABASE_URL` doit viser une base dont le nom contient `test`
(les tables sont vidées entre les tests). Exemple :

```bash
docker compose exec postgres createdb -U gac gac_test
DATABASE_URL=postgresql://gac:gac@localhost:5432/gac_test pnpm test
```

## Tableau de bord

Page d'accueil : indicateurs (leads, qualifiés, e-mails validés et envoyés, à appeler, RDV, deals), trois entonnoirs, leads chauds à traiter en priorité et derniers leads, sur la période choisie. Les montants affichent « aucune valeur saisie » tant que la valeur des deals n'est pas renseignée.

## File d'appel

Menu **Appels** (agents et plus) : un prospect à la fois, les jamais-appelés d'abord et regroupés par ville, numéro cliquable,
notes précédentes, puis l'issue de l'appel en un clic (le suivant s'affiche aussitôt). Onglet « À rappeler » pour les rappels
promis ; filtres par ville et qualification ; « Passer » pour laisser un prospect de côté. Règles : `docs/07-feuille-de-route.md` (phase 3).

## Relire et valider les e-mails

Menu **E-mails** (responsables et administrateurs) : file des e-mails à relire (les plus chauds d'abord), aperçu exact de l'e-mail
final (gabarit du serveur : agenda et signature ajoutés), points d'attention non bloquants, validation ou rejet unitaire
avec passage au suivant, et **validation groupée** sur les filtres affichés (simulation puis confirmation). Une adresse
exclue (rebond, désinscription) ne peut pas être validée. Le bouton **Vérifier les adresses** écarte les adresses mal formées, jetables ou dont le domaine ne reçoit pas de courrier. **Aucun envoi n'a lieu** depuis cet écran. Détails : `docs/06-modele-donnees.md`.

## Importer l'ancienne base (une fois)

Le CSV d'Airtable contient des données de prospects : il ne va **jamais dans le dépôt** (`data/` et `*.csv` sont ignorés par Git).

**Par l'interface** (administrateur) : menu **Import** → choisir le fichier → relire le rapport de simulation (rien n'est écrit) →
**Importer** → confirmer. Le fichier n'est pas conservé ; l'opération est tracée dans le journal d'audit ; maximum 10 Mo et
20 000 lignes. L'import réel exige l'empreinte du fichier simulé : c'est forcément celui que vous avez relu.

**En ligne de commande** (gros fichiers, automatisation) :

```bash
docker compose up -d postgres
docker compose run --rm -v "${PWD}/data:/data:ro" api node dist/import.js /data/export.csv --dry-run   # simulation
docker compose run --rm -v "${PWD}/data:/data:ro" api node dist/import.js /data/export.csv             # import réel
```

Dans les deux cas : rejouable sans doublon, sans écraser vos modifications. Analyse de l'export réel :
[docs/11-analyse-export-airtable.md](docs/11-analyse-export-airtable.md).

## Règles de sécurité implémentées

- Pas d'inscription publique : le premier `ADMIN` vient de l'environnement, puis il crée les comptes.
- Mots de passe : argon2id, 12 caractères minimum. Verrouillage du compte après 5 échecs (15 min), message d'erreur
  identique que l'e-mail existe ou non, limitation de débit sur la connexion.
- Session serveur dans un cookie `HttpOnly`, `Secure` (production), `SameSite=Lax` ; seule l'empreinte SHA-256 du jeton
  est stockée. Expiration par inactivité (12 h) et absolue (14 jours). Désactiver un compte ou changer son rôle ferme
  ses sessions.
- Contrôle de l'origine des requêtes qui modifient des données (en plus de `SameSite`).
- Les autorisations sont appliquées **côté serveur** ; l'interface ne fait que masquer.
- Journal d'audit des connexions, comptes et mots de passe (jamais de secret dans le journal).
- Import de fichier : administrateurs seulement, taille et nombre de lignes bornés, encodage et format vérifiés, empreinte exigée entre la
  simulation et l'import, un seul import à la fois, rapport sans donnée de prospect, aucun fichier conservé.
- Leads : droits **par champ et par rôle** vérifiés côté serveur (un commercial ne peut pas changer la qualification, la valeur ni
  le responsable), historique de chaque modification, liens issus des données limités à http(s) (jamais `javascript:`).

## Branches et déploiement

`feature/*` → PR → `dev` (déploiement automatique sur l'environnement de test) → PR → `main` (production, avec
approbation si l'environnement GitHub « production » l'exige). Le CI doit être vert. Retour arrière : workflow
« Retour arrière » ou `deploy/deploy.sh rollback main`. Guide complet : [docs/08-deploiement.md](docs/08-deploiement.md) ;
exploitation, sauvegardes, restauration : [docs/09-exploitation.md](docs/09-exploitation.md).

## Sortie d'Airtable et d'n8n

Plan de migration, correspondance des champs et correctifs de sécurité à appliquer **tout de suite** sur le workflow
n8n actuel (clés exposées, mode d'envoi, webhook ouvert, double envoi) :
[docs/10-sortie-airtable-n8n.md](docs/10-sortie-airtable-n8n.md).
