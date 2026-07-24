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

.PHONY: help db-link db-list db-push-dry db-push test test-e2e

help:
	@echo "MAANTA make targets:"
	@echo "  db-link      supabase link --project-ref $(SUPABASE_PROJECT_REF)"
	@echo "  db-list      supabase migration list (local vs remote)"
	@echo "  db-push-dry  supabase db push --dry-run (preview, no writes)"
	@echo "  db-push      supabase db push (applies migrations; prompts)"
	@echo "  test         vitest suite (unit)"
	@echo "  test-e2e     Playwright golden path (needs E2E_BASE_URL + storage; see docs/ops/e2e-golden-path.md)"
	@echo ""
	@echo "Production project-ref: $(SUPABASE_PROJECT_REF) — see docs/ops/supabase-migrations.md"

db-link:
	cd $(APP_DIR) && supabase link --project-ref $(SUPABASE_PROJECT_REF)

db-list:
	cd $(APP_DIR) && supabase migration list

db-push-dry:
	cd $(APP_DIR) && supabase db push --dry-run

db-push:
	cd $(APP_DIR) && supabase db push

test:
	cd $(APP_DIR) && npm test

test-e2e:
	cd $(APP_DIR) && npm run test:e2e
