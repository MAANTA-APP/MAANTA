---
name: systematic-debugging
description: Use when encountering any bug, test failure, CI red, or unexpected behavior on MAANTA, before proposing fixes. Root cause first, always.
---

# Systematic Debugging

Adapted from obra/superpowers (MIT — see `../LICENSE-superpowers.md`).
MAANTA precedence: root `CLAUDE.md` governs process; this skill implements
its "verify first" rule for debugging.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Symptom fixes are failure. This applies especially when under time pressure,
when "one quick fix" seems obvious, or when previous fixes didn't work —
those are exactly when guessing is most tempting and most expensive.

## MAANTA-specific first moves

Before anything else:

1. **Search `docs/maanta-drift-register.md`.** Many "bugs" here are known,
   tracked gaps. Re-discovering a row wastes the session; rows D3, D5, D6 and
   D9 were each found twice because someone skipped this.
2. **Check which layer owns the behavior.** For money, claims, redemptions and
   roles the enforcement point is the DB — `claim_deal` / `verify_redemption`
   RPCs, RLS policies, migrations — not the UI. A UI symptom often has an
   RPC/RLS root cause (drift row D25 is the canonical example).
3. **Check `frames.json`** (`maanta-app/design/current-reality/`) — a
   "broken" surface may be `design-ahead`, `gated` or `blocked`, i.e. not
   shipped, not broken.
4. **Trees, not SHAs**, when auditing deploy alignment — squash merges mint
   new SHAs, so ancestry checks against promoted branches fail forever even
   when content is identical (drift row D37).

## The Four Phases

Complete each phase before the next.

### Phase 1: Root Cause Investigation

1. **Read error messages completely** — stack traces, line numbers, codes.
2. **Reproduce consistently.** Not reproducible → gather more data, don't guess.
3. **Check recent changes** — git diff, recent commits, config, env.
4. **In multi-component paths, instrument the boundaries.** MAANTA's money
   path crosses several: UI → API route handler → Supabase RPC → RLS →
   table → webhook (Stripe/IntaSend). Log what enters and exits each layer,
   run once, and let the evidence show *where* it breaks before theorizing
   why. Note the demo switch is the DB row `app_config.demo_mode_enabled`,
   not an env var — reading `.env` cannot rule it out.
5. **Trace bad values to their origin.** Fix at the source, not where the
   error surfaced.

### Phase 2: Pattern Analysis

- Find similar *working* code in this repo — a passing SQL suite in
  `supabase/tests/`, a sibling route, a guard test that covers the
  neighboring rule.
- Read the reference completely, list every difference between working and
  broken, however small. Don't assume "that can't matter."

### Phase 3: Hypothesis and Testing

- State one specific hypothesis: "I think X is the root cause because Y."
- Test it with the smallest possible change — one variable at a time.
- Wrong → new hypothesis. **Don't stack fixes on top of fixes.**
- Don't know → say "I don't understand X." Don't pretend.

### Phase 4: Implementation

1. **Failing test first** — vitest for app code, a `supabase/tests/*.sql`
   assertion for DB behavior (see the `test-driven-development` skill).
2. **One fix**, addressing the identified root cause. No "while I'm here"
   refactoring — smallest safe diff is repo law.
3. **Verify** with the real gates (see `verification-before-completion`).
4. **If 3+ fixes have failed, stop.** Each fix revealing a new problem
   elsewhere means the architecture or the assumption is wrong, not the
   hypothesis. Take it to a human — on MAANTA that usually means a drift
   register row plus a decision-queue question, not a fourth attempt.

## Red flags — return to Phase 1

"Quick fix for now" · "just try changing X" · multiple changes at once ·
"skip the test, I'll manually verify" · "it's probably X" · proposing fixes
before tracing data flow · a third fix attempt.

## When investigation finds drift instead of a bug

If the root cause is a gap between what a doc/comment/frozen rule claims and
what the code or live config does: that is drift, not a code fix. Record the
row in `docs/maanta-drift-register.md` **before** writing any narrative, and
close it only with a named guard or `no guard: <reason>` — the register's
schema test enforces this.

## When there is truly no root cause

Environmental / timing / external issues do exist — but 95% of "no root
cause" is incomplete investigation. If the process genuinely ends there:
document what was investigated, implement honest handling (retry, timeout,
plain error state — the UI bar requires designed error states), and add
logging for next time.
