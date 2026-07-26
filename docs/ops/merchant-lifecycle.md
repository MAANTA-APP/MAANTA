# Merchant lifecycle — stages and click paths

Last updated: 2026-07-26

Maps MAANTA merchant and ops journeys from waitlist through churn. Test accounts are in `docs/ops/test-accounts.md`.

## Lifecycle stages

| Stage | DB signals | Merchant UI | Ops UI |
|---|---|---|---|
| **Waitlist** | `merchants.status = pending` | Banner: "pending approval" on `/merchant/(app)/*` | `/admin` → pending count; `/admin/merchants/[id]` → Activate |
| **Onboarding** | `active`, `onboarded_at` within 14 days | Banner: "Welcome — you're live at {node}" | `/admin/merchants` — recently approved |
| **Live** | `active`, ≥1 claimable deal | Banner: "You're live at {node}"; deals show `CountdownChip` + grace | `/admin/merchants`, `/founder` KPIs |
| **Inactive** | `active`, 0 live deals, &lt;30 days since last deal ended | Empty state on `/merchant/deals`; "Create a deal" CTA | — |
| **Churn-risk** | `active`, 0 live deals, ≥30 days since last deal ended | Urgent banner + outreach copy; support link | `/agent/leads`, `agent_tasks` churn_outreach |
| **Support / disputes** | `fraud_events`, `review_required` redemptions | Merchant sees verify-anyway success at counter | `/admin/redemptions`, `/admin/support` |
| **Churned / closed** | `status = churned` or `rejected` | Account closed banner | `/admin/merchants/[id]` ops |

Deal expiry uses the shared 15-minute grace (`src/lib/deal-expiry.ts`) on shopper and merchant surfaces.

## Click paths by persona

### Merchant B — new shop (onboarding → first deals)

1. Sign in as `aragagency+bilan@gmail.com` → `/login`
2. Land on `/merchant/redeem` (auto-redirect) or open `/merchant/dashboard`
3. See **Onboarding** lifecycle badge and welcome banner
4. `/merchant/deals` — two deals (standard + flash) with expiry countdown
5. `/merchant/wallet` — KES 20 balance (below KES 30 fee; arrears path)
6. `/merchant/deals/new` — create another deal (tier limit applies)

### Merchant A — high-performing live shop

1. Sign in as `aragagency+nuur@gmail.com`
2. `/merchant/dashboard` — KPIs, **Live** badge, redemption history
3. `/merchant/deals` — standard + flash deals with countdown chips
4. `/merchant/redeem` — enter OTP `431977` for live pending ticket
5. `/merchant/redemptions` — past success + disputed override row

### Merchant C — churn-risk / inactive

1. Sign in as `aragagency+churn@gmail.com`
2. `/merchant/deals` — empty state: "No active deals — shoppers can't find you"
3. `/merchant/dashboard` — **Needs attention** badge, zero active deals
4. Banner links: **Create a new deal** · **Contact support**
5. `/merchant/deals/archived` — past expired deal

### Waitlist — pre-approval

1. Sign in as `aragagency+macmacaan@gmail.com`
2. `/merchant` — landing (pending merchants are not redirected to redeem)
3. `/merchant/dashboard` — **Waitlist** banner

### Admin — approvals and disputes

1. Sign in as `aragagency@gmail.com`
2. `/admin` — pending merchant count, dispute queue summary
3. `/admin/merchants` → Macmacaan → **Activate** (waitlist → live rehearsal)
4. `/admin/redemptions` — unresolved merchant-override dispute (Nuur seed)
5. `/founder` — executive KPIs and merchant lifecycle overview

### Agent — field ops and churn outreach

1. Sign in as `aragagency+agent@gmail.com`
2. `/agent` — weekly target, onboarded shop count
3. `/agent/leads` — Hassan Old Town Fabrics (converted, churn-risk notes)
4. `/agent/leads/new` — capture a new lead at the mall

### Support / disputes specialist

1. Sign in as `aragagency+support@gmail.com`
2. `/admin/redemptions` — filter disputed / review-required rows
3. Open dispute detail → release or appeal actions
4. `/admin/support` — override queue and agent tasks

## Gaps and placeholders

| Stage | Status |
|---|---|
| Waitlist form | `/merchant/onboard` wizard (self-serve signup) |
| Onboarding tasks checklist | Lifecycle banner only (no stepper yet) |
| Automated churn emails | `agent_tasks` + banner; no email automation |
| Support role enum | Reuses `admin` with separate login |

## Related code

- Lifecycle logic: `src/lib/merchant-lifecycle.ts`
- Merchant banner: `src/components/merchant/merchant-lifecycle-banner.tsx`
- Role guards: `docs/skills/role-permissions.md`
- Seeds: `supabase/seed/node0_rehearsal_seed.sql`, `node0_ops_personas_seed.sql`
