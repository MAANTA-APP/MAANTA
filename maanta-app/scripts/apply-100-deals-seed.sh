#!/usr/bin/env bash
# Apply supabase/seed/node0_100_deals_seed.sql against DATABASE_URL.
# Usage (from maanta-app/):
#   export DATABASE_URL='postgresql://postgres.axrrslqssmbngbataejg:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'
#   ./scripts/apply-100-deals-seed.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED="$ROOT/supabase/seed/node0_100_deals_seed.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set."
  echo "Use the session pooler URI (see docs/skills/node0-seed-bbs-mall.md):"
  echo "  postgresql://postgres.axrrslqssmbngbataejg:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
  echo "then:  export DATABASE_URL='…' && $0"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found — install PostgreSQL client tools, or paste $SEED into the SQL editor."
  exit 1
fi

echo "Applying 100-deals seed…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED"
echo "Done. Open /feed and /browse at BBS Mall."
