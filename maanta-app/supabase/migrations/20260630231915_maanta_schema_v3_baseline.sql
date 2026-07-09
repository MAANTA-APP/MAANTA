-- Extensions first
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Core tables before functions that reference them
CREATE TABLE public.users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_uid          UUID UNIQUE,
  phone             TEXT UNIQUE,
  email             TEXT,
  full_name         TEXT,
  role              TEXT NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('customer', 'merchant_admin', 'merchant_staff', 'agent', 'admin')),
  device_id         TEXT,
  push_subscription JSONB,
  is_blacklisted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.organizations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'other'
             CHECK (type IN ('mall', 'brand', 'franchise', 'other')),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.merchants (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID REFERENCES public.users(id),
  organization_id      UUID REFERENCES public.organizations(id),
  merchant_name        TEXT NOT NULL,
  tier                 TEXT NOT NULL DEFAULT 'standard'
                       CHECK (tier IN ('standard', 'elite')),
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'active', 'suspended', 'churned')),
  elite_trial_active   BOOLEAN NOT NULL DEFAULT FALSE,
  trial_ends_at        TIMESTAMPTZ,
  node                 TEXT NOT NULL DEFAULT 'BBS Mall',
  what3words_address   TEXT NOT NULL,
  mall_name            TEXT,
  floor                TEXT,
  unit_number          TEXT,
  entrance_notes       TEXT,
  phone                TEXT NOT NULL,
  email                TEXT,
  whatsapp             TEXT,
  account_balance      NUMERIC(12, 2) NOT NULL DEFAULT 0.00
                       CHECK (account_balance >= 0),
  trust_metric         NUMERIC(4, 3) NOT NULL DEFAULT 1.000
                       CHECK (trust_metric BETWEEN 0 AND 1),
  is_visible           BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured          BOOLEAN NOT NULL DEFAULT FALSE,
  is_shadow_banned     BOOLEAN NOT NULL DEFAULT FALSE,
  onboarded_by         UUID,
  onboarded_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helper functions after users table exists
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM public.users WHERE auth_uid = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.users WHERE auth_uid = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (auth_uid, phone, role)
  VALUES (NEW.id, NEW.phone, 'customer')
  ON CONFLICT (auth_uid) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE TABLE public.deals (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id          UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  node                 TEXT NOT NULL DEFAULT 'BBS Mall',
  title                TEXT NOT NULL,
  description          TEXT,
  image_url            TEXT NOT NULL,
  discount_type        TEXT CHECK (discount_type IN ('percentage', 'fixed', 'freebie')),
  discount_value       NUMERIC(10, 2),
  deal_type            TEXT NOT NULL DEFAULT 'standard'
                       CHECK (deal_type IN ('standard', 'flash')),
  flash_duration_hours SMALLINT NOT NULL DEFAULT 6
                       CHECK (flash_duration_hours BETWEEN 1 AND 24),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  max_claims           INTEGER,
  claims_count         INTEGER NOT NULL DEFAULT 0,
  success_fee          NUMERIC(10, 2) NOT NULL DEFAULT 30.00,
  boost_active         BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.redemptions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id              UUID NOT NULL REFERENCES public.deals(id),
  merchant_id          UUID NOT NULL REFERENCES public.merchants(id),
  user_id              UUID NOT NULL REFERENCES public.users(id),
  otp_code             TEXT NOT NULL,
  success_fee_charged  NUMERIC(10, 2) NOT NULL DEFAULT 30.00,
  consumer_device_id   TEXT,
  consumer_gps         GEOGRAPHY(POINT, 4326),
  merchant_device_id   TEXT,
  distance_from_shop   NUMERIC(10, 2),
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'success', 'failed', 'flagged')),
  fraud_flags          TEXT[],
  review_required      BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at           TIMESTAMPTZ NOT NULL,
  redeemed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.archive_history (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id      UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  original_deal_id UUID,
  deal_snapshot    JSONB NOT NULL,
  archived_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reposted_at      TIMESTAMPTZ,
  reposted_deal_id UUID
);

CREATE TABLE public.tier_flags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  flag_type   TEXT NOT NULL
              CHECK (flag_type IN ('deal_limit_exceeded','flash_not_allowed','trial_expired','subscription_lapsed')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.boost_flags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id     UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id),
  boost_fee   NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at     TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.merchant_favourites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_id)
);

CREATE TABLE public.kpi_counters (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id            UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  period                 TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  period_start           DATE NOT NULL,
  total_redemptions      INTEGER NOT NULL DEFAULT 0,
  successful_redemptions INTEGER NOT NULL DEFAULT 0,
  failed_redemptions     INTEGER NOT NULL DEFAULT 0,
  flagged_redemptions    INTEGER NOT NULL DEFAULT 0,
  total_success_fees_kes NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  active_deals_count     INTEGER NOT NULL DEFAULT 0,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, period, period_start)
);

CREATE TABLE public.reporting_aggregates (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('merchant','mall','node','platform')),
  entity_id    UUID,
  period       TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  period_start DATE NOT NULL,
  metrics      JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, period, period_start)
);

CREATE TABLE public.agents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  weekly_target INTEGER NOT NULL DEFAULT 15,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.merchants
  ADD CONSTRAINT fk_merchants_onboarded_by
  FOREIGN KEY (onboarded_by) REFERENCES public.agents(id);

CREATE TABLE public.leads (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id           UUID NOT NULL REFERENCES public.agents(id),
  shop_name          TEXT NOT NULL,
  unit_number        TEXT,
  owner_name         TEXT,
  phone              TEXT,
  what3words_address TEXT,
  notes              TEXT,
  status             TEXT NOT NULL DEFAULT 'locked'
                     CHECK (status IN ('locked','converted','expired','lost')),
  locked_until       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  converted_to       UUID REFERENCES public.merchants(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID NOT NULL REFERENCES public.agents(id),
  merchant_id     UUID NOT NULL REFERENCES public.merchants(id),
  signage_score   NUMERIC(3, 2) CHECK (signage_score BETWEEN 0 AND 1),
  staff_score     NUMERIC(3, 2) CHECK (staff_score BETWEEN 0 AND 1),
  latency_score   NUMERIC(3, 2) CHECK (latency_score BETWEEN 0 AND 1),
  attitude_score  NUMERIC(3, 2) CHECK (attitude_score BETWEEN 0 AND 1),
  composite_score NUMERIC(3, 2),
  notes           TEXT,
  audited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.merchant_transactions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id        UUID NOT NULL REFERENCES public.merchants(id),
  amount             NUMERIC(10, 2) NOT NULL,
  transaction_type   TEXT NOT NULL
                     CHECK (transaction_type IN ('topup','success_fee','boost_fee','subscription','refund')),
  payment_provider   TEXT NOT NULL DEFAULT 'intasend'
                     CHECK (payment_provider IN ('intasend','daraja','manual')),
  provider_reference TEXT,
  description        TEXT,
  reference_id       UUID,
  device_id          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.agent_tasks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id),
  assigned_to UUID REFERENCES public.agents(id),
  task_type   TEXT NOT NULL
              CHECK (task_type IN ('retraining','audit','suspension_review','fraud_review','onboarding_followup')),
  priority    TEXT NOT NULL DEFAULT 'normal'
              CHECK (priority IN ('low','normal','high','critical')),
  description TEXT,
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE TABLE public.fraud_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID REFERENCES public.merchants(id),
  user_id     UUID REFERENCES public.users(id),
  agent_id    UUID REFERENCES public.agents(id),
  event_type  TEXT NOT NULL
              CHECK (event_type IN ('velocity','geofence','collusion','otp_abuse','device_blacklist')),
  severity    TEXT NOT NULL DEFAULT 'medium'
              CHECK (severity IN ('low','medium','high')),
  details     JSONB,
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_auth_uid            ON public.users(auth_uid);
CREATE INDEX idx_users_phone               ON public.users(phone);
CREATE INDEX idx_merchants_tier            ON public.merchants(tier);
CREATE INDEX idx_merchants_status          ON public.merchants(status);
CREATE INDEX idx_merchants_trust           ON public.merchants(trust_metric DESC);
CREATE INDEX idx_merchants_node            ON public.merchants(node);
CREATE INDEX idx_merchants_trial           ON public.merchants(elite_trial_active, trial_ends_at);
CREATE INDEX idx_merchants_org             ON public.merchants(organization_id);
CREATE INDEX idx_deals_merchant_active     ON public.deals(merchant_id, is_active);
CREATE INDEX idx_deals_node_active         ON public.deals(node, is_active, expires_at);
CREATE INDEX idx_deals_expires_at          ON public.deals(expires_at);
CREATE INDEX idx_deals_type                ON public.deals(deal_type, is_active);
CREATE INDEX idx_redemptions_merchant      ON public.redemptions(merchant_id);
CREATE INDEX idx_redemptions_user          ON public.redemptions(user_id);
CREATE INDEX idx_redemptions_deal          ON public.redemptions(deal_id);
CREATE INDEX idx_redemptions_status        ON public.redemptions(status);
CREATE INDEX idx_redemptions_redeemed_at   ON public.redemptions(redeemed_at DESC);
CREATE INDEX idx_redemptions_device        ON public.redemptions(consumer_device_id);
CREATE INDEX idx_archive_merchant          ON public.archive_history(merchant_id, archived_at DESC);
CREATE INDEX idx_boost_merchant_active     ON public.boost_flags(merchant_id, is_active);
CREATE INDEX idx_boost_deal                ON public.boost_flags(deal_id, is_active);
CREATE INDEX idx_favourites_user           ON public.merchant_favourites(user_id);
CREATE INDEX idx_favourites_merchant       ON public.merchant_favourites(merchant_id);
CREATE INDEX idx_kpi_merchant_period       ON public.kpi_counters(merchant_id, period, period_start);
CREATE INDEX idx_leads_agent               ON public.leads(agent_id);
CREATE INDEX idx_leads_status              ON public.leads(status, locked_until);
CREATE INDEX idx_audit_merchant            ON public.audit_logs(merchant_id, audited_at DESC);
CREATE INDEX idx_tasks_assigned            ON public.agent_tasks(assigned_to, is_complete);
CREATE INDEX idx_tasks_merchant            ON public.agent_tasks(merchant_id, is_complete);
CREATE INDEX idx_transactions_merchant     ON public.merchant_transactions(merchant_id, created_at DESC);
CREATE INDEX idx_fraud_merchant            ON public.fraud_events(merchant_id, created_at DESC);

-- Business rule triggers and functions
CREATE OR REPLACE FUNCTION public.enforce_deal_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  active_count  INTEGER;
  merchant_tier TEXT;
  deal_limit    INTEGER;
BEGIN
  SELECT tier INTO merchant_tier FROM public.merchants WHERE id = NEW.merchant_id;
  IF merchant_tier = 'standard' THEN
    deal_limit := 1;
    IF NEW.deal_type = 'flash' THEN
      INSERT INTO public.tier_flags (merchant_id, flag_type, notes)
        VALUES (NEW.merchant_id, 'flash_not_allowed', 'Flash deal attempted on Standard plan');
      RAISE EXCEPTION 'Flash deals are only available on the Elite plan.';
    END IF;
  ELSIF merchant_tier = 'elite' THEN
    deal_limit := 2;
  ELSE
    RAISE EXCEPTION 'Unknown merchant tier: %', merchant_tier;
  END IF;
  SELECT COUNT(*) INTO active_count FROM public.deals WHERE merchant_id = NEW.merchant_id AND is_active = TRUE;
  IF active_count >= deal_limit THEN
    INSERT INTO public.tier_flags (merchant_id, flag_type, notes)
      VALUES (NEW.merchant_id, 'deal_limit_exceeded', FORMAT('Limit %s reached for %s plan', deal_limit, merchant_tier));
    RAISE EXCEPTION 'Deal limit reached. % plan allows % active deal(s).', merchant_tier, deal_limit;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_deal_limit_trigger
  BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deal_limit();

CREATE OR REPLACE FUNCTION public.set_deal_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deal_type = 'standard' THEN
    NEW.expires_at := NEW.starts_at + INTERVAL '24 hours';
    NEW.flash_duration_hours := 6;
  ELSIF NEW.deal_type = 'flash' THEN
    NEW.expires_at := NEW.starts_at + (NEW.flash_duration_hours * INTERVAL '1 hour');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_deal_expiry_trigger
  BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_deal_expiry();

CREATE OR REPLACE FUNCTION public.archive_expired_deal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE oldest_id UUID;
BEGIN
  IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
    INSERT INTO public.archive_history (merchant_id, original_deal_id, deal_snapshot)
    VALUES (NEW.merchant_id, NEW.id, to_jsonb(NEW));
    SELECT id INTO oldest_id FROM public.archive_history
      WHERE merchant_id = NEW.merchant_id ORDER BY archived_at DESC OFFSET 5 LIMIT 1;
    IF oldest_id IS NOT NULL THEN
      DELETE FROM public.archive_history WHERE merchant_id = NEW.merchant_id
        AND archived_at <= (SELECT archived_at FROM public.archive_history WHERE id = oldest_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER archive_expired_deal_trigger
  AFTER UPDATE OF is_active ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.archive_expired_deal();

CREATE OR REPLACE FUNCTION public.compute_audit_composite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.composite_score := (COALESCE(NEW.signage_score,0) + COALESCE(NEW.staff_score,0) + COALESCE(NEW.latency_score,0) + COALESCE(NEW.attitude_score,0)) / 4.0;
  RETURN NEW;
END;
$$;

CREATE TRIGGER compute_audit_composite_trigger
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.compute_audit_composite();

CREATE OR REPLACE FUNCTION public.recalculate_trust_metric(p_merchant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_30d INTEGER; v_success_30d INTEGER; v_flagged_30d INTEGER;
  v_r NUMERIC; v_a NUMERIC; v_f NUMERIC; v_new_trust NUMERIC; v_old_trust NUMERIC;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status='success'), COUNT(*) FILTER (WHERE status='flagged')
  INTO v_total_30d, v_success_30d, v_flagged_30d
  FROM public.redemptions WHERE merchant_id=p_merchant_id AND redeemed_at >= NOW() - INTERVAL '30 days';
  v_r := CASE WHEN v_total_30d=0 THEN 1.0 ELSE LEAST(v_success_30d::NUMERIC/v_total_30d,1.0) END;
  SELECT COALESCE(AVG(composite_score),1.0) INTO v_a FROM public.audit_logs
    WHERE merchant_id=p_merchant_id AND audited_at >= NOW() - INTERVAL '90 days';
  v_f := CASE WHEN v_total_30d=0 THEN 0.0 ELSE LEAST(v_flagged_30d::NUMERIC/v_total_30d,1.0) END;
  v_new_trust := LEAST(GREATEST((0.5*v_r)+(0.3*v_a)-(0.2*v_f),0.0),1.0);
  SELECT trust_metric INTO v_old_trust FROM public.merchants WHERE id=p_merchant_id;
  UPDATE public.merchants SET
    trust_metric = v_new_trust,
    is_visible   = CASE WHEN v_new_trust < 0.50 THEN FALSE ELSE TRUE END,
    is_featured  = CASE WHEN v_new_trust > 0.90 THEN TRUE ELSE FALSE END,
    updated_at   = NOW()
  WHERE id=p_merchant_id;
  IF v_new_trust < 0.50 AND (v_old_trust IS NULL OR v_old_trust >= 0.50) THEN
    INSERT INTO public.agent_tasks (merchant_id, task_type, priority, description)
    VALUES (p_merchant_id,'retraining','high',FORMAT('Trust fell to %.3f. Merchant hidden.',v_new_trust));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_check(
  p_merchant_id UUID, p_user_id UUID, p_consumer_device TEXT,
  p_consumer_gps GEOGRAPHY, p_merchant_device TEXT, p_distance_m NUMERIC
)
RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_flags TEXT[] := '{}'; v_velocity INTEGER; v_agent_device TEXT;
BEGIN
  SELECT COUNT(*) INTO v_velocity FROM public.redemptions
    WHERE consumer_device_id=p_consumer_device AND redeemed_at >= NOW() - INTERVAL '10 minutes';
  IF v_velocity >= 10 THEN
    v_flags := array_append(v_flags,'velocity');
    INSERT INTO public.fraud_events (merchant_id,user_id,event_type,severity,details)
    VALUES (p_merchant_id,p_user_id,'velocity','high',jsonb_build_object('count_in_10min',v_velocity,'device_id',p_consumer_device));
  END IF;
  IF p_distance_m IS NOT NULL AND p_distance_m > 500 THEN
    v_flags := array_append(v_flags,'geofence');
    INSERT INTO public.fraud_events (merchant_id,user_id,event_type,severity,details)
    VALUES (p_merchant_id,p_user_id,'geofence','medium',jsonb_build_object('distance_m',p_distance_m));
  END IF;
  SELECT u.device_id INTO v_agent_device FROM public.agents a JOIN public.users u ON u.id=a.user_id
    WHERE u.device_id=p_consumer_device LIMIT 1;
  IF v_agent_device IS NOT NULL THEN
    v_flags := array_append(v_flags,'collusion');
    INSERT INTO public.fraud_events (merchant_id,user_id,event_type,severity,details)
    VALUES (p_merchant_id,p_user_id,'collusion','high',jsonb_build_object('shared_device_id',p_consumer_device));
  END IF;
  IF 'velocity' = ANY(v_flags) OR 'collusion' = ANY(v_flags) THEN
    UPDATE public.merchants SET trust_metric=GREATEST(trust_metric-0.2,0.0),updated_at=NOW() WHERE id=p_merchant_id;
    PERFORM public.recalculate_trust_metric(p_merchant_id);
  END IF;
  RETURN v_flags;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_kpi_counters()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_is_success BOOLEAN := NEW.status='success';
  v_is_failed  BOOLEAN := NEW.status='failed';
  v_is_flagged BOOLEAN := NEW.status='flagged';
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  INSERT INTO public.kpi_counters (merchant_id,period,period_start,total_redemptions,successful_redemptions,failed_redemptions,flagged_redemptions,total_success_fees_kes,updated_at)
  SELECT NEW.merchant_id,p.period,p.period_start,1,
    CASE WHEN v_is_success THEN 1 ELSE 0 END,
    CASE WHEN v_is_failed  THEN 1 ELSE 0 END,
    CASE WHEN v_is_flagged THEN 1 ELSE 0 END,
    CASE WHEN v_is_success THEN NEW.success_fee_charged ELSE 0 END,
    NOW()
  FROM (VALUES ('daily',DATE_TRUNC('day',NOW())::DATE),('weekly',DATE_TRUNC('week',NOW())::DATE),('monthly',DATE_TRUNC('month',NOW())::DATE)) AS p(period,period_start)
  ON CONFLICT (merchant_id,period,period_start) DO UPDATE SET
    total_redemptions      = kpi_counters.total_redemptions+1,
    successful_redemptions = kpi_counters.successful_redemptions+EXCLUDED.successful_redemptions,
    failed_redemptions     = kpi_counters.failed_redemptions+EXCLUDED.failed_redemptions,
    flagged_redemptions    = kpi_counters.flagged_redemptions+EXCLUDED.flagged_redemptions,
    total_success_fees_kes = kpi_counters.total_success_fees_kes+EXCLUDED.total_success_fees_kes,
    updated_at             = NOW();
  IF v_is_success THEN PERFORM public.recalculate_trust_metric(NEW.merchant_id); END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_kpi_counters_trigger
  AFTER UPDATE OF status ON public.redemptions
  FOR EACH ROW EXECUTE FUNCTION public.update_kpi_counters();

CREATE OR REPLACE FUNCTION public.recalculate_trust_after_audit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM public.recalculate_trust_metric(NEW.merchant_id); RETURN NEW; END;
$$;

CREATE TRIGGER recalculate_trust_after_audit_trigger
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_trust_after_audit();

-- RLS
ALTER TABLE public.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_flags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boost_flags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_favourites   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_counters          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporting_aggregates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_events          ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_own_row ON public.users FOR ALL USING (id = public.current_user_id());
CREATE POLICY users_admin   ON public.users FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY merchants_customer_read ON public.merchants FOR SELECT USING (status='active' AND is_visible=TRUE AND is_shadow_banned=FALSE);
CREATE POLICY merchants_own           ON public.merchants FOR ALL USING (user_id = public.current_user_id());
CREATE POLICY merchants_agent_read    ON public.merchants FOR SELECT USING (onboarded_by IN (SELECT id FROM public.agents WHERE user_id = public.current_user_id()));
CREATE POLICY merchants_admin         ON public.merchants FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY deals_customer_read     ON public.deals FOR SELECT USING (is_active=TRUE AND merchant_id IN (SELECT id FROM public.merchants WHERE status='active' AND is_visible=TRUE AND is_shadow_banned=FALSE));
CREATE POLICY deals_merchant          ON public.deals FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id()) AND public.current_user_role() IN ('merchant_admin','merchant_staff'));
CREATE POLICY deals_admin             ON public.deals FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY redemptions_own         ON public.redemptions FOR SELECT USING (user_id = public.current_user_id());
CREATE POLICY redemptions_merchant    ON public.redemptions FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id()) AND public.current_user_role() IN ('merchant_admin','merchant_staff'));
CREATE POLICY redemptions_admin       ON public.redemptions FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY archive_merchant        ON public.archive_history FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id()));
CREATE POLICY archive_admin           ON public.archive_history FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY tier_flags_merchant     ON public.tier_flags  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id()) OR public.current_user_role()='admin');
CREATE POLICY boost_flags_merchant    ON public.boost_flags FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id()) OR public.current_user_role()='admin');
CREATE POLICY kpi_merchant            ON public.kpi_counters FOR SELECT USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id()) OR public.current_user_role()='admin');
CREATE POLICY transactions_merchant   ON public.merchant_transactions FOR SELECT USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id()) OR public.current_user_role()='admin');
CREATE POLICY favourites_own          ON public.merchant_favourites FOR ALL USING (user_id = public.current_user_id());
CREATE POLICY favourites_admin        ON public.merchant_favourites FOR ALL USING (public.current_user_role() = 'admin');
CREATE POLICY reporting_merchant      ON public.reporting_aggregates FOR SELECT USING ((entity_type='merchant' AND entity_id IN (SELECT id FROM public.merchants WHERE user_id = public.current_user_id())) OR public.current_user_role()='admin');
CREATE POLICY agents_own              ON public.agents     FOR SELECT USING (user_id = public.current_user_id() OR public.current_user_role()='admin');
CREATE POLICY leads_agent             ON public.leads      FOR ALL USING (agent_id IN (SELECT id FROM public.agents WHERE user_id = public.current_user_id()) OR public.current_user_role()='admin');
CREATE POLICY audit_logs_agent        ON public.audit_logs FOR ALL USING (agent_id IN (SELECT id FROM public.agents WHERE user_id = public.current_user_id()) OR public.current_user_role()='admin');
CREATE POLICY agent_tasks_own         ON public.agent_tasks FOR ALL USING (assigned_to IN (SELECT id FROM public.agents WHERE user_id = public.current_user_id()) OR public.current_user_role()='admin');
CREATE POLICY fraud_admin             ON public.fraud_events FOR ALL USING (public.current_user_role() = 'admin');

-- Views
CREATE OR REPLACE VIEW public.vw_active_feed AS
SELECT d.id, d.merchant_id, d.node, d.title, d.description, d.image_url,
  d.discount_type, d.discount_value, d.deal_type, d.flash_duration_hours,
  d.claims_count, d.max_claims, d.boost_active, d.starts_at, d.expires_at,
  m.merchant_name, m.floor, m.unit_number, m.what3words_address,
  m.tier AS merchant_tier, m.trust_metric,
  b.id AS boost_id, b.starts_at AS boost_starts_at,
  CASE
    WHEN b.id IS NOT NULL AND m.tier='elite' THEN 'priority'
    WHEN d.deal_type='flash' AND m.tier='elite' AND b.id IS NULL THEN 'flash'
    ELSE 'standard'
  END AS feed_section
FROM public.deals d
JOIN public.merchants m ON m.id = d.merchant_id
LEFT JOIN public.boost_flags b ON b.merchant_id=d.merchant_id AND b.is_active=TRUE AND b.deal_id=d.id
WHERE d.is_active=TRUE AND d.expires_at > NOW() AND m.status='active' AND m.is_visible=TRUE AND m.is_shadow_banned=FALSE;

CREATE OR REPLACE VIEW public.vw_merchant_health AS
SELECT m.id, m.merchant_name, m.tier, m.status,
  m.trust_metric, m.is_visible, m.is_featured, m.is_shadow_banned,
  m.account_balance, m.elite_trial_active, m.trial_ends_at,
  COUNT(d.id) FILTER (WHERE d.is_active=TRUE) AS active_deal_count,
  COALESCE(k.successful_redemptions,0) AS redemptions_this_month,
  COALESCE(k.total_success_fees_kes,0) AS fees_this_month_kes
FROM public.merchants m
LEFT JOIN public.deals d ON d.merchant_id = m.id
LEFT JOIN public.kpi_counters k ON k.merchant_id=m.id AND k.period='monthly' AND k.period_start=DATE_TRUNC('month',NOW())::DATE
GROUP BY m.id, k.successful_redemptions, k.total_success_fees_kes;
