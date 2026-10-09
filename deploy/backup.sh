#!/usr/bin/env bash
# Sauvegarde de GAC Pilot (base PostgreSQL), avec rotation et copie facultative hors du serveur.
#   deploy/backup.sh                       # production (projet « growthlab »)
#   PROJECT=growthlab-dev ENV_FILE=.env.dev deploy/backup.sh
# Variables facultatives : PROJECT, ENV_FILE, BACKUP_DIR (défaut ~/backups/$PROJECT), KEEP_DAYS (14),
#   BACKUP_RCLONE_REMOTE (ex. « stockage:gac-backups » : copie chiffrée/hors site via rclone, voir docs/09).
# Une sauvegarde qui reste sur le même serveur ne protège pas d'une panne du serveur : configurez la copie hors site.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${PROJECT:-growthlab}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/$PROJECT}"
KEEP_DAYS="${KEEP_DAYS:-14}"
FILE="$BACKUP_DIR/$PROJECT-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

mkdir -p "$BACKUP_DIR"
docker compose -p "$PROJECT" -f docker-compose.prod.yml --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U gac --clean --if-exists gac | gzip > "$FILE"
# une sauvegarde vide ou tronquée est pire que pas de sauvegarde : on vérifie
gzip -t "$FILE"
[ "$(gzip -dc "$FILE" | grep -c 'CREATE TABLE')" -ge 3 ] || { echo "Sauvegarde suspecte (trop peu de tables)"; rm -f "$FILE"; exit 1; }
chmod 600 "$FILE"

find "$BACKUP_DIR" -maxdepth 1 -name "$PROJECT-*.sql.gz" -type f -mtime "+$KEEP_DAYS" -delete

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  command -v rclone >/dev/null || { echo "rclone introuvable alors que BACKUP_RCLONE_REMOTE est défini"; exit 1; }
  rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE/$PROJECT/" --quiet
  echo "copie hors site OK : $BACKUP_RCLONE_REMOTE/$PROJECT/"
fi
echo "$(date '+%F %T') sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
