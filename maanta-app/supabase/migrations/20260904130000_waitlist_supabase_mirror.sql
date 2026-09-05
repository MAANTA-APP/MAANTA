-- =============================================================================
-- The waitlist gains a Supabase mirror. Founder ruling 2026-09-04.
--
-- ## What this supersedes
--
-- The 2026-07-10 decisions ("Waitlist signups live in the email platform", and
-- its same-day amendment naming Resend) said there would be no Supabase table
-- and that `/api/waitlist` would store nothing. That held while the only reader
-- was the email platform itself. It stopped holding when the admin Growth
-- console had to COUNT and FILTER those signups: Resend's audience-list endpoint
-- returns no custom properties, so the console had to walk the audience one
-- contact at a time and cap itself at 500 (D261).
--
-- The founder's ruling is to mirror. This migration is that mirror. The
-- decisions log carries the amendment; `20260904120000`'s header says a waitlist
-- table is "deliberately absent" and is **superseded by this file** — that text
-- was true when written and is left alone, because an applied-or-about-to-be
-- -applied migration is a frozen artifact here (the repo corrects prior wording
-- with a NEW migration, e.g. 20260730160000, never by editing the old one).
--
-- ## Resend stays the sender of record; Supabase becomes the queryable record
--
-- This is not a failover pair and neither store is authoritative for everything:
--
--   Resend    — owns DELIVERABILITY and the join date. It decides whether an
--               address already exists, it sends the confirmation, and its
--               `created_at` is the only real record of when someone joined.
--   Supabase  — owns COUNTING. Everything the console filters, groups or
--               exports reads from here, unbounded and server-side.
--
-- The columns below are named so that distinction survives: anything prefixed
-- `resend_` describes OUR KNOWLEDGE of Resend, not a fact we own.
--
-- ## `joined_at` is NULLABLE, and that is the most important line in this file
--
-- Resend's create-contact response returns an id, not a `created_at` — the join
-- date is only knowable from its list/get endpoints. So at the moment the public
-- form writes this row, WE DO NOT KNOW when the person joined, and writing
-- `NOW()` would fabricate it. Worse, on the `already_exists` branch the true
-- join date may be months old and `NOW()` would silently move a historical
-- signup into today's chart.
--
-- NULL means "not read from Resend yet". The sync pass fills it. It is filled
-- LAST-WRITE-WINS FROM A SUCCESSFUL READ and never floored with LEAST(): a value
-- we hold is only ever replaced by a better read, because `getAudienceContact`
-- used to substitute the Unix epoch for a missing `created_at` and a monotone
-- update would have pinned such a row to 1970 permanently, dropping the person
-- out of every chart with no way back. (That substitution is removed in the same
-- change; the reader now returns null.)
--
-- ## `note` is deliberately NOT mirrored
--
-- It is free text a member of the public typed, the console never renders it,
-- and a second copy of it earns nothing while adding somewhere it can leak.
-- Resend still holds it. Data minimisation, Kenya DPA 2019.
--
-- ## Verification
--
-- Local only: `make db-verify`. Ledger read before choosing this version:
-- production `supabase_migrations.schema_migrations` held 110 rows at
-- `20260903140000` on 2026-09-04, so `20260904120000` and then this file are
-- genuinely next. Read the ledger again before applying — the repo directory is
-- not the authority (D121).
-- =============================================================================

CREATE TABLE public.waitlist_signups (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity. Resend keys its audience on the address, so we do too. citext is
  -- not installed in this project (checked on production 2026-09-04: pg_cron,
  -- pg_stat_statements, pgcrypto, pgmq, plpgsql, postgis, supabase_vault,
  -- uuid-ossp, wrappers) and this repo has added no extension since 2026-07-09,
  -- so case-folding is a functional unique index on lower(email), not a type.
  -- Stored already-lowercased, and the database enforces it rather than trusting
  -- the caller. This is NOT cosmetic: the upsert on the signup path targets
  -- `ON CONFLICT (email)`, and Postgres will only match that against a unique
  -- index on exactly `(email)` — a functional index on `lower(email)` raises
  -- "there is no unique or exclusion constraint matching the ON CONFLICT
  -- specification" (verified on this project's Postgres 17 on 2026-09-04).
  -- Because the mirror write is deliberately non-fatal, that would have failed
  -- silently on every single signup and left the console permanently empty.
  --
  -- `validateWaitlistSubmission` already lowercases; the backfill lowercases
  -- what Resend returns. The CHECK is what makes that an invariant instead of a
  -- convention two call sites happen to share today.
  email                 TEXT NOT NULL UNIQUE
                        CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  full_name             TEXT CHECK (full_name IS NULL OR length(full_name) <= 120),
  -- Plaintext, with the same E.164 shape check `growth_merchant_leads` uses.
  -- Not hashed: the console already masks it at render and audits every reveal
  -- (`/api/admin/growth/waitlist/reveal`), which is the treatment the founder
  -- already accepted; a one-way hash would break duplicate review for the human
  -- who has to act on it while solving a problem that is already solved.
  phone                 TEXT CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$'),
  -- NULLABLE, and only for backfilled rows: a contact whose `segment_type`
  -- Resend would not return still exists and still belongs in the waitlist
  -- total. The console already has an "unknown role" bucket for exactly this,
  -- and guessing 'shopper' would silently invent a segmentation fact. The
  -- public form always knows it, and the constraint below holds it to that.
  segment               TEXT
                        CHECK (segment IS NULL OR segment IN ('shopper', 'merchant', 'mall_operator')),
  node_interest         TEXT,
  business_name         TEXT CHECK (business_name IS NULL OR length(business_name) <= 160),

  utm_source            TEXT CHECK (utm_source IS NULL OR length(utm_source) <= 100),
  utm_medium            TEXT CHECK (utm_medium IS NULL OR length(utm_medium) <= 100),
  utm_campaign          TEXT CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 100),

  -- Consent wording is stored with the timestamp, not just a boolean: Kenya DPA
  -- 2019 requires the wording a person actually agreed to, and that wording can
  -- change between signups.
  consent_at            TIMESTAMPTZ,
  consent_text          TEXT,

  is_test               BOOLEAN NOT NULL DEFAULT FALSE,
  test_label            TEXT CHECK (test_label IS NULL OR length(test_label) <= 60),

  -- Where this ROW came from. Permanent, unlike resend_status which changes on
  -- every sync — conflating the two loses the provenance the first time a
  -- backfilled row is re-synced.
  signup_source         TEXT NOT NULL DEFAULT 'public_form'
                        CHECK (signup_source IN ('public_form', 'backfill')),

  -- Our knowledge of Resend. TEXT, not UUID: Resend's id format is its own
  -- contract, and a UUID column would turn a format change into an unhandled
  -- insert error on the public signup path.
  resend_contact_id     TEXT CHECK (resend_contact_id IS NULL OR length(resend_contact_id) BETWEEN 1 AND 128),
  -- No DEFAULT on purpose: a row that reached this table without a writer
  -- deciding its Resend state must fail loudly rather than read as settled.
  resend_status         TEXT NOT NULL
                        CHECK (resend_status IN ('pending', 'created', 'already_exists', 'failed')),
  resend_synced_at      TIMESTAMPTZ,

  -- TRUE when Resend held this contact but its custom properties could not be
  -- read. Three states, not two: absent properties means "unreadable", an empty
  -- properties object ALSO means unreadable (it is the footprint of
  -- `addWaitlistContact`'s strip-and-retry, which fires on any 4xx including a
  -- 429), and only a populated object means "provided". Without this a person
  -- who did consent renders on the console as a consent defect that is really
  -- our own retry.
  properties_unreadable BOOLEAN NOT NULL DEFAULT FALSE,

  -- Resend owns this. NULL = not read yet. NEVER NOW(). See the header.
  joined_at             TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A row can only be flagged unreadable if it came from a backfill: the public
  -- form writes every property itself, so a live-path row marked unreadable is a
  -- bug inflating the console's data-quality tile with rows that are complete.
  CONSTRAINT waitlist_signups_unreadable_is_backfill_only
    CHECK (NOT properties_unreadable OR signup_source = 'backfill'),
  -- A test label without the flag is a label nothing filters on.
  CONSTRAINT waitlist_signups_test_label_needs_flag
    CHECK (test_label IS NULL OR is_test),
  -- The public form collects the segment as a required field, so a row from it
  -- with no segment is a bug, not an unknown. Only a backfill may leave it null.
  CONSTRAINT waitlist_signups_form_rows_know_their_segment
    CHECK (segment IS NOT NULL OR signup_source = 'backfill')
);

-- One mirror row per Resend contact. Partial, because the id is unknown until
-- Resend answers — and a NULL-heavy plain unique index would be a different
-- (and wrong) statement about rows we have not synced.
CREATE UNIQUE INDEX waitlist_signups_resend_contact_id_key
  ON public.waitlist_signups (resend_contact_id)
  WHERE resend_contact_id IS NOT NULL;

-- The console's three hot paths: population + segment filtering, the signups
-- chart, and campaign attribution.
CREATE INDEX waitlist_signups_population ON public.waitlist_signups (is_test, segment);
CREATE INDEX waitlist_signups_joined ON public.waitlist_signups (joined_at DESC NULLS LAST);
CREATE INDEX waitlist_signups_campaign ON public.waitlist_signups (utm_campaign)
  WHERE utm_campaign IS NOT NULL;
-- Duplicate review is by phone (two people share a household email far more
-- often than a handset).
CREATE INDEX waitlist_signups_phone ON public.waitlist_signups (phone)
  WHERE phone IS NOT NULL;
-- Rows the sync pass still owes a read.
CREATE INDEX waitlist_signups_unsynced ON public.waitlist_signups (resend_synced_at)
  WHERE resend_synced_at IS NULL;

-- Access: identical posture to admin_ops_log and the growth tables — admins read
-- through RLS, service_role writes. There is no authenticated write path; the
-- public signup route holds the service key server-side.
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY waitlist_signups_admin_read ON public.waitlist_signups
  FOR SELECT USING (public.current_user_role() = 'admin');

REVOKE ALL ON TABLE public.waitlist_signups FROM PUBLIC;
REVOKE ALL ON TABLE public.waitlist_signups FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.waitlist_signups FROM authenticated;
GRANT SELECT ON TABLE public.waitlist_signups TO authenticated;
GRANT ALL ON TABLE public.waitlist_signups TO service_role;

COMMENT ON TABLE public.waitlist_signups IS
  'Queryable mirror of the Resend waitlist audience (founder ruling 2026-09-04, amends 2026-07-10). Resend owns deliverability and the join date; this table owns counting. Anything prefixed resend_ describes our knowledge of Resend, not a fact we own.';
COMMENT ON COLUMN public.waitlist_signups.joined_at IS
  'When Resend says the contact was created. NULL until a sync reads it — never NOW(), because the create response carries no created_at and already_exists rows may be months old.';
COMMENT ON COLUMN public.waitlist_signups.properties_unreadable IS
  'Resend held the contact but its properties could not be read — including an empty properties object, which is the footprint of addWaitlistContact strip-and-retry. Distinguishes "we could not read it" from "they did not provide it".';
COMMENT ON COLUMN public.waitlist_signups.resend_status IS
  'Our knowledge of what Resend did: pending (not attempted/unknown), created, already_exists, failed. Not a fact about the person.';

-- The growth board's own header (20260904120000) states that a waitlist table is
-- deliberately absent. That is now superseded, and the correction is recorded
-- here rather than by editing that file.
COMMENT ON TABLE public.growth_merchant_leads IS
  'Pre-launch merchant acquisition board. Identity is (floor, unit) — never an invented shop name. is_test segregates internal rows from every count. NOTE: this table''s own migration header says a waitlist table is deliberately absent; superseded by the founder ruling of 2026-09-04, which added public.waitlist_signups (register row D261).';
