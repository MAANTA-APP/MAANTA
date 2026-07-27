-- Add cofounder role for executive/ops access narrower than full admin.
-- Cofounders: /founder + /agent/* (leads, acquisition). No /admin/* money paths.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY[
    'customer'::text,
    'merchant_admin'::text,
    'merchant_staff'::text,
    'agent'::text,
    'admin'::text,
    'cofounder'::text
  ]));

COMMENT ON COLUMN public.users.role IS
  'App role. cofounder = executive dashboard + field leads; no admin console or payout edits.';
