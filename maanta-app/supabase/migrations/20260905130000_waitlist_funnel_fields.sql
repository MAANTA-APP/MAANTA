-- =============================================================================
-- The waitlist funnel (design board 2 of 4) — the fields the two forms ask for.
-- Founder authorisation 2026-09-05.
--
-- Board 2 redraws `/waitlist` as role selection plus a shopper form, and turns
-- `/merchants/join` into merchant INTEREST capture — shop, contact, phone, floor
-- and unit — feeding the growth board that board 3 already reads. Both forms
-- ask for a few things the tables had no column for. Everything here is
-- additive and nullable-or-defaulted, so existing rows and the admin console's
-- reads are unaffected.
--
-- ## waitlist_signups
--
--   interests      What the shopper usually shops for, from a closed list in
--                  lib/waitlist.ts. Optional chips on the form; NULL when none.
--                  Mirror-only: Resend has no property for it and does not need
--                  one, because Supabase owns counting and this exists to be
--                  counted (which categories the first cohort wants).
--   node_interest  Already existed as a constant "BBS Mall". The form now asks
--                  which mall, so it becomes free text with a length bound. A
--                  shopper who names another mall is a signal for Node 1.
--
-- ## growth_merchant_leads
--
--   shop_name          What the merchant typed above their door. NOT an invented
--                      trading name — D265's rule was that the board must not
--                      carry a name nobody gave us; a name the owner supplied on
--                      a form is theirs. Nullable: agent-created rows still
--                      identify by (floor, unit) alone.
--   mall               Defaults to Node 0. A merchant from another mall is a
--                      lead for a node that does not exist yet, and the row
--                      says so instead of being silently filed under BBS.
--   counter_staff      "How many people work your counter?" — sizes the staff
--                      seat conversation before the visit.
--   elite_trial_opt_in "Include me in the 30-day Elite trial."
--   source             Where the ROW came from: an agent on the floor, or the
--                      public form. Same reasoning as waitlist_signups.signup_source.
--   consent_at/_text   The contact-consent wording the merchant ticked, verbatim,
--                      with its timestamp (Kenya DPA 2019). A form row must carry
--                      it; an agent row records consent in the conversation.
--   utm_*              Attribution, so the Campaigns screen can one day count
--                      merchant leads the way it counts shopper signups.
--   test_label         Parity with the waitlist's TEST treatment: an internal
--                      test row says which run it came from.
--
-- ## Verification
--
-- Ledger read before choosing this version: production held 113 rows at
-- `20260905120000` on 2026-09-05. Scenario J of waitlist_signups_test.sql and
-- scenario H of growth_leads_and_campaigns_test.sql.
-- =============================================================================

ALTER TABLE public.waitlist_signups
  ADD COLUMN interests TEXT[]
    CHECK (interests IS NULL OR array_length(interests, 1) BETWEEN 1 AND 8),
  ADD CONSTRAINT waitlist_signups_node_interest_length
    CHECK (node_interest IS NULL OR length(node_interest) BETWEEN 1 AND 80);

COMMENT ON COLUMN public.waitlist_signups.interests IS
  'What the shopper usually shops for — closed list in lib/waitlist.ts, optional. Mirror-only; Resend does not carry it.';

ALTER TABLE public.growth_merchant_leads
  ADD COLUMN shop_name          TEXT CHECK (shop_name IS NULL OR length(shop_name) BETWEEN 1 AND 160),
  ADD COLUMN mall               TEXT NOT NULL DEFAULT 'BBS Mall, Eastleigh'
                                CHECK (length(mall) BETWEEN 1 AND 120),
  ADD COLUMN counter_staff      TEXT CHECK (counter_staff IS NULL OR counter_staff IN ('just_me', 'two_to_four', 'five_plus')),
  ADD COLUMN elite_trial_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN source             TEXT NOT NULL DEFAULT 'admin'
                                CHECK (source IN ('admin', 'public_form')),
  ADD COLUMN consent_at         TIMESTAMPTZ,
  ADD COLUMN consent_text       TEXT,
  ADD COLUMN utm_source         TEXT CHECK (utm_source IS NULL OR length(utm_source) <= 100),
  ADD COLUMN utm_medium         TEXT CHECK (utm_medium IS NULL OR length(utm_medium) <= 100),
  ADD COLUMN utm_campaign       TEXT CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 100),
  ADD COLUMN test_label         TEXT CHECK (test_label IS NULL OR length(test_label) <= 60),
  -- A row the public form wrote carries the consent the merchant gave. An agent
  -- row records consent in the conversation and may leave this empty.
  ADD CONSTRAINT growth_leads_form_rows_carry_consent
    CHECK (source <> 'public_form' OR (consent_at IS NOT NULL AND consent_text IS NOT NULL)),
  ADD CONSTRAINT growth_leads_test_label_needs_flag
    CHECK (test_label IS NULL OR is_test);

COMMENT ON COLUMN public.growth_merchant_leads.shop_name IS
  'The name the merchant gave above their door. Never invented by us (D265): NULL on agent-created rows, which identify by (floor, unit) alone.';
COMMENT ON COLUMN public.growth_merchant_leads.source IS
  'Where the row came from: admin (an agent on the floor) or public_form (/merchants/join). Permanent, like waitlist_signups.signup_source.';
