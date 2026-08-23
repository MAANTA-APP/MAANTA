# Merchant pilot + BBS Mall launch plan — 2026-08-01

Maps a small merchant pilot to full BBS Mall launch, referencing staged
readiness docs and open drift items.

Related:

- `docs/maanta-staged-readiness-now-launch-10k-100k.md`
- `docs/maanta-launch-readiness-tracker.md`
- `docs/maanta-marketing-agency-brief.md`
- `docs/maanta-drift-register.md` (D25 paused deals)

---

## Part 1: Small merchant pilot

### Who

| Cohort | Count | Selection criteria |
|---|---|---|
| Founding merchants | 5–10 | Active BBS Mall tenants; owner-operated; willing to verify codes at counter |
| Pilot shoppers | 20–50 | Waitlist segment `shopper`; staff + friends; phones with SMS |
| On-ground agent | 1 | MAANTA desk at BBS; handles onboarding + dispute first response |
| Admin | 1 | Founder or engineer; approves merchants, reviews disputes |

Start with **categories that rotate deals daily** (food, fashion, electronics)
to exercise claim→verify loop multiple times per week.

### Onboarding flow

```
Agent visit → merchant signs up (/merchants/join or agent lead)
  → onboard_merchant RPC (shop details, location, plan)
  → admin approves (/admin/merchants)
  → wallet top-up (Stripe sandbox or KES opening credit)
  → merchant posts first deal (/merchant/deals/new)
  → agent confirms deal visible on /feed
  → shopper claims → merchant verifies at counter
  → KES 30 debited (or arrears if empty wallet)
```

### Success metrics (pilot exit criteria)

| Metric | Target | Measurement |
|---|---|---|
| Merchants onboarded + approved | ≥ 5 | Admin panel count |
| Live deals posted | ≥ 10 | `deals` where status = live |
| End-to-end redemptions | ≥ 20 | `redemptions` verified |
| Verify success rate | ≥ 90% | verified / (verified + rejected) |
| Dispute rate | < 5% | admin dispute queue |
| Merchant wallet top-ups | ≥ 3 | Stripe/MPesa events |
| Shopper repeat claims | ≥ 30% | same user_id, 2+ claims |
| Zero money-path bugs | 0 | SQL golden_path + manual ledger check |

### Ops requirements

| Requirement | Owner | Status |
|---|---|---|
| Agent desk at BBS Mall | Founder | ⬜ |
| Merchant WhatsApp support line | Founder | ✅ (ENTITY.whatsappLink) |
| Opening credit offer (10 redemptions) | Product | ✅ in facts.ts if live |
| Demo mode OFF on prod | Engineer | Verify `app_config.demo_mode_enabled` |
| Clerk auth live (not rehearsal supabase) | Engineer | 🟡 verify Vercel env |
| Admin approval SLA < 24h | Founder | Process |
| Dispute playbook | Ops | `docs/skills/redemption-disputes.md` |

### Wallet / top-up testing

1. **Stripe sandbox:** merchant tops up KES 500 → verify balance → post deal →
   redeem → KES 30 debited.
2. **Arrears path:** empty wallet → verify anyway → arrears recorded → top-up
   settles arrears first (migration `20260721120000`).
3. **M-Pesa STK:** defer to post-pilot unless IntaSend credentials arrive (E6).

### Deal creation testing

- Standard deal: title, price, expiry, location pin
- Flash deal: short window (< 1h)
- Paused deal: pause → hidden from feed → resume (requires D25 prod deploy)
- Zero-balance gate: merchant with KES 0 cannot create new deals

### Redemption testing

Two-phone manual smoke (substitute for E2E until staging env wired):

1. Phone A: browse `/feed` → claim deal → note OTP
2. Phone B (merchant): `/merchant/redeem` → enter OTP → verify
3. Confirm: shopper sees success; merchant wallet −KES 30; PostHog events fire

---

## Part 2: BBS Mall launch optimization

### Merchant acquisition

| Tactic | Channel | Owner |
|---|---|---|
| Founding merchant offer (30-day Elite + opening credit) | In-mall agent + WhatsApp | Founder |
| Category anchors (1 anchor per vertical) | Agent outreach | Agent |
| Merchant waitlist nurture | Resend segment `merchant` | Marketing |
| Pricing transparency content | Social / `/merchants` | Agency |

Target: **30–50 live merchants** at launch week (agency brief KPI).

### Shopper activation

| Tactic | Channel | Owner |
|---|---|---|
| Waitlist early-access drop | Email + SMS | Marketing |
| Launch-day deal drop | Push + feed Flash deals | Product |
| In-mall QR to `/feed` | Print at desk + tenant windows | Agent |
| Referral (post-pilot) | Waitlist segment | Marketing |

Target: **500+ shopper waitlist**, **100+ claims in launch week**.

### Mall operator coordination

| Item | Detail |
|---|---|
| BBS Mall partnership status | Not a signed partner until contract — no held claim |
| Operator dashboard | Not built — manual weekly readout from admin reports |
| On-ground activation | Agent desk + tenant window QR codes |
| Data readout promise | Post-launch redemption + footfall proxy report |

### Drift register items (launch blockers)

| ID | Item | Action |
|---|---|---|
| D25 | Paused deals prod deploy | `supabase db push` + `pg_get_functiondef` read-back for `claim_deal` |
| D28 | Contact form | ✅ Closed — `/api/contact` live |
| E6 | M-Pesa STK live | IntaSend credentials + live test |
| E7 | Waitlist prod healthz | Deploy + verify first prod signup |

### Pending deploys checklist

- [ ] D25: migrations `180000` + `190000` applied to prod
- [ ] E11: confirm trial-expiry cron first nightly run in `cron.job_run_details`
- [ ] E10: Vercel production env audit (Clerk, Supabase, Resend, Sentry, PostHog)
- [ ] Demo mode OFF: `UPDATE app_config SET demo_mode_enabled = false`
- [ ] Node 0 seed: live deals at BBS Mall (not rehearsal synthetic)

---

## Part 3: Staged readiness mapping

### Now → Pilot (5–10 merchants, 2–4 weeks)

From `maanta-staged-readiness-now-launch-10k-100k.md` §1:

- ✅ SQL money path (CI green)
- ✅ Auth helpers unit-tested
- 🟡 Two-phone manual smoke (E2–E4)
- 🟡 Prod env vars confirmed (E10)
- 🔴 M-Pesa optional for pilot (Stripe sandbox OK)

**Gate to exit pilot:** 20 verified redemptions, 0 money bugs, 5+ happy merchants.

### Pilot → Launch (BBS Mall public)

- 30–50 merchants live
- Waitlist segments warm (shopper + merchant)
- Agency campaign live (4-week push)
- Legal docs lawyer-reviewed (currently DRAFT)
- Clerk auth on production
- Demo mode OFF
- D25 paused deals live

### Launch → 10k users

- PostHog funnels instrumented (E16 ✅)
- Sentry production DSN (F6)
- FX provider if non-KES charges (E9)
- Playwright E2E on staging (E14)
- Guardian thresholds tuned from real volume

### 10k → 100k

See `docs/ops/tech-stack-deep-dive-2026-07.md` — Supabase scaling, CDN,
read replicas, dedicated support tooling.

---

## Top 10 launch checklist (executive)

1. **Deploy D25** — paused deals to prod (`supabase db push` + read-back)
2. **Confirm prod auth** — `MAANTA_AUTH_STRATEGY=clerk` on Vercel
3. **Demo mode OFF** — `app_config.demo_mode_enabled = false`
4. **Run two-phone smoke** — claim → verify → wallet debit
5. **Onboard 5 pilot merchants** — agent-led, admin-approved
6. **Verify waitlist healthz** — `GET /api/waitlist?healthz=1` on prod
7. **Set Sentry DSN** — confirm errors reach dashboard
8. **Seed 30+ live BBS deals** — real merchants, not rehearsal
9. **Agent desk operational** — WhatsApp + in-mall support
10. **Legal review** — privacy/terms out of DRAFT before public marketing push
