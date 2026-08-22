# Field operator day sheet

**Status:** DRAFT — written 2026-08-22, not yet run for a full day.
**Audience:** the node manager and agents working the BBS Mall floor.
**Staffing (frozen, decisions log 2026-07-31):** one node manager and up to
four agents per node. Agents are shopper- and merchant-facing on the floor:
onboarding shops, setting up staff accounts, helping at the counter.

This is the day around the work. The visit protocol is
`docs/ops/first-merchant-loop-test.md`; what you leave with a shop is
`docs/ops/merchant-welcome-pack.md`.

---

## Carry

- Your phone, charged, signed in, and a power bank. Everything you do is on it.
- Printed merchant welcome packs, with your contact already written on them.
- The current support contact (see **Open question** below).
- Something to write on that is not your phone.

---

## Open the day (10 minutes)

- [ ] Sign in and confirm the app loads on mall wifi **and** on data.
- [ ] `/agent` — read your weekly target and your locked leads.
- [ ] Check which of your **leads are close to their 48-hour lock expiring**.
      A lapsed lock is a shop someone else can take.
- [ ] Read anything the founder sent overnight.
- [ ] Confirm you know today's answer to: *who does a merchant call?*

---

## Through the day

### Capturing a lead

At the shop, in `/agent/leads/new`. Capture it while you are standing there —
a lead written up later is a lead written up wrong. The lock is **48 hours**:
respect other agents' locks, and do not let your own lapse silently.

### Onboarding a shop

Onboarding happens **at the shop**, not over the phone:

1. The owner signs up at `/merchant/onboard` on **their** phone.
2. Capture the precise location (what3words) while you are physically there.
   This is what a shopper follows to find them.
3. An admin approves the shop — you cannot approve it yourself.
4. Run the **first merchant loop test** before telling them they are live.
5. Leave the welcome pack, with your contact written on it.

### Helping at a counter

Your job at a till is to keep the customer moving. The frozen rule is
**verify-anyway**: finish the shopper's redemption, sort the money out
afterwards. Never make a customer wait at a counter over a billing question.

---

## Escalation ladder

Counter → agent → admin → founder. Anything touching money or the mall
relationship goes to the **founder, same day**.

| Situation | Who handles it |
|---|---|
| Code invalid, expired or already used | You, at the counter, with the shopper present |
| Merchant disputes a fee | Admin — resolved within **72 hours** |
| Suspected fraud, flagged redemption | Admin review queue |
| Merchant cannot operate the app | You, in person |
| Anything about money or the mall relationship | Founder, same day |

---

## Close the day (10 minutes)

- [ ] Every visit written up **today** — shop, floor/unit, what3words, outcome.
- [ ] Every test deal ended or expiring — no test deal left live overnight.
- [ ] Every promise you made recorded, with the date you promised it by.
- [ ] Failures and surprises sent up, even small ones. A pilot is worth only
      what gets reported honestly.

---

## Things that are always true

- **You pay nothing, the shop pays KES 30, and only on a verified redemption.**
  No listing fee, no cut of the sale, nothing for a failed code.
- **An empty wallet never blocks a redemption.** It only blocks creating new
  deals.
- **Typing a code never charges.** Only an explicit Confirm charges.
- **Money moves between the shopper and the shop, in person.** MAANTA never
  holds it.
- **Demo mode is on.** The feed shows a synthetic marketplace. During any test,
  send the shopper to the deal by **direct link**, never by browsing the feed —
  a demo deal can be claimed and no real shop can verify that code.

## Things you never do

- Never approve a shop yourself — approval is an admin action.
- Never use a rehearsal account (`aragagency+*`, any demo row) as a real shop.
- Never edit a balance to fix a money problem. Raise it; the ledger is the record.
- Never re-run a verification that reported an uncertain fee outcome — it
  completed, and retrying risks charging twice.
- Never promise a payment rail (M-Pesa top-up) that has not been confirmed live.
- Never tell a merchant they are live before the loop test has passed.

---

## Standing task — the SMS test (drift D151)

Assigned to the field operator, founder direction 2026-08-22. It is a one-off
measurement, not daily work, but it belongs to whoever holds real phones in the
test cities.

**Why it matters.** Claiming now accepts a verified **email** as well as a
verified phone, because Clerk SMS was not reaching Norwegian, Kenyan or UK
numbers. That widening was made "for now". The suspicion is that the cause is
not the countries at all: production is measured running the Clerk
**development** instance, and a development instance is where Clerk restricts
SMS. Three countries failing at once looks like one account limitation.

**Before you can run it:** the test must point at a Clerk **production**
instance. That is a founder/eng step. If it has not happened, do not run the
test — you would re-measure the same development-instance failure and learn
nothing. Ask first.

**The test.** With a production instance in place, from a real handset in each
country:

- [ ] Norwegian number (+47) — request an SMS code at sign-in. Arrived? Y / N, how long?
- [ ] UK number (+44) — same.
- [ ] Kenyan number (+254) — same.

Record the instance used, the date and time, and the result for each. Send it to
the founder the same day.

**What the answer means.** If SMS works on a production instance, the widened
claim gate should be re-examined rather than left to become permanent by
default. If it fails there too, the widening stands on its own merits and D151
closes as confirmed.

---

## Open question this sheet cannot answer

**Who owns merchant support during onboarding week?** Readiness gate **O2** is
open — `docs/maanta-launch-readiness-tracker.md` records it as not started, and
`docs/maanta-launch-ops-runbook.md` says the owner is still to be assigned. The
target is a first response within **2 business hours** during mall opening
hours; the person is a founder decision.

**Founder direction 2026-08-22: "good for now".** The pilot runs without the
gate closed. Ask before you hand out any contact, write the answer you were
given onto every welcome pack you leave — and do not hold up a visit over it.
