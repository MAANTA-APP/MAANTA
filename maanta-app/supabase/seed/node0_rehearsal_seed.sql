-- ============================================================================
-- MAANTA Node 0 (BBS Mall, Eastleigh) — launch-rehearsal seed
--
-- Purpose: give the live Supabase project a small, realistic, REPRODUCIBLE
-- dataset so end-to-end launch rehearsals (admin / merchant / shopper) don't
-- start from an empty database.
--
-- How to apply: paste into the Supabase SQL editor (runs as postgres), or run
-- via the Supabase MCP execute_sql tool. Safe to re-run: every insert is
-- guarded, and seeded deals get their expiry window refreshed on each run.
--
-- Login model: all seeded accounts are plus-addressed variants of the
-- founder's Gmail, so email-OTP codes land in a real inbox Mohamed controls.
--   admin     aragagency@gmail.com               (role: admin)
--   merchant  aragagency+nuur@gmail.com          (Nuur Fashion House — active, Elite trial, funded wallet)
--   merchant  aragagency+bilan@gmail.com         (Bilan Beauty & Cosmetics — active, Standard, KES 20 wallet)
--   merchant  aragagency+macmacaan@gmail.com     (Macmacaan Sweets & Café — PENDING, for activation rehearsal)
--   shopper   aragagency+shopper@gmail.com       (role: customer)
--
-- Passwords are unset — sign in with the email OTP flow at /login.
--
-- Fixed IDs (so re-runs are no-ops and docs can reference them):
--   users:       b0000000-0000-4000-a000-00000000000N (N = 1..5, order above)
--   auth users:  a0000000-0000-4000-a000-00000000000N
--   merchants:   c0000000-0000-4000-a000-000000000001 Nuur
--                c0000000-0000-4000-a000-000000000002 Bilan
--                c0000000-0000-4000-a000-000000000003 Macmacaan (pending)
--   deals:       d0000000-...-0001 Nuur standard · -0002 Nuur flash · -0003 Bilan standard
--   redemptions: e0000000-...-0001 clean success · -0002 disputed override success
--                -0003 rejected/failed · -0004 LIVE pending ticket (OTP 431977)
--
-- Rehearsal state this creates:
--   · Nuur wallet: +600 top-up, two KES 30 fees charged → balance 540
--   · Bilan wallet: KES 20 → below the KES 30 fee → keypad discloses
--     arrears path (verify-anyway); fees record as owing until top-up.
--     New deals stay blocked at zero balance — not till verify.
--   · One unresolved merchant_override fraud event + dispute_review task
--     → visible in /admin/redemptions and admin support queue
--   · One pending OTP ticket (431977) on Nuur's abaya deal → merchant
--     keypad can verify it immediately without a fresh shopper claim
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. App users FIRST (with final roles), so the on_auth_user_created trigger
--    no-ops on conflict and we never UPDATE role (which the
--    prevent_self_role_escalation trigger would block for non-service callers).
-- ----------------------------------------------------------------------------
INSERT INTO public.users (id, auth_uid, phone, email, full_name, role)
SELECT v.id::uuid, v.auth_uid::uuid, v.phone, v.email, v.full_name, v.role
FROM (VALUES
  ('b0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001', '+254700000100', 'aragagency@gmail.com',           'Mohamed (Admin)',   'admin'),
  ('b0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000002', '+254700000101', 'aragagency+nuur@gmail.com',      'Nuur Abdi',         'merchant_admin'),
  ('b0000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000003', '+254700000102', 'aragagency+bilan@gmail.com',     'Bilan Hassan',      'merchant_admin'),
  ('b0000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000004', '+254700000103', 'aragagency+macmacaan@gmail.com', 'Aisha Mohamed',     'merchant_admin'),
  ('b0000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-000000000005', '+254700000105', 'aragagency+shopper@gmail.com',   'Test Shopper',      'customer')
) AS v(id, auth_uid, phone, email, full_name, role)
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.id::uuid);

-- ----------------------------------------------------------------------------
-- 2. Auth users + identities (email provider, OTP login; no password set)
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
  ('a0000000-0000-4000-a000-000000000001', 'aragagency@gmail.com'),
  ('a0000000-0000-4000-a000-000000000002', 'aragagency+nuur@gmail.com'),
  ('a0000000-0000-4000-a000-000000000003', 'aragagency+bilan@gmail.com'),
  ('a0000000-0000-4000-a000-000000000004', 'aragagency+macmacaan@gmail.com'),
  ('a0000000-0000-4000-a000-000000000005', 'aragagency+shopper@gmail.com')
) AS v(id, email)
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v.id::uuid);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(), v.id::uuid,
  jsonb_build_object('sub', v.id, 'email', v.email, 'email_verified', true, 'phone_verified', false),
  'email', v.id, NULL, NOW(), NOW()
FROM (VALUES
  ('a0000000-0000-4000-a000-000000000001', 'aragagency@gmail.com'),
  ('a0000000-0000-4000-a000-000000000002', 'aragagency+nuur@gmail.com'),
  ('a0000000-0000-4000-a000-000000000003', 'aragagency+bilan@gmail.com'),
  ('a0000000-0000-4000-a000-000000000004', 'aragagency+macmacaan@gmail.com'),
  ('a0000000-0000-4000-a000-000000000005', 'aragagency+shopper@gmail.com')
) AS v(id, email)
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.provider = 'email' AND i.provider_id = v.id
);

-- ----------------------------------------------------------------------------
-- 3. Merchants (2 active + 1 pending, all BBS Mall)
--    Nuur balance math: +600 top-up − 30 fee − 30 fee = 540 (ledger in step 6)
-- ----------------------------------------------------------------------------
INSERT INTO public.merchants (
  id, user_id, merchant_name, tier, status, elite_trial_active, trial_ends_at,
  node, what3words_address, mall_name, floor, unit_number, entrance_notes,
  phone, email, whatsapp, account_balance, outstanding_arrears, onboarded_at
)
SELECT
  v.id::uuid, v.user_id::uuid, v.name, v.tier, v.status, v.trial,
  CASE WHEN v.trial THEN NOW() + INTERVAL '30 days' END,
  'BBS Mall', v.w3w, 'BBS Mall', v.floor, v.unit, v.entrance,
  v.phone, v.email, v.phone, v.balance, 0,
  CASE WHEN v.status = 'active' THEN NOW() - INTERVAL '2 days' END
FROM (VALUES
  ('c0000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-000000000002',
   'Nuur Fashion House', 'elite', 'active', true,
   'stored.riches.shine', '1st Floor', 'B-14', 'Near the main escalator, first floor',
   '+254700000101', 'aragagency+nuur@gmail.com', 600.00 - 30.00 - 30.00),
  ('c0000000-0000-4000-a000-000000000002', 'b0000000-0000-4000-a000-000000000003',
   'Bilan Beauty & Cosmetics', 'standard', 'active', false,
   'lively.scent.corner', 'Ground Floor', 'G-07', 'Opposite the ground-floor pharmacy',
   '+254700000102', 'aragagency+bilan@gmail.com', 20.00),
  ('c0000000-0000-4000-a000-000000000003', 'b0000000-0000-4000-a000-000000000004',
   'Macmacaan Sweets & Café', 'standard', 'pending', false,
   'sweet.corner.treat', '2nd Floor', 'F-22', 'Food court, second floor',
   '+254700000103', 'aragagency+macmacaan@gmail.com', 0.00)
) AS v(id, user_id, name, tier, status, trial, w3w, floor, unit, entrance, phone, email, balance)
WHERE NOT EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = v.id::uuid);

-- ----------------------------------------------------------------------------
-- 4. Deals (guarded per-row so re-runs never re-fire the tier-limit trigger).
--    set_deal_expiry forces expiry: standard = starts_at + 24h, flash =
--    starts_at + flash_duration_hours. success_fee is forced from app_config.
-- ----------------------------------------------------------------------------
INSERT INTO public.deals (id, merchant_id, node, title, description, image_url,
                          discount_type, discount_value, deal_type, flash_duration_hours,
                          is_active, max_claims, claims_count, starts_at,
                          price_kes, compare_at_kes, charges)
SELECT 'd0000000-0000-4000-a000-000000000001'::uuid, 'c0000000-0000-4000-a000-000000000001'::uuid,
  'BBS Mall', '20% off all abayas & dirac',
  'Every abaya and dirac in store. Show your MAANTA code at the counter before paying.',
  'data:image/svg+xml;utf8,<svg%20xmlns="http://www.w3.org/2000/svg"%20viewBox="0%200%20400%20300"><rect%20width="400"%20height="300"%20fill="%235b21b6"/><text%20x="200"%20y="150"%20font-family="sans-serif"%20font-size="34"%20font-weight="bold"%20fill="white"%20text-anchor="middle">Nuur%20Fashion</text><text%20x="200"%20y="195"%20font-family="sans-serif"%20font-size="24"%20fill="white"%20text-anchor="middle">20%25%20off%20abayas</text></svg>',
  'percentage', 20, 'standard', 6, true, 20, 2, NOW() - INTERVAL '3 hours',
  2400.00, 3000.00, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = 'd0000000-0000-4000-a000-000000000001'::uuid);

INSERT INTO public.deals (id, merchant_id, node, title, description, image_url,
                          discount_type, discount_value, deal_type, flash_duration_hours,
                          is_active, max_claims, claims_count, starts_at,
                          price_kes, compare_at_kes, charges)
SELECT 'd0000000-0000-4000-a000-000000000002'::uuid, 'c0000000-0000-4000-a000-000000000001'::uuid,
  'BBS Mall', 'Flash: buy 1 get 1 free — scarves & hijabs',
  'Flash deal — any scarf or hijab, second one free. Today only while the timer runs.',
  'data:image/svg+xml;utf8,<svg%20xmlns="http://www.w3.org/2000/svg"%20viewBox="0%200%20400%20300"><rect%20width="400"%20height="300"%20fill="%23b45309"/><text%20x="200"%20y="150"%20font-family="sans-serif"%20font-size="34"%20font-weight="bold"%20fill="white"%20text-anchor="middle">Nuur%20Fashion</text><text%20x="200"%20y="195"%20font-family="sans-serif"%20font-size="24"%20fill="white"%20text-anchor="middle">B1G1%20scarves%20—%20flash</text></svg>',
  'freebie', NULL, 'flash', 6, true, 10, 0, NOW() - INTERVAL '1 hour',
  800.00, 1600.00, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = 'd0000000-0000-4000-a000-000000000002'::uuid);

INSERT INTO public.deals (id, merchant_id, node, title, description, image_url,
                          discount_type, discount_value, deal_type, flash_duration_hours,
                          is_active, max_claims, claims_count, starts_at,
                          price_kes, compare_at_kes, charges)
SELECT 'd0000000-0000-4000-a000-000000000003'::uuid, 'c0000000-0000-4000-a000-000000000002'::uuid,
  'BBS Mall', 'KES 300 off oud & perfume gift sets',
  'All boxed oud and perfume gift sets. One redemption per customer.',
  'data:image/svg+xml;utf8,<svg%20xmlns="http://www.w3.org/2000/svg"%20viewBox="0%200%20400%20300"><rect%20width="400"%20height="300"%20fill="%230f766e"/><text%20x="200"%20y="150"%20font-family="sans-serif"%20font-size="32"%20font-weight="bold"%20fill="white"%20text-anchor="middle">Bilan%20Beauty</text><text%20x="200"%20y="195"%20font-family="sans-serif"%20font-size="24"%20fill="white"%20text-anchor="middle">KES%20300%20off%20gift%20sets</text></svg>',
  'fixed', 300, 'standard', 6, true, 15, 0, NOW() - INTERVAL '3 hours',
  1950.00, 2250.00, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = 'd0000000-0000-4000-a000-000000000003'::uuid);

-- Refresh the rehearsal window on every run: seeded deals are always live for
-- the next ~21h (standard) / ~5h (flash) after the seed runs. Also upgrades
-- rows seeded before the YOU PAY price model (2026-07-19) with shopper prices.
UPDATE public.deals
SET starts_at  = CASE WHEN deal_type = 'flash' THEN NOW() - INTERVAL '1 hour' ELSE NOW() - INTERVAL '3 hours' END,
    expires_at = CASE WHEN deal_type = 'flash' THEN NOW() + INTERVAL '5 hours' ELSE NOW() + INTERVAL '21 hours' END,
    is_active  = true,
    is_paused  = false,
    price_kes  = COALESCE(price_kes, CASE id
                   WHEN 'd0000000-0000-4000-a000-000000000001'::uuid THEN 2400.00
                   WHEN 'd0000000-0000-4000-a000-000000000002'::uuid THEN 800.00
                   WHEN 'd0000000-0000-4000-a000-000000000003'::uuid THEN 1950.00
                 END),
    compare_at_kes = COALESCE(compare_at_kes, CASE id
                   WHEN 'd0000000-0000-4000-a000-000000000001'::uuid THEN 3000.00
                   WHEN 'd0000000-0000-4000-a000-000000000002'::uuid THEN 1600.00
                   WHEN 'd0000000-0000-4000-a000-000000000003'::uuid THEN 2250.00
                 END)
WHERE id IN ('d0000000-0000-4000-a000-000000000001'::uuid,
             'd0000000-0000-4000-a000-000000000002'::uuid,
             'd0000000-0000-4000-a000-000000000003'::uuid);

-- ----------------------------------------------------------------------------
-- 5. Redemption history + one LIVE pending ticket
-- ----------------------------------------------------------------------------
INSERT INTO public.redemptions (id, deal_id, merchant_id, user_id, otp_code,
                                success_fee_charged, status, fraud_flags, review_required,
                                distance_from_shop, expires_at, redeemed_at)
SELECT v.id::uuid, v.deal_id::uuid, v.merchant_id::uuid, 'b0000000-0000-4000-a000-000000000005'::uuid,
       v.otp, 30.00, v.status, v.flags::text[], v.review, v.distance,
       v.expires_at, v.redeemed_at
FROM (VALUES
  -- clean verified redemption (fee charged — see ledger row below)
  ('e0000000-0000-4000-a000-000000000001', 'd0000000-0000-4000-a000-000000000001',
   'c0000000-0000-4000-a000-000000000001', '112233', 'success', NULL, false, 42::numeric,
   NOW() + INTERVAL '21 hours 15 minutes', NOW() - INTERVAL '2 hours'),
  -- disputed verify-anyway: geofence flag + merchant override, routed to admin
  ('e0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001',
   'c0000000-0000-4000-a000-000000000001', '445566', 'success', '{geofence,merchant_override}', true, 1250::numeric,
   NOW() + INTERVAL '21 hours 15 minutes', NOW() - INTERVAL '1 hour'),
  -- rejected code at Bilan (no fee ever charged on failed codes)
  ('e0000000-0000-4000-a000-000000000003', 'd0000000-0000-4000-a000-000000000003',
   'c0000000-0000-4000-a000-000000000002', '778899', 'failed', NULL, false, NULL::numeric,
   NOW() + INTERVAL '21 hours 15 minutes', NOW() - INTERVAL '90 minutes'),
  -- LIVE pending ticket: type 431977 into Nuur's keypad to verify it
  ('e0000000-0000-4000-a000-000000000004', 'd0000000-0000-4000-a000-000000000001',
   'c0000000-0000-4000-a000-000000000001', '431977', 'pending', NULL, false, 38::numeric,
   NOW() + INTERVAL '21 hours 15 minutes', NOW() - INTERVAL '10 minutes')
) AS v(id, deal_id, merchant_id, otp, status, flags, review, distance, expires_at, redeemed_at)
WHERE NOT EXISTS (SELECT 1 FROM public.redemptions r WHERE r.id = v.id::uuid);

-- Keep the live ticket usable after re-runs (only while it is still pending),
-- and stamp the YOU PAY snapshot the claim path would have written.
UPDATE public.redemptions
SET expires_at = NOW() + INTERVAL '21 hours 15 minutes',
    amount_kes = COALESCE(amount_kes, 2400.00)
WHERE id = 'e0000000-0000-4000-a000-000000000004'::uuid AND status = 'pending';

-- ----------------------------------------------------------------------------
-- 6. Wallet ledger (amount signs follow deduct_success_fee_or_record_arrears:
--    top-ups positive, fees negative)
-- ----------------------------------------------------------------------------
INSERT INTO public.merchant_transactions (id, merchant_id, amount, transaction_type,
                                          payment_provider, provider_reference, description, reference_id, created_at)
SELECT v.id::uuid, v.merchant_id::uuid, v.amount, v.type, 'manual', v.ref, v.descr, v.reference_id::uuid, v.created_at
FROM (VALUES
  ('f0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001',
   600.00, 'topup', 'SEED-TOPUP-NUUR', 'Wallet top-up (launch rehearsal seed)', NULL, NOW() - INTERVAL '2 days'),
  ('f0000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000001',
   -30.00, 'success_fee', NULL, 'Success fee deducted on verified redemption',
   'e0000000-0000-4000-a000-000000000001', NOW() - INTERVAL '2 hours'),
  ('f0000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000001',
   -30.00, 'success_fee', NULL, 'Success fee deducted on verified redemption',
   'e0000000-0000-4000-a000-000000000002', NOW() - INTERVAL '1 hour'),
  ('f0000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000002',
   20.00, 'topup', 'SEED-TOPUP-BILAN', 'Wallet top-up (launch rehearsal seed)', NULL, NOW() - INTERVAL '2 days')
) AS v(id, merchant_id, amount, type, ref, descr, reference_id, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.merchant_transactions t WHERE t.id = v.id::uuid);

-- ----------------------------------------------------------------------------
-- 7. Dispute routing for the override redemption (mirrors what
--    verify_redemption writes on a live "verify anyway"): unresolved fraud
--    event for /admin/redemptions + a high-priority dispute_review task.
-- ----------------------------------------------------------------------------
INSERT INTO public.fraud_events (id, merchant_id, user_id, event_type, severity, details, resolved, created_at)
SELECT 'f1000000-0000-4000-a000-000000000001'::uuid,
       'c0000000-0000-4000-a000-000000000001'::uuid,
       'b0000000-0000-4000-a000-000000000005'::uuid,
       'merchant_override', 'medium',
       jsonb_build_object(
         'redemption_id', 'e0000000-0000-4000-a000-000000000002',
         'deal_id', 'd0000000-0000-4000-a000-000000000001',
         'fraud_flags', jsonb_build_array('geofence'),
         'distance_from_shop', 1250,
         'merchant_override', true,
         'override_reason', 'Location mismatch (1250m from shop) — merchant confirmed customer at counter',
         'seed', true
       ),
       false, NOW() - INTERVAL '1 hour'
WHERE NOT EXISTS (SELECT 1 FROM public.fraud_events f WHERE f.id = 'f1000000-0000-4000-a000-000000000001'::uuid);

INSERT INTO public.agent_tasks (id, merchant_id, task_type, priority, description, is_complete, created_at, due_at)
SELECT 'a1000000-0000-4000-a000-000000000001'::uuid,
       'c0000000-0000-4000-a000-000000000001'::uuid,
       'dispute_review', 'high',
       'Disputed verification on redemption e0000000-0000-4000-a000-000000000002 (deal d0000000-0000-4000-a000-000000000001). Flags: geofence. Distance: 1250 m. Merchant override: true. Reason: customer confirmed at counter. Redemption completed and fee applied per frozen rules - review outcome; handle directly or delegate via assigned_to. [launch rehearsal seed]',
       false, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours'
WHERE NOT EXISTS (SELECT 1 FROM public.agent_tasks a WHERE a.id = 'a1000000-0000-4000-a000-000000000001'::uuid);

COMMIT;
