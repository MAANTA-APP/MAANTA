---
name: test-driven-development
description: Use when implementing any MAANTA feature, bugfix, or behavior change — before writing implementation code. Mandatory for money-path, access-control, and frozen-rule work.
---

# Test-Driven Development

Adapted from obra/superpowers (MIT — see `../LICENSE-superpowers.md`).

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** if you didn't watch the test fail, you don't know it
tests the right thing.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it and start from the test. Don't keep it
"as reference" — you'll adapt it, and that's testing after.

Exceptions (ask a human first): throwaway prototypes, generated code, pure
config. "Skip TDD just this once" is not an exception, it's the
rationalization this rule exists for.

## Where tests live on this repo

| Behavior | Test goes in | Run with |
|---|---|---|
| App/lib logic, UI rules, copy guards | vitest under `maanta-app/src/**/__tests__/` | `npm test` (from `maanta-app/`) |
| DB behavior — RPCs, RLS, constraints, money movement | plain-SQL assertions in `maanta-app/supabase/tests/` | `make db-verify` (repo root) |

**A migration without a SQL test is untested** — vitest never touches the
database, and CI's `db-tests` job is the gate that would have caught it.

MAANTA's guard-test culture *is* TDD's endgame: `frozen-ui-rules.test.ts`,
`drift-register.test.ts`, `search-paused-filter.test.ts`,
`pricing-copy.test.ts`, `build-gates.test.ts` each pin a rule so its
violation fails CI. When your change enforces a rule, finish by asking:
which test makes the *reintroduction* of this bug red?

## Red — Green — Refactor

**RED.** One minimal test for one behavior, named for the behavior it pins.
Assert on real code, not on a mock's own choreography.

**Verify RED (mandatory).** Run it. Confirm it *fails* — not errors — and
fails because the feature is missing, not because of a typo. A test that
passes immediately is testing existing behavior; fix the test.

**GREEN.** Simplest code that passes. No extra options, no speculative
generality, no drive-by refactoring — smallest safe diff is already repo law.

**Verify GREEN (mandatory).** Run it again: new test passes, the rest of the
suite still passes, output clean.

**REFACTOR.** Only after green: dedupe, rename, extract. Tests stay green;
no new behavior.

Repeat per behavior.

## Money-path corollary

Any diff that shows a price, moves money, or gates a role goes through
`docs/skills/money-trust-engineering-guardrails.md` — and its test belongs at
the enforcement layer. The RPC is the enforcement point; a vitest asserting
what a component *renders* does not test what `claim_deal` *allows* (drift
row D25 is the standing reminder). Fee values come from `app_config` /
`src/lib/pricing.ts` — a test that hardcodes `30` beside the constant is a
second copy of the fee.

## Bug fixes

A bug fix is TDD with the bug as the spec: write the failing test that
reproduces it, watch it fail, fix, watch it pass. Never fix a bug without a
test — untested fixes don't stick, and the test is usually the drift-register
row's named guard.

## Red flags — delete and restart

Code before test · test written after implementation · test passed on first
run · can't explain why the test failed · "I already manually tested it" ·
"tests after achieve the same purpose" · "too simple to test".

## When stuck

| Problem | Move |
|---|---|
| Don't know how to test it | Write the wished-for API's assertion first; ask a human if still stuck |
| Test needs a huge setup | The design is too coupled — simplify the interface, don't heroically mock |
| DB behavior hard to assert | Look at an existing `supabase/tests/*.sql` suite for the pattern |
