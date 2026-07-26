#!/usr/bin/env bash
# Apply missing prod migrations + 100-deal seed, then verify schema/counts.
# Requires a Postgres URI in DATABASE_URL (see docs/skills/node0-seed-bbs-mall.md).
# Password must be percent-encoded if it contains special characters.
#
# Usage (from maanta-app/):
#   export DATABASE_URL='<postgres-uri-from-supabase-dashboard>'
#   ./scripts/prod-schema-seed-fixup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

redact_url() {
  python3 -c "import os, re; u=os.environ.get('DATABASE_URL',''); print(re.sub(r'(postgresql://[^:]+:)[^@]+', r'\1***', u))" 2>/dev/null || echo "(redacted)"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is not set. Add the Supabase Postgres URI as a Cursor secret."
fi

if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]]; then
  fail "DATABASE_URL must be a PostgreSQL URI. Use the Supabase Database connection string, not an HTTP app URL."
fi

if [[ "$DATABASE_URL" != *"db."*".supabase.co"* && "$DATABASE_URL" != *".pooler.supabase.com"* ]]; then
  fail "DATABASE_URL host does not look like a Supabase Postgres host (direct db.*.supabase.co or *.pooler.supabase.com)."
fi

command -v psql >/dev/null 2>&1 || fail "psql not found — install PostgreSQL client tools."
command -v supabase >/dev/null 2>&1 || fail "supabase CLI not found."

echo "==> DATABASE_URL host check OK ($(redact_url))"

echo "==> Pushing migrations to production (supabase db push --db-url …)"
supabase db push --db-url "$DATABASE_URL" --yes

echo "==> Applying 100-deal Node 0 seed"
./scripts/apply-100-deals-seed.sh

echo "==> Verifying schema columns"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='merchants'
     AND column_name IN ('lat','lng') ORDER BY 1;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='users'
     AND column_name='preferred_language';"

echo "==> Verifying seed counts"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) AS seeded_merchants FROM merchants WHERE id::text LIKE 'c1000000-%';"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) AS seeded_deals FROM deals WHERE id::text LIKE 'd1000000-%';"

echo "==> Done. Check https://www.maanta.app/feed and /browse at BBS Mall."
