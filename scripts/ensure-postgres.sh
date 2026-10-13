#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${DB_NAME:-medusa-maktabah}"
DB_USER="${DB_USER:-medusa}"
DB_PASSWORD="${DB_PASSWORD:-medusa}"
DB_PORT="${DB_PORT:-5432}"
PG_BIN_DIR="${PG_BIN_DIR:-}"
USER_PG_DIR="$ROOT/.tools/postgres"
USER_PG_DATA="$USER_PG_DIR/data"
USER_PG_LOG="$USER_PG_DIR/postgres.log"
USER_PG_PORT="${USER_PG_PORT:-5433}"

find_pg_bin() {
  if [ -n "$PG_BIN_DIR" ] && [ -x "$PG_BIN_DIR/initdb" ]; then
    echo "$PG_BIN_DIR"
    return
  fi
  for candidate in \
    /usr/lib/postgresql/18/bin \
    /usr/lib/postgresql/17/bin \
    /usr/lib/postgresql/16/bin \
    /usr/lib/postgresql/15/bin; do
    if [ -x "$candidate/initdb" ]; then
      echo "$candidate"
      return
    fi
  done
  return 1
}

write_database_url() {
  local port="$1"
  local url="postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${port}/${DB_NAME}"
  local env_file="$ROOT/apps/backend/.env"

  mkdir -p "$(dirname "$env_file")"
  if [ -f "$env_file" ]; then
    if grep -q '^DATABASE_URL=' "$env_file"; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${url}|" "$env_file"
    else
      echo "DATABASE_URL=${url}" >>"$env_file"
    fi
  else
    cp "$ROOT/apps/backend/.env.template" "$env_file" 2>/dev/null || true
    if [ -f "$env_file" ] && grep -q '^DATABASE_URL=' "$env_file"; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${url}|" "$env_file"
    else
      echo "DATABASE_URL=${url}" >"$env_file"
    fi
  fi

  echo "DATABASE_URL -> ${url}"
}

can_connect() {
  local port="$1"
  local db="$2"
  PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$port" -U "$DB_USER" -d "$db" -c 'SELECT 1' >/dev/null 2>&1
}

echo "==> Ensuring PostgreSQL database '${DB_NAME}' is available"

# 1) Preferred: system Postgres on 5432 if already reachable
if can_connect 5432 postgres; then
  echo "System Postgres reachable as ${DB_USER}"
  if can_connect 5432 "$DB_NAME"; then
    echo "Database '${DB_NAME}' already exists on :5432"
    write_database_url 5432
    exit 0
  fi

  if PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 5432 -U "$DB_USER" -d postgres -c "CREATE DATABASE \"${DB_NAME}\";" >/dev/null 2>&1; then
    echo "Created database '${DB_NAME}' on :5432"
    write_database_url 5432
    exit 0
  fi

  if sudo -n true >/dev/null 2>&1; then
    echo "Creating database with sudo -u postgres..."
    sudo -n -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE "${DB_NAME}" OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
GRANT ALL PRIVILEGES ON DATABASE "${DB_NAME}" TO ${DB_USER};
SQL
    sudo -n -u postgres psql -v ON_ERROR_STOP=1 -d "${DB_NAME}" <<SQL
GRANT ALL ON SCHEMA public TO ${DB_USER};
ALTER SCHEMA public OWNER TO ${DB_USER};
SQL
    write_database_url 5432
    exit 0
  fi

  echo "System Postgres is up but cannot create '${DB_NAME}' without sudo CREATEDB rights."
  echo "Falling back to a user-space Postgres on :${USER_PG_PORT}"
fi

# 2) Fallback: user-space Postgres (no sudo)
PG_BIN="$(find_pg_bin)" || {
  echo "Could not find PostgreSQL binaries (initdb)."
  echo "Install with: sudo apt install postgresql"
  echo "Or create the DB manually:"
  echo "  sudo -u postgres createuser -P ${DB_USER}"
  echo "  sudo -u postgres createdb -O ${DB_USER} ${DB_NAME}"
  exit 1
}

echo "Using PostgreSQL binaries at ${PG_BIN}"
mkdir -p "$USER_PG_DIR"

if [ ! -f "$USER_PG_DATA/PG_VERSION" ]; then
  echo "Initializing user-space data directory..."
  mkdir -p "$USER_PG_DATA"
  echo "$DB_PASSWORD" >"$USER_PG_DIR/pwfile"
  chmod 600 "$USER_PG_DIR/pwfile"
  "${PG_BIN}/initdb" \
    -D "$USER_PG_DATA" \
    -U "$DB_USER" \
    --pwfile="$USER_PG_DIR/pwfile" \
    -A scram-sha-256 \
    --encoding=UTF8 \
    --locale=C >/dev/null

  mkdir -p "$USER_PG_DIR/sockets"
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = ${USER_PG_PORT}"
    echo "unix_socket_directories = '${USER_PG_DIR}/sockets'"
  } >>"$USER_PG_DATA/postgresql.conf"
  echo "host all all 127.0.0.1/32 scram-sha-256" >>"$USER_PG_DATA/pg_hba.conf"
fi

# Ensure socket directory is writable even for previously initialized clusters
mkdir -p "$USER_PG_DIR/sockets"
if ! grep -q "^unix_socket_directories" "$USER_PG_DATA/postgresql.conf"; then
  echo "unix_socket_directories = '${USER_PG_DIR}/sockets'" >>"$USER_PG_DATA/postgresql.conf"
fi


if ! can_connect "$USER_PG_PORT" postgres; then
  echo "Starting user-space Postgres on :${USER_PG_PORT}..."
  "${PG_BIN}/pg_ctl" \
    -D "$USER_PG_DATA" \
    -l "$USER_PG_LOG" \
    -o "-p ${USER_PG_PORT}" \
    start >/dev/null
  for _ in $(seq 1 30); do
    if can_connect "$USER_PG_PORT" postgres; then
      break
    fi
    sleep 0.3
  done
fi

if ! can_connect "$USER_PG_PORT" postgres; then
  echo "Failed to start user-space Postgres. See $USER_PG_LOG"
  exit 1
fi

if ! can_connect "$USER_PG_PORT" "$DB_NAME"; then
  echo "Creating database '${DB_NAME}' on :${USER_PG_PORT}..."
  PGPASSWORD="$DB_PASSWORD" "${PG_BIN}/createdb" \
    -h 127.0.0.1 -p "$USER_PG_PORT" -U "$DB_USER" "$DB_NAME"
fi

write_database_url "$USER_PG_PORT"
echo "Postgres OK (user-space) -> 127.0.0.1:${USER_PG_PORT}/${DB_NAME}"
