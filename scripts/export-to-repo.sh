#!/usr/bin/env bash
set -euo pipefail

# Config
REPO_OWNER="pqlammy"
REPO_NAME="Gennerweb"
REPO_URL_BASE="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"

# Zielordner und Commit Message (optional Parameter)
DEST_DIR="${1:-/gennerweb-repo}"
COMMIT_MSG="${2:-sync from project root}"

# User/Token manuell abfragen
read -p "GitHub Username: " GITHUB_USER
read -s -p "GitHub Token: " GITHUB_TOKEN
echo ""

# Pfade bestimmen
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[i] Project root: ${PROJECT_ROOT}"
echo "[i] Destination : ${DEST_DIR}"
mkdir -p "${DEST_DIR}"

# Excludes für rsync
tmp_excludes="$(mktemp)"
cat <<'EXCLUDES' > "${tmp_excludes}"
# build artefacts
node_modules/
dist/
build/
.out/
.next/
vendor/
# environment / secrets
.env
.env.*
supabase/.env
supabase/.secrets
backend/.env
backend/.secrets
ssl/
logs/
# os/editor junk
.DS_Store
Thumbs.db
*.swp
# git metadata at destination should stay untouched
.git/
EXCLUDES

echo "[i] Sync files -> ${DEST_DIR}"
rsync -av --delete --exclude-from="${tmp_excludes}" "${PROJECT_ROOT}/" "${DEST_DIR}/"
rm -f "${tmp_excludes}"

cd "${DEST_DIR}"

# Git init falls nicht vorhanden
if [ ! -d ".git" ]; then
  echo "[i] Init git repo"
  git init
fi

# Main branch sicherstellen
git symbolic-ref -q HEAD refs/heads/main || true

# Minimal identity, falls nicht gesetzt
git config user.name  >/dev/null 2>&1 || git config user.name "local-user"
git config user.email >/dev/null 2>&1 || git config user.email "local-user@localhost"

# Remote-URL mit Username setzen (Token wird über Askpass geliefert)
REMOTE_URL="https://${GITHUB_USER}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${REMOTE_URL}"
else
  git remote add origin "${REMOTE_URL}"
fi

# Änderungen committen, falls nötig
git add -A
if [ -n "$(git status --porcelain)" ]; then
  echo "[i] Commit changes"
  git commit -m "${COMMIT_MSG}"
else
  echo "[i] No changes to commit"
fi

git branch -M main

# Token nur für diesen Push über Askpass
ASKPASS="$(mktemp)"
printf '%s\n' '#!/bin/sh' "exec printf '%s' '${GITHUB_TOKEN}'" > "${ASKPASS}"
chmod +x "${ASKPASS}"
export GIT_ASKPASS="${ASKPASS}"

echo "[i] Push to origin main"
git fetch origin
git push -u origin main --force
rm -f "${ASKPASS}"
unset GITHUB_TOKEN
echo "[ok] Sync and push completed."
