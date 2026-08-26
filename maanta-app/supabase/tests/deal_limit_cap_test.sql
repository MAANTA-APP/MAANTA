-- ============================================================
-- Test: the per-plan ACTIVE-DEAL CAP — the locked product rule.
--
--   STANDARD = maximum 1 active deal
--   ELITE    = maximum 2 active deals
--
-- Why this file exists: the cap is one of MAANTA's oldest commercial rules and
-- until now NOTHING asserted it. The two suites that touch it
-- (deal_categories_test.sql, demo_mode_test.sql) deliberately route *around*
-- the trigger — inserting and deleting one deal at a time so the limit "is
-- never approached" — so a change that widened, narrowed or silently removed
-- `enforce_deal_limit()` would have left every suite green. That is precisely
-- the shape of a rule that drifts.
--
-- What is authoritative, and what is not: `public.enforce_deal_limit()`, a
-- BEFORE INSERT trigger on `public.deals`, is the ONLY enforcement point. The
-- application never pre-checks the cap — `/api/deals` and `/api/deals/repost`
-- both attempt the INSERT and translate the trigger's exception into HTTP 409
-- — and `authenticated` holds no INSERT/UPDATE grant on `deals` at all, so
-- there is no client path that bypasses it. These assertions therefore run
-- against the trigger directly, never against UI state.
--
-- ## What "active" means here (read before editing)
--
-- The trigger counts `is_active = TRUE` and NOTHING else:
--
--   SELECT COUNT(*) ... WHERE merchant_id = NEW.merchant_id AND is_active = TRUE
--
-- It does not consult `expires_at`, and it does not consult `is_paused`. So an
-- EXPIRED deal and a PAUSED deal each still occupy a cap slot until somebody
-- archives them (`is_active = FALSE`, written only by the merchant's archive
-- action and the admin remove action — nothing in the product flips it on
-- expiry). Scenarios E and F pin exactly that, because it is the boundary a
-- future refactor is most likely to "clean up" by accident, and doing so would
-- silently widen the cap.
--
-- ## One thing this suite documents rather than enforces
--
-- `enforce_deal_limit()` inserts a `tier_flags` audit row immediately before
-- it raises. That row can never persist — the RAISE rolls back the same
-- subtransaction that wrote it — so the refusal is unaudited in practice, and
-- production's `tier_flags` table is empty. Drift **D194**. The scenarios
-- below assert the observed (zero-row) behaviour so the dead path stays
-- visible instead of being mistaken for a working audit trail.
--
-- Self-contained and self-cleaning. Run after the full migration chain:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/deal_limit_cap_test.sql
-- ============================================================

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ------------------------------------------------------------
-- Scenario A: STANDARD = 1. First active deal lands, second is refused.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mid       UUID;
  v_first     UUID;
  v_flag_note TEXT;
  v_flags     INTEGER;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_standard', 'test.cap.standard', '+254700000901', 'BBS Mall', 'active', TRUE, 999, 'standard')
    RETURNING id INTO v_mid;

  -- 0 active -> the first deal succeeds.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test cap standard 1', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_first;
  ASSERT v_first IS NOT NULL, 'A: a Standard merchant could not create their FIRST active deal';

  -- 1 active -> the second is refused. The exception is the product rule
  -- speaking; assert on the message so a silently renamed error is caught.
  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
      VALUES (v_mid, '__test cap standard 2', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
    RAISE EXCEPTION 'A: STANDARD CAP BREACHED — a second active deal was accepted on the Standard plan';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'A: STANDARD CAP BREACHED%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%Deal limit reached%',
        format('A: expected the deal-limit refusal, got: %s', SQLERRM);
      ASSERT SQLERRM LIKE '%standard plan allows 1 active deal%',
        format('A: the refusal no longer states the Standard limit as 1: %s', SQLERRM);
  END;

  -- The trigger tries to audit the refusal into tier_flags before it raises.
  -- That row NEVER survives, and cannot: the INSERT and the RAISE are in the
  -- same subtransaction, so the exception that reports the refusal also rolls
  -- back the record of it. Production agrees — public.tier_flags holds zero
  -- rows of any type. Recorded as drift D194; NOT fixed here, because the cap
  -- itself is correct and the founder's authorization for this package is to
  -- ratchet the rule, not to re-engineer the trigger.
  --
  -- Asserted rather than ignored so the dead path stays visible. If the audit
  -- is ever made durable (an autonomous transaction, or logging from the
  -- caller), update this deliberately — do not delete it.
  SELECT COUNT(*) INTO v_flags
    FROM public.tier_flags
    WHERE merchant_id = v_mid AND flag_type = 'deal_limit_exceeded';
  ASSERT v_flags = 0,
    format('A: tier_flags now survives the refusal (%s rows) — D194 has changed, update this assertion', v_flags);
  v_flag_note := NULL;  -- unused while the audit path is dead

  -- Exactly one active deal survives the attempt.
  ASSERT (SELECT COUNT(*) FROM public.deals WHERE merchant_id = v_mid AND is_active) = 1,
    'A: the merchant does not hold exactly 1 active deal after the refused insert';

  DELETE FROM public.tier_flags WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario A passed: STANDARD = 1 active deal, second refused';
END $$;

-- ------------------------------------------------------------
-- Scenario B: ELITE = 2. First and second land, third is refused.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mid   UUID;
  v_id    UUID;
  v_flags INTEGER;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_elite', 'test.cap.elite', '+254700000902', 'BBS Mall', 'active', TRUE, 999, 'elite')
    RETURNING id INTO v_mid;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test cap elite 1', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, 'B: an Elite merchant could not create their FIRST active deal';

  -- The half of the Elite rule a narrowing regression would break: the SECOND
  -- deal is the benefit Elite exists to give, so this is not a formality.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test cap elite 2', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, 'B: ELITE NARROWED — the second active deal was refused on the Elite plan';

  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
      VALUES (v_mid, '__test cap elite 3', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
    RAISE EXCEPTION 'B: ELITE CAP BREACHED — a third active deal was accepted on the Elite plan';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'B: ELITE CAP BREACHED%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%Deal limit reached%',
        format('B: expected the deal-limit refusal, got: %s', SQLERRM);
      ASSERT SQLERRM LIKE '%elite plan allows 2 active deal%',
        format('B: the refusal no longer states the Elite limit as 2: %s', SQLERRM);
  END;

  -- Same dead audit path as Scenario A (drift D194).
  SELECT COUNT(*) INTO v_flags FROM public.tier_flags
    WHERE merchant_id = v_mid AND flag_type = 'deal_limit_exceeded';
  ASSERT v_flags = 0,
    format('B: tier_flags now survives the refusal (%s rows) — D194 has changed', v_flags);

  ASSERT (SELECT COUNT(*) FROM public.deals WHERE merchant_id = v_mid AND is_active) = 2,
    'B: the merchant does not hold exactly 2 active deals after the refused insert';

  DELETE FROM public.tier_flags WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario B passed: ELITE = 2 active deals, third refused';
END $$;

-- ------------------------------------------------------------
-- Scenario C: REPOST is capped on both plans.
--
-- `/api/deals/repost` rebuilds a deal from an archive_history snapshot with a
-- plain INSERT, so it meets the same trigger. This scenario reproduces that
-- shape — an archived (is_active = FALSE) row brought back as a new active
-- deal while the merchant is already at their cap — because a repost path that
-- quietly bypassed the trigger would hand every merchant a free extra slot.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_std   UUID;
  v_eli   UUID;
  v_arch  UUID;
BEGIN
  -- Standard at cap: 1 active + 1 archived, repost of the archived refused.
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_repost_std', 'test.cap.repost.std', '+254700000903', 'BBS Mall', 'active', TRUE, 999, 'standard')
    RETURNING id INTO v_std;

  -- Seeded in the order a real merchant reaches this state: publish, archive,
  -- publish again. The archived original must exist BEFORE the current live
  -- deal, because the trigger refuses ANY insert once the merchant is at cap —
  -- it never inspects NEW.is_active, so even creating a row that is already
  -- archived is blocked at cap. Stricter than the rule requires, never looser,
  -- and asserted at the end of this scenario so a future "optimisation" that
  -- starts inspecting NEW.is_active has to be a deliberate decision.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_std, '__test repost std archived', 'x', TRUE, NOW() - INTERVAL '2 hours', 100)
    RETURNING id INTO v_arch;
  UPDATE public.deals SET is_active = FALSE WHERE id = v_arch;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_std, '__test repost std live', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);

  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
      VALUES (v_std, '__test repost std reposted', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
    RAISE EXCEPTION 'C: STANDARD CAP BREACHED VIA REPOST — a reposted deal became a second active deal';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'C: STANDARD CAP BREACHED VIA REPOST%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%Deal limit reached%',
        format('C: expected the deal-limit refusal on Standard repost, got: %s', SQLERRM);
  END;

  -- Elite at cap: 2 active, repost refused just the same.
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_repost_eli', 'test.cap.repost.eli', '+254700000904', 'BBS Mall', 'active', TRUE, 999, 'elite')
    RETURNING id INTO v_eli;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_eli, '__test repost eli archived', 'x', TRUE, NOW() - INTERVAL '2 hours', 100)
    RETURNING id INTO v_arch;
  UPDATE public.deals SET is_active = FALSE WHERE id = v_arch;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_eli, '__test repost eli 1', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_eli, '__test repost eli 2', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);

  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
      VALUES (v_eli, '__test repost eli reposted', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
    RAISE EXCEPTION 'C: ELITE CAP BREACHED VIA REPOST — a reposted deal became a third active deal';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'C: ELITE CAP BREACHED VIA REPOST%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%Deal limit reached%',
        format('C: expected the deal-limit refusal on Elite repost, got: %s', SQLERRM);
  END;

  -- The archived rows themselves never held a slot: freeing the live one lets
  -- the Standard merchant publish again immediately.
  UPDATE public.deals SET is_active = FALSE
    WHERE merchant_id = v_std AND title = '__test repost std live';
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_std, '__test repost std after archive', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
  ASSERT (SELECT COUNT(*) FROM public.deals WHERE merchant_id = v_std AND is_active) = 1,
    'C: archived rows are being counted against the cap';

  DELETE FROM public.tier_flags WHERE merchant_id IN (v_std, v_eli);
  DELETE FROM public.archive_history WHERE merchant_id IN (v_std, v_eli);
  DELETE FROM public.deals WHERE merchant_id IN (v_std, v_eli);
  DELETE FROM public.merchants WHERE id IN (v_std, v_eli);
  RAISE NOTICE 'Scenario C passed: repost at cap refused on both plans; archived rows hold no slot';
END $$;

-- ------------------------------------------------------------
-- Scenario D: FLASH is Elite-only, and that rule is independent of the cap.
--
-- A Standard merchant with ZERO active deals is still refused a flash deal —
-- proving the refusal comes from the plan, not from the count.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_std   UUID;
  v_eli   UUID;
  v_id    UUID;
  v_flags INTEGER;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_flash_std', 'test.cap.flash.std', '+254700000905', 'BBS Mall', 'active', TRUE, 999, 'standard')
    RETURNING id INTO v_std;

  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, deal_type, flash_duration_hours, expires_at, price_kes)
      VALUES (v_std, '__test flash on standard', 'x', TRUE, 'flash', 6, NOW() + INTERVAL '2 hours', 100);
    RAISE EXCEPTION 'D: FLASH LEAKED TO STANDARD — a flash deal was accepted on the Standard plan';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'D: FLASH LEAKED TO STANDARD%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%Flash deals are only available on the Elite plan%',
        format('D: expected the flash refusal, got: %s', SQLERRM);
  END;

  -- The flash refusal carries the same dead audit path (drift D194).
  SELECT COUNT(*) INTO v_flags FROM public.tier_flags
    WHERE merchant_id = v_std AND flag_type = 'flash_not_allowed';
  ASSERT v_flags = 0,
    format('D: tier_flags now survives the flash refusal (%s rows) — D194 has changed', v_flags);

  -- Elite keeps its canonical flash behaviour, and a flash deal consumes a
  -- normal cap slot like any other active deal.
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_flash_eli', 'test.cap.flash.eli', '+254700000906', 'BBS Mall', 'active', TRUE, 999, 'elite')
    RETURNING id INTO v_eli;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, deal_type, flash_duration_hours, expires_at, price_kes)
    VALUES (v_eli, '__test flash on elite', 'x', TRUE, 'flash', 6, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, 'D: ELITE FLASH BROKEN — an Elite merchant could not create a flash deal';

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_eli, '__test flash elite second', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);

  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, deal_type, flash_duration_hours, expires_at, price_kes)
      VALUES (v_eli, '__test flash elite third', 'x', TRUE, 'flash', 6, NOW() + INTERVAL '2 hours', 100);
    RAISE EXCEPTION 'D: ELITE CAP BREACHED BY FLASH — flash deals do not consume a cap slot';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'D: ELITE CAP BREACHED BY FLASH%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%Deal limit reached%',
        format('D: expected the deal-limit refusal for a third Elite deal, got: %s', SQLERRM);
  END;

  DELETE FROM public.tier_flags WHERE merchant_id IN (v_std, v_eli);
  DELETE FROM public.deals WHERE merchant_id IN (v_std, v_eli);
  DELETE FROM public.merchants WHERE id IN (v_std, v_eli);
  RAISE NOTICE 'Scenario D passed: flash is Elite-only and still consumes a cap slot';
END $$;

-- ------------------------------------------------------------
-- Scenario E: an EXPIRED deal still holds its slot until archived.
--
-- Pinned deliberately. `is_active` is flipped only by the merchant's archive
-- action and the admin remove action — nothing in the product deactivates a
-- deal when it expires — so an expired row keeps occupying the cap. A future
-- "tidy-up" that taught the trigger to ignore expired rows would hand every
-- Standard merchant a second concurrent slot the moment their first deal
-- lapsed, which is a widening of the locked rule and must fail here first.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mid UUID;
  v_id  UUID;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_expired', 'test.cap.expired', '+254700000907', 'BBS Mall', 'active', TRUE, 999, 'standard')
    RETURNING id INTO v_mid;

  -- starts_at is backdated, NOT expires_at: `set_deal_expiry` is a BEFORE
  -- INSERT trigger that overwrites expires_at with starts_at + 24h for a
  -- standard deal, so passing a past expires_at directly produces a deal that
  -- is not expired at all. (This suite's first draft did exactly that, and a
  -- mutant that taught the cap to ignore expired deals passed against it.)
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, starts_at, price_kes)
    VALUES (v_mid, '__test cap expired', 'x', TRUE, NOW() - INTERVAL '30 hours', 100)
    RETURNING id INTO v_id;
  ASSERT (SELECT expires_at FROM public.deals WHERE id = v_id) < NOW(),
    'E: fixture is not actually expired — set_deal_expiry moved expires_at forward';

  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
      VALUES (v_mid, '__test cap after expiry', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
    RAISE EXCEPTION 'E: CAP WIDENED — an expired-but-active deal no longer holds its slot';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'E: CAP WIDENED%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%Deal limit reached%',
        format('E: expected the deal-limit refusal, got: %s', SQLERRM);
  END;

  -- Archiving it (the canonical way out) frees the slot immediately.
  UPDATE public.deals SET is_active = FALSE WHERE id = v_id;
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_mid, '__test cap after archive', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, 'E: archiving the expired deal did not free the Standard slot';

  DELETE FROM public.tier_flags WHERE merchant_id = v_mid;
  DELETE FROM public.archive_history WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario E passed: expired deals hold their slot; archiving frees it';
END $$;

-- ------------------------------------------------------------
-- Scenario F: a PAUSED deal still holds its slot.
--
-- Pausing removes a deal from shopper discovery and blocks new claims
-- (docs/skills/paused-deal-semantics.md) but it is not archiving: the row
-- stays `is_active = TRUE` and keeps its cap slot. Pinned so that "pause the
-- old one to post a new one" can never become an unlegislated way to run two
-- concurrent Standard deals.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_mid UUID;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_paused', 'test.cap.paused', '+254700000908', 'BBS Mall', 'active', TRUE, 999, 'standard')
    RETURNING id INTO v_mid;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, is_paused, expires_at, price_kes)
    VALUES (v_mid, '__test cap paused', 'x', TRUE, TRUE, NOW() + INTERVAL '2 hours', 100);

  BEGIN
    INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
      VALUES (v_mid, '__test cap beside paused', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
    RAISE EXCEPTION 'F: CAP WIDENED — pausing a deal released its slot';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'F: CAP WIDENED%' THEN RAISE; END IF;
      ASSERT SQLERRM LIKE '%Deal limit reached%',
        format('F: expected the deal-limit refusal, got: %s', SQLERRM);
  END;

  DELETE FROM public.tier_flags WHERE merchant_id = v_mid;
  DELETE FROM public.deals WHERE merchant_id = v_mid;
  DELETE FROM public.merchants WHERE id = v_mid;
  RAISE NOTICE 'Scenario F passed: paused deals still hold their cap slot';
END $$;

-- ------------------------------------------------------------
-- Scenario G: the cap is PER MERCHANT, and the plan set is exactly the two
-- capped plans.
--
-- The tier CHECK is asserted here on purpose. `enforce_deal_limit()` knows
-- 'standard' and 'elite' and raises 'Unknown merchant tier' for anything else,
-- so widening the CHECK to admit a third plan without teaching the trigger
-- about it would make that plan unable to publish any deal at all. Either the
-- CHECK and the trigger move together or this fails.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_a          UUID;
  v_b          UUID;
  v_id         UUID;
  v_tier_check TEXT;
BEGIN
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_tenant_a', 'test.cap.tenant.a', '+254700000909', 'BBS Mall', 'active', TRUE, 999, 'standard')
    RETURNING id INTO v_a;
  INSERT INTO public.merchants (
    merchant_name, what3words_address, phone, node, status, is_visible, account_balance, tier
  )
    VALUES ('__test_cap_tenant_b', 'test.cap.tenant.b', '+254700000910', 'BBS Mall', 'active', TRUE, 999, 'standard')
    RETURNING id INTO v_b;

  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_a, '__test cap tenant a', 'x', TRUE, NOW() + INTERVAL '2 hours', 100);
  -- B's own first deal must be unaffected by A being at cap.
  INSERT INTO public.deals (merchant_id, title, image_url, is_active, expires_at, price_kes)
    VALUES (v_b, '__test cap tenant b', 'x', TRUE, NOW() + INTERVAL '2 hours', 100)
    RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, 'G: one merchant at cap blocked a DIFFERENT merchant''s first deal';

  -- The plan vocabulary the trigger is written against, pinned.
  SELECT pg_get_constraintdef(c.oid) INTO v_tier_check
    FROM pg_constraint c
    WHERE c.conrelid = 'public.merchants'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%tier%';
  ASSERT v_tier_check IS NOT NULL, 'G: the merchants.tier CHECK has gone missing';
  ASSERT v_tier_check LIKE '%standard%' AND v_tier_check LIKE '%elite%',
    format('G: the tier CHECK no longer names both capped plans: %s', v_tier_check);
  ASSERT (SELECT COUNT(*) FROM regexp_matches(v_tier_check, '''[a-z_]+''', 'g')) = 2,
    format('G: merchants.tier admits a plan enforce_deal_limit() has no cap for: %s', v_tier_check);

  DELETE FROM public.deals WHERE merchant_id IN (v_a, v_b);
  DELETE FROM public.merchants WHERE id IN (v_a, v_b);
  RAISE NOTICE 'Scenario G passed: cap is per merchant; plan set is exactly standard+elite';
END $$;

SELECT 'deal_limit_cap_test.sql: ALL SCENARIOS PASSED (Standard=1, Elite=2)' AS result;
