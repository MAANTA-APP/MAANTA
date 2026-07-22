# Skills: payments rails

Last updated: 2026-07-21 · How money moves in MAANTA and where the code lives.
Update this file after any meaningful payments change.

## The one rule

**Every merchant money movement goes through `recordMerchantTransaction`**
(`maanta-app/src/lib/merchant-ledger.ts`), which delegates to the
`record_merchant_ledger_entry` RPC (service-role-only, SECURITY DEFINER).
The RPC does the ledger INSERT, the balance UPDATE, and idempotency (UNIQUE
constraint on provider reference) in one transaction. Never adjust
`merchants.account_balance` directly, and never reimplement idempotency in a
route handler.

Ledger `transaction_type` values: `topup`, `success_fee`, `success_fee_arrears`,
`boost_fee`, `subscription`, `refund`, `dispute`, `arrears_settlement`,
`fee_reversal`. Amounts are signed KES: positive credits, negative debits.

**One sanctioned exception to "everything goes through `recordMerchantTransaction`":**
admin **success-fee reversals** are applied by the dedicated SECURITY DEFINER RPC
`reverse_success_fee` (it cannot reuse `record_merchant_ledger_entry`, which is
`service_role`-only via `auth.role()` and so rejects an admin JWT). It still
obeys the one rule in spirit — it writes a `fee_reversal` ledger row and settles
arrears first exactly like a top-up, never a bare balance edit. See
`docs/skills/fee-reversals.md`.

**Reconciliation (asserted by `supabase/tests/topup_settles_arrears_test.sql`):**
- `account_balance` = Σ `amount` over every type **except** `success_fee_arrears`
  (the arrears marker is not a balance movement).
- `outstanding_arrears` = Σ `amount` over `success_fee_arrears` (+markers) and
  `arrears_settlement` (−payoffs).

## Top-ups settle arrears FIRST (frozen: ENGINEERING_NOTES §3)

A top-up does **not** just credit the balance. `record_merchant_ledger_entry`,
on a `topup` credit, pays down `outstanding_arrears` by `LEAST(arrears, amount)`
first and credits only the remainder — "arrears settle first, remainder credits
your balance, never pre-credit" (boards M6 arrears / M7). It writes the **full**
`+amount` `topup` row (the real M-PESA/card figure, and the idempotency anchor)
plus a `−settled` `arrears_settlement` row so the ledger reconciles to both the
balance and the arrears. Migration `20260721120000_topup_settles_arrears_first.sql`.
Before this, a merchant who owed arrears kept both the full balance and the full
arrears on top-up — a divergence from the frozen rule; the code now matches it.

## Rail 1: Stripe card top-ups (sandbox during testing)

- **Initiate**: `POST /api/topup/stripe` → creates a Stripe Checkout session.
  Merchant-role check, server-side amount validation (1 to 1,000,000, real
  number), currency must be KES/USD/EUR/GBP (`src/lib/currency.ts`).
  `client_reference_id` = merchant id.
- **Credit**: Stripe webhook (`/api/webhooks/stripe`) on completed checkout →
  converts charged currency to KES via live FX → `recordMerchantTransaction`
  with the payment reference. Duplicate webhook deliveries roll back cleanly on
  the unique provider reference.
- **FX**: live rates from open.er-api.com (keyless), 6h cache, 5s timeout,
  hardcoded approximate fallback rates. ⚠️ Replace with a paid/SLA provider and
  disclose the rate source in `legal/refund-and-wallet-policy.md` before live
  non-KES charges.
- **Refunds/disputes** (same webhook): `charge.refunded`,
  `charge.dispute.created` (hold debit), `charge.dispute.closed`. Idempotency is
  keyed on the underlying **`payment_intent`**, not charge/dispute IDs — a
  dispute resolved via refund would otherwise double-debit. If an unresolved
  dispute hold exists for a payment_intent, the refund debit is skipped and
  logged. Don't "fix" this by keying on event IDs.

## Rail 2: M-Pesa STK via IntaSend (prepared, not assumed)

- `src/lib/intasend.ts` — STK push against sandbox or production base URL
  depending on env; keys via env vars.
- **Credit**: `POST /api/webhooks/intasend` → verifies the webhook challenge,
  only acts on `state === "COMPLETE"`, parses merchant id from
  `api_ref` (`topup:<merchant-uuid>:...`), credits via `recordMerchantTransaction`
  (KES only), then Web Push notifies the merchant.
- Launch stance: keep the rail ready, but **do not assume IntaSend is
  available** — production account/approval is an open item on the launch
  tracker.

## Rail 3: Success fees (internal, no processor)

Charged inside `verify_redemption` → `deduct_success_fee_or_record_arrears`.
Fee amount is a config row hardened to **KES 30.00** with a hard fallback in the
function (migration `20260702094145`). Insufficient balance → arrears entry, not
a failed redemption. Details in `docs/skills/redemption-disputes.md`.

## Failure handling

Bad webhooks (invalid challenge/signature, unresolvable merchant, unrecognized
refs) are written to the webhook failure log via `logWebhookFailure` — check it
during the weekly ops review. Webhooks return 2xx after logging so providers
don't retry forever against a permanent failure.

## Env vars that matter

Stripe secret key, IntaSend keys (+ sandbox/production switch),
`NEXT_PUBLIC_APP_URL` (Checkout success/cancel URLs), Supabase service role key,
`FX_PROVIDER_URL` behavior baked into `currency.ts`.

## Known gotchas

- `MIN/MAX_TOPUP_AMOUNT` is a sanity ceiling per currency unit, **not** FX-aware.
- Fallback FX rates being used at all means the FX provider is broken — investigate.
- Stripe stays in sandbox until a deliberate go-live decision (decisions log).
