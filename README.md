# GAC Pilot — CRM de prospection de GrowthLab Agency

Nouvelle version de GAC Pilot : une API TypeScript (Fastify) sur **PostgreSQL**, une interface React, déployées en
Docker Compose sur un VPS. Elle remplace progressivement l'ancienne application (Airtable + n8n + Netlify), conservée
dans [`legacy/`](legacy/) comme référence fonctionnelle.

## État d'avancement

| Phase | Contenu | État |
|---|---|---|
| 1 — Socle | Monorepo, API Fastify, PostgreSQL + migrations, comptes nominatifs et rôles (ADMIN > MANAGER > AGENT > VIEWER), sessions serveur, verrouillage et limitation de débit, journal d'audit, `/health`, interface (connexion, utilisateurs, audit, profil), Docker, CI, déploiement automatique `dev`/`main`, sauvegardes, retour arrière | ✅ |
| 2 — Leads | Entreprises / contacts / leads, grille paginée et filtrée côté serveur, édition, historique, import depuis Airtable | à venir |
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
docs/            Conception (01-05) et documentation du nouveau socle (06-10)
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

## Dépannage (Docker)

| Symptôme | Cause probable | Solution |
|---|---|---|
| `getaddrinfo ENOTFOUND postgres` dans le journal de l'API | l'API ne trouve pas le service `postgres` : base arrêtée, ou conteneurs sur des réseaux Docker différents | `docker compose down` puis `docker compose up --build` ; vérifier `docker compose ps -a` et `docker network ls` ; l'API réessaie pendant 60 s (`DB_WAIT_SECONDS`) avant d'abandonner avec un message qui nomme l'hôte |
| `ECONNREFUSED` vers la base | la base démarre encore (premier lancement : initialisation) | attendre ; l'API réessaie seule |
| Anciennes données ou mot de passe qui ne change pas | le volume `pgdata` garde l'ancienne base | `docker compose down -v` (efface la base) |
| Port 5432, 3001 ou 8080 déjà pris | un autre programme (PostgreSQL installé en local, par exemple) | l'arrêter, ou changer le port à gauche du `:` dans `docker-compose.yml` |

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

## Branches et déploiement

`feature/*` → PR → `dev` (déploiement automatique sur l'environnement de test) → PR → `main` (production, avec
approbation si l'environnement GitHub « production » l'exige). Le CI doit être vert. Retour arrière : workflow
« Retour arrière » ou `deploy/deploy.sh rollback main`. Guide complet : [docs/08-deploiement.md](docs/08-deploiement.md) ;
exploitation, sauvegardes, restauration : [docs/09-exploitation.md](docs/09-exploitation.md).

## Sortie d'Airtable et d'n8n

Plan de migration, correspondance des champs et correctifs de sécurité à appliquer **tout de suite** sur le workflow
n8n actuel (clés exposées, mode d'envoi, webhook ouvert, double envoi) :
[docs/10-sortie-airtable-n8n.md](docs/10-sortie-airtable-n8n.md).
