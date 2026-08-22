# MAANTA — Node 0 field validation timeline

**Founder plan, 2026-08-22.** Supersedes nothing in the decisions log — this is
operational sequencing, not a behaviour change. The
[launch readiness tracker](maanta-launch-readiness-tracker.md) remains the gate
status source of truth; this doc is the order the pilot runs in.

The priority changes from **build MAANTA** to **prove MAANTA works with real
merchants and shoppers in Nairobi**. Engineering reopens when field evidence
shows a genuine technical problem, not before.

---

## The sequence

```
Nairobi Field Operator → BBS Mall → Merchant 01 → Staff 01 → Deal 01
  → Shopper 01 → verified email/phone → claim → physical visit
  → verification → success → 5 → 10 → 20 → merchant reposts
```

Running in parallel: **D151** — prove +254 SMS.

| Period | Objective | Evidence |
|---|---|---|
| Week 1 | Field activation | 3–5 credible prospects |
| Week 1–2 | Merchant 01 | Real merchant + genuine deal |
| Week 2 | Staff 01 | Real staff verification access |
| Week 2 | First attribution | First real success |
| Weeks 2–3 | Initial repeatability | 5 successes |
| Weeks 1–3 | D151 parallel | +254 / +47 / +44 OTP evidence |
| Weeks 3–4 | Full controlled test | 10–20 successes |
| Weeks 4–6 | Merchant value | Merchant repost / repeat intent |
| Weeks 6–8 | Controlled expansion | 5–10 active merchants |
| Weeks 6–10 | Commercial / legal | Ready to charge properly |
| Weeks 10–12 | Commercial cohort | 10–20 merchants + real payments |
| Months 3–4 | Node validation | Acquisition + demand + attribution + retention |
| Months 4–6 | Density | 20 → 50 → 75+ merchants if evidence supports it |

### Operating model

- **Founder** — decide → oversee → verify → allocate.
- **Nairobi field operator** — approach → observe → record → report → retest.
  Working docs: [`ops/field-operator-day-sheet.md`](ops/field-operator-day-sheet.md),
  [`ops/first-merchant-loop-test.md`](ops/first-merchant-loop-test.md),
  [`ops/merchant-welcome-pack.md`](ops/merchant-welcome-pack.md).
- **Claude Code** — investigate evidence-backed defects → implement approved
  fixes → verify → stop. No continuous search for work.

### The rule that makes the evidence worth anything

**Watch first. Help second.** A redemption the operator talked the shopper
through is not the same result as one that happened without them. Record the
intervention, every time.

---

## What the repo says before Week 1 begins

Verified 2026-08-22 against migrations, `app_config` defaults, `src/lib/` and the
readiness tracker. Five things the plan should carry into the field.

### 1. The D151 prerequisite is already satisfied — the SMS test can run now

**Correction to the 2026-08-22 record (PR #252).** D151 and the day sheet both
said the SMS test must wait for a Clerk **production** instance to be
provisioned, citing D99. That cited D99's *opening* measurement (2026-08-14) and
missed its **closure**: D99 closed 2026-08-16 on a re-measurement showing
production serving the **production** instance — `pk_live_…` decoding to
`clerk.maanta.app$`, clerk-js from `clerk.maanta.app`, and
`x-clerk-auth-reason: session-token-and-uat-missing` rather than the
`dev-browser-missing` header that identified the development instance. **D59**
re-measured the same thing on 2026-08-19.

Two consequences, both of which change what happens next:

- **No founder/eng provisioning step gates the test.** The operator can run it
  in Week 1 as ordinary parallel work.
- **The SMS failures the founder hit were on a production instance**, so the
  development-instance hypothesis — the whole reason D151 doubted the widened
  claim gate — is dead. Three countries failing on a pk_live instance is not an
  instance limitation. The investigation target moves to that instance's **SMS
  settings**: country permissions / destination allowlist, sender identity, and
  any fraud protections restricting destinations. Check those before concluding
  anything about carriers.

This also *strengthens* the email widening: it was answering a real delivery
problem, not a provisioning oversight.

### 2. The credit runs out at 10 redemptions — and that is where Phase 7 lives

The mechanism, from the migrations:

- Activation grants **KES 300** (`app_config.node0_opening_credit_kes`,
  `20260716084804_node0_opening_credit_on_activation.sql`).
- Each verified redemption debits **KES 30**. So the credit covers exactly
  **10 verified redemptions**.
- Redemption 11 onward still **verifies** — verify-anyway holds, the fee is
  recorded as `owed` (arrears) rather than blocking the counter.
- But `trg_enforce_zero_balance_gate`
  (`20260703190627_zero_balance_gate_deals.sql`) raises
  `INSUFFICIENT_BALANCE_FOR_NEW_DEAL` on **new deal INSERTs** whenever
  `account_balance <= 0`.

The collision: **Phase 6 targets 20 redemptions, and Phase 7's single most
important signal is "the merchant voluntarily posts another deal."** From
redemption 10 onward that post is blocked until the merchant tops up — and
there is no live top-up rail for a Nairobi merchant today (**E6** M-Pesa/IntaSend
is 🔴 blocked on API access; Stripe is sandbox-only by frozen rule). The plan
hits this wall in **weeks 3–4** and does not reach billing readiness until
**weeks 6–10**.

**One option has a deadline.** The credit is granted **at activation** and is not
retroactive, so raising `node0_opening_credit_kes` only helps if it is changed
**before Merchant 01 activates** — i.e. in Week 1. After that, the only route is
a manual ledger credit.

Founder decision, four options, none of them mine to take:

1. Raise the opening credit before Merchant 01 activates (Week 1 deadline).
2. Manually credit the pilot merchant's wallet when it empties (admin action).
3. Accept the wall and treat *"how do I top up?"* as itself the Phase 7 signal —
   a merchant asking to pay is stronger evidence than a merchant reposting on
   free credit.
4. Cap the pilot at 10 redemptions per merchant and widen to a second merchant
   instead of deepening on the first.

Option 3 is worth weighing seriously rather than dismissing: it converts a
blocker into the exact commercial signal Phase 10 exists to test.

### 3. Demo mode is ON, and `claim_deal` has no demo guard

A real shopper browsing `/feed` in Phase 4 can claim a **synthetic** deal, and
nothing in the RPC stops them — the redemption then fails at Merchant 01's
counter for reasons that look like a product bug. The mitigation is already
written into [`ops/first-merchant-loop-test.md`](ops/first-merchant-loop-test.md):
**Shopper 01 opens the real deal by direct link `/deals/{id}`**, not by browsing.
Bind that to Phase 4 explicitly — it is the single most likely way the first
attribution attempt fails for a non-reason.

`demo_mode_enabled` is a database row, not an env var, so it cannot be read from
the repo. Confirm with `make demo-status` before Phase 4.

### 4. Whether email sign-up is actually enabled is a dashboard fact, not a code fact

The plan's central unblocking premise is that a shopper can satisfy the claim
gate with a verified email. The gate itself is correct and shipped —
`VERIFIED_CONTACT_REQUIRED_AT_CLAIM`, enforced in
`src/app/api/redemptions/route.ts` via `currentUserHasVerifiedContact()`. But
`src/lib/launch-auth.ts` carries an explicit **SPEC-GAP**: which sign-up factors
the hosted Clerk widget renders lives in the Clerk dashboard, not in app code.

If email-address sign-up with verification is not enabled on the production
instance, Shopper 01 cannot obtain a verified email either, and Phase 4 stalls at
the milestone the plan calls its most important. **One dashboard check, before
the operator recruits Shopper 01.**

### 5. "All gates passed" is true of CI, not of the readiness tracker

The build gates are green and #252 is merged into `main`. The tracker's **GATE**
items are a different list, and several are open:

- **E2 / E3 / E4** (shopper, merchant, admin journeys smoke-tested) — 🟡 in
  progress. These are precisely what this pilot closes; the plan is their
  evidence, so run it knowing it is closing them.
- **E6** M-Pesa STK — 🔴 blocked on IntaSend access. Feeds finding 2 above.
- **O2** merchant onboarding support owner — open. Founder direction 2026-08-22
  is *"good for now"* for the pilot: accepted, **not closed**, and a named owner
  is still required before launch. Do not re-raise it for the pilot.
- **O5** legal docs lawyer-reviewed — 🔴 blocked on incorporation. This is the
  plan's Phase 9, so the sequencing already agrees.
- **O7 / O8 / O9** (privacy machinery, tested restore, ODPC status) — the tracker
  records each as explicitly **not** gating the controlled pilot.

Nothing here blocks Week 1. It is worth stating only so the pilot is not run
under the belief that the launch gates are behind it.

---

## Open decisions this plan needs from the founder

| # | Decision | Deadline | Why it cannot wait |
|---|---|---|---|
| 1 | How Merchant 01's wallet is handled past 10 redemptions (four options above) | **Before Merchant 01 activates**, if the answer is "raise the credit" | The credit is granted at activation and is not retroactive |
| 2 | Confirm email sign-up + verification is enabled on the production Clerk instance | Before Phase 4 | The plan's unblocking premise rests on it |
| 3 | Whether demo mode stays on during the pilot | Before Phase 4 | Decides whether the direct-link workaround is a workaround or the protocol |
| 4 | O2's named support owner | Before launch, not before the pilot | Founder already accepted current state for the pilot |

---

## What would make this plan wrong

Recorded so a later reader can tell whether it held:

- If **Merchant 01 cannot be found** in Week 1, the constraint is the
  proposition or the corridor, not the product — and no amount of engineering
  changes it.
- If shoppers claim but **do not physically visit**, MAANTA's attribution
  mechanism is sound and its demand assumption is not.
- If the operator has to **guide every step**, the loop works and the product
  does not — Phase 6's intervention measurement is the one that detects this,
  which is why it is measured rather than assumed.
