#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/gennerweb"
BRANCH="${UPDATE_BRANCH:-main}"

cd "${REPO_DIR}"

git fetch origin "$BRANCH"

AHEAD=$(git rev-list --count HEAD..origin/$BRANCH)
BEHIND=$(git rev-list --count origin/$BRANCH..HEAD)
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH)

cat <<JSON
{"branch": "$BRANCH", "ahead": $AHEAD, "behind": $BEHIND, "local": "$LOCAL", "remote": "$REMOTE"}
JSON
