#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

BACKEND_PID=""
FRONTEND_PID=""

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q .
    return $?
  fi

  (echo >"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

find_backend_python() {
  if [[ -x "$BACKEND_DIR/venv/bin/python" ]]; then
    echo "$BACKEND_DIR/venv/bin/python"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    echo "$(command -v python3)"
    return 0
  fi

  return 1
}

cleanup() {
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

echo "🚀 Запуск TransCom Stream..."

if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
  echo "❌ Не найдены каталоги backend/frontend."
  exit 1
fi

BACKEND_PYTHON="$(find_backend_python || true)"
if [[ -z "$BACKEND_PYTHON" ]]; then
  echo "❌ Python не найден. Установите Python 3 и зависимости backend."
  exit 1
fi

if ! "$BACKEND_PYTHON" -c "import uvicorn" >/dev/null 2>&1; then
  echo "❌ В окружении backend не найден модуль uvicorn."
  echo "   Подсказка: cd backend && ./venv/bin/pip install -r requirements.txt"
  exit 1
fi

if port_in_use "$BACKEND_PORT"; then
  echo "❌ Порт backend $BACKEND_PORT уже занят."
  echo "   Освободите его или запустите так: BACKEND_PORT=<порт> ./start.sh"
  exit 1
fi

while port_in_use "$FRONTEND_PORT"; do
  FRONTEND_PORT=$((FRONTEND_PORT + 1))
done

echo "📡 Запуск backend на порту $BACKEND_PORT..."
(
  cd "$BACKEND_DIR"
  "$BACKEND_PYTHON" -m uvicorn main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

for _ in {1..30}; do
  if port_in_use "$BACKEND_PORT"; then
    break
  fi

  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    echo "❌ Backend завершился с ошибкой во время запуска."
    exit 1
  fi

  sleep 1
done

if ! port_in_use "$BACKEND_PORT"; then
  echo "❌ Backend не поднялся на порту $BACKEND_PORT."
  exit 1
fi

echo "🎨 Запуск frontend на порту $FRONTEND_PORT..."
(
  cd "$FRONTEND_DIR"
  BACKEND_PORT="$BACKEND_PORT" npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

sleep 2
if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
  echo "❌ Frontend завершился с ошибкой во время запуска."
  exit 1
fi

echo ""
echo "✅ Приложение запущено!"
echo ""
echo "Доступ:"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  Backend API: http://localhost:$BACKEND_PORT"
echo "  API Docs: http://localhost:$BACKEND_PORT/docs"
echo ""
echo "Администратор по умолчанию:"
echo "  Логин: admin"
echo "  Пароль: admin123"
echo ""
echo "Для остановки нажмите Ctrl+C"

wait
