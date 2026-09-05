-- =============================================================================
-- The waitlist mirror learns who has unsubscribed. Founder authorisation
-- 2026-09-05 (register row D267).
--
-- ## The gap
--
-- Resend's contact record carries `unsubscribed`, and `getAudienceContact`
-- has always read it — but the mirror had nowhere to put it, so neither the
-- signup path nor the sync recorded it. The console's counts and, worse, the
-- CSV export therefore included people who had opted out of MAANTA email. A
-- CSV taken for a campaign send would have mailed them. Found by the 2026-09-05
-- hand review of the mirror (D268); the flag was present in the Resend-walk
-- directory the mirror replaced and was dropped in the move.
--
-- ## Why it is not prefixed `resend_`
--
-- The mirror's convention is that a `resend_` column is OUR KNOWLEDGE of
-- Resend, not a fact we own. An opt-out is different in kind: it is the
-- person's withdrawal of consent to be emailed (Kenya DPA 2019), and Resend is
-- merely where they recorded it, because the unsubscribe link lives in the
-- email. So the column is named for the fact about the person, and the sync is
-- how that fact arrives.
--
-- ## Semantics
--
--   * DEFAULT FALSE, and the public form leaves it there: nobody can have
--     unsubscribed at the moment they subscribe.
--   * The sync writes it from Resend on every pass, last-read-wins in both
--     directions — a person who re-subscribes must come back.
--   * An unsubscribed person is STILL a waitlist signup. They joined; they
--     count in the total; they are flagged. What they must not be is emailed,
--     so the CSV export excludes them unless the operator asks for them by
--     name, and the filename says so when they do.
--
-- ## Verification
--
-- Ledger read before choosing this version: production
-- `supabase_migrations.schema_migrations` held 112 rows at `20260904130000`
-- on 2026-09-05. Scenario I of `supabase/tests/waitlist_signups_test.sql`.
-- =============================================================================

ALTER TABLE public.waitlist_signups
  ADD COLUMN unsubscribed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.waitlist_signups.unsubscribed IS
  'The person has opted out of MAANTA email. Recorded in Resend (the unsubscribe link lives in the email) and written here by the sync, last-read-wins. FALSE on the public form. Still counts as a signup; excluded from the CSV export by default (D267).';

-- The export's suppression check and the data-quality tile both ask "who has
-- opted out", and that set is small relative to the audience.
CREATE INDEX waitlist_signups_unsubscribed ON public.waitlist_signups (unsubscribed)
  WHERE unsubscribed;
