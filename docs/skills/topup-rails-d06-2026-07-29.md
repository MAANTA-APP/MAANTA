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
  Nothing further is needed in code — provision the keys and the rail appears.
- **Settlement is polled, not pushed.** The screen polls `/api/wallet` every 4s
  for up to 2 minutes. A webhook that lands later still credits the wallet; the
  merchant just sees it on the wallet screen instead of the takeover.
