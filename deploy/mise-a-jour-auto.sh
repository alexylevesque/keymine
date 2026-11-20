#!/usr/bin/env bash
# Déploiement automatique (TECH-05) : lancé par cron toutes les 5 minutes sur le serveur.
# Si GitHub a de nouveaux commits sur main, récupère le code et reconstruit les conteneurs.
# Un verrou empêche deux mises à jour en même temps ; tout est noté dans deploy/mise-a-jour.log.
set -euo pipefail

cd "$(dirname "$0")/.."
exec 9>/tmp/keymine-mise-a-jour.lock
flock -n 9 || exit 0

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0
fi

{
  echo "=== $(date -u '+%Y-%m-%d %H:%M:%S') UTC : nouvelle version $(git rev-parse --short origin/main)"
  git pull --ff-only origin main
  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
  docker image prune -f
  echo "=== terminé"
} >>deploy/mise-a-jour.log 2>&1
