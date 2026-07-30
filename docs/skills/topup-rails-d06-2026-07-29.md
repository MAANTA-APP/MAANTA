# Skills: top-up rails and settlement — drift D-06 closed

Date: 2026-07-29 · Session mode: **Builder** · Branch: `claude/maanta-role-hardening-62ut64`

## What D-06 said, and why it was mis-filed

> "M-Pesa listed first. Design system says M-Pesa is always primary. Shipped code
> runs Stripe as Phase 1." — `blockedOn: code`

`blockedOn: code` was wrong by the time I looked. The rail-order fix shipped in
an earlier pass: `isMpesaTopupConfigured()` reads the real
`INTASEND_API_KEY`/`INTASEND_SECRET`, so **M-Pesa leads wherever credentials
exist and card leads wherever they don't**, and an unprovisioned rail is not
rendered at all. That is not "Stripe forever" — it is the correct permanent
behaviour, and it makes M-Pesa going live an **ops event, not a code change**.

So the design/code mismatch was already resolved. What remained was credentials,
which no code can fix.

## The defect behind the row

Closing it properly meant reading the flow, and the second half of
`R-STRIPE-PHASE-1` — *pending never means credited* — was being violated.

Stripe redirects to `/merchant/topup?stripe=success` when the **checkout session**
completes. The wallet is credited later, by the webhook. The old code did:

```ts
stripeResult === "success" ? { kind: "success", added: 0, newBalance: balance }
```

So on return the merchant saw the **green success takeover**, with **`added: 0`**
and their **pre-payment balance**. It claimed a credit that had not happened, on
a money screen. And the polling effect was gated on the STK path only, so the
card rail **never polled** — which is exactly why frame 13i recorded `credited`
as a missing state. A merchant had to leave the screen and come back to see their
own top-up.

## What changed

`src/lib/topup-settlement.ts` (new) holds the rule, so the money copy lives in
one testable place:

| Stage | Means |
|---|---|
| `confirming` | Payment accepted or in flight; wallet not yet credited. Polls. |
| `credited` | Balance actually increased. Shows the **observed delta**, never the amount typed. |
| `unsettled` | Card charged, credit not yet visible. **Not a failure.** |
| `failed` | Cancelled, or an STK push never accepted. No money moved. |

- `initialStageFromStripeReturn` — a `success` return starts `confirming`, not
  `credited`.
- `settlementOutcome` — only a real balance increase credits; a failed poll keeps
  waiting rather than giving up; a balance that went *down* (a success fee
  debiting mid-poll) never reads as a top-up.
- **The two rails fail differently.** An STK timeout says "No money left your
  account" — true. A card timeout must never say that: Stripe has the money, and
  the false reassurance would invite a second payment. It gets "Payment
  received… check your wallet, and contact support if it doesn't land."

`topup-flow.tsx` renders from it, and `confirming` is now its own screen so
**both** rails show progress — the old inline spinner sat inside the
`mpesaEnabled` branch, so a card return rendered the bare form with no feedback.

## Tests

`src/lib/__tests__/topup-settlement.test.ts` (15). The two that matter most:

- a Stripe `success` return resolves to `confirming`, **never** `credited`;
- a charged-card timeout message is asserted **not** to contain "no money" — the
  exact false statement that would invite a double payment.

Plus: credit uses the observed delta; a null poll keeps waiting; a downward
balance never credits; a late credit still credits past the timeout.

Layer 1 gains a D-06 block asserting the row stays closed and that
`R-STRIPE-PHASE-1` keeps the words *capability-driven*, *pending never means
credited*, and *unsettled*. Negative-tested by flattening the rule text back to
its old wording — one targeted failure.

## Design truth

- **D-06 closed** (`historical / none`) with the code evidence.
- **`R-STRIPE-PHASE-1` rewritten** to describe capability-driven ordering and the
  unsettled-vs-failed distinction.
- **Frame 13i** — `stateCoverage` now `missing: []` (all four states build), and
  it is **smoke-eligible** for the first time: its note said it was waiting on the
  provider order, and the heading "Top up" is stable whichever rail leads, so
  asserting it locks in no primary method. Contract smoke coverage is now 15
  frames.

## Limitations — ops, not code

- **Live Stripe keys are still pending.** `src/lib/stripe.ts` refuses a live key
  unless `STRIPE_ENV=live`, so today's top-ups are sandbox. 13i stays
  `status: blocked` for that reason, and its `captureReadinessReason` now names it.
- **IntaSend credentials are still absent**, so no environment shows M-Pesa yet.
  Provision the keys and the rail appears — but see the follow-up below, because
  "provisioned" has a stricter meaning than it used to.
- **Settlement is polled, not pushed.** The screen polls `/api/wallet` every 4s
  for up to 2 minutes. A webhook that lands later still credits the wallet; the
  merchant just sees it on the wallet screen instead of the takeover.

## Follow-up, 2026-07-30: "configured" now means usable, not present

Found in review on PR #131. `isMpesaTopupConfigured()` checked only that both
keys existed — but a pair that disagrees with `INTASEND_ENV` is **refused on the
money path**:

```
initiateMpesaStkPush()
  → assertKeyMatchesEnv()   // throws, and it throws BEFORE the try block
```

So a staging environment handed live keys, or live keys with `INTASEND_ENV`
unset, would have **offered M-Pesa as the primary action and then thrown** —
`initiateMpesaStkPush` raises rather than returning `null`, so the merchant meets
a broken primary action instead of the card rail that works. Worst at exactly the
moment credentials are first provisioned, which is when a typo is most likely.

The fix is not a new flag. The refusal rule is extracted to `keyEnvMismatch()`
and **both** the capability check and the assert consult it, so they cannot
disagree. `assertKeyMatchesEnv` is unchanged in behaviour and stays as the
money-path backstop for direct API calls — the capability check hides the rail,
it does not replace the guard.

### Why this is not a readiness flag

A separate `MPESA_READY`-style flag was **declined** on PR #131. A flag can
disagree with reality in both directions — off with working credentials, on
without them — which is the "fake rail" failure mode the capability check exists
to prevent, and it would reopen the D-06 ruling that rail order is derived from
provisioning rather than declared. Deriving from the keys, and now from whether
those keys are *usable*, keeps one source of truth.

### What each audience sees

| Audience | On a mismatch |
|---|---|
| Merchant | No M-Pesa option; card leads. `/api/topup` returns the same honest 503 and points at card. |
| Operator | `[intasend] M-Pesa top-up is hidden: <reason>` — **warned once per process**, since this runs on every render and every POST. |

Deliberate split: the merchant gets advice they can act on, not configuration
detail; the operator gets the actual reason, because silence here would look
identical to "no credentials" and send them hunting the wrong thing.

### The invariant, and how it is held

`src/lib/__tests__/intasend-guard.test.ts` (18 tests) asserts parity across a
seven-config matrix — test/live keys × sandbox/live env, both mixed pairs, and
unmarked keys: **the capability answer equals what the money path accepts**,
every time. Either direction of disagreement is a defect — stricter hides a
working rail, looser offers a broken one — which is why the test asserts equality
rather than one-way implication.

Unmarked keys (neither `_test_` nor `_live_`) stay **allowed**, because
`assertKeyMatchesEnv` allows them. Parity with the money path is the property;
tightening only one side would have recreated the bug facing the other way.

Negative-tested by reverting the check to present-only: four config rows plus
four targeted tests fail, naming the direction — *"offered=true but the money
path refuses this config"*.
