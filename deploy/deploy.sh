#!/usr/bin/env bash
# Déploiement d'une branche sur ce serveur. Appelé par GitHub Actions (.github/workflows/deploy.yml)
# via une clé SSH restreinte (command="…/deploy.sh"), ou à la main :
#
#   deploy/deploy.sh main            # production -> ~/growthlab      (.env.prod, projet « growthlab »)
#   deploy/deploy.sh dev             # test       -> ~/growthlab-dev  (.env.dev,  projet « growthlab-dev »)
#   deploy/deploy.sh rollback main   # revient à la dernière version qui a démarré correctement
#   deploy/deploy.sh rollback main <sha>   # revient à un commit précis
#
# Étapes : récupérer le code, sauvegarder la base, reconstruire, vérifier l'API de bout en bout (web -> API -> base),
# et revenir à la version précédente si le nouveau code ne démarre pas.
set -euo pipefail

# Tout dans une fonction : bash lit le script en entier avant de l'exécuter, donc le
# « git reset » peut remplacer ce fichier sans perturber l'exécution en cours.
run() {
  local mode="deploy"
  local args=("$@")
  # Appel par la clé SSH restreinte : les arguments arrivent dans SSH_ORIGINAL_COMMAND (« main » ou « rollback main <sha> »)
  if [ "${#args[@]}" -eq 0 ] && [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
    read -r -a args <<<"$SSH_ORIGINAL_COMMAND"
  fi
  if [ "${args[0]:-}" = "rollback" ]; then mode="rollback"; args=("${args[@]:1}"); fi
  BRANCH="${args[0]:-}"
  TARGET_SHA="${args[1]:-}"
  # un SHA éventuel ne peut contenir que des caractères hexadécimaux (la valeur vient d'une commande SSH)
  if [ -n "$TARGET_SHA" ] && ! [[ "$TARGET_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then echo "SHA invalide"; exit 2; fi
  case "$BRANCH" in
    main) DIR="$HOME/growthlab";     PROJECT="growthlab";     ENV_FILE=".env.prod" ;;
    dev)  DIR="$HOME/growthlab-dev"; PROJECT="growthlab-dev"; ENV_FILE=".env.dev"  ;;
    *) echo "Branche inconnue : '$BRANCH' (attendu : main ou dev)"; exit 2 ;;
  esac

  cd "$DIR"
  exec 9>"/tmp/deploy-$PROJECT.lock"
  flock -n 9 || { echo "Un déploiement de $BRANCH est déjà en cours"; exit 3; }

  compose() { docker compose -p "$PROJECT" -f docker-compose.prod.yml --env-file "$ENV_FILE" "$@"; }
  web_port="$(grep -E '^WEB_PORT=' "$ENV_FILE" | cut -d= -f2 || true)"
  base_url="http://127.0.0.1:${web_port:-3020}"
  mkdir -p .deploy

  # /api/health traverse le conteneur web, l'API et la base : 200 = toute la chaîne répond.
  wait_healthy() {
    for _ in $(seq 1 40); do
      [ "$(curl -s -o /dev/null -w '%{http_code}' "$base_url/api/health" || true)" = 200 ] && return 0
      sleep 3
    done
    return 1
  }

  start_version() {  # $1 = commit à déployer
    git reset --hard "$1"
    APP_VERSION="$(git rev-parse --short HEAD)" compose up -d --build --remove-orphans
  }

  PREVIOUS="$(git rev-parse HEAD)"
  if [ "$mode" = "rollback" ]; then
    TARGET="${TARGET_SHA:-$(cat .deploy/last_good 2>/dev/null || true)}"
    [ -n "$TARGET" ] || { echo "Aucune version de référence (.deploy/last_good absent) : précisez un commit."; exit 4; }
    git fetch --quiet origin "$BRANCH"
    TARGET="$(git rev-parse "$TARGET")"
    echo "→ RETOUR ARRIÈRE $BRANCH : $PREVIOUS -> $TARGET"
  else
    git fetch --quiet origin "$BRANCH"
    TARGET="$(git rev-parse "origin/$BRANCH")"
    echo "→ $BRANCH : $PREVIOUS -> $TARGET"
    if [ "$PREVIOUS" = "$TARGET" ] && wait_healthy; then
      echo "Déjà à jour."
      exit 0
    fi
  fi

  # Sauvegarde AVANT de toucher à la base (les migrations s'appliquent au démarrage de l'API)
  if compose ps --status running postgres 2>/dev/null | grep -q postgres; then
    echo "→ Sauvegarde avant déploiement"
    PROJECT="$PROJECT" ENV_FILE="$ENV_FILE" deploy/backup.sh
  fi

  echo "→ Construction et démarrage"
  start_version "$TARGET"

  if wait_healthy; then
    echo "$TARGET" > .deploy/last_good
    [ "$mode" = "deploy" ] && echo "$PREVIOUS" > .deploy/previous
    docker image prune -f >/dev/null
    echo "OK : $BRANCH déployé ($TARGET)"
    exit 0
  fi

  echo "ÉCHEC : l'application ne répond pas. Retour à $PREVIOUS"
  compose logs --tail 40 api || true
  start_version "$PREVIOUS"
  wait_healthy && echo "Ancienne version rétablie." || echo "L'ancienne version ne répond pas non plus : intervention manuelle nécessaire."
  echo "Attention : si la nouvelle version avait modifié la base, restaurez la dernière sauvegarde (docs/09-exploitation.md)."
  exit 1
}

run "$@"
