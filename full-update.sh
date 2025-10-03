#!/usr/bin/env bash

# Full update helper for Gennerweb deployment.
#
# Dieses Skript wird manuell auf dem Server ausgeführt (z. B. per SSH).
# Es aktualisiert das Betriebssystem, holt die neuesten Änderungen aus dem Git-Repository,
# installiert Node/NPM-Abhängigkeiten und baut/ startet die Anwendung neu.
#
# Hinweis:
# - Skript als privilegierter Benutzer ausführen (z. B. sudo ./full-update.sh).
# - .env-Dateien, Datenbank und Secrets werden nicht verändert.
# - Prüfe vor dem Einsatz die Pfade/Service-Namen und passe sie bei Bedarf an.

set -euo pipefail

PROJECT_ROOT="/gennerweb"
BRANCH="${UPDATE_BRANCH:-main}"
APP_USER="genner"
BACKEND_SERVICE="genner-backend"
FRONTEND_SERVICE="genner-frontend"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    echo "Dieses Skript muss als root (oder via sudo) ausgeführt werden." >&2
    exit 1
  fi
}

update_system() {
  log "Systempakete aktualisieren …"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
  apt-get -y autoremove
  apt-get -y autoclean
}

update_project() {
  log "Wechsle ins Projektverzeichnis ${PROJECT_ROOT}"
  cd "${PROJECT_ROOT}"

  log "Hole neuesten Stand von origin/${BRANCH} …"
  sudo -u "${APP_USER}" git fetch origin "${BRANCH}"
  sudo -u "${APP_USER}" git checkout "${BRANCH}"
  sudo -u "${APP_USER}" git reset --hard "origin/${BRANCH}"

  log "Installiere Node-Abhängigkeiten …"
  sudo -u "${APP_USER}" npm ci

  log "Baue Frontend …"
  sudo -u "${APP_USER}" npm run build
}

restart_services() {
  log "Services neu starten …"
  systemctl restart "${BACKEND_SERVICE}"
  systemctl restart "${FRONTEND_SERVICE}"

  log "Service-Status prüfen …"
  systemctl --no-pager status "${BACKEND_SERVICE}"
  systemctl --no-pager status "${FRONTEND_SERVICE}"
}

main() {
  require_root
  update_system
  update_project
  restart_services
  log "Update erfolgreich abgeschlossen."
}

main "$@"
