# The collection gate (2026-09-05)

**Status:** built, CLOSED. **Authorisation:** founder ruling of the same day
(register D274), after the branch-readiness report for the channel rulings
established that the public waitlist was open on main with no gate in code.

## What it is

One constant, `COLLECTION_GATE` in `maanta-app/src/lib/marketing/collection-gate.ts`,
read by four surfaces:

| Surface | Closed | Open |
|---|---|---|
| `/waitlist` | "We're not taking names yet." No form, no notify-me | Role selection and the form |
| `/merchants/join` | "We're not registering shops yet." No form | The interest form |
| `POST /api/waitlist` | 403 before validation, rate limit or any write | Normal |
| `POST /api/merchants/interest` | 403, same ordering | Normal |

**A verified TEST entry passes in every state.** The gate check runs after the
TEST verdict (`WAITLIST_TEST_TOKEN`) and before everything else, so an internal
tester with the link sees the form, submits, and lands as a TEST row held out
of every real count — the third step of the launch sequence stays testable
while the fifth is closed.

The Growth console shows the state in the overview header and on the Waitlist
screen.

## Why a constant, not an environment variable

Opening genuine collection is the incorporation/compliance gate of the launch
sequence — a governance act, not a dashboard toggle. A constant flips in a
commit, the commit carries the record, and the guard forces the record to be
deliberate.

## How to open it

In one commit:

1. Change `COLLECTION_GATE` to `"open"`.
2. Update the first test in `collection-gate.test.ts` to expect `"open"`.
3. Add a decisions-log row citing, explicitly: the incorporation/compliance
   gate passed; the D269 channel posture re-examined (email approved; WhatsApp
   and SMS still not activated unless separately ruled); the D270 compliance
   recheck done.
4. Update the register: D274's disposition gains the opening date.

Nothing else changes. The forms, endpoints and console read the constant.

## Baseline at closure

2 internal test rows in the mirror, 0 genuine external signups. The console
reads Real 0 / Test 2. That baseline is what genuine acquisition will be
measured against when the gate opens.

## Verified, and not

`tsc` clean · `next lint` clean · suite green · `next build` green. Not
verified: the closed panel has not been rendered in a browser; the 403 has not
been exercised against production.
