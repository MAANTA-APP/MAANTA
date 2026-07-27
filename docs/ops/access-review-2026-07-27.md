# Access review — 2026-07-27

Multi-persona verification for Node 0 rehearsal accounts. Methods: DB persona audit, RPC golden-path simulation, route-guard unit tests (`src/lib/__tests__/roles.test.ts`), and code review of data projections per role.

**Login caveat:** Interactive Clerk email OTP at `/login` was not exercised in this VM (no `maanta-app/.env.local` with live Clerk keys). Seeded `auth.users` rows exist for local Supabase; production/rehearsal uses Clerk → `public.users.clerk_user_id` linking. Route guards and role checks were verified in code + tests.

---

## 1. Account inventory (DB verified ✅)

| Persona | Email | Role | Merchant ID | Status |
|---|---|---|---|---|
| Shopper 1 | `aragagency+shopper@gmail.com` | `customer` | — | ✅ |
| Merchant A | `aragagency+nuur@gmail.com` | `merchant_admin` | `c0000000-…0001` | active ✅ |
| Merchant B | `aragagency+bilan@gmail.com` | `merchant_admin` | `c0000000-…0002` | active, onboarded 5d ago ✅ |
| Merchant C | `aragagency+churn@gmail.com` | `merchant_admin` | `c0000000-…0004` | active, 0 live deals ✅ |
| Waitlist | `aragagency+macmacaan@gmail.com` | `merchant_admin` | `c0000000-…0003` | **pending** ✅ |
| Admin | `aragagency@gmail.com` | `admin` | — | ✅ |
| Support | `aragagency+support@gmail.com` | `admin` | — | ✅ |
| Agent | `aragagency+agent@gmail.com` | `agent` | agent `b0000000-…b001` | ✅ |
| Co-founder | `aragagency+cofounder@gmail.com` | `cofounder` | — | ✅ **added this review** |

All rehearsal emails have matching `auth.users` + `auth.identities` rows (email provider, OTP-ready).

**Expected post-login routes (from code):**

| Role | Default redirect |
|---|---|
| Shopper | `/feed` (or deep link) |
| Merchant (active) | `/merchant/redeem` via `/merchant` landing |
| Merchant (pending) | `/merchant` → can open `/merchant/dashboard` with waitlist banner |
| Admin / Support | `/admin` |
| Agent | `/agent` |
| Co-founder | `/founder` (recommended) or `/agent` read-only |

**Cross-route blocks (guard tests ✅):**

| Actor | `/admin` | `/founder` | `/agent` | `/merchant` (other shop) |
|---|---|---|---|---|
| Shopper | ❌ | ❌ | ❌ | ❌ (no merchant row) |
| Merchant A | ❌ | ❌ | ❌ | own shop only |
| Agent | ❌ | ❌ | ✅ | ❌ |
| Co-founder | ❌ | ✅ | ✅ read-only | ❌ |
| Admin | ✅ | ✅ | ✅ | ❌ |

---

## Scenario A — Shopper redemption dispute

### Steps performed

1. **Shopper 1** — Simulated via `golden_path_test.sql`: `claim_deal` → pending redemption with OTP + deal-end + 15 min grace expiry. Shopper UI (`/tickets/[id]`, `/my-deals`) shows `CountdownChip` with grace framing (code review ✅).

2. **Merchant A** — Seeded dispute redemption `e0000000-…0002` (OTP `445566`, geofence override, `review_required=true`). Merchant `/merchant/redemptions` shows status + fee only — **no shopper PII** (code review ✅). Keypad `/merchant/redeem` shows masked phone at verify time (redeem-keypad.tsx ✅). Live pending ticket OTP `431977` also seeded.

3. **Support (admin)** — `/admin/redemptions` lists recent redemptions; detail `/admin/redemptions/[id]` shows full OTP, masked phone/email, user_id prefix, fee ledger, Guardian timeline, release/reverse-fee actions (code review ✅). `/admin/support` shows open `dispute_review` task for Nuur override.

4. **Founder / co-founder** — `/founder` shows aggregated KPIs only (counts, revenue 7d) — **no OTP codes or shopper emails** (code review ✅). Co-founder blocked from `/admin/redemptions` after RBAC fix ✅.

### Scenario A findings

| Finding | Severity | Status |
|---|---|---|
| Admin dispute detail exposes raw OTP | Expected for support | ✅ By design |
| Merchant cannot see shopper user_id in redemption list | Gap for counter disputes? | ⚠️ Open — merchant sees status/fee only |
| Co-founder previously had full admin via shared `admin` role | Over-exposure | ✅ Fixed — `cofounder` role added |
| Support cannot attach structured notes on dispute | UX gap | ⚠️ Open — override/resolve only, no notes field |

---

## Scenario B — Waitlist → live lifecycle

### Steps performed

1. **Macmacaan (waitlist)** — DB: `status=pending`. UI: `MerchantLifecycleBanner` → **Waitlist** stage; `/merchant` landing does not auto-redirect to redeem (code ✅).

2. **Admin** — `/admin/merchants` + approve action via `MerchantAdminActions` → `activate_merchant` RPC. Guard: `requireAdminApi` — **admin only** ✅.

3. **Co-founder** — `/agent` shows read-only acquisition dashboard (waitlist count, churn tasks, all leads). **Cannot** open `/admin/merchants` or approve (redirect `/`) ✅.

4. **Field agent** — `/agent/leads` scoped to own `agent_id`; can create via `/agent/leads/new`. `/admin` blocked ✅.

5. **Merchant B (onboarding)** — `onboarded_at` 5 days ago → lifecycle **Onboarding** banner despite 1 live deal (Standard tier limit) ✅.

### Scenario B findings

| Finding | Severity | Status |
|---|---|---|
| Co-founder could not see leads before fix | Missing access | ✅ Fixed — read-only platform leads |
| Co-founder could approve merchants when using `admin` | Over-privilege | ✅ Fixed — cofounder blocked from `/admin/*` |
| Pending merchant can still open `/merchant/deals/new`? | Policy | ⚠️ Not gated in UI — API may reject; verify in follow-up |

---

## Scenario C — Churn-risk follow-up

### Steps performed

1. **Merchant C** — DB: 0 live deals, last deal ended ~45 days ago. Lifecycle → **Needs attention** / churn-risk; `/merchant/deals` empty state with CTA ✅.

2. **Agent** — Lead `Hassan Old Town Fabrics` on `/agent/leads` with churn notes ✅. Open `onboarding_followup` task in `/admin/support`.

3. **Co-founder** — `/agent` churn task count + `/founder` pending-merchant KPI ✅. No wallet/payout surfaces ✅.

4. **Admin** — Can suspend/close via `/admin/merchants/[id]` ops actions; agent/co-founder cannot ✅.

### Scenario C findings

| Finding | Severity | Status |
|---|---|---|
| Agent sees churn via leads notes, not dedicated “Needs attention” filter | UX | ⚠️ Open — workable via seeded lead |
| Merchant C churn visible in agent console | ✅ | Seeded lead + task |

---

## Per-role summary

### Shopper (`customer`)
- **Saw/used:** Feed deals, claim RPC output, ticket expiry + grace.
- **Missing:** N/A for dispute ops.
- **Over-exposed:** None identified.

### Merchant owner (`merchant_admin`)
- **Saw/used:** Own deals, redeem keypad, redemption history (no shopper PII), lifecycle banners.
- **Missing:** Shopper identifier on redemption history (only at keypad verify).
- **Over-exposed:** None.

### Admin (`admin`)
- **Saw/used:** Full `/admin/*`, disputes, OTP, fee reversal, merchant approve/suspend.
- **Missing:** Structured dispute notes (only task description + override).
- **Over-exposed:** Support login = full admin (intentional for launch rehearsal).

### Agent (`agent`)
- **Saw/used:** Own leads, lead capture, weekly targets.
- **Missing:** Cross-agent churn queue (by design — own leads only).
- **Over-exposed:** None.

### Co-founder (`cofounder`) — **new**
- **Saw/used:** `/founder` KPIs, `/agent` read-only leads + waitlist/churn counts.
- **Missing:** Cannot approve merchants or resolve disputes (intentional).
- **Over-exposed:** None after fix.

---

## Fixes implemented in this review

1. **`cofounder` role** — migration `20260727010000_cofounder_role.sql`
2. **`src/lib/roles.ts`** — centralized `canAccessAdminConsole`, `canAccessFounderDashboard`, `canAccessAgentConsole`
3. **Guards updated** — admin (admin only), founder (admin + cofounder), agent (agent + admin + cofounder)
4. **Co-founder agent UI** — read-only acquisition dashboard; blocked from `/agent/leads/new`
5. **Seed fixes** — invalid UUIDs, tier limits, task priority; cofounder account added
6. **Docs** — `docs/ops/access-matrix.md`, this report, tests `roles.test.ts`

---

## Remaining open questions / trade-offs

1. **Support = admin** — Separate login but identical privileges; true `support` role deferred.
2. **Clerk OTP E2E** — Needs live Clerk keys + browser; DB/RPC layer verified only.
3. **Pending merchant deal creation** — UI may allow navigation; confirm API blocks.
4. **Co-founder vs founder** — Co-founder cannot resolve disputes; must escalate to admin/support.
5. **Merchant dispute context** — No shopper ID in redemption history; only at verify keypad.

---

## Re-verification

- `npm test` — **243 passed** (includes `roles.test.ts`)
- `npm run lint` — clean
- `golden_path_test.sql` — passed
- Ops seed — applies cleanly after fixes

---

## Recommended next steps

1. Manual browser walkthrough with live Clerk keys per `docs/ops/test-accounts.md`
2. Gate `/merchant/deals/new` for `pending` merchants in UI
3. Add optional dispute notes on `/admin/redemptions/[id]`
4. Consider `support` role with redemptions/support only (no billing/approve)
