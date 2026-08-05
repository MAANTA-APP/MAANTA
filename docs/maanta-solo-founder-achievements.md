# MAANTA — what the solo founder has shipped (as of 2026-08-05)

Written in response to the founder's question: *"Explain to me what I have
achieved as a solo non-technical startup founder."* Every figure below was
measured against this repo on 2026-08-05, not estimated. Caveats are listed
at the end, per the source-of-truth rules — this is a record, not a pitch.

## The product, in one paragraph

MAANTA is a working, production-deployed in-mall deals platform: shoppers
claim deals and redeem them in person with a 6-digit OTP code; merchants pay
a KES 30 success fee per verified redemption from a prepaid wallet; admins
and on-ground agents handle approval, billing, fraud and disputes. It is
live on Supabase + Vercel, serving `main`, in pre-launch pilot at BBS Mall,
Nairobi (Node 0).

## Measured scope (repo, 2026-08-05)

| What | Count |
|---|---|
| TypeScript/TSX source in `maanta-app/src` | ~40,300 lines |
| App pages (`page.tsx`) | 82 across 5 role surfaces + marketing |
| API route handlers | 39 |
| Database migrations (ledger reconciled with prod, D24 closed) | 85 |
| Plain-SQL money-path test suites | 23 |
| Vitest test files (incl. guards that enforce frozen rules) | 73 |
| Operating/ops/skills docs in `docs/` | 152 markdown files |
| Tracked drift rows in the register | ~70 (majority closed with named guards) |

## What is genuinely hard about what exists

1. **A real money path, enforced in the database.** `claim_deal` and
   `verify_redemption` are RPCs; fees read from `app_config`; YOU PAY is
   computed in exactly one file (`src/lib/pricing.ts`). The zero-balance
   gate, pause gate, and success-fee debit are enforced server-side and
   covered by SQL assertion suites run in CI.
2. **Five distinct role surfaces** — shopper, merchant, admin, agent,
   founder — plus a 17-page marketing site, on one design system with UI
   rules that are ratcheted by tests, not taste.
3. **An operating system, not just an app.** Frozen business rules change
   only via decisions-log entries; every known gap between claim and
   reality lives in a drift register whose schema is itself test-enforced;
   launch is gated by a readiness tracker, not optimism.
4. **Verification culture.** Prod/repo migration ledger reconciled by full
   read-back diff (D24). Deployment alignment verified against Vercel, not
   assumed (D37). Guards exist for token leaks, canonical drift,
   server-rendered forms, duplicate fee declarations, and held marketing
   claims.

## Honest open items (do not read this doc as "done")

- **D73**: the node-scoped opening-credit cap is in the migration chain but
  not in effect — must be relanded before a second node.
- **D59**: decisions log says Clerk is the default; code default is
  Supabase — founder to rule.
- **D39**: the `/how-it-works` 308 still needs its production measurement.
- Demo mode is still on; data is seed/rehearsal; legal content is DRAFT,
  not lawyer-reviewed; Stripe is sandbox; IntaSend availability is not
  assumed. The live gate is the 3-person friends-and-family pilot — the
  readiness tracker, not this doc, is gate-status truth.
