# Field operator day sheet

**Status:** DRAFT — written 2026-08-22, **updated 2026-09-01** (counter QR
placement, and the runsheet pointer). Not yet run for a full day.
**Audience:** the node manager and agents working the BBS Mall floor.
**Staffing (frozen, decisions log 2026-07-31):** one node manager and up to
four agents per node. Agents are shopper- and merchant-facing on the floor:
onboarding shops, setting up staff accounts, helping at the counter.

This is the day around the work. The visit protocol is
`docs/ops/first-merchant-loop-test.md`; what you leave with a shop is
`docs/ops/merchant-welcome-pack.md`, plus
`docs/ops/merchant-staff-counter-card.md` at the till and
`docs/ops/shopper-pilot-card.md` for a shopper.

**Running Merchant 01?** Use `docs/ops/merchant-01-pilot-runsheet.md` — the full
sequence in one place. Before any pilot day, read
`docs/ops/node0-known-limitations.md`: it lists what is live, what is switched
off, and what must not be promised.

---

## Carry

- Your phone, charged, signed in, and a power bank. Everything you do is on it.
- Printed merchant welcome packs, staff counter cards and shopper cards, with
  your contact already written on them.
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
2. The owner taps **Locate my shop** while standing **at the shop entrance** —
   not inside at the till, not in the corridor. That confirmed pin is what a
   shopper follows to find them, so check it on the map before they submit and
   drag it onto the door if it is off. If the phone refuses or the reading is
   vague, place the pin by hand; it is never a reason to stop onboarding.
3. An admin approves the shop — you cannot approve it yourself.
4. **Print and place the counter QR.** The owner (owner only) opens
   `/merchant/qr/print` and prints the sheet. The **same** code goes at the
   entrance **and** at the till. Print at A5 or larger and test it with your own
   phone before it goes up. The sheet promises no reward, deliberately — do not
   write one on it.
5. Run the **first merchant loop test** before telling them they are live.
6. Leave the welcome pack and the staff counter card, with your contact written
   on both.

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

- [ ] Every visit written up **today** — shop, floor/unit, shop location pin, outcome.
- [ ] Every event classified — demo, internal or genuine external
      (`docs/ops/evidence-classification-guide.md`). Genuine-tagged is not
      automatically external.
- [ ] Every test deal ended or expiring — no test deal left live overnight.
- [ ] Every promise you made recorded, with the date you promised it by.
- [ ] Failures and surprises sent up, even small ones. A pilot is worth only
      what gets reported honestly.
- [ ] **Prompted or not, for every event today.** One line each, for every
      claim, redemption, repost and payment question:

      | What happened | Who | Did we prompt it? |
      |---|---|---|
      | e.g. claim on Deal 01 | Shopper 03 | N |
      | e.g. asked how to top up | Merchant 01 | N |

      "Prompted" means we asked, reminded, suggested or brought it up first —
      in person, by phone, or on WhatsApp. Y is not a failure and is often the
      right answer during onboarding; an unrecorded Y is the failure, because
      nobody can tell afterwards which it was. Nothing else in MAANTA captures
      this, so if it is not on this sheet it is gone.

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
- **The QR records arrival; it never redeems.** A shopper in the counter queue
  has not been served and the shop has not been charged. The 6-digit code the
  shopper presents is still the only thing that completes a redemption, and
  staff verification is still what makes it authoritative.
- **There are no MAANTA Points right now.** `fast_visit_enabled` is `false` on
  production (verified 2026-09-01), so nothing is awarded and no eligibility is
  stamped. Never tell a shopper or merchant a reward is available.

### A fully claimed deal can reopen by itself — say this before it happens

A shopper holding an unredeemed claim is occupying one of the merchant's claim
places. When that claim **expires unused**, the place is released and the deal
can accept claims again.

Tell the merchant this **during onboarding**, not the first time they notice it.
A merchant who sees a full deal reopen and has not been told will reasonably
conclude MAANTA added stock to their offer, changed their limit, or is
double-selling them. It is none of those: it is a place somebody did not use
being handed back.

Two sentences that work at a counter:

> "If someone claims and never turns up, their claim runs out and their place
> goes back into your limit, so the deal can open up again on its own."
>
> "A code that was actually redeemed never frees a place — that one was a sale."

Never say MAANTA "added" claims or "topped up" the deal. The limit is theirs and
it has not moved.

## Things you never do

- Never approve a shop yourself — approval is an admin action.
- Never use a rehearsal account (`aragagency+*`, any demo row) as a real shop.
- Never edit a balance to fix a money problem. Raise it; the ledger is the record.
- Never re-run a verification that reported an uncertain fee outcome — it
  completed, and retrying risks charging twice.
- Never promise a payment rail (M-Pesa top-up) that has not been confirmed live.
- Never promise points, rewards or a paid Elite price. There is no published
  Elite price and no replacement number is authorized — where one must appear,
  the product says "Pricing coming soon".
- Never tell a merchant they are live before the loop test has passed.

### Never, because it destroys the evidence

Founder ruling 2026-08-24. The rules above protect money. These protect the
answer we are at BBS to get.

MAANTA can already be shown to work. What nobody knows yet is whether anyone
**wants** it. Every rule below asks you not to do something helpful, and that is
exactly the point: a claim you asked for measures you, not the shopper. Helping
the pilot succeed and finding out whether it works are two different jobs, and
right now the second one is yours.

- **Never ask a shopper to claim a deal.** Hand them the app and let them
  decide. If you asked, it is not evidence.
- **Never remind a merchant to post another deal.** A repost you prompted is
  not a repost.
- **Never raise the balance, the wall, or topping up.** When the KES 300 runs
  out at around ten redemptions, say nothing and wait. Whether they ask you
  about it, unprompted, is the single most valuable thing this pilot can
  produce. If you mention it first, that measurement is gone and cannot be
  taken again.
- **Never talk a merchant out of a complaint.** Write it down in their words,
  including the ones that sting.
- **Always write down whether we prompted it** — see the close-of-day notes.

**Onboarding is the exception.** Someone has to show Merchant 01 what MAANTA
is, sit with them through the wizard, and train Staff 01 on the counter. That is
push, and it is correct. These rules start the moment the shop is live.

If you are ever unsure whether something counts as prompting, do the quieter
thing and write down what you did.

---

## Standing task — the SMS test (drift D151)

Assigned to the field operator, founder direction 2026-08-22. It is a one-off
measurement, not daily work, but it belongs to whoever holds real phones in the
test cities.

**Why it matters.** Claiming now accepts a verified **email** as well as a
verified phone, because Clerk SMS was not reaching Norwegian, Kenyan or UK
numbers. That widening was made "for now", and this test decides whether it
becomes permanent.

**You can run this now — nothing is blocking it.** An earlier version of this
sheet told you to wait for a Clerk "production instance" to be set up first.
That was wrong: production has been running the production instance since
2026-08-16. Ignore that instruction; it has been withdrawn.

It also means the codes that failed already failed on the real production
setup — so this is a genuine delivery problem, not a setup oversight. Your
measurement is what tells the founder which countries it affects.

**The test.** From a real handset in each country:

- [ ] Norwegian number (+47) — request an SMS code at sign-in. Arrived? Y / N, how long?
- [ ] UK number (+44) — same.
- [ ] Kenyan number (+254) — same.

Record the instance used, the date and time, and the result for each. Send it to
the founder the same day.

**What the answer means.** If the codes arrive, the widened claim gate should be
re-examined rather than left to become permanent by default. If they do not, the
widening stands on its own merits and D151 closes as confirmed. **+254 is the
result that matters commercially** — a code arriving in Oslo or London proves
nothing about Kenyan delivery.

Your result on its own cannot tell the founder whether the cause is the carrier
or a setting in Clerk that restricts which countries it will text. Report what
you observed; the founder pairs it with a check of that setting.

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
