# Gennerweb automated installation script for Ubuntu Server

#!/usr/bin/env bash

set -euo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo "[ERROR] Bitte als root oder mit sudo ausführen." >&2
  exit 1
fi

read -rp "Installationsverzeichnis [/gennerweb]: " target_dir
target_dir=${target_dir:-/gennerweb}
target_dir=${target_dir%/}

if [[ -e "$target_dir" && ! -d "$target_dir/.git" ]]; then
  read -rp "Verzeichnis $target_dir existiert bereits. Für ein frisches Setup löschen? (j/n) [n]: " wipe_choice
  wipe_choice=${wipe_choice:-n}
  if [[ $wipe_choice =~ ^[Jj]$ ]]; then
    rm -rf "$target_dir"
  fi
fi

if [[ ! -d "$target_dir/.git" ]]; then
  read -rp "Git Repository URL [https://github.com/pqlammy/Gennerweb.git]: " repo_url
  repo_url=${repo_url:-https://github.com/pqlammy/Gennerweb.git}
  read -rp "Branch [main]: " repo_branch
  repo_branch=${repo_branch:-main}

  mkdir -p "$target_dir"
  chown "${SUDO_USER:-$(logname 2>/dev/null || echo root)}" "$target_dir"
  sudo -u "${SUDO_USER:-$(logname 2>/dev/null || echo root)}" git clone --branch "$repo_branch" --depth 1 "$repo_url" "$target_dir"
else
  read -rp "Repository existiert bereits. Möchtest du es aktualisieren? (j/n) [j]: " update_existing
  update_existing=${update_existing:-j}
  if [[ $update_existing =~ ^[Jj]$ ]]; then
    sudo -u "${SUDO_USER:-$(logname 2>/dev/null || echo root)}" git -C "$target_dir" fetch origin && \
    sudo -u "${SUDO_USER:-$(logname 2>/dev/null || echo root)}" git -C "$target_dir" reset --hard origin/$(git -C "$target_dir" rev-parse --abbrev-ref HEAD)
  fi
fi

SCRIPT_DIR=$(cd "$target_dir" && pwd)
PROJECT_ROOT="$SCRIPT_DIR"
ENV_FILE="$PROJECT_ROOT/.env"
APP_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
APP_GROUP=$(id -gn "$APP_USER" 2>/dev/null || echo "$APP_USER")
NODE_TARGET_MAJOR=20
SSL_STATUS="nicht gestartet"

print_prerequisites() {
  cat <<'INFO'

Voraussetzungen:
  • Eine registrierte Domain, die per DNS auf diesen Server zeigt.
  • Port 80 und 443 müssen von extern erreichbar sein (für Let's Encrypt).
  • Für die SMTP-Einrichtung benötigst du Host, Port, Benutzername und Passwort.
  • Das Skript sollte als root oder via sudo ausgeführt werden.

INFO
}

log() {
  printf '\n[INFO] %s\n' "$1"
}

run_as_app_user() {
  local cmd="$1"
  if [[ "$APP_USER" == "root" ]]; then
    bash -lc "$cmd"
  else
    runuser -u "$APP_USER" -- bash -lc "$cmd"
  fi
}

ensure_package_repo() {
  if [[ ! -f /etc/apt/sources.list.d/nodesource.list ]]; then
    log "Richte NodeSource Repository für Node.js $NODE_TARGET_MAJOR ein"
    curl -fsSL https://deb.nodesource.com/setup_${NODE_TARGET_MAJOR}.x | bash -
  else
    log "NodeSource Repository bereits konfiguriert"
  fi
}

install_packages() {
  log "Aktualisiere Paketquellen"
  apt-get update
  log "Installiere Systemaktualisierungen"
  DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

  log "Installiere benötigte Pakete"
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential \
    ca-certificates \
    curl \
    gnupg \
    openssl \
    software-properties-common \
    nginx \
    postgresql \
    postgresql-contrib \
    rsync \
    ufw \
    nodejs \
    certbot \
    python3-certbot-nginx
}

configure_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    if ufw status | grep -q "inactive"; then
      log "Konfiguriere UFW Firewall (HTTP/HTTPS zulassen)"
      ufw allow OpenSSH >/dev/null 2>&1 || true
      ufw allow 'Nginx Full' >/dev/null 2>&1 || true
      yes | ufw enable >/dev/null 2>&1 || true
    else
      log "Firewall UFW ist bereits aktiv – stelle sicher, dass HTTP/HTTPS erlaubt sind"
      ufw allow 'Nginx Full' >/dev/null 2>&1 || true
    fi
  fi
}

parse_server_name() {
  local url="$1"
  url=${url#http://}
  url=${url#https://}
  echo "${url%%/*}"
}

default_site_url() {
  local ip
  ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  if [[ -n "$ip" ]]; then
    printf 'http://%s' "$ip"
  else
    printf 'http://localhost'
  fi
}

generate_secret() {
  openssl rand -hex 32
}

generate_password() {
  local base
  base=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 14)
  printf '%s!Aa1' "$base"
}

setup_postgres() {
  local db_user="$1"
  local db_pass="$2"
  local db_name="$3"

  log "Konfiguriere PostgreSQL Datenbank"

  local role_exists
  role_exists=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${db_user}'" 2>/dev/null || true)
  role_exists=${role_exists//[[:space:]]/}
  if [[ "$role_exists" != "1" ]]; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE \"${db_user}\" LOGIN PASSWORD '${db_pass}';"
  else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \"${db_user}\" WITH LOGIN PASSWORD '${db_pass}';"
  fi

  local db_exists
  db_exists=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db_name}'" 2>/dev/null || true)
  db_exists=${db_exists//[[:space:]]/}
  if [[ "$db_exists" != "1" ]]; then
    sudo -u postgres createdb -E UTF8 -O "${db_user}" --template=template0 "${db_name}"
  else
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"${db_name}\" OWNER TO \"${db_user}\";"
  fi

  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE \"${db_name}\" TO \"${db_user}\";"

  sudo -u postgres psql -d "${db_name}" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SQL
}

write_env_file() {
  local db_user="$1"
  local db_pass="$2"
  local db_name="$3"
  local jwt_secret="$4"
  local encryption_key="$5"
  local admin_user="$6"
  local admin_email="$7"
  local admin_password="$8"
  local site_url="$9"
  local cors_origins="${10}"
  local smtp_from="${11}"
  local smtp_enabled="${12}"
  local smtp_host="${13}"
  local smtp_port="${14}"
  local smtp_user="${15}"
  local smtp_password="${16}"
  local smtp_secure="${17}"

  if [[ -f "$ENV_FILE" ]]; then
    local backup="$ENV_FILE.$(date +%Y%m%d%H%M%S).bak"
    cp "$ENV_FILE" "$backup"
    log "Bestehende .env gesichert unter $backup"
  fi

  cat >"$ENV_FILE" <<EOF
# --- Backend ---
POSTGRES_PASSWORD=$db_pass
DATABASE_URL=postgres://$db_user:$db_pass@localhost:5432/$db_name
JWT_SECRET=$jwt_secret
ENCRYPTION_KEY=$encryption_key
PORT=3001
DB_SSL=false
CORS_ORIGINS=$cors_origins
SITE_URL=$site_url
ADMIN_USERNAME=$admin_user
ADMIN_EMAIL=$admin_email
ADMIN_PASSWORD=$admin_password
FORCE_ADMIN_PASSWORD_RESET=false
RATE_LIMIT_MAX=200
AUTH_RATE_LIMIT_MAX=10
LOGIN_FAIL_THRESHOLD=5
LOGIN_FAIL_WINDOW_MS=900000
LOGIN_FAIL_LOCKOUT_MS=900000
JSON_BODY_LIMIT=1mb
REQUIRE_HTTPS=false
ENABLE_OUTBOUND_MAIL=$smtp_enabled
MAIL_FROM=$smtp_from
SMTP_HOST=$smtp_host
SMTP_PORT=$smtp_port
SMTP_USER=$smtp_user
SMTP_PASSWORD=$smtp_password
SMTP_SECURE=$smtp_secure

# --- Frontend ---
VITE_API_BASE_URL=
VITE_ENCRYPTION_KEY=$encryption_key
VITE_SUPABASE_URL=http://localhost
VITE_SUPABASE_ANON_KEY=development-anon-key
EOF

  chown "$APP_USER:$APP_GROUP" "$ENV_FILE"
}

install_node_dependencies() {
  log "Installiere Frontend Abhängigkeiten"
  run_as_app_user "cd '$PROJECT_ROOT' && npm ci"
  log "Baue Frontend"
  run_as_app_user "cd '$PROJECT_ROOT' && npm run build"

  log "Installiere Backend Abhängigkeiten"
  run_as_app_user "cd '$PROJECT_ROOT/backend' && npm install --omit=dev"
}

deploy_frontend() {
  local web_root="/var/www/gennerweb"
  log "Kopiere Frontend-Build nach $web_root"
  mkdir -p "$web_root"
  rsync -a --delete "$PROJECT_ROOT/dist/" "$web_root/"
  chown -R www-data:www-data "$web_root"
}

configure_nginx() {
  local site_url="$1"
  local server_name
  server_name=$(parse_server_name "$site_url")
  if [[ -z "$server_name" ]]; then
    server_name="_"
  fi

  local nginx_conf="/etc/nginx/sites-available/gennerweb.conf"

  cat >"$nginx_conf" <<EOF
server {
    listen 80;
    server_name $server_name;

    root /var/www/gennerweb;
    index index.html;

    client_max_body_size 5m;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /auth/ {
        proxy_pass http://127.0.0.1:3001/auth/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  ln -sf "$nginx_conf" /etc/nginx/sites-enabled/gennerweb.conf
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
  fi

  nginx -t
  systemctl reload nginx
}

setup_ssl() {
  local site_url="$1"
  local email_default="$2"
  local domain
  domain=$(parse_server_name "$site_url")

  if [[ -z $domain || $domain == '_' || $domain == 'localhost' ]]; then
    SSL_STATUS="übersprungen (keine Domain)"
    log "SSL Einrichtung übersprungen (keine gültige Domain)."
    return
  fi

  if [[ $domain =~ ^[0-9\.]+$ ]]; then
    SSL_STATUS="übersprungen (IP-Adresse)"
    log "SSL Einrichtung übersprungen (IP-Adresse statt Domain)."
    return
  fi

  if certbot certificates 2>/dev/null | grep -q "Domains: .*\b$domain\b"; then
    SSL_STATUS="bereits vorhanden (Let's Encrypt)"
    log "Let's-Encrypt-Zertifikat für $domain bereits vorhanden – überspringe Ausstellung."
    return
  fi

  read -rp "Let's Encrypt Zertifikat für $domain erstellen? (j/n) [j]: " le_choice
  le_choice=${le_choice:-j}
  if [[ ! $le_choice =~ ^[Jj]$ ]]; then
    SSL_STATUS="übersprungen (abgewählt)"
    log "SSL Einrichtung übersprungen auf Wunsch."
    return
  fi

  local cert_email
  if [[ -n $email_default ]]; then
    read -rp "E-Mail für Let's Encrypt [$email_default]: " cert_email
    cert_email=${cert_email:-$email_default}
  else
    read -rp "E-Mail für Let's Encrypt (für Ablaufwarnungen, optional): " cert_email
  fi

  log "Starte certbot für $domain"
  if [[ -n $cert_email ]]; then
    certbot --nginx --non-interactive --agree-tos --redirect --email "$cert_email" -d "$domain" || {
      SSL_STATUS="fehlgeschlagen (Certbot)"
      echo "[WARN] Zertifikatsanforderung für $domain fehlgeschlagen. Bitte manuell prüfen."
      return
    }
  else
    certbot --nginx --non-interactive --agree-tos --redirect --register-unsafely-without-email -d "$domain" || {
      SSL_STATUS="fehlgeschlagen (Certbot)"
      echo "[WARN] Zertifikatsanforderung für $domain fehlgeschlagen. Bitte manuell prüfen."
      return
    }
  fi

  SSL_STATUS="aktiv (Let's Encrypt)"
  systemctl reload nginx
  log "SSL Zertifikat erfolgreich eingerichtet."
}

configure_systemd() {
  local service_file="/etc/systemd/system/gennerweb-backend.service"
  cat >"$service_file" <<EOF
[Unit]
Description=Genner Gibelguuger Backend
After=network.target postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$PROJECT_ROOT
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
ExecStart=$(command -v node) backend/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now gennerweb-backend.service
}

main() {
  log "Starte Gennerweb Installation"
  print_prerequisites
  read -rp "Sind die Voraussetzungen erfüllt? (j/n) [j]: " prereq_confirm
  prereq_confirm=${prereq_confirm:-j}
  if [[ ! $prereq_confirm =~ ^[Jj]$ ]]; then
    echo "[INFO] Installation abgebrochen. Bitte Voraussetzungen erfüllen und erneut starten."
    exit 0
  fi

  ensure_package_repo
  install_packages
  configure_firewall

  local site_url
  local admin_email
  local admin_user
  local admin_password

  local default_url
  default_url=$(default_site_url)
  read -rp "Öffentliche Adresse der Seite [$default_url]: " site_url
  site_url=${site_url:-$default_url}

  read -rp "Admin Benutzername [admin]: " admin_user
  admin_user=${admin_user:-admin}

  read -rp "Admin E-Mail [admin@example.com]: " admin_email
  admin_email=${admin_email:-admin@example.com}

  read -rsp "Admin Passwort (leer lassen für Autogenerierung): " admin_password_input
  echo
  if [[ -z "$admin_password_input" ]]; then
    admin_password=$(generate_password)
    echo "[INFO] Generiere Admin Passwort: $admin_password"
  else
    admin_password="$admin_password_input"
  fi

  local smtp_enabled="false"
  local smtp_host=""
  local smtp_port="465"
  local smtp_user=""
  local smtp_password=""
  local smtp_secure="true"
  local smtp_from="$admin_email"

  read -rp "SMTP E-Mail-Versand aktivieren? (j/n) [n]: " smtp_choice
  smtp_choice=${smtp_choice:-n}
  if [[ $smtp_choice =~ ^[Jj]$ ]]; then
    smtp_enabled="true"
    read -rp "SMTP Host (z. B. mail.example.com): " smtp_host
    read -rp "SMTP Port [465]: " smtp_port_input
    smtp_port=${smtp_port_input:-465}
    read -rp "SMTP Benutzername: " smtp_user
    read -rsp "SMTP Passwort: " smtp_password_input
    echo
    smtp_password="$smtp_password_input"
    read -rp "Absender-Adresse (MAIL_FROM) [$smtp_from]: " smtp_from_input
    if [[ -n $smtp_from_input ]]; then
      smtp_from="$smtp_from_input"
    fi
    read -rp "TLS/SSL verwenden? (j/n) [j]: " smtp_secure_choice
    smtp_secure_choice=${smtp_secure_choice:-j}
    if [[ $smtp_secure_choice =~ ^[Nn]$ ]]; then
      smtp_secure="false"
    fi
  fi

  local db_user="genner_app"
  local db_name="genner_db"
  local db_pass="$(openssl rand -hex 24)"
  local jwt_secret="$(openssl rand -hex 48)"
  local encryption_key="$(generate_secret)"
  local cors_origins="$site_url,http://localhost:5173,http://localhost"

  if [[ $smtp_enabled == "true" && ( -z $smtp_host || -z $smtp_user || -z $smtp_password ) ]]; then
    echo "[WARN] SMTP-Einstellungen unvollständig – Versand wird deaktiviert."
    smtp_enabled="false"
    smtp_host=""
    smtp_user=""
    smtp_password=""
  fi

  setup_postgres "$db_user" "$db_pass" "$db_name"
  write_env_file "$db_user" "$db_pass" "$db_name" "$jwt_secret" "$encryption_key" "$admin_user" "$admin_email" "$admin_password" "$site_url" "$cors_origins" "$smtp_from" "$smtp_enabled" "$smtp_host" "$smtp_port" "$smtp_user" "$smtp_password" "$smtp_secure"
  install_node_dependencies
  deploy_frontend
  configure_nginx "$site_url"
  setup_ssl "$site_url" "$admin_email"
  configure_systemd

  local smtp_summary
  if [[ $smtp_enabled == "true" ]]; then
    if [[ -n $smtp_user ]]; then
      smtp_summary="aktiv (Host: $smtp_host, Port: $smtp_port, Benutzer: $smtp_user)"
    else
      smtp_summary="aktiv (Host: $smtp_host, Port: $smtp_port)"
    fi
  else
    smtp_summary="deaktiviert"
  fi

  log "Installation abgeschlossen"
  cat <<SUMMARY

Backend Service: systemctl status gennerweb-backend
Nginx Konfiguration: /etc/nginx/sites-available/gennerweb.conf
Projektpfad: $PROJECT_ROOT

Anmeldedaten Admin:
  Benutzername: $admin_user
  Passwort: $admin_password

SMTP Versand: $smtp_summary
SSL Status: $SSL_STATUS

Wichtige Dateien:
  $ENV_FILE
  /var/www/gennerweb (Frontend Build)

Änderungen an der Konfiguration bitte in $ENV_FILE vornehmen und danach "systemctl restart gennerweb-backend" ausführen.
SUMMARY
}

main "$@"
