#!/usr/bin/env bash
# Print a human-run production migration verification checklist.
# Does NOT connect to production — safe to run anytime.
#
# Usage (from repo root or maanta-app/):
#   ./scripts/print-prod-migration-checklist.sh
#   make db-migration-checklist

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"

echo "=== MAANTA production migration checklist ==="
echo "Pinned prod ref: axrrslqssmbngbataejg"
echo "Do NOT use: vcrfqsevompqjazbwzyh"
echo ""
echo "Local migration files: $(ls -1 "$MIG_DIR"/*.sql 2>/dev/null | wc -l | tr -d ' ')"
echo ""
echo "Operator steps (HUMAN — requires Supabase CLI + credentials):"
echo "  1. Confirm Vercel NEXT_PUBLIC_SUPABASE_URL contains axrrslqssmbngbataejg"
echo "  2. cd maanta-app && supabase link --project-ref axrrslqssmbngbataejg"
echo "  3. make db-list          # or: supabase migration list"
echo "  4. make db-push-dry      # preview pending"
echo "  5. Take a PITR / backup if uneasy"
echo "  6. make db-push          # applies pending migrations in order"
echo "  7. Run verification SQL in docs/ops/supabase-migrations.md §5"
echo "  8. GET https://www.maanta.app/api/healthz?ready=1"
echo "  9. Optional seed: node0_100_deals_seed.sql (demo only)"
echo ""
echo "Full runbook: docs/ops/supabase-migrations.md"
echo "Prod sync:    docs/ops/prod-sync-checklist-2026-07.md"
echo "Launch:       docs/ops/launch-runbook-2026-07.md"
echo ""
echo "Latest 10 local migrations:"
ls -1 "$MIG_DIR"/*.sql | sort | tail -10 | xargs -n1 basename
