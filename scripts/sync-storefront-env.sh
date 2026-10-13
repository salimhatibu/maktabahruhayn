#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT/apps/backend/.env"
STORE_ENV="$ROOT/apps/storefront/.env.local"

# shellcheck disable=SC1090
set -a
[ -f "$BACKEND_ENV" ] && source "$BACKEND_ENV"
set +a

DB_URL="${DATABASE_URL:-postgres://medusa:medusa@127.0.0.1:5433/medusa-maktabah}"
BACKEND_URL="${NEXT_PUBLIC_MEDUSA_BACKEND_URL:-http://localhost:9000}"

# Parse postgres URL for psql
# postgres://user:pass@host:port/db
proto="$(echo "$DB_URL" | sed -E 's#^([^:]+)://.*#\1#')"
rest="${DB_URL#*://}"
userpass="${rest%%@*}"
hostportdb="${rest#*@}"
user="${userpass%%:*}"
pass="${userpass#*:}"
hostport="${hostportdb%%/*}"
db="${hostportdb#*/}"
host="${hostport%%:*}"
port="${hostport#*:}"
[ "$host" = "$port" ] && port=5432

KEY="$(PGPASSWORD="$pass" psql -h "$host" -p "$port" -U "$user" -d "$db" -tAc \
  "select token from api_key where type='publishable' and deleted_at is null limit 1;" 2>/dev/null || true)"

if [ -z "$KEY" ]; then
  echo "No publishable API key found yet. Run pnpm db:migrate first."
  exit 1
fi

cat >"$STORE_ENV" <<EOF
NEXT_PUBLIC_MEDUSA_BACKEND_URL=${BACKEND_URL}
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${KEY}
EOF

echo "Wrote $STORE_ENV"
echo "Publishable key: ${KEY:0:12}..."
