# TransCom Stream Deployment Guide

## Recommended path

For the hackathon version, the simplest and most reliable production setup is:

- Ubuntu server
- `nginx` for public access
- `systemd` for backend process management
- SQLite by default

This is exactly what `install.sh` now configures. It avoids the most common deployment failures from missing venvs, wrong `DATABASE_URL`, broken nginx proxying, and frontend/backend port mismatches.

## Before you start

Prepare these things first:

1. Point your subdomain to the server public IP with an `A` record.
2. Open ports `80`, `443`, and `22` in your cloud/firewall settings.
3. Copy the project to the server.

Example:

```bash
scp -r ./transcom-stream user@your-server:/home/user/
ssh user@your-server
cd /home/user/transcom-stream
```

## One-command install

HTTP only:

```bash
sudo ./install.sh --domain radio.example.com --public-ip 203.0.113.10 --no-ssl
```

HTTPS with Let's Encrypt:

```bash
sudo ./install.sh \
  --domain radio.example.com \
  --public-ip 203.0.113.10 \
  --email ops@example.com
```

What the script does:

- installs system packages on Ubuntu
- installs Node.js 20 if needed
- creates `/opt/transcom-stream`
- copies the project there
- creates Python venv and installs backend dependencies
- installs frontend dependencies and builds `dist`
- creates backend `.env`
- initializes database, roles, and default admin
- creates `systemd` service `transcom-stream`
- creates nginx config and publishes the site
- optionally requests SSL certificate via Let's Encrypt

## After install

Check statuses:

```bash
systemctl status transcom-stream
systemctl status nginx
```

Health checks:

```bash
curl http://127.0.0.1:8000/health
curl -I http://radio.example.com
```

Open in browser:

- `https://radio.example.com`
- `https://radio.example.com/docs`

Default admin:

- login: `admin`
- password: `admin123`

If you passed `--admin-login` or `--admin-password`, use those values instead.

## Update deployment

When you change the code:

```bash
cd /home/user/transcom-stream
git pull
sudo ./install.sh --domain radio.example.com --public-ip 203.0.113.10 --email ops@example.com
```

The script is intended to be rerun. It refreshes the deployed code, rebuilds frontend, and restarts services.

## Where things live

- app files: `/opt/transcom-stream`
- backend env: `/opt/transcom-stream/backend/.env`
- uploaded files: `/opt/transcom-stream/backend/storage`
- backend service: `transcom-stream`
- nginx site: `/etc/nginx/sites-available/transcom-stream`

## Useful commands

Backend logs:

```bash
journalctl -u transcom-stream -f
```

Restart backend:

```bash
sudo systemctl restart transcom-stream
```

Reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## PostgreSQL instead of SQLite

The default installer uses SQLite because it is the fastest stable path for the hackathon build.

If you want PostgreSQL later:

1. install PostgreSQL yourself
2. create a database and user
3. set `DATABASE_URL` in `/opt/transcom-stream/backend/.env`

Use async SQLAlchemy URL format:

```bash
DATABASE_URL=postgresql+asyncpg://transcom:strong-password@127.0.0.1:5432/transcom_stream
```

Then restart:

```bash
sudo systemctl restart transcom-stream
```

## Troubleshooting

### 502 Bad Gateway

Usually backend service is down.

```bash
systemctl status transcom-stream
journalctl -u transcom-stream -n 100 --no-pager
```

### Domain opens, but API calls fail

Check nginx proxy and backend health:

```bash
curl http://127.0.0.1:8000/health
nginx -t
```

### SSL certificate failed

Most common causes:

- DNS is not pointed to the server yet
- port `80` is closed
- nginx is already bound with broken config

Retry after fixing DNS/firewall:

```bash
sudo certbot --nginx -d radio.example.com
```

### Frontend works, uploads fail

Check nginx upload limit and storage permissions:

```bash
ls -la /opt/transcom-stream/backend/storage
```

### You changed `.env`, but nothing changed in app

Restart backend:

```bash
sudo systemctl restart transcom-stream
```
