-- Public pre-launch waitlist. Deliberately separate from public.leads,
-- which is the agent-sourced merchant-lead pipeline (48-hour exclusivity
-- lock for on-ground sales) with a completely different lifecycle.
--
-- Access model: writes and reads go exclusively through server routes
-- using the service-role key (POST /api/waitlist for inserts, the admin
-- CSV export for reads). RLS is enabled with NO policies, so anon and
-- authenticated roles can do nothing even if the table name leaks into a
-- client bundle. This mirrors the repo's "RLS is the real backstop" rule.
CREATE TABLE public.waitlist_signups (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_type      TEXT NOT NULL
                    CHECK (segment_type IN ('shopper', 'merchant', 'mall_operator')),
  -- Stored lowercase; normalization happens server-side before insert but
  -- the CHECK keeps a bypassing writer from breaking the uniqueness model.
  email             TEXT NOT NULL CHECK (email = lower(email)),
  phone             TEXT NOT NULL,
  full_name         TEXT,
  city              TEXT NOT NULL,
  node_interest     TEXT NOT NULL DEFAULT 'BBS Mall',
  -- Campaign attribution, captured from UTM query params at signup.
  source_campaign   TEXT,   -- utm_campaign
  source_medium     TEXT,   -- utm_medium
  source_channel    TEXT,   -- utm_source
  -- Consent: timestamp plus the exact wording shown at signup (Kenya DPA
  -- 2019 evidence trail). The server stamps both; clients only send a
  -- boolean acceptance.
  consent_at        TIMESTAMPTZ NOT NULL,
  consent_text      TEXT NOT NULL,
  -- Merchant-only fields
  business_name     TEXT,
  business_category TEXT,
  floor_unit        TEXT,
  -- Mall-operator-only fields
  mall_name         TEXT,
  mall_role         TEXT,
  -- Set by the CRM sync job once the contact reaches the email platform;
  -- NULL rows are the retry queue. No sync job exists yet.
  crm_synced_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A shop owner may join both the shopper and merchant lists, but never
  -- the same list twice. Duplicate inserts surface as unique_violation and
  -- the API reports them as an idempotent success.
  UNIQUE (email, segment_type)
);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.waitlist_signups FROM PUBLIC;
REVOKE ALL ON TABLE public.waitlist_signups FROM anon;
REVOKE ALL ON TABLE public.waitlist_signups FROM authenticated;

-- Segment split and campaign reporting are frequent admin/export reads.
CREATE INDEX waitlist_signups_segment_created_idx
  ON public.waitlist_signups (segment_type, created_at);
