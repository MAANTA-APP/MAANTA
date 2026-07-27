#!/usr/bin/env bash
# Apply supabase/seed/test_accounts_maanta_2026_07.sql against DATABASE_URL.
# Usage (from maanta-app/):
#   export DATABASE_URL='postgresql://...'
#   ./scripts/apply-test-accounts-seed.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED="$ROOT/supabase/seed/test_accounts_maanta_2026_07.sql"

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

echo "Applying Maanta test accounts seed…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED"
echo "Done. Sign in at /login with the @maanta.app emails (see docs/ops/test-accounts-seed-2026-07.md)."
