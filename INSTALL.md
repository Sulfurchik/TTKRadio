# Инструкция по установке и запуску

## 🚀 Быстрый старт

### 1. Установка зависимостей

#### Backend (Python)
```bash
cd /home/Flany/Hack/transcom-stream/backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# или venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

#### Frontend (Node.js)
```bash
cd /home/Flany/Hack/transcom-stream/frontend
npm install
```

**Если npm не установлен:**
- Arch Linux: `sudo pacman -S npm`
- Ubuntu/Debian: `sudo apt install npm`
- Windows/Mac: установите с https://nodejs.org/

### 2. Запуск приложения

#### Терминал 1 - Backend
```bash
cd /home/Flany/Hack/transcom-stream/backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Терминал 2 - Frontend  
```bash
cd /home/Flany/Hack/transcom-stream/frontend
npm run dev
```

### 3. Доступ к приложению

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs (Swagger):** http://localhost:8000/docs

### 4. Учетные данные

**Администратор по умолчанию:**
- Логин: `admin`
- Пароль: `admin123`

**База данных создается автоматически при первом запуске!**

---

## Структура проекта

```
transcom-stream/
├── backend/           # Python FastAPI backend
│   ├── app/          # Модели, сервисы, middleware
│   ├── api/          # API роутеры
│   ├── config/       # Конфигурация
│   ├── storage/      # Хранилище файлов
│   └── main.py       # Точка входа
├── frontend/         # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── store/
│   └── package.json
└── README.md
```

---

## Модули системы

### 1. Авторизация ✅
- Вход по логину/паролю
- Регистрация (валидация: логин - лат., ФИО - рус.)
- Хеширование паролей (bcrypt)
- JWT токены

### 2. Администрирование ✅
- Таблица пользователей с фильтрами
- CRUD операции
- Soft delete
- Смена пароля
- Назначение ролей (мультивыбор)

### 3. Плеер ✅
- Воспроизведение потока
- Регулировка громкости
- Текстовые сообщения ведущему
- Голосовые сообщения

### 4. Раздел ведущего ✅
- Медиатека (загрузка файлов)
- Плейлисты (Loop, Shuffle)
- Запись с микрофона
- Управление вещанием
- Обработка сообщений

---

## Возможные проблемы и решения

### Ошибка: "module not found" на backend
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

### Ошибка: "npm not found"
Установите Node.js и npm:
- https://nodejs.org/ (рекомендуется LTS версия)

### Ошибка CORS
Убедитесь, что backend запущен на порту 8000, а frontend на 3000

### База данных не создается
Удалите файл `backend/database.db` и перезапустите backend

---

## Сценарий для демонстрации

1. **Регистрация:** http://localhost:3000/register
2. **Вход администратора:** admin / admin123
3. **Админка:** Назначить новому пользователю роль "Ведущий"
4. **Ведущий:** 
   - Загрузить MP3 файл
   - Создать плейлист
   - Запустить вещание
5. **Пользователь:**
   - Слушать поток
   - Отправить сообщение
   - Отправить голосовое

---

## API Endpoints

Полная документация: http://localhost:8000/docs

### Auth
- POST `/api/auth/login` - Вход
- POST `/api/auth/register` - Регистрация
- GET `/api/auth/me` - Текущий пользователь

### Admin (требуется роль Администратор)
- GET `/api/admin/users` - Список пользователей
- PUT `/api/admin/users/:id` - Редактировать
- DELETE `/api/admin/users/:id` - Удалить
- POST `/api/admin/users/:id/password` - Смена пароля
- POST `/api/admin/users/:id/roles` - Назначить роли

### Player
- GET `/api/player/stream` - URL потока
- POST `/api/player/messages` - Отправить сообщение
- POST `/api/player/voice` - Голосовое сообщение

### Host (требуется роль Ведущий/Администратор)
- GET `/api/host/media` - Медиатека
- POST `/api/host/media/upload` - Загрузка
- GET `/api/host/playlists` - Плейлисты
- POST `/api/host/broadcast/start` - Начать вещание
- GET `/api/host/messages` - Сообщения
