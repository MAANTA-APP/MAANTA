# MAANTA ops convenience targets.
#
# These wrap the Supabase CLI commands documented in
# docs/ops/supabase-migrations.md. They target PRODUCTION
# (project-ref axrrslqssmbngbataejg) and are meant to be run BY A HUMAN with
# CLI credentials — review docs/ops/supabase-migrations.md before running.
#
# Run from the repo root, e.g. `make db-list`. All db targets cd into maanta-app/.

SUPABASE_PROJECT_REF := axrrslqssmbngbataejg
APP_DIR := maanta-app

.PHONY: help db-link db-list db-push-dry db-push db-prod-fixup db-verify db-seed-test-accounts db-seed-elite test test-e2e

help:
	@echo "MAANTA make targets:"
	@echo "  db-link      supabase link --project-ref $(SUPABASE_PROJECT_REF)"
	@echo "  db-list      supabase migration list (local vs remote)"
	@echo "  db-push-dry  supabase db push --dry-run (preview, no writes)"
	@echo "  db-push      supabase db push (applies migrations; prompts)"
	@echo "  db-prod-fixup  migrations + 100-deal seed + verify (needs DATABASE_URL)"
	@echo "  db-verify    LOCAL ONLY: boot a throwaway local Supabase + run supabase/tests/*.sql (mirrors CI db-tests)"
	@echo "  db-seed-test-accounts  apply test @maanta.app accounts (needs DATABASE_URL)"
	@echo "  db-seed-elite        apply 100 elite merchants + deals seed (needs DATABASE_URL)"
	@echo "  test         vitest suite (unit)"
	@echo "  test-e2e     Playwright golden path (needs E2E_BASE_URL + storage; see docs/ops/e2e-golden-path.md)"
	@echo ""
	@echo "db-link/db-list/db-push* target PRODUCTION ($(SUPABASE_PROJECT_REF)) and are HUMAN-RUN."
	@echo "db-verify is LOCAL/dev only and never touches production — see docs/ops/supabase-migrations.md"

db-link:
	cd $(APP_DIR) && supabase link --project-ref $(SUPABASE_PROJECT_REF)

db-list:
	cd $(APP_DIR) && supabase migration list

db-push-dry:
	cd $(APP_DIR) && supabase db push --dry-run

db-push:
	cd $(APP_DIR) && supabase db push

# Requires DATABASE_URL = Postgres URI for axrrslqssmbngbataejg (see docs/skills/node0-seed-bbs-mall.md).
db-prod-fixup:
	cd $(APP_DIR) && ./scripts/prod-schema-seed-fixup.sh

# db-verify — LOCAL/dev ONLY. Boots a disposable local Supabase (which applies
# every migration), runs the supabase/tests/*.sql assertion suites against it
# (exactly mirroring the CI `db-tests` job), then stops it. It NEVER targets the
# linked production project: the suites INSERT assertion data, so they must only
# ever run against a throwaway local stack. Requires the Supabase CLI + Docker.
# The db_url below is the fixed local-stack address, not a remote/prod one.
db-verify:
	@command -v supabase >/dev/null 2>&1 || { echo "supabase CLI not found — install it first (see docs/ops/supabase-migrations.md)"; exit 1; }
	cd $(APP_DIR) && supabase start
	cd $(APP_DIR) && db_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"; \
	  rc=0; \
	  for f in supabase/tests/*.sql; do echo "── $$f"; psql "$$db_url" -v ON_ERROR_STOP=1 -f "$$f" || rc=1; done; \
	  supabase stop; \
	  exit $$rc

# Requires DATABASE_URL (local stack or hosted). See docs/ops/test-accounts-seed-2026-07.md
db-seed-test-accounts:
	cd $(APP_DIR) && ./scripts/apply-test-accounts-seed.sh

# Requires DATABASE_URL. See docs/skills/elite-merchants-seed.md
db-seed-elite:
	cd $(APP_DIR) && ./scripts/apply-elite-merchants-seed.sh

test:
	cd $(APP_DIR) && npm test

test-e2e:
	cd $(APP_DIR) && npm run test:e2e
