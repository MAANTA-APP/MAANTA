# Product Flows

**Status:** Canonical · **Last verified:** 2026-07-28  
**Supersedes Notion:** User Flows (archive with pointer)  
**Audience:** product, ops, engineers, agents

## Purpose

Describe the real shopper, merchant, and admin/founder journeys as implemented — including gates, cash handling, and manual steps.

---

## Shopper

### Current reality

1. Land on PWA (`www.maanta.app` preferred host).
2. Authenticate per **Auth and Identity** strategy (Clerk launch vs Supabase email OTP rehearsal).
3. `/app-bootstrap` routes by role into shopper surfaces.
4. Select node (default BBS Mall) → `/feed` Discover rails and/or `/browse` map+list.
5. Open deal → see **YOU PAY** (price + disclosed charges). This is what the shopper pays the **merchant in cash**, not MAANTA.
6. Claim → OTP ticket (expiry = deal expiry + 15 minutes). Under Clerk launch strategy, claim requires verified phone (`/verify-phone`).
7. Navigate via what3words / map → present code.
8. After staff verify: redemption success for shopper; MAANTA fee is a merchant-side event.

### What is working

- Feed/browse/deal/ticket UI on `main`.
- Claim RPC + phone gate logic in code.
- Favourite / language preference fields (Kiswahili UI still “coming soon”).

### What is not yet ready

- Assuming push favourites always deliver (Web Push is merchant-leaning today; shopper notification prefs partly device-local).
- Multi-language content.

### Risks

- Email-only Clerk sessions blocked at claim — agents must know the phone gate.
- Empty feed from wrong node cookie or unseeded prod.

---

## Merchant

### Current reality

1. Register / login → onboard wizard (node, floor, unit, what3words; optional agent attribution Yes/No).
2. Admin activation (pending → active); possible Node 0 opening credit.
3. Top up wallet (Stripe Checkout sandbox; IntaSend STK when available).
4. Create deal (image required; YOU PAY disclosure step; Elite gates for flash/boost).
5. Redeem: keypad → resolve → confirm → success takeover shows collect-from-shopper amount (display-only) + fee charged/owed.
6. Dashboard: deals, wallet, staff.

### What is working

- Onboard/activate RPCs, zero-balance gate, Elite boost gate, arrears path, two-step redeem.

### What is not yet ready

- Live M-Pesa top-ups.
- Self-serve Elite subscription payment rail (deferred historically).

### Risks

- Staff without `can_verify` cannot redeem.
- Promising shoppers in-app payment.

---

## Admin / Founder

### Current reality

**Admin (`/admin`):**

- Approve/activate merchants; plans/trials.
- Redemption detail: Guardian events, release held, appeal hard-block, reverse success fee (note required).
- Fraud/dispute queues; reporting RPCs.
- Users/customers lists.

**Founder (`/founder`):**

- Executive KPI view for **admin-role** users (no separate `founder` DB enum).

**Ops-assisted:**

- Prod migrations, seeds, env, threshold tuning, dispute SLA (72h).

### What is working

- Admin redemption tooling + fee reversal + Guardian panels in repo.
- `/founder` dashboard shipped.

### What is not yet ready

- Fully staffed 24/7 support (founders/agents cover launch).
- Mall-operator dashboard.

### Risks

- Fee reversal without note (blocked in code — keep UI discipline).
- Using founder dashboard metrics from seeded data in investor materials without labeling.

---

## Shared notes

- **Support channel:** WhatsApp (no in-app chat).
- **Agent flow:** lead capture + attribution only; merchant remains the authenticated onboard submitter.

## Dependencies

- Auth strategy configuration.
- Seed vs real inventory.
- Agent rota for assisted onboard.

## Next actions

1. Replace links to User Flows with this page.
2. Rehearse with `docs/ops/test-accounts.md` personas.
3. Capture device-pass evidence on Launch Readiness.

## Related pages

- Auth and Identity
- Claims, Redemption, Fees, and Guardian
- BBS Mall / Nairobi Rollout
- Node 0 Rehearsal Checklist
