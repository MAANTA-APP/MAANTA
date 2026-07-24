# Skill — FX provider abstraction (tracker E9)

**Status:** implemented in repo (2026-07-24). Launch default is the keyless
`open.er-api.com` source; swapping to a paid/SLA-backed provider is now a
one-line `configureFxProvider()` call, not a `currency.ts` edit.

## Why

MAANTA card top-ups may be charged in KES/USD/EUR/GBP and are converted to KES
before crediting the merchant wallet (`toKes()` → `record_merchant_ledger_entry`).
The rate source was hardcoded in `src/lib/currency.ts`. Before real non-KES
charges go live we must move to an SLA-backed provider and disclose the rate
source + any margin (see `maanta-app/legal/` and decisions log "Paid FX
provider" pending item). This abstraction makes that swap safe and testable
**without touching the money path**.

## Files

| File | Role |
|---|---|
| `src/lib/fx/types.ts` | `FxProvider` interface + `KesRateMap` (currency-per-KES) |
| `src/lib/fx/open-er-api-provider.ts` | `OpenErApiProvider` — the launch default (keyless) |
| `src/lib/fx/static-provider.ts` | `StaticFxProvider` — fixed map (tests / pinned / offline) |
| `src/lib/fx/index.ts` | active-provider registry, 6h cache, `ratesFromKes()`, `configureFxProvider()` |
| `src/lib/currency.ts` | `toKes()` — consumes `ratesFromKes()`, keeps the approximate static fallback |
| `src/lib/__tests__/fx.test.ts` | provider swap, caching, failure-not-cached, `toKes` conversion + fallbacks |

## The interface

```ts
export type KesRateMap = Record<string, number>; // units of <currency> per 1 KES

export interface FxProvider {
  readonly name: string;                       // for logs/telemetry
  ratesFromKes(): Promise<KesRateMap | null>;   // null on any failure; never throws
}
```

Rates are **currency-per-KES** (matching `open.er-api.com/v6/latest/KES`), so
`toKes(amount, cur) = amount / rates[cur]`.

## Conversion + fallback flow (`toKes`)

1. `KES` → returned unchanged (no provider call).
2. Otherwise `ratesFromKes()` returns the active provider's rates (cached 6h).
3. If a positive rate for the currency exists → `amount / rate`.
4. If the provider failed (`null`) **or** the currency is missing → the
   **approximate** `FALLBACK_KES_RATE` in `currency.ts` (a top-up never
   hard-fails because FX is down; a failed fetch is **not** cached, so it
   retries next call).

## Adding a real provider later (the swap)

1. Implement `FxProvider` (e.g. `src/lib/fx/my-provider.ts`) — read the API key
   from an env var, return `null` on any error, keep it non-throwing.
2. Call `configureFxProvider(new MyProvider(...))` once at server startup
   (e.g. from an instrumentation/bootstrap module), guarded by the key being
   present so dev/CI keep the default.
3. Add the env var to `.env.example` + the Vercel env audit (E10) + the
   `/api/healthz` check (`fx` group) so ops can confirm it's wired.
4. Update `FALLBACK_KES_RATE` if the approximations have drifted.
5. **Human/legal:** disclose the rate source + margin in the wallet/refund
   policy and log the decision in `docs/maanta-decisions-log.md` (the pending
   "Paid FX provider" item). Run a real test-mode non-KES top-up and verify the
   ledger (`charged_amount`, `currency`, KES `amount`) per the launch-audit
   Human-only runbook §C.

## Constraints honoured

- No money-path, RPC, or schema change — pure `currency.ts` internal refactor;
  all existing `currency.ts` exports (`toKes`, `isSupportedCurrency`,
  `isValidTopupAmount`, bounds) are unchanged and still green
  (`currency.test.ts`).
- The provider contract forbids throwing — an FX outage degrades to the static
  fallback, never a failed top-up.
