#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TYPESENSE_DIR="$ROOT/.tools/typesense"
TYPESENSE_DATA="$TYPESENSE_DIR/data"
TYPESENSE_BIN="$TYPESENSE_DIR/typesense-server"
TYPESENSE_API_KEY="${TYPESENSE_API_KEY:-xyz}"

echo "==> Starting local infrastructure"

if command -v docker >/dev/null 2>&1; then
  echo "Docker found — using docker compose"
  cd "$ROOT"
  docker compose up -d
  echo "Waiting for Postgres..."
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U medusa -d medusa-maktabah >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  exit 0
fi

echo "Docker not found — using system Postgres/Redis + local Typesense binary"

# Redis
if command -v redis-server >/dev/null 2>&1; then
  if redis-cli ping >/dev/null 2>&1; then
    echo "Redis already running"
  else
    echo "Starting Redis..."
    sudo service redis-server start || sudo systemctl start redis-server || \
      redis-server --daemonize yes --bind 127.0.0.1 --port 6379 --dir /tmp --protected-mode no --save "" || true
    if ! redis-cli ping >/dev/null 2>&1; then
      echo "Could not start Redis. Run: sudo service redis-server start"
      exit 1
    fi
    echo "Redis is up on :6379"
  fi
else
  echo "redis-server not installed. Install with: sudo apt install redis-server"
  exit 1
fi

# Postgres
bash "$ROOT/scripts/ensure-postgres.sh"

# Typesense binary
mkdir -p "$TYPESENSE_DATA"
if [ ! -x "$TYPESENSE_BIN" ]; then
  echo "Downloading Typesense 27.1..."
  mkdir -p "$TYPESENSE_DIR"
  curl -fsSL -o "$TYPESENSE_DIR/typesense.tar.gz" \
    "https://dl.typesense.org/releases/27.1/typesense-server-27.1-linux-amd64.tar.gz"
  tar -xzf "$TYPESENSE_DIR/typesense.tar.gz" -C "$TYPESENSE_DIR"
  rm -f "$TYPESENSE_DIR/typesense.tar.gz"
fi

if curl -fsS "http://127.0.0.1:8108/health" 2>/dev/null | grep -q '"ok":true'; then
  echo "Typesense already running on :8108"
else
  echo "Starting Typesense on :8108..."
  # Clear stale peer state that can leave health at 503
  rm -rf "$TYPESENSE_DATA/state" 2>/dev/null || true
  setsid "$TYPESENSE_BIN" \
    --data-dir="$TYPESENSE_DATA" \
    --api-key="$TYPESENSE_API_KEY" \
    --api-address=127.0.0.1 \
    --api-port=8108 \
    --enable-cors \
    >>"$TYPESENSE_DIR/typesense.log" 2>&1 < /dev/null &
  echo $! >"$TYPESENSE_DIR/typesense.pid"

  ready=0
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:8108/health" 2>/dev/null | grep -q '"ok":true'; then
      ready=1
      break
    fi
    sleep 0.5
  done

  if [ "$ready" -eq 1 ]; then
    echo "Typesense is up on :8108"
  else
    echo "Typesense failed to start. Check $TYPESENSE_DIR/typesense.log"
    exit 1
  fi
fi

echo ""
echo "Infra ready:"
echo "  Postgres  -> localhost:5432 (db medusa-maktabah / user medusa)"
echo "  Redis     -> localhost:6379"
echo "  Typesense -> http://localhost:8108 (api key: $TYPESENSE_API_KEY)"
