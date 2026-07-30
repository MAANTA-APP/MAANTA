-- ============================================================================
-- MAANTA Node 0 — ops & merchant-lifecycle personas seed
--
-- Run AFTER node0_rehearsal_seed.sql. Safe to re-run (guarded inserts + idempotent
-- updates). Adds agent/support logins and enriches merchant A/B/C lifecycle data.
--
-- Personas (see docs/ops/test-accounts.md):
--   Merchant A  aragagency+nuur@gmail.com      — high-performing (rehearsal seed)
--   Merchant B  aragagency+bilan@gmail.com     — new / onboarding
--   Merchant C  aragagency+churn@gmail.com       — churn-risk / inactive
--   Waitlist    aragagency+macmacaan@gmail.com — pending approval (rehearsal seed)
--   Agent       aragagency+agent@gmail.com
--   Support     aragagency+support@gmail.com    — admin role, disputes focus
--   Admin       aragagency@gmail.com            — full platform (rehearsal seed)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Ops users: field agent + support/disputes admin
-- ----------------------------------------------------------------------------
INSERT INTO public.users (id, auth_uid, phone, email, full_name, role)
SELECT v.id::uuid, v.auth_uid::uuid, v.phone, v.email, v.full_name, v.role
FROM (VALUES
  ('b0000000-0000-4000-a000-000000000006', 'a0000000-0000-4000-a000-000000000006', '+254700000106', 'aragagency+agent@gmail.com',   'Amina Field Agent',  'agent'),
  ('b0000000-0000-4000-a000-000000000007', 'a0000000-0000-4000-a000-000000000007', '+254700000107', 'aragagency+support@gmail.com', 'Sara Disputes Ops',  'admin')
) AS v(id, auth_uid, phone, email, full_name, role)
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v.id::uuid);

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
  ('a0000000-0000-4000-a000-000000000006', 'aragagency+agent@gmail.com'),
  ('a0000000-0000-4000-a000-000000000007', 'aragagency+support@gmail.com')
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
  ('a0000000-0000-4000-a000-000000000006', 'aragagency+agent@gmail.com'),
  ('a0000000-0000-4000-a000-000000000007', 'aragagency+support@gmail.com')
) AS v(id, email)
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.provider = 'email' AND i.provider_id = v.id
);

-- Active field agent profile (required for /agent writes and lead capture)
INSERT INTO public.agents (id, user_id, weekly_target, is_active)
SELECT 'g0000000-0000-4000-a000-000000000001'::uuid,
       'b0000000-0000-4000-a000-000000000006'::uuid, 15, true
WHERE NOT EXISTS (SELECT 1 FROM public.agents a WHERE a.user_id = 'b0000000-0000-4000-a000-000000000006'::uuid);

-- ----------------------------------------------------------------------------
-- 2. Merchant C — churn-risk shop (previously live, no current live deals)
-- ----------------------------------------------------------------------------
INSERT INTO public.users (id, auth_uid, phone, email, full_name, role)
SELECT 'b0000000-0000-4000-a000-000000000008'::uuid,
       'a0000000-0000-4000-a000-000000000008'::uuid,
       '+254700000108', 'aragagency+churn@gmail.com', 'Hassan Old Town Fabrics', 'merchant_admin'
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = 'b0000000-0000-4000-a000-000000000008'::uuid);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  'a0000000-0000-4000-a000-000000000008'::uuid, 'authenticated', 'authenticated',
  'aragagency+churn@gmail.com', '', NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW(),
  '', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = 'a0000000-0000-4000-a000-000000000008'::uuid);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(), 'a0000000-0000-4000-a000-000000000008'::uuid,
  jsonb_build_object('sub', 'a0000000-0000-4000-a000-000000000008', 'email', 'aragagency+churn@gmail.com', 'email_verified', true, 'phone_verified', false),
  'email', 'a0000000-0000-4000-a000-000000000008', NULL, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.provider = 'email' AND i.provider_id = 'a0000000-0000-4000-a000-000000000008'
);

INSERT INTO public.merchants (
  id, user_id, merchant_name, tier, status, elite_trial_active,
  node, what3words_address, mall_name, floor, unit_number, entrance_notes,
  phone, email, whatsapp, account_balance, outstanding_arrears,
  onboarded_at, onboarding_mode, trust_metric
)
SELECT
  'c0000000-0000-4000-a000-000000000004'::uuid,
  'b0000000-0000-4000-a000-000000000008'::uuid,
  'Hassan Old Town Fabrics', 'standard', 'active', false,
  'BBS Mall', 'quiet.fabric.lane', 'BBS Mall', 'Ground Floor', 'G-19',
  'Near the main entrance, ground floor textiles row',
  '+254700000108', 'aragagency+churn@gmail.com', '+254700000108',
  150.00, 0,
  NOW() - INTERVAL '75 days', 'agent_assisted', 0.65
WHERE NOT EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = 'c0000000-0000-4000-a000-000000000004'::uuid);

-- Expired deal (ended 45 days ago — drives churn-risk lifecycle UI)
INSERT INTO public.deals (id, merchant_id, node, title, description, image_url,
                          discount_type, discount_value, deal_type, flash_duration_hours,
                          is_active, max_claims, claims_count, starts_at, expires_at,
                          price_kes, compare_at_kes, charges)
SELECT 'd0000000-0000-4000-a000-000000000004'::uuid,
       'c0000000-0000-4000-a000-000000000004'::uuid,
  'BBS Mall', '15% off men''s kanzu & kikois',
  'Classic kanzu and kikoi fabrics. Deal ended — merchant inactive since.',
  'data:image/svg+xml;utf8,<svg%20xmlns="http://www.w3.org/2000/svg"%20viewBox="0%200%20400%20300"><rect%20width="400"%20height="300"%20fill="%234b5563"/><text%20x="200"%20y="150"%20font-family="sans-serif"%20font-size="32"%20font-weight="bold"%20fill="white"%20text-anchor="middle">Hassan%20Fabrics</text><text%20x="200"%20y="195"%20font-family="sans-serif"%20font-size="22"%20fill="white"%20text-anchor="middle">15%25%20off%20kanzu</text></svg>',
  'percentage', 15, 'standard', 6, false, 10, 3,
  NOW() - INTERVAL '69 days', NOW() - INTERVAL '45 days',
  850.00, 1000.00, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = 'd0000000-0000-4000-a000-000000000004'::uuid);

-- Past successful redemption on the expired deal
INSERT INTO public.redemptions (id, deal_id, merchant_id, user_id, otp_code,
                                success_fee_charged, status, expires_at, redeemed_at)
SELECT 'e0000000-0000-4000-a000-000000000005'::uuid,
       'd0000000-0000-4000-a000-000000000004'::uuid,
       'c0000000-0000-4000-a000-000000000004'::uuid,
       'b0000000-0000-4000-a000-000000000005'::uuid,
       '556677', 30.00, 'success',
       NOW() - INTERVAL '45 days', NOW() - INTERVAL '50 days'
WHERE NOT EXISTS (SELECT 1 FROM public.redemptions r WHERE r.id = 'e0000000-0000-4000-a000-000000000005'::uuid);

-- Churn outreach task for agents (visible in admin support queue)
INSERT INTO public.agent_tasks (id, merchant_id, task_type, priority, description, is_complete, created_at, due_at)
SELECT 'a1000000-0000-4000-a000-000000000002'::uuid,
       'c0000000-0000-4000-a000-000000000004'::uuid,
       'onboarding_followup', 'medium',
       'Merchant Hassan Old Town Fabrics has had no live deals for 45+ days. Last redemption 50 days ago. Suggested outreach: check if shop still trading at BBS Mall G-19, offer onboarding refresh. [ops personas seed]',
       false, NOW() - INTERVAL '2 days', NOW() + INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM public.agent_tasks a WHERE a.id = 'a1000000-0000-4000-a000-000000000002'::uuid);

-- Lead for churn merchant (agent can see in /agent/leads)
INSERT INTO public.leads (id, agent_id, shop_name, unit_number, owner_name, phone,
                          what3words_address, notes, status, locked_until, converted_to)
SELECT 'l0000000-0000-4000-a000-000000000001'::uuid,
       'g0000000-0000-4000-a000-000000000001'::uuid,
       'Hassan Old Town Fabrics', 'G-19', 'Hassan Mohamed', '+254700000108',
       'quiet.fabric.lane',
       'Converted 75 days ago; now churn-risk — no live deals. Follow up for re-activation.',
       'converted', NOW() - INTERVAL '70 days',
       'c0000000-0000-4000-a000-000000000004'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = 'l0000000-0000-4000-a000-000000000001'::uuid);

-- ----------------------------------------------------------------------------
-- 3. Enrich Merchant B (Bilan) — recently onboarded, still learning
-- ----------------------------------------------------------------------------
UPDATE public.merchants
SET onboarded_at    = NOW() - INTERVAL '5 days',
    onboarding_mode = 'self_serve',
    onboarded_by    = NULL
WHERE id = 'c0000000-0000-4000-a000-000000000002'::uuid;

-- Second deal for Bilan (new merchant learning curve)
INSERT INTO public.deals (id, merchant_id, node, title, description, image_url,
                          discount_type, discount_value, deal_type, flash_duration_hours,
                          is_active, max_claims, claims_count, starts_at,
                          price_kes, compare_at_kes, charges)
SELECT 'd0000000-0000-4000-a000-000000000005'::uuid,
       'c0000000-0000-4000-a000-000000000002'::uuid,
  'BBS Mall', 'Flash: 20% off lip gloss sets',
  'Limited flash — all lip gloss gift sets. New merchant promo.',
  'data:image/svg+xml;utf8,<svg%20xmlns="http://www.w3.org/2000/svg"%20viewBox="0%200%20400%20300"><rect%20width="400"%20height="300"%20fill="%23db2777"/><text%20x="200"%20y="150"%20font-family="sans-serif"%20font-size="30"%20font-weight="bold"%20fill="white"%20text-anchor="middle">Bilan%20Beauty</text><text%20x="200"%20y="195"%20font-family="sans-serif"%20font-size="22"%20fill="white"%20text-anchor="middle">Flash%20lip%20gloss</text></svg>',
  'percentage', 20, 'flash', 6, true, 8, 0, NOW() - INTERVAL '45 minutes',
  640.00, 800.00, '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = 'd0000000-0000-4000-a000-000000000005'::uuid);

UPDATE public.deals
SET starts_at  = CASE WHEN deal_type = 'flash' THEN NOW() - INTERVAL '45 minutes' ELSE NOW() - INTERVAL '3 hours' END,
    expires_at = CASE WHEN deal_type = 'flash' THEN NOW() + INTERVAL '5 hours 15 minutes' ELSE NOW() + INTERVAL '21 hours' END,
    is_active  = true,
    is_paused  = false
WHERE merchant_id = 'c0000000-0000-4000-a000-000000000002'::uuid
  AND id IN ('d0000000-0000-4000-a000-000000000003'::uuid,
             'd0000000-0000-4000-a000-000000000005'::uuid);

-- ----------------------------------------------------------------------------
-- 4. Enrich Merchant A (Nuur) — high-performing baseline
-- ----------------------------------------------------------------------------
UPDATE public.merchants
SET onboarded_at    = NOW() - INTERVAL '90 days',
    onboarding_mode = 'agent_assisted',
    trust_metric    = 0.92,
    onboarded_by    = 'g0000000-0000-4000-a000-000000000001'::uuid
WHERE id = 'c0000000-0000-4000-a000-000000000001'::uuid;

COMMIT;
