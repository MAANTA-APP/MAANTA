# MAANTA launch ops runbook

Last updated: 2026-07-09 · The human side of launch at BBS Mall (Node 0).
Owner: founder, with the AI lead keeping this doc current as decisions land.
Frozen decisions referenced here live in `maanta-decisions-log.md`.

## Founder testing model

The founder tests as all three actors — admin, shopper, and merchant —
using separate accounts (distinct phone numbers / emails per role; the
system blocks self-role-escalation, so role changes go through the admin
account). Family members assist when a flow needs genuinely separate
people/devices — most importantly the redemption flow, where shopper and
merchant must be two phones in two hands at the shop location
(what3words/GPS distance is checked at verification).

Test accounts must be tagged (e.g. known phone numbers listed in an
internal note) so their redemptions can be excluded from launch KPIs.

## QA smoke checklist

Run the full checklist (1) after any major merge, and (2) in the 48 hours
before launch, on real phones against the production environment (Stripe in
sandbox until the launch cutover decision).

### Shopper journey

- [ ] Sign up with a Kenyan phone number (OTP arrives, session persists)
- [ ] Sign in with email as the alternative path
- [ ] Browse the feed; boosted/flash deals render correctly
- [ ] Claim a deal → 6-digit code issued; claim count increments
- [ ] Claim blocked when deal is at `max_claims` or expired
- [ ] Code expires correctly if unredeemed (deal expiry + 15-min grace)

### Merchant journey

- [ ] Onboard via the merchant flow (with agent attribution when an agent code is used)
- [ ] Admin approval → merchant becomes active; Elite trial starts (30 days)
- [ ] Post a deal with image upload
- [ ] Top up wallet via Stripe (KES and one non-KES currency); balance credits exactly once even if the webhook is retried
- [ ] Verify a redemption at the keypad: valid code succeeds, KES 30 debited, correct ledger entry
- [ ] Re-using the same code fails with "already redeemed"; expired code fails with "expired"
- [ ] Empty-wallet merchant: verification still succeeds, fee recorded as **arrears**, deals gated at zero balance
- [ ] Location-mismatch code shows the warning; "Reject code" charges no fee
- [ ] Web push notification received on top-up

### Admin journey

- [ ] Approve a pending merchant from `/admin`
- [ ] A redemption with `unknown` fee status opens a fraud-review task
- [ ] Fraud-flagged redemption visible for review; dispute can be resolved
- [ ] Non-admin users cannot reach admin routes or escalate their own role

### Public / infrastructure

- [ ] Homepage, login, and deals pages load logged-out
- [ ] Waitlist forms (once built): each of the three forms writes the right segment, UTM captured, duplicate email handled gracefully
- [ ] CI green on the release commit; production env vars verified (`STRIPE_ENV` guard behaves as expected)

## Weekly operations review (Ops track, Thursday)

1. **Merchant onboarding readiness** — pipeline from waitlist interest →
   onboarded → approved → topped up → first deal live. A merchant isn't
   "onboarded" until they can be redeemed against.
2. **Dispute and escalation cases** — review open fraud-review tasks (created
   automatically on unknown fee status) and any refund/dispute webhook
   failures in `payment_webhook_failures`.
3. **Mall-agent responsibilities** — who is physically at BBS Mall, what they
   own (merchant hand-holding, dispute follow-up, counter training), gaps.
4. **Support messages and FAQs** — recurring friction → FAQ or product fix.
5. **BBS Mall stakeholder notes** — short weekly note if there's anything the
   mall needs to know (tenant complaints, launch timing, activity numbers).

## Merchant onboarding support process

- Onboarding happens **at the shop**, done by the founder or an on-ground
  agent: account creation, precise location capture (what3words), first
  deal, first wallet top-up, and a live test verification. Zero-balance
  merchants can't create deals, so the top-up happens during the visit.
- Agents lock leads for 48 hours (`leads` table) — respect the lock when
  assigning onboarding visits, and record attribution so agent commissions
  are computable later.
- During launch month, merchant questions route to a single WhatsApp/phone
  contact (assign owner — tracker item O2). Target: first response within
  2 business hours during mall opening hours.

## Dispute and escalation path

Decision on record (**verify-anyway routing**, see the decisions log):
redemption verification is never blocked on fee-outcome uncertainty. If the
fee debit outcome is `unknown`, the redemption completes for the shopper and
a fraud-review task is opened automatically for async admin review. Never
make the shopper wait on a billing issue.

Escalation ladder (counter → agent → admin → founder; anything touching
money or the mall relationship escalates to the founder same-day):

1. **At the counter** — code invalid/expired/already used: merchant staff
   asks the shopper to re-check the code in-app; if genuinely broken, staff
   contacts merchant support (above) while the shopper is present.
2. **Merchant disputes a fee** ("that redemption didn't happen") — admin
   reviews the redemption record (GPS distance, device IDs, fraud flags,
   timestamps) in the admin panel; outcome is refund (ledger `refund`
   entry — never a manual balance edit) or fee stands, with the decision
   noted in the audit log.
3. **Suspected fraud** — flagged redemptions and fraud events queue for
   admin review; repeated flags lower the merchant trust metric and can
   lead to shadow-ban or suspension. Blacklisting exists for abusive
   shopper accounts.
4. **Card disputes** — the Stripe webhook already holds/releases the money;
   do not double-adjust. See `docs/skills/payments-rails.md`.
5. **On-ground agent escalation** — anything requiring physical presence
   (merchant can't operate the app, location mismatch at a real shop) is
   assigned to an agent as a task.

## BBS Mall operator communication

- Before launch: share the launch plan, expected activation activity, and
  what data MAANTA will report (aggregated redemption/traffic trends —
  not tenant-confidential figures).
- During launch month: a short weekly note to the operator with headline
  numbers (active merchants, redemptions, standout categories).
- Owner: founder (tracker item O4).

## What the founder handles personally (pre-launch phase)

- BBS Mall management relationship and weekly stakeholder note.
- Final merchant approvals and any fee waiver/refund decision.
- Agency review (Friday) and launch-date decision.

## Launch-week rhythm

| When | What |
|---|---|
| Launch − 3 days | Full smoke checklist on production; shopper countdown email; merchant wallets confirmed topped up |
| Launch day | Monitor: redemption success rate, webhook failures (`payment_webhook_failures`), fraud queue, support channel |
| Daily (week 1) | Triage fraud/dispute queue to zero; check arrears list; note bugs in the readiness tracker |
| Launch + 7 days | Week-1 readout: KPI review with agency, operator note, retro on this runbook |

## Doc updates

After each ops session, update this runbook or
`maanta-launch-readiness-tracker.md`, and log any behavior-changing decision
in `maanta-decisions-log.md`.
