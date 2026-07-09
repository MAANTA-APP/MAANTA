# MAANTA launch ops runbook

Last updated: 2026-07-09 · The human side of launch at BBS Mall (Node 0).

## Weekly operations review (Ops track, Thursday)

1. **Merchant onboarding readiness** — pipeline from waitlist interest →
   onboarded → approved → topped up → first deal live. A merchant isn't
   "onboarded" until they can be redeemed against.
2. **Dispute and escalation cases** — review open fraud-review tasks (created
   automatically on unknown fee status) and any refund/dispute webhook failures
   in the failure log.
3. **Mall-agent responsibilities** — who is physically at BBS Mall, what they
   own (merchant hand-holding, dispute follow-up, counter training), gaps.
4. **Support messages and FAQs** — recurring friction → FAQ or product fix.
5. **BBS Mall stakeholder notes** — short weekly note if there's anything the
   mall needs to know (tenant complaints, launch timing, activity numbers).

## Frozen ops decisions

- **Elite trial remains 30 days** (then 7-day grace, then auto-downgrade).
- **Verify-anyway**: the shopper's redemption succeeds at the counter even when
  the fee charge status is uncertain; the dispute routes to admin or on-ground
  agent handling after the fact. Never make the shopper wait on a billing issue.
- **Auditability**: every dispute/escalation must be traceable through product
  behavior (ledger entries, admin tasks, webhook failure log) and documentation.

## Standard procedures

### Merchant onboarding

1. Merchant submits via `/merchant/onboard` (or agent-assisted, attributed to the agent).
2. Admin reviews and approves in `/admin` (KYC baseline per `maanta-app/legal/kyc-aml-policy.md`).
3. Merchant tops up wallet (`/merchant/topup`) — zero-balance merchants can't create deals.
4. Merchant creates first deal; agent verifies the counter flow works with a test redemption.

### Dispute handling

1. Fraud-review/dispute task appears in admin (auto-created on unknown fee status,
   or raised by agent/support).
2. Admin checks the ledger: was the fee charged, owed (arrears), or unknown?
3. Resolve: charge/waive/refund via the ledger path (never manual balance edits),
   note the outcome on the task.
4. If a merchant disputes a card payment, the Stripe webhook already holds/releases
   the money — do not double-adjust; see `docs/skills/payments-rails.md`.

### Escalation ladder

Counter issue → on-ground mall agent → admin panel task → founder. Anything
touching money or a mall relationship escalates to the founder same-day.

## What the founder handles personally (pre-launch phase)

- BBS Mall management relationship and weekly stakeholder note.
- Final merchant approvals and any fee waiver/refund decision.
- Agency review (Friday) and launch-date decision.

## Doc updates

After each ops session, update this runbook or `maanta-launch-readiness-tracker.md`,
and log any behavior-changing decision in `maanta-decisions-log.md`.
