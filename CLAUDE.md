# GAC Pilot — consignes pour les sessions Claude Code

CRM de prospection de GrowthLab Agency. Monorepo pnpm : `apps/api` (Fastify + Drizzle + PostgreSQL), `apps/web`
(React + Vite + Tailwind), `packages/shared` (schémas Zod, rôles, catalogue). `legacy/` = ancienne application :
référence fonctionnelle uniquement, ne pas la modifier. Vue d'ensemble : `README.md` ; plan : `docs/07-feuille-de-route.md`.

## Commandes

- `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (depuis la racine).
- Tests de l'API : `DATABASE_URL=postgresql://gac:gac@localhost:5432/gac_test pnpm test` (base JETABLE dont le nom contient « test »).
- Après un changement de `apps/api/src/db/schema.ts` : `pnpm db:generate` et commiter le SQL généré (la CI échoue sinon).
- Ne jamais éditer une migration déjà fusionnée ; en ajouter une nouvelle.

## Règles du projet

- Langue : interface, messages d'erreur, commentaires et documentation en **français** ; identifiants du code en anglais.
- Les autorisations se vérifient **côté serveur** (`app.requireRole`), jamais seulement dans l'interface.
- Toute entrée passe par un schéma Zod de `packages/shared` (une seule définition pour l'API et le front).
- Format d'erreur unique : `{ error: { code, message, details? } }` (`packages/shared/src/errors.ts`).
- Pas de `!` (assertion non nulle) : utiliser `one()` / `authOf()` (`apps/api/src/lib/assert.ts`).
- Jamais de secret, de jeton ni de donnée réelle de prospect dans le dépôt, les journaux ou les tests
  (`scripts/check-no-secrets.sh` tourne en CI). Les workflows n8n exportés doivent être expurgés avant d'être commités.
- Migrations compatibles avec la version précédente (ajouter d'abord, supprimer dans un déploiement ultérieur) : le retour
  arrière ne défait pas les migrations.
- Toute logique métier nouvelle a un test d'intégration sur la vraie base ; pas de simulation de la base.
- Interface : composants accessibles (labels, `role="alert"`, tableaux avec `caption` et `scope`), pas de style en ligne
  ni de ressource tierce (la CSP de nginx les bloque).
- Branches : `feature/*` → PR vers `dev` → PR `dev` → `main`. Pas de push direct sur `dev` ni `main`.
