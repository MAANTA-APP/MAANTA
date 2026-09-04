-- =============================================================================
-- Admin Growth console — merchant leads and campaigns.
--
-- Founder-authorised 2026-09-04 (Claude Design handoff, board 3 of 4:
-- "MAANTA Admin Growth"). Node 0 Field Validation Mode freezes speculative
-- engineering; this is the specifically-authorised exception, recorded as such
-- in docs/skills/admin-growth-console-2026-09-04.md.
--
-- ## Two tables, and one that is deliberately absent
--
-- `growth_merchant_leads` and `growth_campaigns` are new operating records with
-- no existing home. The **waitlist is not here**: waitlist signups live in the
-- Resend audience by founder decision 2026-07-10, and `/admin/growth/waitlist`
-- reads them back out of Resend rather than growing a second copy. Adding a
-- waitlist table would silently reverse that decision, so it is not in this
-- migration. See D262.
--
-- ## A lead is a unit on a floor
--
-- Identity is `(floor, unit)` and it is UNIQUE among live leads: an agent
-- walking the ground floor must not be able to create a second card for a shop
-- a colleague already logged an hour ago. There is no shop-name column on
-- purpose — MAANTA does not hold trading names for businesses that have not
-- signed anything, and inventing one is the fabrication the pre-launch claims
-- discipline exists to prevent.
--
-- ## `is_test` is a real column, not a convention
--
-- The console's population filter (Real / Test / All) has to be answerable in
-- SQL, and it defaults to Real. A test row that relied on a naming convention
-- would leak into a count the first time somebody typed a unit number without
-- the agreed prefix — the same class of defect as D188, where `is_demo` was
-- never set by the product and every claim silently counted as real. Here the
-- column is NOT NULL with a DEFAULT FALSE and the console always states which
-- population it counted.
--
-- ## Verification
--
-- Local only: `make db-verify` (boots a throwaway Supabase, applies the chain,
-- runs supabase/tests/*.sql). **Claude does not apply migrations to production.**
-- Before applying, a human must read `supabase_migrations.schema_migrations` —
-- not `ls supabase/migrations/` — and confirm this version is genuinely next;
-- the repo directory has under-reported the high-water mark before (D121).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Merchant leads
-- ---------------------------------------------------------------------------
CREATE TABLE public.growth_merchant_leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor              TEXT NOT NULL CHECK (floor IN ('GF', '1F', '2F')),
  unit               TEXT NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 16),
  category           TEXT CHECK (category IS NULL OR length(category) <= 80),
  contact_name       TEXT CHECK (contact_name IS NULL OR length(contact_name) <= 120),
  contact_phone      TEXT CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  stage              TEXT NOT NULL DEFAULT 'new'
                     CHECK (stage IN ('new','contacted','visit_booked','onboarding','ready_to_publish','lost')),
  -- A lost lead must say why, from the closed list; a lead that is not lost must
  -- not carry a reason. Free text becomes a hundred spellings of "no answer",
  -- and "why did they say no" is the most valuable thing cohort one produces.
  lost_reason        TEXT CHECK (lost_reason IN ('not_interested','unit_vacant','wrong_number','asked_us_to_stop')),
  agent_user_id      UUID REFERENCES public.users(id),
  visit_at           TIMESTAMPTZ,
  account_created    BOOLEAN NOT NULL DEFAULT FALSE,
  staff_added        BOOLEAN NOT NULL DEFAULT FALSE,
  wallet_topped_up   BOOLEAN NOT NULL DEFAULT FALSE,
  is_test            BOOLEAN NOT NULL DEFAULT FALSE,
  -- Stamped on the first move out of `new`. The published 1-business-day reply
  -- promise is about the FIRST reply, so overdue is measured from created_at to
  -- this, and a lead that has been contacted can never be overdue again.
  first_contacted_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT growth_leads_lost_reason_matches_stage
    CHECK ((stage = 'lost') = (lost_reason IS NOT NULL)),
  -- A lead cannot have been contacted before it existed.
  CONSTRAINT growth_leads_contacted_after_created
    CHECK (first_contacted_at IS NULL OR first_contacted_at >= created_at)
);

-- One live card per unit. Lost leads are excluded so a unit that said no this
-- month can be approached again next quarter without deleting the history.
CREATE UNIQUE INDEX growth_leads_unique_live_unit
  ON public.growth_merchant_leads (floor, unit)
  WHERE stage <> 'lost';

CREATE INDEX growth_leads_board ON public.growth_merchant_leads (stage, created_at);
CREATE INDEX growth_leads_population ON public.growth_merchant_leads (is_test, stage);

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE public.growth_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  -- `utm_campaign`. This is the attribution join key against the UTM stored on
  -- a waitlist contact, so its shape is constrained rather than trusted: one
  -- `Node0-Teaser` beside twenty `node0-teaser` splits a campaign into two rows
  -- that never add up.
  slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 60),
  channel     TEXT NOT NULL
              CHECK (channel IN ('instagram','tiktok','whatsapp','facebook','linkedin','offline','email')),
  destination TEXT NOT NULL CHECK (destination ~ '^/'),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','ended')),
  -- Nullable on purpose: an owned channel has no cost per signup, it has no
  -- cost. Zero would be a different and wrong claim. Internal figure only —
  -- never rendered on a public surface (see the module doc in lib/growth/campaigns.ts).
  spend_kes   NUMERIC(12,2) CHECK (spend_kes IS NULL OR spend_kes >= 0),
  is_test     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX growth_campaigns_status ON public.growth_campaigns (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Access. Same shape as admin_ops_log: admins read through RLS, service_role
-- writes. No authenticated write path — every mutation goes through an admin
-- route that also writes admin_ops_log, so a stage change is always attributable.
-- ---------------------------------------------------------------------------
ALTER TABLE public.growth_merchant_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_campaigns      ENABLE ROW LEVEL SECURITY;

CREATE POLICY growth_leads_admin_read ON public.growth_merchant_leads
  FOR SELECT USING (public.current_user_role() = 'admin');
CREATE POLICY growth_campaigns_admin_read ON public.growth_campaigns
  FOR SELECT USING (public.current_user_role() = 'admin');

REVOKE ALL ON TABLE public.growth_merchant_leads FROM PUBLIC;
REVOKE ALL ON TABLE public.growth_merchant_leads FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.growth_merchant_leads FROM authenticated;
GRANT SELECT ON TABLE public.growth_merchant_leads TO authenticated;
GRANT ALL ON TABLE public.growth_merchant_leads TO service_role;

REVOKE ALL ON TABLE public.growth_campaigns FROM PUBLIC;
REVOKE ALL ON TABLE public.growth_campaigns FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.growth_campaigns FROM authenticated;
GRANT SELECT ON TABLE public.growth_campaigns TO authenticated;
GRANT ALL ON TABLE public.growth_campaigns TO service_role;

-- ---------------------------------------------------------------------------
-- Audit target types. A lead stage change and a campaign edit are admin
-- mutations and belong in the same trail as every other one.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_ops_log DROP CONSTRAINT IF EXISTS admin_ops_log_target_type_check;
ALTER TABLE public.admin_ops_log ADD CONSTRAINT admin_ops_log_target_type_check
  CHECK (target_type IN (
    'merchant', 'deal', 'redemption', 'fraud_event', 'agent_task', 'user',
    'growth_lead', 'growth_campaign', 'waitlist_contact'
  ));

COMMENT ON TABLE public.growth_merchant_leads IS
  'Pre-launch merchant acquisition board. Identity is (floor, unit) — never an invented shop name. is_test segregates internal rows from every count.';
COMMENT ON TABLE public.growth_campaigns IS
  'Acquisition campaigns and their utm_campaign slugs. spend_kes is an internal operating figure and never renders publicly.';
