-- ============================================================================
-- MAANTA test accounts — friends/family rehearsal (maanta.app emails)
--
-- UUID namespace b2/a2/c2/d2/e2/f2 (no collision with rehearsal b0, demo b1, elite b3).
-- Sign in with email OTP at /login (Supabase Auth dev) or Clerk (launch).
--
-- Founder uses role=admin (founder dashboard at /founder — see docs).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. public.users (roles set before auth trigger fires)
-- ----------------------------------------------------------------------------
INSERT INTO public.users (id, auth_uid, phone, email, full_name, role)
SELECT v.id::uuid, v.auth_uid::uuid, v.phone, v.email, v.full_name, v.role
FROM (VALUES
  ('b2000000-0000-4000-a000-000000000001', 'a2000000-0000-4000-a000-000000000001', '+254700000001', 'founder@maanta.app',           'Maanta Founder',      'admin'),
  ('b2000000-0000-4000-a000-000000000002', 'a2000000-0000-4000-a000-000000000002', '+254700000002', 'admin@maanta.app',            'Maanta Admin',        'admin'),
  ('b2000000-0000-4000-a000-000000000003', 'a2000000-0000-4000-a000-000000000003', '+254700000003', 'agent@maanta.app',            'Field Agent',         'agent'),
  ('b2000000-0000-4000-a000-000000000010', 'a2000000-0000-4000-a000-000000000010', '+254700000010', 'merchant.a.owner@maanta.app',   'Merchant A Owner',    'merchant_admin'),
  ('b2000000-0000-4000-a000-000000000011', 'a2000000-0000-4000-a000-000000000011', '+447900000010', 'merchant.b.owner@maanta.app',   'Merchant B Owner',    'merchant_admin'),
  ('b2000000-0000-4000-a000-000000000012', 'a2000000-0000-4000-a000-000000000012', '+254700000011', 'merchant.a.staff@maanta.app',   'Merchant A Staff',    'merchant_staff'),
  ('b2000000-0000-4000-a000-000000000013', 'a2000000-0000-4000-a000-000000000013', '+447900000011', 'merchant.b.staff@maanta.app',   'Merchant B Staff',    'merchant_staff'),
  ('b2000000-0000-4000-a000-000000000020', 'a2000000-0000-4000-a000-000000000020', '+254700000020', 'shopper.ke@maanta.app',         'Shopper Kenya',       'customer'),
  ('b2000000-0000-4000-a000-000000000021', 'a2000000-0000-4000-a000-000000000021', '+447900000020', 'shopper.uk@maanta.app',         'Shopper UK',          'customer'),
  ('b2000000-0000-4000-a000-000000000022', 'a2000000-0000-4000-a000-000000000022', '+47900000020',  'shopper.no@maanta.app',         'Shopper Norway',      'customer')
) AS v(id, auth_uid, phone, email, full_name, role)
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.id::uuid);

-- ----------------------------------------------------------------------------
-- 2. Supabase Auth users (email OTP in dev/test strategy)
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
  ('a2000000-0000-4000-a000-000000000001', 'founder@maanta.app'),
  ('a2000000-0000-4000-a000-000000000002', 'admin@maanta.app'),
  ('a2000000-0000-4000-a000-000000000003', 'agent@maanta.app'),
  ('a2000000-0000-4000-a000-000000000010', 'merchant.a.owner@maanta.app'),
  ('a2000000-0000-4000-a000-000000000011', 'merchant.b.owner@maanta.app'),
  ('a2000000-0000-4000-a000-000000000012', 'merchant.a.staff@maanta.app'),
  ('a2000000-0000-4000-a000-000000000013', 'merchant.b.staff@maanta.app'),
  ('a2000000-0000-4000-a000-000000000020', 'shopper.ke@maanta.app'),
  ('a2000000-0000-4000-a000-000000000021', 'shopper.uk@maanta.app'),
  ('a2000000-0000-4000-a000-000000000022', 'shopper.no@maanta.app')
) AS v(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v.id::uuid);

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT
  gen_random_uuid(), v.id::uuid,
  jsonb_build_object('sub', v.id, 'email', v.email, 'email_verified', true, 'phone_verified', false),
  'email', v.id, NULL, NOW(), NOW()
FROM (VALUES
  ('a2000000-0000-4000-a000-000000000001', 'founder@maanta.app'),
  ('a2000000-0000-4000-a000-000000000002', 'admin@maanta.app'),
  ('a2000000-0000-4000-a000-000000000003', 'agent@maanta.app'),
  ('a2000000-0000-4000-a000-000000000010', 'merchant.a.owner@maanta.app'),
  ('a2000000-0000-4000-a000-000000000011', 'merchant.b.owner@maanta.app'),
  ('a2000000-0000-4000-a000-000000000012', 'merchant.a.staff@maanta.app'),
  ('a2000000-0000-4000-a000-000000000013', 'merchant.b.staff@maanta.app'),
  ('a2000000-0000-4000-a000-000000000020', 'shopper.ke@maanta.app'),
  ('a2000000-0000-4000-a000-000000000021', 'shopper.uk@maanta.app'),
  ('a2000000-0000-4000-a000-000000000022', 'shopper.no@maanta.app')
) AS v(id, email)
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.provider = 'email' AND i.provider_id = v.id
);

-- ----------------------------------------------------------------------------
-- 3. Merchants A & B (Elite, BBS Mall)
-- ----------------------------------------------------------------------------
INSERT INTO public.merchants (
  id, user_id, merchant_name, tier, status, elite_trial_active, trial_ends_at,
  node, what3words_address, mall_name, floor, unit_number, entrance_notes,
  phone, email, whatsapp, account_balance, outstanding_arrears,
  is_visible, is_shadow_banned, onboarded_at, trust_metric
)
SELECT v.id::uuid, v.user_id::uuid, v.name, 'elite', 'active', true, NOW() + INTERVAL '30 days',
  'BBS Mall', 'shops.test.mall', 'BBS Mall', v.floor, v.unit, v.category,
  v.phone, v.email, v.phone, 2500.00, 0, true, false, NOW() - INTERVAL '10 days', 0.92
FROM (VALUES
  ('c2000000-0000-4000-a000-000000000001', 'b2000000-0000-4000-a000-000000000010', 'Test Merchant A — Nairobi Grill', 'Ground Floor', 'A-01', 'restaurant · BBS Mall', '+254700000010', 'merchant.a.owner@maanta.app'),
  ('c2000000-0000-4000-a000-000000000002', 'b2000000-0000-4000-a000-000000000011', 'Test Merchant B — London Fashion', '1st Floor', 'B-12', 'fashion · BBS Mall', '+447900000010', 'merchant.b.owner@maanta.app')
) AS v(id, user_id, name, floor, unit, category, phone, email)
WHERE NOT EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = v.id::uuid);

-- GPS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchants' AND column_name = 'lat'
  ) THEN
    UPDATE public.merchants SET lat = -1.2750, lng = 36.8498, updated_at = NOW()
    WHERE id = 'c2000000-0000-4000-a000-000000000001'::uuid;
    UPDATE public.merchants SET lat = -1.2748, lng = 36.8503, updated_at = NOW()
    WHERE id = 'c2000000-0000-4000-a000-000000000002'::uuid;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Deals (flash + standard per test merchant)
-- ----------------------------------------------------------------------------
INSERT INTO public.deals (
  id, merchant_id, node, title, description, image_url,
  discount_type, discount_value, deal_type, flash_duration_hours,
  is_active, boost_active, max_claims, claims_count, starts_at,
  price_kes, compare_at_kes, charges, expires_at
)
SELECT * FROM (VALUES
  ('d2000000-0000-4000-a000-000000000001'::uuid, 'c2000000-0000-4000-a000-000000000001'::uuid, 'BBS Mall',
   'FLASH: Test Merchant A lunch special', 'Rehearsal flash deal — Maanta test account.', '/deals/food-01.svg',
   'fixed', 300, 'flash', 6, true, false, 20, 0, NOW() - INTERVAL '1 hour', 450::numeric, 900::numeric, '[]'::jsonb, NOW() + INTERVAL '5 hours'),
  ('d2000000-0000-4000-a000-000000000002'::uuid, 'c2000000-0000-4000-a000-000000000001'::uuid, 'BBS Mall',
   'Test Merchant A — weekend platter', 'Rehearsal standard deal.', '/deals/food-02.svg',
   'fixed', 400, 'standard', 6, true, false, 40, 0, NOW() - INTERVAL '2 hours', 1200::numeric, 1800::numeric, '[]'::jsonb, NOW() + INTERVAL '10 days'),
  ('d2000000-0000-4000-a000-000000000003'::uuid, 'c2000000-0000-4000-a000-000000000002'::uuid, 'BBS Mall',
   'FLASH: Test Merchant B style drop', 'Rehearsal flash deal.', '/deals/fashion-01.svg',
   'fixed', 500, 'flash', 6, true, false, 15, 0, NOW() - INTERVAL '1 hour', 800::numeric, 1600::numeric, '[]'::jsonb, NOW() + INTERVAL '4 hours'),
  ('d2000000-0000-4000-a000-000000000004'::uuid, 'c2000000-0000-4000-a000-000000000002'::uuid, 'BBS Mall',
   'Test Merchant B — member bundle', 'Rehearsal standard deal.', '/deals/fashion-02.svg',
   'fixed', 600, 'standard', 6, true, false, 30, 0, NOW() - INTERVAL '3 hours', 2200::numeric, 3200::numeric, '[]'::jsonb, NOW() + INTERVAL '14 days')
) AS v(id, merchant_id, node, title, description, image_url, discount_type, discount_value, deal_type, flash_duration_hours, is_active, boost_active, max_claims, claims_count, starts_at, price_kes, compare_at_kes, charges, expires_at)
WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = v.id);

-- ----------------------------------------------------------------------------
-- 5. Merchant staff invites
-- ----------------------------------------------------------------------------
INSERT INTO public.merchant_staff (id, merchant_id, user_id, staff_name, phone, can_verify, can_deals, can_topup, can_purchase)
SELECT v.id::uuid, v.merchant_id::uuid, v.user_id::uuid, v.name, v.phone, true, true, false, false
FROM (VALUES
  ('f2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000001', 'b2000000-0000-4000-a000-000000000012', 'Merchant A Staff', '+254700000011'),
  ('f2000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000002', 'b2000000-0000-4000-a000-000000000013', 'Merchant B Staff', '+447900000011')
) AS v(id, merchant_id, user_id, name, phone)
WHERE NOT EXISTS (SELECT 1 FROM public.merchant_staff ms WHERE ms.id = v.id::uuid);

-- ----------------------------------------------------------------------------
-- 6. Field agent profile
-- ----------------------------------------------------------------------------
INSERT INTO public.agents (id, user_id, weekly_target, is_active)
SELECT 'e2000000-0000-4000-a000-000000000001'::uuid, 'b2000000-0000-4000-a000-000000000003'::uuid, 10, true
WHERE NOT EXISTS (SELECT 1 FROM public.agents a WHERE a.user_id = 'b2000000-0000-4000-a000-000000000003'::uuid);

COMMIT;
