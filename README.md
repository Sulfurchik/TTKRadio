# 📻 TransCom Stream

Система управления потоковым вещанием для АО «Компания ТрансТелеКом»

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-green.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org)

---

## 📋 Описание

Веб-приложение для управления аудиовещанием с возможностью:
- Авторизации и регистрации пользователей
- Администрирования пользователей
- Воспроизведения аудиопотока
- Управления эфиром для ведущего
- Отправки текстовых и голосовых сообщений

---

## 🎯 Функционал по ТЗ

### ✅ Модуль 1: Авторизация
- [x] Вход по логину/паролю
- [x] Регистрация с валидацией (логин - лат., ФИО - рус.)
- [x] Хеширование паролей (bcrypt)
- [x] JWT токены
- [x] Роль "Пользователь" по умолчанию

### ✅ Модуль 2: Администрирование
- [x] Таблица пользователей с фильтрами
- [x] CRUD операции
- [x] Soft delete
- [x] Смена пароля
- [x] Назначение ролей (мультивыбор)
- [x] Доступ только для Администратора

### ✅ Модуль 3: Плеер
- [x] Воспроизведение потока
- [x] Регулировка громкости
- [x] Текстовые сообщения
- [x] Голосовые сообщения
- [x] Видеорежим

### ✅ Модуль 4: Раздел ведущего
- [x] Медиатека (загрузка файлов)
- [x] Плейлисты
- [x] Loop/Shuffle режимы
- [x] Запись с микрофона
- [x] Управление вещанием
- [x] Обработка сообщений
- [x] Архив сообщений

---

## 🚀 Быстрый старт

### 1. Установка

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### 2. Запуск

**Терминал 1 - Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Терминал 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 3. Доступ

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

### 4. Учетные данные

**Администратор:**
- Логин: `admin`
- Пароль: `admin123`

---

## 📁 Структура проекта

```
transcom-stream/
├── backend/
│   ├── app/
│   │   ├── models.py       # SQLAlchemy модели
│   │   ├── schemas.py      # Pydantic схемы
│   │   ├── database.py     # Подключение к БД
│   │   ├── services/       # Бизнес-логика
│   │   └── middleware/     # Auth middleware
│   ├── api/
│   │   ├── auth/           # Авторизация
│   │   ├── admin/          # Админка
│   │   ├── player/         # Плеер
│   │   ├── host/           # Панель ведущего
│   │   └── stream/         # Стриминг (WebSocket)
│   ├── config/
│   ├── storage/            # Файлы
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/     # UI компоненты
│   │   ├── pages/          # Страницы
│   │   ├── services/       # API сервисы
│   │   └── store/          # Zustand store
│   └── package.json
├── docker-compose.yml
├── deploy.sh
├── README.md
└── DEPLOYMENT.md
```

---

## 🔒 Безопасность

- Хеширование паролей (bcrypt)
- JWT аутентификация
- CORS защита
- Валидация входных данных
- Проверка прав доступа
- Soft delete
- Security headers (Nginx)

---

## 🎨 Дизайн

- Фирменный стиль ТТК (красный #e52713)
- Адаптивная верстка (мобильные, планшеты, десктоп)
- Плавные анимации
- Минималистичный интерфейс

---

## 📊 API Endpoints

### Auth
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/register` | Регистрация |
| GET | `/api/auth/me` | Текущий пользователь |

### Admin
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/users` | Список пользователей |
| PUT | `/api/admin/users/:id` | Редактировать |
| DELETE | `/api/admin/users/:id` | Удалить |
| POST | `/api/admin/users/:id/password` | Смена пароля |
| POST | `/api/admin/users/:id/roles` | Назначить роли |

### Player
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/player/stream` | URL потока |
| POST | `/api/player/messages` | Сообщение |
| POST | `/api/player/voice` | Голосовое |

### Host
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/host/media` | Медиатека |
| POST | `/api/host/media/upload` | Загрузка |
| GET | `/api/host/playlists` | Плейлисты |
| POST | `/api/host/broadcast/start` | Начать вещание |

### Streaming
| Метод | Endpoint | Описание |
|-------|----------|----------|
| WS | `/api/stream/ws/listen` | Прослушивание |
| WS | `/api/stream/ws/host/:id` | Вещание |

---

## 🐳 Docker

```bash
# Запуск
docker-compose up -d

# Логи
docker-compose logs -f

# Остановка
docker-compose down
```

---

## 📈 Производительность

- Gunicorn workers: 4
- Static files caching
- Database connection pooling
- Frontend code splitting

---

## 📝 Лицензия

Проект создан для хакатона АО «ТрансТелеКом»

---

## 📞 Контакты

Команда разработки Hackathon 2026

**Документация:**
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Руководство по деплою
- [INSTALL.md](./INSTALL.md) - Установка и запуск
- [DEMO.md](./DEMO.md) - Сценарий демонстрации
