#!/bin/bash

# TransCom Stream - Production Deployment Script
# Usage: ./deploy.sh [production|staging]

set -e

ENV=${1:-production}
APP_NAME="transcom-stream"
APP_DIR="/var/www/$APP_NAME"
USER="www-data"
SERVICE_NAME="$APP_NAME"

echo "🚀 TransCom Stream Deployment Script"
echo "Environment: $ENV"
echo "=================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (sudo ./deploy.sh)"
  exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p $APP_DIR/backend/storage/{audio,video,voice_messages}
mkdir -p $APP_DIR/frontend/dist
mkdir -p /var/log/$APP_NAME
chown -R $USER:$USER $APP_DIR
chown -R $USER:$USER /var/log/$APP_NAME

# Install system dependencies
echo "📦 Installing system dependencies..."
apt-get update
apt-get install -y python3 python3-pip python3-venv nginx nodejs npm postgresql postgresql-contrib

# Setup PostgreSQL
echo "🗄️ Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE DATABASE transcom_stream;" || true
sudo -u postgres psql -c "CREATE USER transcom WITH PASSWORD 'change_this_password';" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE transcom_stream TO transcom;" || true

# Setup Python virtual environment
echo "🐍 Setting up Python environment..."
cd $APP_DIR/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn

# Setup frontend
echo "🎨 Building frontend..."
cd $APP_DIR/frontend
npm install
npm run build

# Copy environment file
echo "⚙️ Configuring environment..."
if [ "$ENV" = "production" ]; then
  cp $APP_DIR/backend/.env.production $APP_DIR/backend/.env
else
  cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env
fi

# Generate secret key
if ! grep -q "SECRET_KEY=" $APP_DIR/backend/.env; then
  SECRET_KEY=$(openssl rand -hex 32)
  echo "SECRET_KEY=$SECRET_KEY" >> $APP_DIR/backend/.env
fi

# Setup Nginx
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/sites-available/$APP_NAME << 'NGINX_EOF'
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Frontend
    location / {
        root /var/www/transcom-stream/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # WebSocket
    location /api/stream/ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
    
    # Static files
    location /storage {
        alias /var/www/transcom-stream/backend/storage;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # Logs
    access_log /var/log/transcom-stream/access.log;
    error_log /var/log/transcom-stream/error.log;
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# Setup systemd service
echo "🔧 Setting up systemd service..."
cat > /etc/systemd/system/$SERVICE_NAME.service << 'SYSTEMD_EOF'
[Unit]
Description=TransCom Stream Backend
After=network.target postgresql.service

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/var/www/transcom-stream/backend
Environment="PATH=/var/www/transcom-stream/backend/venv/bin"
ExecStart=/var/www/transcom-stream/backend/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app -b 127.0.0.1:8000
Restart=always
RestartSec=10
StandardOutput=append:/var/log/transcom-stream/app.log
StandardError=append:/var/log/transcom-stream/app.log

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SYSTEMD_EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

# Setup firewall
echo "🔥 Configuring firewall..."
ufw allow 'Nginx Full' || true
ufw allow ssh || true

# Initialize database
echo "🗃️ Initializing database..."
cd $APP_DIR/backend
source venv/bin/activate
python -c "from app.database import init_db; import asyncio; asyncio.run(init_db())"

# Set proper permissions
echo "🔐 Setting permissions..."
chown -R $USER:$USER $APP_DIR
chmod 755 $APP_DIR/backend/storage
chmod 644 $APP_DIR/backend/.env

# Final status
echo ""
echo "=================================="
echo "✅ Deployment complete!"
echo ""
echo "Services:"
echo "  - Nginx: $(systemctl is-active nginx)"
echo "  - Backend: $(systemctl is-active $SERVICE_NAME)"
echo ""
echo "Logs:"
echo "  - App: /var/log/transcom-stream/app.log"
echo "  - Nginx: /var/log/transcom-stream/access.log"
echo ""
echo "Commands:"
echo "  - Status: systemctl status $SERVICE_NAME"
echo "  - Logs: journalctl -u $SERVICE_NAME -f"
echo "  - Restart: systemctl restart $SERVICE_NAME"
echo ""
echo "⚠️  IMPORTANT: Update these before going live:"
echo "  1. Change SECRET_KEY in .env"
echo "  2. Change database password"
echo "  3. Update CORS_ORIGINS with your domain"
echo "  4. Update nginx server_name"
echo "  5. Setup SSL with Let's Encrypt"
echo ""
