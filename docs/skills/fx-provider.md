# FX provider abstraction (`src/lib/fx/**`)

**Added:** 2026-07-24. **Status:** repo — live provider is a free/keyless tier;
an SLA-backed source is still tracker gate **E9** (not started).

MAANTA charges merchant top-ups in KES. A non-KES card top-up (Stripe supports
USD/EUR/GBP) must be converted to a KES wallet credit. That conversion is the
*only* thing this module does, and it does it in exactly one direction:
**KES per 1 unit of a foreign currency**.

## Why an abstraction

FX used to be inline in `src/lib/currency.ts`: a hard-coded `open.er-api.com`
fetch plus a static fallback table. That works, but it couples the money path to
one provider and makes "swap in a paid/SLA provider before go-live" (gate E9) a
surgical edit of `toKes`. The abstraction makes a provider a small, testable
unit and turns the swap into "add a file, put it in the chain".

## Shape

```
src/lib/fx/
  types.ts      FxRateProvider interface
  remote.ts     openErApiProvider — live rates (open.er-api.com), cached 6h
  fallback.ts   staticFallbackProvider — approximate static KES-per-unit table
  index.ts      the provider chain + kesPerUnit() resolver (the public entry)
```

### The interface

```ts
interface FxRateProvider {
  readonly name: string;
  // KES per 1 unit of `currency` (129 for USD, 1 for KES). null = can't answer.
  kesPerUnit(currency: SupportedCurrency): Promise<number | null>;
}
```

A provider returns `null` — never throws — when it can't answer (unreachable,
malformed response, unsupported pair). That's the signal for the registry to
fall through to the next provider.

### The chain / resolver

`kesPerUnit(currency, chain = [openErApiProvider, staticFallbackProvider])`
tries each provider in order and returns the first **positive, finite** answer.
Because the static fallback answers for every supported currency, a supported
currency effectively always resolves — the system degrades instead of failing a
top-up when live FX is down. `chain` is injectable, which is how the tests run
without network.

### The public entry point is unchanged

`src/lib/currency.ts` still exports `toKes(amount, currency)`; it now delegates
to `kesPerUnit`. Callers (`src/app/api/webhooks/stripe/route.ts`,
`src/lib/merchant-ledger.ts`) did not change. Behaviour is identical:

- live rate present → `amount * (1 / ratePerKes)` (same as the old
  `amount / ratePerKes`);
- live rate absent → `amount * FALLBACK_KES_PER_UNIT[currency]`.

## Adding a provider (e.g. the E9 SLA-backed source)

1. Create `src/lib/fx/<provider>.ts` exporting an `FxRateProvider`.
2. Insert it into `DEFAULT_CHAIN` in `index.ts` **ahead of** the static
   fallback (and typically ahead of `openErApiProvider`).
3. Add unit tests mirroring `remote.ts`'s (success, non-OK, malformed, throw,
   cache).
4. If the new provider applies a margin or has licensing/attribution terms,
   disclose the rate source + margin in
   `maanta-app/legal/refund-and-wallet-policy.md` before enabling non-KES
   charges in production.

## Constraints / cautions

- **Free tier today.** `open.er-api.com` has no SLA and no support contract. Fine
  for KES-only launch and for sandbox non-KES testing; **not** an acceptable
  production source for real non-KES charges — that's gate E9.
- **Cache is per-process, in-memory** (6h TTL). Serverless instances each hold
  their own; it is a courtesy cache, not a rate lock.
- **Rounding / precision:** `toKes` returns a float; money rounding stays where
  it already was (Stripe unit-amount handling, ledger). This module does not
  change rounding behaviour.
- **Direction is fixed** (→KES). If a genuine multi-pair need appears, widen the
  interface deliberately — don't smuggle a second direction into `kesPerUnit`.
