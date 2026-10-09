#!/usr/bin/env bash
# Cherche des secrets évidents dans les fichiers suivis par Git (clés d'API, clés privées, jetons).
# Exécuté en CI. Ce n'est pas un remplaçant de la protection native de GitHub (secret scanning + push protection),
# mais il bloque les fuites les plus probables : un export de workflow n8n avec ses clés, par exemple.
set -euo pipefail
cd "$(dirname "$0")/.."
PATTERNS='sk-ant-[A-Za-z0-9_-]{20,}|apify_api_[A-Za-z0-9]{20,}|xkeysib-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}'
# les fichiers de ce contrôle et la documentation citent des préfixes de clés sans valeur réelle
if git ls-files -z -- ':!scripts/check-no-secrets.sh' ':!docs' ':!pnpm-lock.yaml' | xargs -0 grep -nIE -- "$PATTERNS"; then
  echo "❌ Secret probable détecté ci-dessus. Retirez-le, révoquez la clé, puis recommencez." >&2
  exit 1
fi
echo "✅ Aucun secret évident dans les fichiers suivis."
