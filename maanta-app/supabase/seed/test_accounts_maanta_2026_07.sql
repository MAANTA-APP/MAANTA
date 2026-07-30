-- ============================================================================
-- MAANTA Nairobi rehearsal — role test accounts (@maanta.app)
--
-- Run AFTER nairobi_nodes_150_merchants.sql so merchant A/B rows exist.
-- Safe to re-run (guarded inserts + idempotent updates).
--
-- Accounts (see docs/ops/test-accounts-seed-2026-07.md):
--   founder@maanta.app              admin (founder dashboard)
--   admin@maanta.app                admin
--   agent@maanta.app                agent (BBS Mall primary)
--   merchant.a.owner@maanta.app     merchant_admin — Eastleigh Spices (BBS elite)
--   merchant.a.staff@maanta.app     merchant_staff — same merchant
--   merchant.b.owner@maanta.app     merchant_admin — Juniper Spa (CBD standard)
--   merchant.b.staff@maanta.app     merchant_staff — same merchant
--   shopper.everyday@maanta.app     customer
--   shopper.occasional@maanta.app   customer
--
-- Sign in with email OTP at /login (MAANTA_AUTH_STRATEGY=supabase).
-- For Clerk production: if an email already exists (e.g. admin@maanta.app signed
-- up via Clerk), this seed promotes role on the existing row and skips creating a
-- duplicate auth.users email (unique). Link clerk_user_id after first Clerk login
-- when using the fixed seed UUID rows.
-- ============================================================================

BEGIN;

-- Role promotions below need service_role JWT claim (prevent_self_role_escalation).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Fixed IDs (b0000000 …010–018 app users, a0000000 …010–018 auth)
-- Merchant A = c2000000-…001 (Eastleigh Spices, BBS elite, flash+boost)
-- Merchant B = c2000000-…076 (Juniper Spa, CBD standard)

-- ----------------------------------------------------------------------------
-- 1. App users
--    Skip insert when the fixed UUID OR the email already exists (Clerk may
--    have created customer rows for the same address without our seed IDs).
-- ----------------------------------------------------------------------------
INSERT INTO public.users (id, auth_uid, phone, email, full_name, role)
SELECT v.id::uuid, v.auth_uid::uuid, v.phone, v.email, v.full_name, v.role
FROM (VALUES
  ('b0000000-0000-4000-a000-000000000010', 'a0000000-0000-4000-a000-000000000010', '+254720000010', 'founder@maanta.app',            'Founder Demo',       'admin'),
  ('b0000000-0000-4000-a000-000000000011', 'a0000000-0000-4000-a000-000000000011', '+254720000011', 'admin@maanta.app',              'Admin Demo',         'admin'),
  ('b0000000-0000-4000-a000-000000000012', 'a0000000-0000-4000-a000-000000000012', '+254720000012', 'agent@maanta.app',              'Agent Demo',         'agent'),
  ('b0000000-0000-4000-a000-000000000013', 'a0000000-0000-4000-a000-000000000013', '+254720000013', 'merchant.a.owner@maanta.app',   'Merchant A Owner',   'merchant_admin'),
  ('b0000000-0000-4000-a000-000000000014', 'a0000000-0000-4000-a000-000000000014', '+254720000014', 'merchant.a.staff@maanta.app',   'Merchant A Staff',   'merchant_staff'),
  ('b0000000-0000-4000-a000-000000000015', 'a0000000-0000-4000-a000-000000000015', '+254720000015', 'merchant.b.owner@maanta.app',   'Merchant B Owner',   'merchant_admin'),
  ('b0000000-0000-4000-a000-000000000016', 'a0000000-0000-4000-a000-000000000016', '+254720000016', 'merchant.b.staff@maanta.app',   'Merchant B Staff',   'merchant_staff'),
  ('b0000000-0000-4000-a000-000000000017', 'a0000000-0000-4000-a000-000000000017', '+254720000017', 'shopper.everyday@maanta.app',   'Shopper Everyday',   'customer'),
  ('b0000000-0000-4000-a000-000000000018', 'a0000000-0000-4000-a000-000000000018', '+254720000018', 'shopper.occasional@maanta.app', 'Shopper Occasional', 'customer')
) AS v(id, auth_uid, phone, email, full_name, role)
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(v.email))
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.phone = v.phone);

-- Promote intended roles on any pre-existing rows for these emails (Clerk signups).
UPDATE public.users u
SET role = v.role
FROM (VALUES
  ('founder@maanta.app',            'admin'),
  ('admin@maanta.app',              'admin'),
  ('agent@maanta.app',              'agent'),
  ('merchant.a.owner@maanta.app',   'merchant_admin'),
  ('merchant.a.staff@maanta.app',   'merchant_staff'),
  ('merchant.b.owner@maanta.app',   'merchant_admin'),
  ('merchant.b.staff@maanta.app',   'merchant_staff'),
  ('shopper.everyday@maanta.app',   'customer'),
  ('shopper.occasional@maanta.app', 'customer')
) AS v(email, role)
WHERE lower(u.email) = lower(v.email)
  AND u.role IS DISTINCT FROM v.role;

-- ----------------------------------------------------------------------------
-- 2. Supabase Auth users + identities (email OTP)
--    Also skip when email already exists (Clerk-linked or prior signup).
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid, v.id::uuid, 'authenticated', 'authenticated',
  v.email, '', NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW(),
  '', '', '', ''
FROM (VALUES
  ('a0000000-0000-4000-a000-000000000010', 'founder@maanta.app'),
  ('a0000000-0000-4000-a000-000000000011', 'admin@maanta.app'),
  ('a0000000-0000-4000-a000-000000000012', 'agent@maanta.app'),
  ('a0000000-0000-4000-a000-000000000013', 'merchant.a.owner@maanta.app'),
  ('a0000000-0000-4000-a000-000000000014', 'merchant.a.staff@maanta.app'),
  ('a0000000-0000-4000-a000-000000000015', 'merchant.b.owner@maanta.app'),
  ('a0000000-0000-4000-a000-000000000016', 'merchant.b.staff@maanta.app'),
  ('a0000000-0000-4000-a000-000000000017', 'shopper.everyday@maanta.app'),
  ('a0000000-0000-4000-a000-000000000018', 'shopper.occasional@maanta.app')
) AS v(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v.id::uuid)
  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = lower(v.email));

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(), v.id::uuid,
  jsonb_build_object('sub', v.id, 'email', v.email, 'email_verified', true, 'phone_verified', false),
  'email', v.id, NULL, NOW(), NOW()
FROM (VALUES
  ('a0000000-0000-4000-a000-000000000010', 'founder@maanta.app'),
  ('a0000000-0000-4000-a000-000000000011', 'admin@maanta.app'),
  ('a0000000-0000-4000-a000-000000000012', 'agent@maanta.app'),
  ('a0000000-0000-4000-a000-000000000013', 'merchant.a.owner@maanta.app'),
  ('a0000000-0000-4000-a000-000000000014', 'merchant.a.staff@maanta.app'),
  ('a0000000-0000-4000-a000-000000000015', 'merchant.b.owner@maanta.app'),
  ('a0000000-0000-4000-a000-000000000016', 'merchant.b.staff@maanta.app'),
  ('a0000000-0000-4000-a000-000000000017', 'shopper.everyday@maanta.app'),
  ('a0000000-0000-4000-a000-000000000018', 'shopper.occasional@maanta.app')
) AS v(id, email)
WHERE EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v.id::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.provider = 'email' AND i.provider_id = v.id
  );

-- ----------------------------------------------------------------------------
-- 3. Agent profile (BBS Mall field agent)
-- ----------------------------------------------------------------------------
INSERT INTO public.agents (id, user_id, weekly_target, is_active)
SELECT 'a2000000-0000-4000-a000-000000000002'::uuid,
       'b0000000-0000-4000-a000-000000000012'::uuid, 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.agents a WHERE a.user_id = 'b0000000-0000-4000-a000-000000000012'::uuid
);

-- ----------------------------------------------------------------------------
-- 4. Wire Merchant A owner to Eastleigh Spices (seed merchant #1, BBS elite)
--    Reassign user_id on the seeded merchant row.
-- ----------------------------------------------------------------------------
UPDATE public.merchants
SET
  user_id = 'b0000000-0000-4000-a000-000000000013'::uuid,
  email = 'merchant.a.owner@maanta.app',
  phone = '+254720000013',
  whatsapp = '+254720000013',
  merchant_name = 'Eastleigh Spices (Demo A)',
  updated_at = NOW()
WHERE id = 'c2000000-0000-4000-a000-000000000001'::uuid;

-- Remove the placeholder seed user for merchant #1 (now owned by test account)
DELETE FROM public.users
WHERE id = 'b2000000-0000-4000-a000-000000000001'::uuid
  AND email LIKE 'seed.nairobi%';

-- ----------------------------------------------------------------------------
-- 5. Wire Merchant B owner to Urban Brew (seed merchant #76, CBD standard)
-- ----------------------------------------------------------------------------
UPDATE public.merchants
SET
  user_id = 'b0000000-0000-4000-a000-000000000015'::uuid,
  email = 'merchant.b.owner@maanta.app',
  phone = '+254720000015',
  whatsapp = '+254720000015',
  merchant_name = 'Juniper Spa (Demo B)',
  updated_at = NOW()
WHERE id = 'c2000000-0000-4000-a000-000000000076'::uuid;

DELETE FROM public.users
WHERE id = 'b2000000-0000-4000-a000-000000000076'::uuid
  AND email LIKE 'seed.nairobi%';

-- ----------------------------------------------------------------------------
-- 6. Merchant staff rows
-- ----------------------------------------------------------------------------
INSERT INTO public.merchant_staff (
  id, merchant_id, user_id, staff_name, phone, can_verify, can_deals, can_topup, can_purchase
)
SELECT
  'f1000000-0000-4000-a000-000000000001'::uuid,
  'c2000000-0000-4000-a000-000000000001'::uuid,
  'b0000000-0000-4000-a000-000000000014'::uuid,
  'Merchant A Staff', '+254720000014', true, false, false, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.merchant_staff ms
  WHERE ms.id = 'f1000000-0000-4000-a000-000000000001'::uuid
);

INSERT INTO public.merchant_staff (
  id, merchant_id, user_id, staff_name, phone, can_verify, can_deals, can_topup, can_purchase
)
SELECT
  'f1000000-0000-4000-a000-000000000002'::uuid,
  'c2000000-0000-4000-a000-000000000076'::uuid,
  'b0000000-0000-4000-a000-000000000016'::uuid,
  'Merchant B Staff', '+254720000016', true, false, false, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.merchant_staff ms
  WHERE ms.id = 'f1000000-0000-4000-a000-000000000002'::uuid
);

-- ----------------------------------------------------------------------------
-- 7. Pending OTP tickets for shopper rehearsal (optional — claim via UI otherwise)
--    Everyday shopper: flash deal on Merchant A (OTP 881122)
-- ----------------------------------------------------------------------------
INSERT INTO public.redemptions (id, deal_id, merchant_id, user_id, otp_code,
                                success_fee_charged, status, expires_at, redeemed_at)
SELECT
  'e0000000-0000-4000-a000-000000000010'::uuid,
  'd2000000-0000-4000-a000-000000000001'::uuid,
  'c2000000-0000-4000-a000-000000000001'::uuid,
  'b0000000-0000-4000-a000-000000000017'::uuid,
  '881122', 30.00, 'pending',
  NOW() + INTERVAL '4 hours', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.redemptions r WHERE r.id = 'e0000000-0000-4000-a000-000000000010'::uuid
);

COMMIT;

-- Verify wiring (role personas only — not every seed.nairobi* merchant user)
SELECT u.email, u.role, m.merchant_name, m.node, m.tier
FROM public.users u
LEFT JOIN public.merchants m ON m.user_id = u.id
WHERE u.email IN (
  'founder@maanta.app',
  'admin@maanta.app',
  'agent@maanta.app',
  'merchant.a.owner@maanta.app',
  'merchant.a.staff@maanta.app',
  'merchant.b.owner@maanta.app',
  'merchant.b.staff@maanta.app',
  'shopper.everyday@maanta.app',
  'shopper.occasional@maanta.app'
)
ORDER BY u.email;
