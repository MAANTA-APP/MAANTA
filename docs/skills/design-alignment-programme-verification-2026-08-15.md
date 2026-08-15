# Design-alignment programme — repo-side verification

**Date:** 2026-08-15
**Session type:** Reviewer (verification only — no code, no design-system edit, no migration)
**Subject:** the design-side alignment programme (12 screens, 6 phases), authored by
the Claude design session working on the wireframes/UI. That document is **not in
this repo** and is not reproduced here.
**Verified at:** `274db18` (branch `claude/design-alignment-handoff-dvehc1`, identical to `origin/main`)

---

## Why this file exists

The programme resolved four conflicts in its brief against MAANTA's frozen rules
rather than applying them silently. Three of those resolutions are correct against
the code. One is not, and a fourth finding is stated backwards in a way that hides
a live defect rather than an absence.

This is the same shape as **D80**: a design-side brief whose premises were mostly
stale, where the act of checking them surfaced a real merchant-facing residue. The
lesson recorded there applies unchanged — verify the premise, not just the
conclusion, because a correct conclusion resting on a false premise will be built
on by the next session.

Per `CLAUDE.md`, the register rows came first: **D103** and **D104**.

## What was checked, and what the repo says

| Programme resolution | Repo evidence | Verdict |
|---|---|---|
| "Free: one active deal" is a naming error — plans are Standard and Elite, the allowance is right | `enforce_deal_limit()` sets `deal_limit := 1` for `standard` and `:= 2` for `elite` (`maanta-app/supabase/migrations/20260630231915_maanta_schema_v3_baseline.sql:318-341`). "Free" is not merely off-vocabulary, it is guarded: `maanta-app/src/lib/__tests__/pricing-copy.test.ts:120-133` fails the suite on "Free" rendered where a price goes, and `frozen-ui-rules.test.ts:58` bans "free plan" outright | **Correct.** Allowance right, name wrong, and the name is enforced |
| View-as-shopper / view-as-merchant do not exist; audited impersonation is unsupported, so previews run over synthetic personas | Zero occurrences of `impersonat`, `view-as` or `viewAs` anywhere in `maanta-app/src`. There is no account-access path to design around | **Correct.** Designing a persona switcher over situations rather than named accounts adds no surface that has to be secured |
| "Node 0 launch credit" is the KES 300 opening credit at activation for the first 100 merchants — a separate promo from the 30-day Elite trial, never merged with it | Both are granted by `activate_merchant`, and they are independently gated: the trial by `elite_trial_slot_available()`, the credit by `node0_opening_credit_kes` / `node0_opening_credit_merchant_cap` under a per-node advisory lock (`maanta-app/supabase/migrations/20260807160000_reland_node_scoped_opening_credit_cap.sql:100-156`). Adjacent in one function, distinct in every gate | **Correct**, and worth keeping correct — the cap is per node since the D73 reland, so the two promos do not even exhaust on the same clock |
| Agent-assisted onboarding is the same merchant-facing form on a shared tablet, "with no agent name or ID field" | False. `maanta-app/src/app/merchant/onboard/onboard-wizard.tsx` renders "Were you helped by a Maanta agent?" as a radiogroup in the review step, over a picker of `OnboardAgent = id + name` values supplied by the page. Shipped via #68 on 2026-07-24, documented in `docs/skills/agent-attribution.md` | **Premise false, guarantee correct** — see below. Registered as **D103** |

## The two findings

### D103 — the agent field is already there

The programme's *guarantee* is exactly what the code does: the merchant is always
the authenticated submitter, the agent id travels as attribution only, and an
absent, malformed or inactive id degrades to `self_serve` rather than blocking or
escalating. That is the trust property worth stating, and it holds at the RPC
boundary, not just in the UI.

What is false is the premise underneath it — that no agent name or ID field is
rendered. One is, and it is the mechanism the guarantee is *about*. A phase built
on "there is no such field" will either remove a ruled surface or draw a second
one next to it, which is how a rule ends up enforced in two places.

The correction belongs to the programme document, which lives on the design side.
Nothing in this repo should change to match the premise.

### D104 — the opening credit reaches the merchant, wearing an internal name

**Closed 2026-08-15, same day, in the follow-up change described at the end of
this document.** The finding as written below stands as the record of what was
wrong.

The programme records the credit as founder-side with no merchant-side surface,
and infers a missing screen. The inference points at something real but describes
it backwards: the grant *does* reach the merchant. `activate_merchant` credits
`account_balance` and writes a `merchant_transactions` row.

The defect is the label. That row's description is the literal
`Node 0 launch opening credit · node0_opening_credit`, and the wallet's label
helper returns the raw description before reaching any of its merchant-voice
fallbacks:

```ts
const label = (t: string, desc: string | null) => {
  if (desc) return desc;
  if (t === "topup") return "Top-up";
  ...
```

So the internal `app_config` key renders verbatim on a merchant money surface,
and nothing anywhere under `maanta-app/src/app/merchant/` explains the credit in
other words — the promise is made only on `(marketing)/merchants` and in the
merchant terms. A merchant meets a grant they were promised as an unexplained
top-up tagged with an identifier meant for operators.

This is the D80 class exactly, and D80's resolution is the precedent: the fix was
a formatter split with the import boundary pinned by a test, not a reworded
literal. Founder ruling first — see D104.

## Programme claims this repo cannot settle

- **D-08 does not exist here.** It is a design-side identifier; the repo register
  has no such row and its IDs are contiguous `D1..D104`. Cross-referencing the two
  numbering spaces by eye is how a row gets re-reported.
- **D82 and D83 are open** in `docs/maanta-drift-register.md` and were carried
  correctly.
- **The landing-screenshot blocker (programme D-c) is already half-registered.**
  `maanta-app/public/` holds no product photography — only `demo/`, `icon.svg`,
  the manifest and the service worker — and the home hero renders a CSS mockup of
  the shopper feed rather than a captured screen. That mockup is **D50**, still
  open. The programme's conclusion (capture is not safe yet, so the landing
  revamp goes last) is sound and needs no new row; it should cite D50 rather than
  open a parallel one.

## What was not done, deliberately

- The programme document itself was **not** written into this repo. It is a
  design-side artifact; committing a reconstruction of it here would create a
  second copy that drifts from the first, which is the exact failure the
  source-of-truth order in `CLAUDE.md` exists to prevent.
- No rows were opened for programme decisions D-b, D-d, D-e, D-f or D-g. Their
  content was not available to this session, and a register row invented from a
  title is not evidence.
- No code changed. Both findings need a founder ruling before a diff, and D104's
  fix spans a migration and a component.

## The D104 fix (2026-08-15)

Founder asked for the merchant-voice label, so D104 was fixed the same day. The
shape of the fix matters more than the copy, and three choices are worth keeping:

**The read side owns the vocabulary, not the write side.** `activate_merchant`
still writes its operator description. Correcting that literal in a new migration
would have fixed nothing that already exists — ledger rows are never rewritten,
so every credit granted to date would keep the old string, and the fix would
depend on a production apply. Detection keys on the `node0_opening_credit:`
provider-reference prefix instead, which is also what the per-node cap counts, so
it cannot drift from the promo without the cap drifting too. Rows already in the
production ledger render correctly with no migration at all.

**The internal reference is suppressed, not shortened.** The detail screen showed
`provider_reference` verbatim, which for this row is the config key joined to the
merchant's own id. A manual grant has no external payment behind it, so there is
no reference worth showing; the transaction id remains what support asks for, on
the ledger row and in the detail URL.

**One formatter, two screens.** Both wallet screens had their own type maps. The
list's had seven entries, the detail's had five of the eight ledger types — so a
`success_fee_arrears` row rendered the raw enum `success_fee_arrears` on the
detail screen. That is a second, smaller instance of the same defect class, found
only because the fix consolidated the maps, and it is fixed by the same change.

Files: `maanta-app/src/lib/merchant-ledger-copy.ts` (new),
`maanta-app/src/app/merchant/(app)/wallet/page.tsx`,
`maanta-app/src/app/merchant/(app)/wallet/[id]/page.tsx`,
`maanta-app/src/lib/__tests__/merchant-ledger-copy.test.ts` (new).

The guard asserts the leak, not the wording: a copy change stays free, while
re-exposing the config key fails. It also pins that both queries still select
`provider_reference` — dropping that column would typecheck, look harmless, and
silently restore the leak, which is the failure mode most likely to come back.

## Verification run

The verification pass itself was documentation only, and was checked with
`npx vitest run src/lib/__tests__/drift-register.test.ts` (12 passed) plus the
full `npm test` (90 files, 708 tests) from `maanta-app/`.

The D104 fix that followed touches shipped merchant surfaces, so it ran the full
CI gate set from `maanta-app/`:

- `npm run lint` — no ESLint warnings or errors
- `npm run typecheck` — clean
- `npm test` — 91 files, 719 tests passing (the 11 new ones are the D104 guard)
- `npm run build` — succeeded, including all three chained post-build gates:
  `check:tokens` clean over 47 rendered files and 402 chunks, `check:canonicals`
  clean over 16 marketing routes, `check:forms` clean

`make db-verify` was **not** run and is not required here: no SQL changed. That is
the point of the fix's shape — the migration is untouched, so there is nothing to
apply to production and nothing for a human to gate.
