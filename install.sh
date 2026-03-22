#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="transcom-stream"
SERVICE_NAME="transcom-stream"
SERVICE_USER="transcom"
INSTALL_DIR="/opt/transcom-stream"
BACKEND_PORT="8000"
DOMAIN=""
PUBLIC_IP=""
SSL_EMAIL=""
ADMIN_LOGIN="admin"
ADMIN_PASSWORD="admin123"
NO_SSL=0
SKIP_APT=0

REPO_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


info() {
  printf '\n[INFO] %s\n' "$1"
}


warn() {
  printf '\n[WARN] %s\n' "$1"
}


die() {
  printf '\n[ERROR] %s\n' "$1" >&2
  exit 1
}


usage() {
  cat <<'EOF'
Ubuntu installer for TransCom Stream.

Usage:
  sudo ./install.sh --domain radio.example.com [options]
  sudo ./install.sh --public-ip 203.0.113.10 [options]

Options:
  --domain DOMAIN            Public domain for nginx/server_name.
  --public-ip IP             Public IP if you want to access the app by IP.
  --email EMAIL              Email for Let's Encrypt certificate issuance.
  --install-dir PATH         Deployment directory. Default: /opt/transcom-stream
  --backend-port PORT        Local backend port behind nginx. Default: 8000
  --admin-login LOGIN        Default admin login. Default: admin
  --admin-password PASSWORD  Default admin password. Default: admin123
  --no-ssl                   Skip Let's Encrypt even if --email is provided.
  --skip-apt                 Do not install system packages with apt.
  -h, --help                 Show this help.

Examples:
  sudo ./install.sh --domain radio.example.com --email ops@example.com
  sudo ./install.sh --public-ip 203.0.113.10 --no-ssl
EOF
}


parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain)
        DOMAIN="${2:-}"
        shift 2
        ;;
      --public-ip)
        PUBLIC_IP="${2:-}"
        shift 2
        ;;
      --email)
        SSL_EMAIL="${2:-}"
        shift 2
        ;;
      --install-dir)
        INSTALL_DIR="${2:-}"
        shift 2
        ;;
      --backend-port)
        BACKEND_PORT="${2:-}"
        shift 2
        ;;
      --admin-login)
        ADMIN_LOGIN="${2:-}"
        shift 2
        ;;
      --admin-password)
        ADMIN_PASSWORD="${2:-}"
        shift 2
        ;;
      --no-ssl)
        NO_SSL=1
        shift
        ;;
      --skip-apt)
        SKIP_APT=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done

  if [[ -z "$DOMAIN" && -z "$PUBLIC_IP" ]]; then
    die "Specify at least --domain or --public-ip."
  fi

  if [[ -n "$SSL_EMAIL" && -z "$DOMAIN" ]]; then
    die "Let's Encrypt requires --domain."
  fi

  if ! [[ "$BACKEND_PORT" =~ ^[0-9]+$ ]]; then
    die "--backend-port must be numeric."
  fi
}


require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Run this script with sudo or as root."
  fi
}


check_os() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *"debian"* ]]; then
      warn "This installer is tuned for Ubuntu/Debian. Detected: ${PRETTY_NAME:-unknown}"
    fi
  fi
}


install_system_packages() {
  if [[ "$SKIP_APT" -eq 1 ]]; then
    warn "Skipping apt package installation."
    return
  fi

  info "Installing system packages"
  apt-get update
  apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    python3-dev \
    nginx \
    curl \
    ca-certificates \
    openssl \
    rsync \
    build-essential \
    ufw
}


node_major_version() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || true
}


ensure_nodejs() {
  local node_major
  node_major="$(node_major_version)"

  if [[ -n "$node_major" && "$node_major" -ge 18 ]]; then
    info "Node.js ${node_major} detected"
    return
  fi

  if [[ "$SKIP_APT" -eq 0 ]]; then
    info "Installing Node.js 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi

  node_major="$(node_major_version)"
  if [[ -z "$node_major" || "$node_major" -lt 18 ]]; then
    die "Node.js 18+ is required. Current version: ${node_major:-missing}"
  fi
}


ensure_service_user() {
  if id -u "$SERVICE_USER" >/dev/null 2>&1; then
    return
  fi

  info "Creating service user ${SERVICE_USER}"
  useradd --system --create-home --home-dir /var/lib/transcom-stream --shell /usr/sbin/nologin "$SERVICE_USER"
}


sync_project_files() {
  local source_realpath
  local install_realpath

  info "Copying project to ${INSTALL_DIR}"
  mkdir -p "$INSTALL_DIR"
  source_realpath="$(realpath "$REPO_SOURCE_DIR")"
  install_realpath="$(realpath "$INSTALL_DIR")"

  if [[ "$source_realpath" != "$install_realpath" ]]; then
    rsync -a --delete \
      --exclude '.git' \
      --exclude '.github' \
      --exclude 'backend/venv' \
      --exclude 'backend/.env' \
      --exclude 'frontend/node_modules' \
      --exclude 'frontend/dist' \
      --exclude 'backend/__pycache__' \
      --exclude 'frontend/.vite' \
      --exclude 'backend/database.db' \
      --exclude 'backend/storage' \
      "$REPO_SOURCE_DIR"/ "$INSTALL_DIR"/
  else
    warn "Source directory is already ${INSTALL_DIR}. Skipping rsync step."
  fi

  mkdir -p \
    "$INSTALL_DIR/backend/storage/audio" \
    "$INSTALL_DIR/backend/storage/video" \
    "$INSTALL_DIR/backend/storage/voice_messages"
}


install_backend_dependencies() {
  info "Installing backend dependencies"
  python3 -m venv "$INSTALL_DIR/backend/venv"
  "$INSTALL_DIR/backend/venv/bin/pip" install --upgrade pip wheel
  "$INSTALL_DIR/backend/venv/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt"
}


install_frontend_dependencies() {
  info "Installing frontend dependencies and building UI"
  runuser -u "$SERVICE_USER" -- bash -lc "
    cd '$INSTALL_DIR/frontend'
    npm ci
    npm run build
  "
}


ensure_secret_key() {
  local env_file="$1"
  local current_secret=""

  if grep -q '^SECRET_KEY=' "$env_file"; then
    current_secret="$(grep '^SECRET_KEY=' "$env_file" | head -n1 | cut -d'=' -f2-)"
  fi

  if [[ -n "$current_secret" && "$current_secret" != "your-secret-key-min-32-characters-long" && "$current_secret" != "your-secret-key-change-in-production" ]]; then
    return
  fi

  upsert_env "$env_file" "SECRET_KEY" "$(openssl rand -hex 32)"
}


ensure_admin_password() {
  if [[ "$ADMIN_PASSWORD" != "admin123" ]]; then
    return
  fi

  ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n' | tr '/+' 'AB' | cut -c1-20)"
  warn "Default admin password was replaced with a generated secure password: ${ADMIN_PASSWORD}"
}


upsert_env() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local escaped_value

  escaped_value="$(printf '%s' "$value" | sed -e 's/[&|]/\\&/g')"

  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${escaped_value}|" "$env_file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}


remove_env_key() {
  local env_file="$1"
  local key="$2"
  sed -i "/^${key}=.*/d" "$env_file"
}


build_cors_origins() {
  local origins=()

  if [[ -n "$DOMAIN" ]]; then
    origins+=("\"https://${DOMAIN}\"" "\"http://${DOMAIN}\"")
  fi

  if [[ -n "$PUBLIC_IP" ]]; then
    origins+=("\"http://${PUBLIC_IP}\"")
  fi

  origins+=("\"http://localhost:3000\"" "\"http://127.0.0.1:3000\"")

  local joined=""
  local item
  for item in "${origins[@]}"; do
    if [[ -n "$joined" ]]; then
      joined+=","
    fi
    joined+="$item"
  done

  printf '[%s]' "$joined"
}


configure_environment() {
  local env_file="$INSTALL_DIR/backend/.env"
  local cors_origins
  local database_url

  info "Configuring backend environment"
  if [[ ! -f "$env_file" ]]; then
    cp "$INSTALL_DIR/backend/.env.example" "$env_file"
  fi

  cors_origins="$(build_cors_origins)"
  database_url="sqlite+aiosqlite:///$INSTALL_DIR/backend/database.db"

  upsert_env "$env_file" "APP_NAME" "TransCom Stream"
  upsert_env "$env_file" "APP_VERSION" "1.0.0"
  upsert_env "$env_file" "DEBUG" "False"
  upsert_env "$env_file" "DATABASE_URL" "$database_url"
  upsert_env "$env_file" "STORAGE_PATH" "$INSTALL_DIR/backend/storage"
  upsert_env "$env_file" "CORS_ORIGINS" "$cors_origins"
  upsert_env "$env_file" "ALLOWED_AUDIO_FORMATS" "[\"mp3\",\"wav\",\"ogg\",\"webm\",\"m4a\"]"
  upsert_env "$env_file" "RATE_LIMIT_WINDOW_SECONDS" "60"
  upsert_env "$env_file" "RATE_LIMIT_LOGIN_MAX" "12"
  upsert_env "$env_file" "RATE_LIMIT_REGISTER_MAX" "6"
  upsert_env "$env_file" "RATE_LIMIT_MESSAGE_MAX" "20"
  upsert_env "$env_file" "RATE_LIMIT_UPLOAD_MAX" "12"
  upsert_env "$env_file" "RATE_LIMIT_WS_CONNECT_MAX" "10"
  upsert_env "$env_file" "WEBSOCKET_IDLE_TIMEOUT_SECONDS" "45"
  upsert_env "$env_file" "MAX_WEBSOCKET_BINARY_BYTES" "262144"
  upsert_env "$env_file" "MAX_WEBSOCKET_TEXT_BYTES" "4096"
  upsert_env "$env_file" "DEFAULT_ADMIN_LOGIN" "$ADMIN_LOGIN"
  upsert_env "$env_file" "DEFAULT_ADMIN_PASSWORD" "$ADMIN_PASSWORD"
  upsert_env "$env_file" "DEFAULT_ADMIN_FIO" "Администратор Системы"
  remove_env_key "$env_file" "HOST"
  remove_env_key "$env_file" "PORT"
  remove_env_key "$env_file" "WORKERS"
  remove_env_key "$env_file" "LOG_LEVEL"
  remove_env_key "$env_file" "LOG_FILE"
  ensure_secret_key "$env_file"
}


initialize_database() {
  info "Initializing database and default roles"
  runuser -u "$SERVICE_USER" -- bash -lc "
    cd '$INSTALL_DIR/backend'
    ./venv/bin/python - <<'PY'
import asyncio

from app.database import init_db
from main import create_default_admin, create_default_roles


async def bootstrap():
    await init_db()
    await create_default_roles()
    await create_default_admin()


asyncio.run(bootstrap())
PY
  "
}


write_systemd_service() {
  info "Creating systemd service"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=TransCom Stream backend
After=network.target

[Service]
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/backend
Environment=PYTHONUNBUFFERED=1
ExecStart=${INSTALL_DIR}/backend/venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port ${BACKEND_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
}


build_server_names() {
  local names=()

  if [[ -n "$DOMAIN" ]]; then
    names+=("$DOMAIN")
  fi

  if [[ -n "$PUBLIC_IP" ]]; then
    names+=("$PUBLIC_IP")
  fi

  printf '%s' "${names[*]}"
}


write_nginx_config() {
  local server_names
  server_names="$(build_server_names)"

  info "Creating nginx config"
  cat > "/etc/nginx/sites-available/${APP_NAME}" <<EOF
server {
    listen 80;
    server_name ${server_names};
    client_max_body_size 1024M;

    root ${INSTALL_DIR}/frontend/dist;
    index index.html;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 86400;
    }

    location /storage/audio/ {
        alias ${INSTALL_DIR}/backend/storage/audio/;
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public";
    }

    location /storage/video/ {
        alias ${INSTALL_DIR}/backend/storage/video/;
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public";
    }

    location /storage/ {
        return 404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
}


configure_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi

  info "Opening firewall ports"
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
}


configure_ssl() {
  if [[ "$NO_SSL" -eq 1 || -z "$SSL_EMAIL" || -z "$DOMAIN" ]]; then
    warn "Skipping automatic SSL setup."
    return
  fi

  info "Requesting Let's Encrypt certificate"
  if [[ "$SKIP_APT" -eq 0 ]]; then
    apt-get install -y certbot python3-certbot-nginx
  fi

  certbot --nginx --non-interactive --agree-tos --redirect -m "$SSL_EMAIL" -d "$DOMAIN"
}


set_permissions() {
  info "Setting file permissions"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
  chmod 755 "$INSTALL_DIR" "$INSTALL_DIR/frontend" "$INSTALL_DIR/backend"
  if [[ -f "$INSTALL_DIR/backend/.env" ]]; then
    chmod 640 "$INSTALL_DIR/backend/.env"
  fi
  chmod -R 755 "$INSTALL_DIR/backend/storage"
}


show_summary() {
  local external_url=""
  if [[ -n "$DOMAIN" ]]; then
    if [[ "$NO_SSL" -eq 0 && -n "$SSL_EMAIL" ]]; then
      external_url="https://${DOMAIN}"
    else
      external_url="http://${DOMAIN}"
    fi
  elif [[ -n "$PUBLIC_IP" ]]; then
    external_url="http://${PUBLIC_IP}"
  fi

  printf '\n========================================\n'
  printf 'TransCom Stream installed successfully\n'
  printf '========================================\n'
  printf 'App directory: %s\n' "$INSTALL_DIR"
  printf 'Backend service: %s (%s)\n' "$SERVICE_NAME" "$(systemctl is-active "$SERVICE_NAME")"
  printf 'Nginx: %s\n' "$(systemctl is-active nginx)"
  printf 'Frontend URL: %s\n' "$external_url"
  printf 'Backend docs: %s/docs\n' "$external_url"
  printf 'Admin login: %s\n' "$ADMIN_LOGIN"
  printf 'Admin password: %s\n' "$ADMIN_PASSWORD"
  printf '\nUseful commands:\n'
  printf '  systemctl status %s\n' "$SERVICE_NAME"
  printf '  journalctl -u %s -f\n' "$SERVICE_NAME"
  printf '  nginx -t && systemctl reload nginx\n'
}


main() {
  parse_args "$@"
  require_root
  check_os
  ensure_admin_password
  install_system_packages
  ensure_nodejs
  ensure_service_user
  sync_project_files
  set_permissions
  install_backend_dependencies
  configure_environment
  initialize_database
  install_frontend_dependencies
  write_systemd_service
  write_nginx_config
  configure_firewall
  configure_ssl
  set_permissions
  show_summary
}


main "$@"
