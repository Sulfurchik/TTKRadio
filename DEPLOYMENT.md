# 🚀 TransCom Stream - Production Deployment Guide

## 📋 Обзор

Система управления потоковым вещанием для АО «Компания ТрансТелеКом»

**Стек:**
- Backend: Python 3.11 + FastAPI + PostgreSQL
- Frontend: React 18 + Vite
- Streaming: WebSocket (real-time audio)
- Deployment: Docker / Systemd + Nginx

---

## 🔒 Безопасность

### Реализованные меры:
1. **Хеширование паролей** - bcrypt
2. **JWT аутентификация** - токены с expiration
3. **CORS защита** - настроенные origins
4. **Валидация входных данных** - Pydantic schemas
5. **Soft delete** - сохранение истории
6. **Проверка ролей** - middleware авторизация
7. **SQL injection защита** - SQLAlchemy ORM
8. **XSS защита** - React escaping
9. **Security headers** - в Nginx конфигурации

### Требуется изменить перед production:
```bash
# 1. SECRET_KEY (минимум 32 символа)
SECRET_KEY=your-random-32-char-secret-key-here

# 2. Пароль базы данных
DB_PASSWORD=strong-password-here

# 3. CORS origins
CORS_ORIGINS=["https://your-domain.com"]

# 4. SSL сертификаты (Let's Encrypt)
certbot --nginx -d your-domain.com
```

---

## 📦 Варианты деплоя

### Вариант 1: Docker Compose (Рекомендуется)

```bash
# 1. Клонировать репозиторий
git clone <repository-url>
cd transcom-stream

# 2. Настроить переменные окружения
cp .env.example .env
# Отредактировать .env с вашими значениями

# 3. Запустить
docker-compose up -d

# 4. Проверить логи
docker-compose logs -f
```

**Порты:**
- 80: HTTP
- 443: HTTPS (после настройки SSL)

### Вариант 2: Systemd + Nginx (Ubuntu/Debian)

```bash
# 1. Скопировать файлы на сервер
scp -r transcom-stream user@server:/var/www/

# 2. Запустить скрипт деплоя
sudo ./deploy.sh production

# 3. Проверить статус
systemctl status transcom-stream
systemctl status nginx
```

### Вариант 3: Ручная установка

#### Backend:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn

# Запуск
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app -b 0.0.0.0:8000
```

#### Frontend:
```bash
cd frontend
npm install
npm run build

# Serve через nginx или node
npm install -g serve
serve -s dist -l 3000
```

---

## 🗄️ База данных

### PostgreSQL (Production):
```sql
CREATE DATABASE transcom_stream;
CREATE USER transcom WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE transcom_stream TO transcom;
```

### SQLite (Development):
Автоматически создается при первом запуске.

### Миграции:
```bash
cd backend
alembic upgrade head
```

---

## 🔧 Конфигурация

### Переменные окружения (.env):

```bash
# Application
APP_NAME=TransCom Stream
DEBUG=False

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/transcom_stream

# Security
SECRET_KEY=minimum-32-character-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# CORS
CORS_ORIGINS=["https://your-domain.com"]

# Files
MAX_AUDIO_SIZE_MB=50
MAX_VIDEO_SIZE_MB=1000
STORAGE_PATH=/var/www/transcom-stream/storage
```

---

## 🌐 Nginx конфигурация

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
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
    }
    
    # WebSocket
    location /api/stream/ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_read_timeout 86400;
    }
    
    # Static files
    location /storage {
        alias /var/www/transcom-stream/backend/storage;
        expires 30d;
    }
}
```

---

## 📊 Мониторинг

### Логи:
```bash
# Application logs
journalctl -u transcom-stream -f

# Nginx logs
tail -f /var/log/transcom-stream/access.log
tail -f /var/log/transcom-stream/error.log

# Docker logs
docker-compose logs -f backend
docker-compose logs -f nginx
```

### Health checks:
```bash
# Backend health
curl http://localhost:8000/health

# Frontend
curl http://localhost/

# WebSocket test
wscat -c ws://localhost:8000/api/stream/ws/listen
```

---

## 🔐 Пользователи по умолчанию

После первого запуска создается:
- **Логин:** `admin`
- **Пароль:** `admin123`
- **Роль:** Администратор

**Смените пароль сразу после первого входа!**

---

## 📱 API Endpoints

### Auth
- `POST /api/auth/login` - Вход
- `POST /api/auth/register` - Регистрация
- `GET /api/auth/me` - Текущий пользователь

### Admin (Администратор)
- `GET /api/admin/users` - Список пользователей
- `PUT /api/admin/users/:id` - Редактировать
- `DELETE /api/admin/users/:id` - Удалить (soft)
- `POST /api/admin/users/:id/password` - Смена пароля
- `POST /api/admin/users/:id/roles` - Назначить роли

### Player (Все авторизованные)
- `GET /api/player/stream` - URL потока
- `POST /api/player/messages` - Отправить сообщение
- `POST /api/player/voice` - Голосовое сообщение

### Host (Ведущий/Администратор)
- `GET /api/host/media` - Медиатека
- `POST /api/host/media/upload` - Загрузка
- `GET /api/host/playlists` - Плейлисты
- `POST /api/host/broadcast/start` - Начать вещание

### Streaming (WebSocket)
- `WS /api/stream/ws/listen` - Прослушивание
- `WS /api/stream/ws/host/:id` - Вещание

---

## 🐛 Troubleshooting

### Backend не запускается:
```bash
# Проверить логи
journalctl -u transcom-stream -n 50

# Проверить БД
sudo -u postgres psql -c "\l" | grep transcom

# Перезапустить
systemctl restart transcom-stream
```

### Frontend не загружается:
```bash
# Пересобрать
cd frontend
npm run build

# Проверить nginx
nginx -t
systemctl restart nginx
```

### WebSocket не подключается:
```bash
# Проверить firewall
ufw status

# Разрешить порты
ufw allow 80/tcp
ufw allow 443/tcp
```

---

## 📈 Производительность

### Оптимизации:
1. **Gunicorn workers:** 4 (CPU cores * 2 + 1)
2. **Static files:** Nginx caching
3. **Database:** Connection pooling
4. **Frontend:** Code splitting, lazy loading

### Масштабирование:
```bash
# Увеличить workers
systemctl edit transcom-stream
# Добавить: Environment=GUNICORN_WORKERS=8

# Horizontal scaling с Docker
docker-compose up -d --scale backend=3
```

---

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи
2. Проверьте переменные окружения
3. Убедитесь что БД доступна
4. Проверьте firewall правила

---

**Версия:** 1.0.0  
**Дата обновления:** 2026-03-20
