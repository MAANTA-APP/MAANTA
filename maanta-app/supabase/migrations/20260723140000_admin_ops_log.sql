-- M-3: durable audit trail for admin panel mutations.
--
-- Several /api/admin routes mutate merchants, deals, and fraud state via the
-- service-role client with no row-level audit. RPC-backed paths (fee reversal,
-- Guardian release/appeal) already write domain tables; this log captures the
-- direct-update admin ops so every panel action is attributable.

CREATE TABLE public.admin_ops_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.users(id),
  action        TEXT NOT NULL,
  target_type   TEXT NOT NULL
                CHECK (target_type IN ('merchant', 'deal', 'redemption', 'fraud_event', 'agent_task')),
  target_id     UUID NOT NULL,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_ops_log_target ON public.admin_ops_log(target_type, target_id, created_at DESC);
CREATE INDEX idx_admin_ops_log_admin   ON public.admin_ops_log(admin_user_id, created_at DESC);

ALTER TABLE public.admin_ops_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_ops_log_admin_read ON public.admin_ops_log
  FOR SELECT USING (public.current_user_role() = 'admin');

REVOKE ALL ON TABLE public.admin_ops_log FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_ops_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.admin_ops_log FROM authenticated;
GRANT SELECT ON TABLE public.admin_ops_log TO authenticated;
GRANT ALL ON TABLE public.admin_ops_log TO service_role;

COMMENT ON TABLE public.admin_ops_log IS
  'Append-only audit of admin panel mutations from /api/admin routes. service_role writes only; admins read via RLS.';
