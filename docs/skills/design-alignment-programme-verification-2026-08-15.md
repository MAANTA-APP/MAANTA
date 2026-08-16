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

**Closed 2026-08-15.** The finding below stands; what changed is the diagnosis of
where the premise came from — see "The D103 fix" near the end.

The programme's *guarantee* is exactly what the code does: the merchant is always
the authenticated submitter, the agent id travels as attribution only, and an
absent, malformed or inactive id degrades to `self_serve` rather than blocking or
escalating. That is the trust property worth stating, and it holds at the RPC
boundary, not just in the UI.

What is false is the premise underneath it — that no agent name or ID field is
rendered. One is, and it is the mechanism the guarantee is *about*. A phase built
on "there is no such field" will either remove a ruled surface or draw a second
one next to it, which is how a rule ends up enforced in two places.

Nothing in this repo should change to match the premise — attribution is ruled
behaviour, not a design leftover. But see below: the repo did have something to
fix, just not the wizard.

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

## Where the programme's premises actually came from (2026-08-15, Notion read)

The programme document is **not in Notion**. Four searches — by title, by phase
vocabulary, by screen vocabulary, by its own decision IDs — return the operating
pages and `Design Brief v1.4 — frozen scope + 2026-08-03 rulings`, never the
programme. Per the Decisions Log it lives in the Claude Design project
("Maanta production wireframes"), which is not reachable from this session.

Reading the brief changed two conclusions:

**The brief is right about the agent question, and the programme misread it.**
§ "Onboarding — the one conditional question" is precise:

> The form asks **one** conditional question: "Were you helped by a Maanta agent?"
> — Yes / No.
> **No** → no agent field is shown at all. A self-serve merchant is never asked
> for an agent name or ID, and never required to supply one.
> **Yes** → reveals "Select or enter the assisting agent."

Read whole, that is exactly what the wizard does. Read fast, the bolded No-branch
sentence — "no agent field is shown at all… never asked for an agent name or ID" —
is a sentence about a *branch* that reads like a sentence about the *form*. That
is the premise D103 recorded, and its source is a skim, not an error. So there is
nothing false to correct in the brief: the conditional is already there.

**D-a was pointing at something real, in a place it did not name.** The brief's §9
wallet-state table specifies a **new-merchant opening-credit state** with exact
copy — "KES 300 starting credit — your first 10 verified redemptions covered;
thereafter a transparent KES 30 success fee." The wallet renders three states
(arrears, empty, low balance) and no such string exists anywhere in `src`. The
ledger row exists and is now labelled (D104), but the state the brief asks for is
absent. Registered as **D105**, open, pending a founder ruling: the specified copy
derives "10" from KES 300 over the KES 30 fee, and hardcoding that would violate
the never-hardcode-a-fee rule while both values live in `app_config`.

Worth noting the brief's own open-questions section asks for exactly this — item
10 requests ledger row types for the boost, the Elite subscription and the opening
credit. D104 settled one of the three.

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

## The D103 fix (2026-08-15)

The first reading of D103 concluded the repo needed no change, because the false
premise lives in a design-side document. That was right about the document and
wrong about the cause. Asking *where would a design session have got this idea*
points at an artifact this repo owns.

`maanta-app/design/current-reality/frames.json` is what `CLAUDE.md` sends a
session to for "is this shipped, or design-ahead". Its `/merchant/onboard` entry
said:

> "Merchant-authored; agent attribution only."

and listed one file, `page.tsx` — a server component that fetches the agent list
and renders none of it. Every word is true. It also reads as a *guarantee*
("attribution happens, nothing more") with no surface behind it, which is exactly
the premise the programme formed. The inventory did not lie; it described a
property where a design reader needed a screen.

The entry now says the review step renders the question, names
`onboard-wizard.tsx`, keeps the guarantee underneath it, and says plainly not to
design the field away. The `/merchant/wallet` entry got the same treatment for
D104's sibling premise — that the opening credit has no merchant surface — since
both premises came from the same programme and the same silence.

**The guard is a biconditional, deliberately.** `parity-sync.test.ts` asserts the
inventory documents the agent step *if and only if* the wizard asks the question.
Asserting only the forward direction would let a stale entry pass forever after
the field is removed — documentation outliving its surface, which is this drift's
exact shape. It was checked by restoring the old wording and watching the ratchet
fail with the message naming D103, then restoring.

**What this does not fix.** The programme document still carries the false
premise, and it is not in this repo. D80 closed on the same terms and the same
residue. What changed is that the repo can no longer supply the misreading.

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

## The D105 build (2026-08-15)

Founder ruled the count derived, so the state shipped. Three things a reviewer
should check, because each was a judgement rather than a transcription:

**All three numerals are computed, not typed.** The brief's sentence survives
clause for clause — "KES 300 starting credit — your first 10 verified redemptions
covered; thereafter a transparent KES 30 success fee" — but every number in it
comes from data: the credit from the merchant's own ledger row, the fee from
`app_config`, the count from flooring one over the other. A test strips comments
(via the shared D38 lexer, since the module's docblock quotes the brief) and fails
if any of the three literals reappears in code.

**The credit is read from the row, not from `app_config`.** The config value is
today's promo; the row is what this merchant was actually granted. Reading config
would silently restate an older merchant's credit the day the amount changes.

**The trigger was mine to choose at ship time — and was ruled on 2026-08-16.** The
brief scopes the state to a "new merchant" and never says when it stops. It renders
only while the credit is unspent — no success fee charged yet — because the sentence
claims "your first N redemptions covered" and that stops being true at the first
charge. The alternative was writing an unruled sentence for the partly-spent case,
which is inventing product copy.

The founder closed the question on the shipped behaviour rather than commissioning
that second sentence, so the predicate is now the rule and **there is deliberately
no partly-spent state**: a merchant who has redeemed once sees the ordinary wallet,
and the credit remains visible as its ledger row. Recorded in
`docs/maanta-decisions-log.md` under 2026-08-16, and in the `hasUnspentOpeningCredit`
docblock, which is where someone would go to widen it. Widening it would make the
product assert something untrue, so it needs a new ruling and new copy from the
brief — not a predicate tweak.

Two smaller calls: the state renders **last** in the wallet's state chain so a
real warning always wins and no merchant ever sees two states at once; and it uses
a new neutral `info` variant of `InlineAlert` rather than the rust warning tone,
because good news in a be-careful colour is the colour-semantics error D80
corrected on the trial pill. The `info` variant is also not `role="alert"` — an
assertive live region is for a state that changed, not a note that is true on
arrival.

## Verification run

The verification pass itself was documentation only, and was checked with
`npx vitest run src/lib/__tests__/drift-register.test.ts` (12 passed) plus the
full `npm test` (90 files, 708 tests) from `maanta-app/`.

The D103 and D104 fixes that followed touch shipped merchant surfaces, so they ran
the full CI gate set from `maanta-app/`:

- `npm run lint` — no ESLint warnings or errors
- `npm run typecheck` — clean
- `npm test` — 91 files, 732 tests passing (20 of them the D104 and D105 guards)
- `npm run build` — succeeded, including all three chained post-build gates:
  `check:tokens` clean over 47 rendered files and 402 chunks, `check:canonicals`
  clean over 16 marketing routes, `check:forms` clean

`make db-verify` was **not** run and is not required here: no SQL changed. That is
the point of the fix's shape — the migration is untouched, so there is nothing to
apply to production and nothing for a human to gate.
