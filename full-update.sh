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
APP_USER="${UPDATE_APP_USER:-auto}"
BACKEND_SERVICE="${UPDATE_BACKEND_SERVICE:-gennerweb-backend.service}"
FRONTEND_SERVICE="${UPDATE_FRONTEND_SERVICE:-}"
WEB_ROOT="${UPDATE_WEB_ROOT:-/var/www/gennerweb}"
APP_USER_WARNED=0

if [[ "$APP_USER" == "auto" ]]; then
  detected_user=$(stat -c '%U' "$PROJECT_ROOT" 2>/dev/null || true)
  if [[ -n "$detected_user" ]]; then
    APP_USER="$detected_user"
  else
    APP_USER=""
  fi
fi

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    echo "Dieses Skript muss als root (oder via sudo) ausgeführt werden." >&2
    exit 1
  fi
}

run_as_app_user() {
  local user="$APP_USER"
  if [[ -z "$user" ]]; then
    "$@"
    return
  fi

  if id "$user" >/dev/null 2>&1; then
    runuser -u "$user" -- "$@"
  else
    if [[ "$APP_USER_WARNED" -eq 0 ]]; then
      log "Warnung: App-Benutzer '$user' existiert nicht – führe Befehle als aktueller Benutzer aus."
      APP_USER_WARNED=1
    fi
    "$@"
  fi
}

run_in_project() {
  local command="${1:-}"
  if [[ -z "$command" ]]; then
    return 0
  fi
  run_as_app_user bash -lc "cd '$PROJECT_ROOT' && $command"
}

run_in_backend() {
  local command="${1:-}"
  if [[ -z "$command" ]]; then
    return 0
  fi
  run_as_app_user bash -lc "cd '$PROJECT_ROOT/backend' && $command"
}

normalize_service_name() {
  local name="$1"
  if [[ -z "$name" ]]; then
    return
  fi
  if [[ "$name" != *.service ]]; then
    name="${name}.service"
  fi
  printf '%s' "$name"
}

service_exists() {
  local name
  name=$(normalize_service_name "$1")
  if [[ -z "$name" ]]; then
    return 1
  fi
  systemctl list-unit-files --type=service --full --no-legend 2>/dev/null | awk '{print $1}' | grep -Fxq "$name"
}

restart_service_if_exists() {
  local service="$1"
  local normalized
  normalized=$(normalize_service_name "$service")
  if [[ -z "$normalized" ]]; then
    return
  fi

  if service_exists "$normalized"; then
    log "Starte Service ${normalized} neu …"
    systemctl restart "$normalized"
    systemctl --no-pager status "$normalized"
  else
    log "Hinweis: Service '${normalized}' nicht gefunden – überspringe Neustart."
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
  run_in_project "git fetch origin '${BRANCH}'"
  run_in_project "git checkout '${BRANCH}'"
  run_in_project "git reset --hard 'origin/${BRANCH}'"

  log "Installiere Node-Abhängigkeiten …"
  run_in_project "npm ci"

  log "Baue Frontend …"
  run_in_project "npm run build"

  log "Installiere Backend-Abhängigkeiten …"
  run_in_backend "npm install --omit=dev"

  deploy_frontend

  log "Synchronisiere Versionsinformationen …"
  if [[ -f "$PROJECT_ROOT/backend/scripts/sync-site-version.mjs" ]]; then
    if ! run_in_backend "node ./scripts/sync-site-version.mjs"; then
      log "Hinweis: Version konnte nicht synchronisiert werden – siehe obenstehende Fehlermeldung."
    fi
  else
    log "Hinweis: Sync-Skript nicht gefunden – überspringe Versionsabgleich."
  fi
}

deploy_frontend() {
  local source_dir="$PROJECT_ROOT/dist"
  local target_dir="$WEB_ROOT"

  if [[ ! -d "$source_dir" ]]; then
    log "Warnung: Build-Verzeichnis '$source_dir' nicht vorhanden – Frontend wird nicht aktualisiert."
    return
  fi

  log "Aktualisiere Frontend-Deployment in ${target_dir} …"
  mkdir -p "$target_dir"
  rsync -a --delete "$source_dir"/ "$target_dir"/
  chown -R www-data:www-data "$target_dir"
}

restart_services() {
  log "Services neu starten …"
  if [[ -n "$BACKEND_SERVICE" ]]; then
    restart_service_if_exists "$BACKEND_SERVICE"
  fi

  if [[ -n "$FRONTEND_SERVICE" ]]; then
    restart_service_if_exists "$FRONTEND_SERVICE"
  fi

  if service_exists nginx.service; then
    log "Nginx neu laden …"
    systemctl reload nginx
    systemctl --no-pager status nginx
  else
    log "Hinweis: nginx Service nicht gefunden – kein Reload durchgeführt."
  fi
}

main() {
  require_root
  update_system
  update_project
  restart_services
  log "Update erfolgreich abgeschlossen."
}

main "$@"
