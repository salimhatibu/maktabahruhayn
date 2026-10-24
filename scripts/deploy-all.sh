#!/usr/bin/env bash
set -euo pipefail

# Deploy all three Workers in the right order:
#   1. storefront  (must exist before the router's service binding resolves)
#   2. admin       (same reason)
#   3. router      (binds to the other two by name)
#
# Run from the repo root:
#   bash scripts/deploy-all.sh
#
# Or through pnpm:
#   pnpm deploy:all

cd "$(dirname "$0")/.."
ROOT=$(pwd)

echo "==> Building and deploying storefront..."
cd "$ROOT/apps/storefront"
node ./scripts/cf.mjs build
node ./scripts/cf.mjs deploy

echo ""
echo "==> Building and deploying admin..."
cd "$ROOT/apps/admin"
node ./scripts/cf.mjs build
node ./scripts/cf.mjs deploy

echo ""
echo "==> Deploying router..."
cd "$ROOT/apps/router"
npx wrangler deploy

echo ""
echo "=== All three Workers deployed ==="
