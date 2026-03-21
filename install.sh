#!/bin/bash

echo "🚀 Установка TransCom Stream..."

# Проверка Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 не найден. Установите Python 3.10+"
    exit 1
fi

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не найден. Установите Node.js 18+"
    exit 1
fi

# Установка backend зависимостей
echo "📦 Установка backend зависимостей..."
cd backend
python3 -m pip install -r requirements.txt
cd ..

# Установка frontend зависимостей
echo "📦 Установка frontend зависимостей..."
cd frontend
npm install
cd ..

echo "✅ Установка завершена!"
echo ""
echo "Для запуска выполните:"
echo "  Terminal 1: cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo "  Terminal 2: cd frontend && npm run dev"
echo ""
echo "Доступ:"
echo "  Frontend: http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Администратор по умолчанию:"
echo "  Логин: admin"
echo "  Пароль: admin123"
