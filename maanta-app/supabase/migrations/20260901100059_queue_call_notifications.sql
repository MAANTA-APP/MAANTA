-- Staff call-forward for the merchant QR queue.
--
-- A call is a durable, idempotent queue transition. The transition and the
-- shopper's inbox row commit atomically; web push is only a best-effort copy
-- sent by the route after this function returns. Redemption and Fast Visit
-- award state are deliberately untouched.

ALTER TABLE public.merchant_presentations
  DROP CONSTRAINT IF EXISTS merchant_presentations_status_check;

ALTER TABLE public.merchant_presentations
  ADD CONSTRAINT merchant_presentations_status_check
  CHECK (status IN ('waiting', 'called', 'cancelled', 'dismissed')),
  ADD COLUMN IF NOT EXISTS called_at timestamptz,
  ADD COLUMN IF NOT EXISTS called_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.merchant_presentations
  DROP CONSTRAINT IF EXISTS merchant_presentations_called_shape_check;
ALTER TABLE public.merchant_presentations
  ADD CONSTRAINT merchant_presentations_called_shape_check CHECK (
    (status = 'called' AND called_at IS NOT NULL)
    OR (status <> 'called' AND called_at IS NULL AND called_by IS NULL)
  );

DROP INDEX IF EXISTS public.merchant_presentations_waiting_key;
CREATE UNIQUE INDEX merchant_presentations_live_key
  ON public.merchant_presentations (redemption_id)
  WHERE status IN ('waiting', 'called');

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS presentation_id uuid
    REFERENCES public.merchant_presentations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_queue_call_key
  ON public.notifications (presentation_id)
  WHERE presentation_id IS NOT NULL;

-- The existing notifications_update policy scopes rows, but the table-level
-- UPDATE grant also let a shopper rewrite title/message and, after this
-- migration, presentation_id. That would let the shopper pre-empt the unique
-- idempotency key and suppress the durable call alert. Keep only the intended
-- read-receipt mutation client-writable.
REVOKE UPDATE ON TABLE public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON TABLE public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.call_shopper_forward(
  p_presentation_id uuid,
  p_merchant_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  presentation_id uuid,
  shopper_id uuid,
  merchant_name text,
  qr_token text,
  called_at timestamptz,
  newly_called boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.merchant_presentations%ROWTYPE;
  v_redemption public.redemptions%ROWTYPE;
  v_redemption_id uuid;
  v_merchant_name text;
  v_qr_token text;
  v_now timestamptz;
  v_new boolean := false;
BEGIN
  IF p_presentation_id IS NULL OR p_merchant_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'queue_call_invalid_request';
  END IF;

  -- Defence in depth beneath requireMerchant("can_verify"). The actor must be
  -- this merchant's owner or a currently-linked seat with can_verify.
  IF NOT EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = p_merchant_id
      AND (
        m.user_id = p_actor_id
        OR EXISTS (
          SELECT 1 FROM public.merchant_staff s
          WHERE s.merchant_id = m.id
            AND s.user_id = p_actor_id
            AND s.can_verify = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'queue_call_unauthorized';
  END IF;

  -- Verification locks the redemption first. Match that order so a call can
  -- never commit from a stale `pending` observation after verification wins
  -- the race, and so the two paths cannot deadlock each other.
  SELECT p.redemption_id INTO v_redemption_id
  FROM public.merchant_presentations p
  WHERE p.id = p_presentation_id
    AND p.merchant_id = p_merchant_id;

  SELECT r.* INTO v_redemption
  FROM public.redemptions r
  WHERE r.id = v_redemption_id
    AND r.merchant_id = p_merchant_id
    AND r.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue_call_not_found';
  END IF;

  SELECT p.* INTO v_row
  FROM public.merchant_presentations p
  WHERE p.id = p_presentation_id
    AND p.merchant_id = p_merchant_id
    AND p.redemption_id = v_redemption.id
    AND p.status IN ('waiting', 'called')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue_call_not_found';
  END IF;

  -- Both locks may have waited. Deadlines are judged from a fresh database
  -- clock only after the state they protect is ours to change.
  v_now := clock_timestamp();
  IF v_redemption.expires_at <= v_now OR v_row.expires_at <= v_now THEN
    RAISE EXCEPTION 'queue_call_not_found';
  END IF;

  SELECT m.merchant_name, m.qr_token
    INTO v_merchant_name, v_qr_token
  FROM public.merchants m
  WHERE m.id = p_merchant_id;

  IF v_row.status = 'waiting' THEN
    UPDATE public.merchant_presentations
    SET status = 'called', called_at = v_now, called_by = p_actor_id
    WHERE id = v_row.id;
    v_row.called_at := v_now;
    v_new := true;
  END IF;

  INSERT INTO public.notifications (
    user_id, merchant_id, presentation_id, title, message, is_read, expires_at
  ) VALUES (
    v_row.shopper_id,
    p_merchant_id,
    v_row.id,
    v_merchant_name,
    'It''s your turn — please go to the counter.',
    false,
    v_row.expires_at
  )
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT
    v_row.id, v_row.shopper_id, v_merchant_name, v_qr_token,
    v_row.called_at, v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.call_shopper_forward(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.call_shopper_forward(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.call_shopper_forward(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.call_shopper_forward(uuid, uuid, uuid)
  TO service_role, postgres;

COMMENT ON FUNCTION public.call_shopper_forward(uuid, uuid, uuid) IS
  'Atomically moves one live, pending presentation from waiting to called and '
  'writes exactly one durable shopper notification. Idempotent for an already '
  'called row. Server-only; verifies actor ownership/can_verify and merchant '
  'scope. Does not verify a redemption or award Fast Visit points. 2026-09-01.';
