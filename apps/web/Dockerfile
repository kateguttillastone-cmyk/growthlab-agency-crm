# Contexte de construction : la RACINE du dépôt (workspace pnpm).
#   docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @gac/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @gac/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine
# Les fichiers *.template sont passés à envsubst au démarrage (variable API_UPSTREAM)
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://api:3001
EXPOSE 8080
