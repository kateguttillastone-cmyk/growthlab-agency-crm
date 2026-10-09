# Contexte de construction : la RACINE du dépôt (workspace pnpm).
#   docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @gac/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @gac/api build \
 && pnpm --filter @gac/api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/drizzle /out/

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/dist ./dist
COPY --from=build /out/drizzle ./drizzle
USER node
EXPOSE 3001
# Applique les migrations (verrou consultatif : sûr même si deux instances démarrent), puis lance l'API.
# L'administrateur initial est créé au démarrage de l'API depuis SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
CMD ["sh", "-c", "node dist/migrate.js && node dist/main.js"]
