#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TYPESENSE_DIR="$ROOT/.tools/typesense"
PID_FILE="$TYPESENSE_DIR/typesense.pid"
USER_PG_DATA="$ROOT/.tools/postgres/data"

if command -v docker >/dev/null 2>&1 && [ -f "$ROOT/docker-compose.yml" ]; then
  if docker compose ps -q 2>/dev/null | grep -q .; then
    docker compose -f "$ROOT/docker-compose.yml" down
  fi
fi

if [ -f "$PID_FILE" ]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Stopped Typesense"
fi

for candidate in /usr/lib/postgresql/18/bin /usr/lib/postgresql/17/bin; do
  if [ -x "$candidate/pg_ctl" ] && [ -d "$USER_PG_DATA" ]; then
    "$candidate/pg_ctl" -D "$USER_PG_DATA" stop >/dev/null 2>&1 || true
    echo "Stopped user-space Postgres"
    break
  fi
done
