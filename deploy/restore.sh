#!/usr/bin/env bash
# Restaure une sauvegarde dans la base d'un environnement. ⚠️ REMPLACE les données actuelles.
#   deploy/restore.sh main ~/backups/growthlab/growthlab-20261009T020000Z.sql.gz
#   deploy/restore.sh dev  <fichier>                  # idéal pour répéter la restauration sans risque
# Le fichier contient « DROP … IF EXISTS » puis les tables : la base est recréée à l'identique.
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="${1:?usage : restore.sh main|dev FICHIER.sql.gz}"
FILE="${2:?usage : restore.sh main|dev FICHIER.sql.gz}"
case "$BRANCH" in
  main) PROJECT="growthlab";     ENV_FILE=".env.prod" ;;
  dev)  PROJECT="growthlab-dev"; ENV_FILE=".env.dev"  ;;
  *) echo "Branche inconnue : $BRANCH"; exit 2 ;;
esac
gzip -t "$FILE"
if [ "$BRANCH" = "main" ] && [ "${CONFIRM:-}" != "oui" ]; then
  echo "Production : relancez avec CONFIRM=oui pour confirmer le remplacement des données."; exit 3
fi
compose() { docker compose -p "$PROJECT" -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"; }
echo "→ arrêt de l'API pendant la restauration"
compose stop api web
gunzip -c "$FILE" | compose exec -T postgres psql -U gac -d gac -v ON_ERROR_STOP=1 >/dev/null
echo "→ redémarrage"
compose up -d api web
echo "Restauration terminée. Vérifiez : curl -s http://127.0.0.1:\$WEB_PORT/api/health"
