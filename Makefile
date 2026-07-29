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

.PHONY: help db-link db-list db-push-dry db-push db-prod-fixup db-verify \
        db-seed-nairobi-150 db-seed-test-accounts test test-e2e \
        demo-on demo-off demo-status demo-seed demo-reseed demo-wipe

help:
	@echo "MAANTA make targets:"
	@echo "  db-link      supabase link --project-ref $(SUPABASE_PROJECT_REF)"
	@echo "  db-list      supabase migration list (local vs remote)"
	@echo "  db-push-dry  supabase db push --dry-run (preview, no writes)"
	@echo "  db-push      supabase db push (applies migrations; prompts)"
	@echo "  db-prod-fixup  migrations + 100-deal seed + verify (needs DATABASE_URL)"
	@echo "  db-verify    LOCAL ONLY: boot a throwaway local Supabase + run supabase/tests/*.sql (mirrors CI db-tests)"
	@echo "  db-seed-nairobi-150  Apply 150-merchant Nairobi 3-node seed (needs DATABASE_URL or local stack)"
	@echo "  db-seed-test-accounts  Apply @maanta.app role test accounts (run after nairobi-150 seed)"
	@echo "  test         vitest suite (unit)"
	@echo ""
	@echo "Demo mode (see docs/ops/demo-mode.md):"
	@echo "  demo-status  show demo/real row counts and whether demo mode is on"
	@echo "  demo-on      enable demo mode (synthetic data becomes visible)"
	@echo "  demo-off     disable demo mode (data stays, becomes invisible)"
	@echo "  demo-seed    seed demo activity history"
	@echo "  demo-reseed  force a flash-deal top-up now"
	@echo "  demo-wipe    DELETE demo rows (prompts; refuses while demo mode is on)"
	@echo "               Agents/users a surviving real row still references are"
	@echo "               RETAINED and reported — a non-zero count is expected,"
	@echo "               not a partial failure. Do not re-run to 'finish' it."
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

# Nairobi 3-node rehearsal seed (150 merchants + deals). Requires DATABASE_URL or
# a running local stack (postgresql://postgres:postgres@127.0.0.1:54322/postgres).
db-seed-nairobi-150:
	@db_url="$${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"; \
	  echo "Applying nairobi_nodes_150_merchants.sql to $$db_url"; \
	  psql "$$db_url" -v ON_ERROR_STOP=1 -f $(APP_DIR)/supabase/seed/nairobi_nodes_150_merchants.sql

# Role test accounts (@maanta.app). Run after db-seed-nairobi-150.
db-seed-test-accounts:
	@db_url="$${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"; \
	  echo "Applying test_accounts_maanta_2026_07.sql to $$db_url"; \
	  psql "$$db_url" -v ON_ERROR_STOP=1 -f $(APP_DIR)/supabase/seed/test_accounts_maanta_2026_07.sql

# ---------------------------------------------------------------------------
# Demo mode. Targets read and write only rows where is_demo — with one
# deliberate exception: demo-on and demo-off update the control flag itself,
# public.app_config.demo_mode_enabled, which is not a demo row.
# See docs/ops/demo-mode.md.
#
# DB_URL resolution matches the seed targets above: DATABASE_URL if set,
# otherwise the local stack.
# ---------------------------------------------------------------------------
DEMO_PSQL = psql "$${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}" -v ON_ERROR_STOP=1

demo-status:
	@$(DEMO_PSQL) -c "SELECT public.is_demo_mode() AS demo_mode_on;" \
	              -c "SELECT * FROM public.demo_data_census;"

demo-on:
	@$(DEMO_PSQL) -c "UPDATE public.app_config SET value='true' WHERE key='demo_mode_enabled';" \
	              -c "SELECT public.is_demo_mode() AS demo_mode_on;"
	@echo "Demo mode ON. Also set MAANTA_DEMO_MODE=true in the app environment so analytics events are tagged."

demo-off:
	@$(DEMO_PSQL) -c "UPDATE public.app_config SET value='false' WHERE key='demo_mode_enabled';" \
	              -c "SELECT public.is_demo_mode() AS demo_mode_on;"
	@echo "Demo mode OFF. Synthetic rows are now hidden but still present — run demo-wipe to remove them."

demo-seed:
	@$(DEMO_PSQL) -f $(APP_DIR)/supabase/seed/demo_activity_seed.sql

demo-reseed:
	@$(DEMO_PSQL) -c "SELECT public.reseed_demo_flash_deals() AS deals_created;"

# Destructive. Refuses while demo mode is on, shows the dry run, then requires
# an explicit yes. The precondition is enforced, not just documented: wiping
# while the public site is still serving demo data empties it under live eyes.
demo-wipe:
	@on="$$($(DEMO_PSQL) -Atc 'SELECT public.is_demo_mode();')"; \
	  if [ "$$on" = "t" ]; then \
	    echo "Refusing: demo mode is ON. Run 'make demo-off' first, then retry."; \
	    exit 1; \
	  fi
	@echo "Dry run — rows that WOULD be deleted:"
	@$(DEMO_PSQL) -c "SELECT * FROM public.wipe_demo_data();"
	@printf "Type 'wipe' to delete all demo data: "; read ans; \
	  if [ "$$ans" = "wipe" ]; then \
	    $(DEMO_PSQL) -c "SELECT * FROM public.wipe_demo_data(TRUE);"; \
	    echo "Demo data removed. Verify with: make demo-status"; \
	  else echo "Aborted — nothing deleted."; fi

test:
	cd $(APP_DIR) && npm test

test-e2e:
	cd $(APP_DIR) && npm run test:e2e
