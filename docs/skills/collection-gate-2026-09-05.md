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

## Verified on production (2026-09-05)

`tsc` clean · `next lint` clean · suite green · `next build` green · main CI and
db-tests green on `03817c9`. Then the deployed gate was checked at four levels,
with no test token at any of them:

| Level | Check | Result |
|---|---|---|
| UI | GET `/waitlist` and `/merchants/join` on production | Closed panels; no collecting form on either |
| API | POST both endpoints with a deliberately invalid body (consent missing) | 403 with the closed message from both. A 400 would have meant the gate sat after validation; 403 proves it precedes it |
| Runtime logs | Vercel production logs filtered to status 403 | Both requests present at 11:21 UTC on the `03817c9` deployment, no errors |
| Database | Counts before and after | 2 waitlist rows (both TEST), 0 merchant leads, newest row unchanged at 2026-09-04 20:52 UTC |

The POST originated from an external sandbox because this session's network
policy blocks the production domain. Not verified: the closed panel in a real
browser (server-rendered HTML only).

### CURRENT REALITY — 5 September 2026

Founder's record of the production state at closure of #325:

- `03817c9` is deployed and READY.
- Production collection is CLOSED.
- Shopper `/waitlist` has no collecting form.
- Merchant `/merchants/join` has no collecting form.
- Both corresponding APIs reject unauthorised production submissions with 403 before validation.
- Database remained 2 TEST waitlist rows / 0 merchant leads before and after verification.
- No genuine waitlist data was collected by the verification.
- Main CI + db-tests are green.
- This does not change external field validation, which remains 0.

**Reading the closure report.** The verification report ended "Nothing was
committed, no PR opened, no merge." That sentence describes the verification
step only. PR #325 itself was merged as `03817c9` before the verification ran;
the verification added no commits on top of it.

## Operational rule (founder, 2026-09-05)

**Nobody reopens either production collection surface simply because the
website, marketing assets, social accounts or incorporation become ready.**
Opening collection is a separate founder-controlled event after its
prerequisite gates pass. A marketing deploy must never turn acquisition on as
a side effect. The guard in `collection-gate.test.ts` pins the state; the flip
protocol above is the only path, and it carries its own record.

With the gate proven, collection testing stops here. The next work is the
founder review of the kit at `/admin/growth/content/kit`, then the presence
sequence: brand/search baseline → social account setup → SEO optimisation →
content production → friends-and-family UX testing without collection →
incorporation/compliance → the explicit founder decision to open collection.
