# TransCom Stream — Проект для Qwen Code

## 📋 Обзор проекта

**TransCom Stream** — веб-приложение для управления аудиовещанием, разработанное для АО «Компания ТрансТелеКом». Система предоставляет функционал авторизации, администрирования пользователей, воспроизведения аудиопотока, управления эфиром для ведущего и отправки текстовых/голосовых сообщений.

### Основные технологии

| Компонент | Технологии |
|-----------|------------|
| **Backend** | Python 3.11+, FastAPI 0.109+, SQLAlchemy 2.0, Pydantic 2.6, JWT (python-jose), bcrypt |
| **Frontend** | React 18, Vite 5, Zustand (state management), React Router 6, Axios |
| **БД** | SQLite (dev) / PostgreSQL 15 (prod) |
| **DevOps** | Docker, Docker Compose, Nginx, systemd, Certbot (SSL) |
| **Хранение файлов** | Локальное хранилище (`backend/storage/`) |

### Архитектура

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│    Nginx     │────▶│   Backend   │
│  (React)    │     │  (reverse)   │     │  (FastAPI)  │
│  :3000/:80  │     │   :80/:443   │     │    :8000    │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                 │
                                                 ▼
                                         ┌─────────────┐
                                         │  Database   │
                                         │ SQLite/PgSQL│
                                         └─────────────┘
```

---

## 🚀 Запуск и сборка

### Быстрый старт (локальная разработка)

```bash
# Один скрипт запускает всё
./start.sh
```

**Доступ:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs (Swagger): http://localhost:8000/docs

**Учётные данные администратора:**
- Логин: `admin`
- Пароль: `admin123`

### Ручной запуск

#### Backend
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt  # первый раз
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend (отдельный терминал)
```bash
cd frontend
npm ci  # первый раз
npm run dev
```

### Production (Docker)

```bash
docker-compose up -d
docker-compose logs -f
```

### Production (Ubuntu server)

```bash
sudo ./install.sh --domain radio.example.com --public-ip 203.0.113.10 --email ops@example.com
```

---

## 📁 Структура проекта

```
transcom-stream/
├── backend/
│   ├── api/                    # API endpoints (роутеры)
│   │   ├── admin/              # Администрирование пользователей
│   │   ├── auth/               # Авторизация/регистрация
│   │   ├── host/               # Панель ведущего
│   │   ├── player/             # Плеер
│   │   └── stream/             # WebSocket стриминг
│   ├── app/
│   │   ├── models.py           # SQLAlchemy модели
│   │   ├── schemas.py          # Pydantic схемы
│   │   ├── database.py         # DB сессии
│   │   ├── constants.py        # Константы (роли, настройки)
│   │   └── services/
│   │       ├── auth.py         # Хэширование, JWT
│   │       ├── media.py        # Работа с медиафайлами
│   │       └── middleware/     # Auth middleware
│   ├── config/
│   │   └── settings.py         # Pydantic settings
│   ├── storage/                # Загруженные файлы
│   │   ├── audio/
│   │   ├── video/
│   │   └── voice/
│   ├── tests/                  # Тесты
│   ├── main.py                 # Точка входа FastAPI
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/         # UI компоненты
│   │   ├── pages/              # Страницы (Login, Admin, Player...)
│   │   ├── services/           # API клиенты (axios)
│   │   ├── store/              # Zustand store
│   │   ├── hooks/              # Кастомные хуки
│   │   ├── utils/              # Утилиты
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── dist/                   # Build output
│   ├── package.json
│   ├── vite.config.js
│   └── nginx.conf
├── docker-compose.yml
├── install.sh                  # Production installer
├── start.sh                    # Dev launcher
├── deploy.sh
├── README.md
├── INSTALL.md
├── DEPLOYMENT.md
└── DEMO.md
```

---

## 🔑 Ключевые файлы конфигурации

| Файл | Описание |
|------|----------|
| `backend/.env` | Переменные окружения (SECRET_KEY, DATABASE_URL, CORS) |
| `backend/config/settings.py` | Pydantic settings с валидацией |
| `frontend/vite.config.js` | Vite конфиг + proxy на backend |
| `docker-compose.yml` | Docker сервисы (postgres, backend, frontend, nginx) |
| `nginx.conf` | Nginx конфигурация для frontend |

---

## 📊 API Endpoints (основные)

### Auth
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/register` | Регистрация |
| GET | `/api/auth/me` | Текущий пользователь |

### Admin (требуется роль ADMIN)
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/users` | Список пользователей |
| PUT | `/api/admin/users/:id` | Редактировать |
| DELETE | `/api/admin/users/:id` | Soft delete |
| POST | `/api/admin/users/:id/password` | Смена пароля |
| POST | `/api/admin/users/:id/roles` | Назначить роли |

### Player
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/player/stream` | URL потока |
| POST | `/api/player/messages` | Сообщение |
| POST | `/api/player/voice` | Голосовое |

### Host (требуется роль HOST/ADMIN)
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/host/media` | Медиатека |
| POST | `/api/host/media/upload` | Загрузка |
| GET | `/api/host/playlists` | Плейлисты |
| POST | `/api/host/broadcast/start` | Начать вещание |

### Streaming (WebSocket)
| Метод | Endpoint | Описание |
|-------|----------|----------|
| WS | `/api/stream/ws/listen` | Прослушивание |
| WS | `/api/stream/ws/host/:id` | Вещание |

---

## 🔒 Безопасность

- **Пароли:** bcrypt хеширование
- **Аутентификация:** JWT токены (ACCESS_TOKEN_EXPIRE_MINUTES=1440)
- **CORS:** Настройка разрешённых origin
- **Валидация:** Pydantic схемы для всех входных данных
- **Роли:** ADMIN, HOST, USER (через `app/constants.DEFAULT_ROLES`)
- **Soft delete:** Поле `is_deleted` в модели User

---

## 🧪 Тестирование

```bash
cd backend
source venv/bin/activate
pytest  # если установлены тесты
```

Frontend тесты не настроены (можно добавить через Vitest/Jest).

---

## 🛠 Разработка: полезные команды

### Backend
```bash
# Проверка типов (если добавите mypy)
mypy backend/

# Форматирование (рекомендуется black/ruff)
black backend/
ruff check backend/
```

### Frontend
```bash
# Build
npm run build

# Preview production билда
npm run preview

# Lint (если добавите eslint)
npm run lint
```

### Docker
```bash
# Пересборка
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Логи
docker-compose logs -f backend
docker-compose logs -f frontend
```

---

## 📝 Константы и настройки

### Роли (app/constants.py)
```python
DEFAULT_ROLES = ["USER", "ADMIN", "HOST"]
```

### Ограничения файлов (config/settings.py)
```python
MAX_AUDIO_SIZE_MB = 50
MAX_VIDEO_SIZE_MB = 1000
MAX_VOICE_MESSAGE_SIZE_MB = 50
ALLOWED_AUDIO_FORMATS = ["mp3", "wav", "ogg", "webm"]
ALLOWED_VIDEO_FORMATS = ["mp4", "webm"]
```

### CORS (по умолчанию)
```python
CORS_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]
```

---

## 🐛 Частые проблемы

| Проблема | Решение |
|----------|---------|
| `ModuleNotFoundError` | `cd backend && source venv/bin/activate && pip install -r requirements.txt` |
| Порт 8000 занят | `pkill -f uvicorn` или смените порт |
| БД не создаётся | Удалите `backend/database.db` и перезапустите |
| Frontend не видит API | Проверьте proxy в `frontend/vite.config.js` |
| 502 Bad Gateway (prod) | `systemctl status transcom-stream && journalctl -u transcom-stream -f` |

---

## 📚 Документация

| Файл | Описание |
|------|----------|
| `README.md` | Основная документация проекта |
| `INSTALL.md` | Инструкция по локальной установке |
| `DEPLOYMENT.md` | Production deployment guide (Ubuntu, nginx, SSL) |
| `DEMO.md` | Сценарий демонстрации функционала |

---

## 🎯 Особенности для Qwen Code

1. **При изменении кода** всегда проверяйте, что импорты соответствуют структуре проекта
2. **Новые API endpoints** добавляйте в соответствующие роутеры (`api/<module>/<name>_router.py`)
3. **Модели БД** находятся в `backend/app/models.py`, используйте SQLAlchemy 2.0 синтаксис
4. **Схемы Pydantic** в `backend/app/schemas.py`
5. **Настройки** только через `config/settings.py` (Pydantic Settings)
6. **Frontend store** использует Zustand (`frontend/src/store/`)
7. **API вызовы** через axios сервисы (`frontend/src/services/`)
8. **Стили** — фирменный стиль ТТК (красный `#e52713`), адаптивная вёрстка

---

## ✅ Чеклист перед коммитом

- [ ] Backend запускается без ошибок
- [ ] Frontend билдится (`npm run build`)
- [ ] API docs доступны (`/docs`)
- [ ] Авторизация работает
- [ ] Нет hardcoded secrets (используйте `.env`)
