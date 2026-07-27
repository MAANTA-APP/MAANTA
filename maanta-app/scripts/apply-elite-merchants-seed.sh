#!/usr/bin/env bash
# Apply supabase/seed/elite_merchants_100.sql against DATABASE_URL.
# Usage (from maanta-app/):
#   export DATABASE_URL='postgresql://...'
#   ./scripts/apply-elite-merchants-seed.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED="$ROOT/supabase/seed/elite_merchants_100.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set."
  echo "Get it from Supabase → Project Settings → Database → Connection string (URI),"
  echo "or use the local stack URL from \`supabase start\`."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found — install PostgreSQL client tools, or paste $SEED into the SQL editor."
  exit 1
fi

echo "Applying 100 elite merchants seed…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED"
echo "Done. Browse elite merchants at /feed and /browse (BBS Mall node)."
