# Merchant 01 — Node 0 pilot runsheet

**Status:** DRAFT — written 2026-09-01, never run. It becomes a record the first
time it is used; until then every line in it is an instruction, not a result.
**Audience:** the field operator running Merchant 01 at BBS Mall, and the
founder/admin supporting from off-site.
**Purpose:** one document an operator can execute end to end without the founder
narrating each step.

**Read with:** `docs/ops/first-merchant-loop-test.md` (the seven money proofs),
`docs/ops/d158-self-serve-live-test.md` (the onboarding observation checklist),
`docs/ops/node0-known-limitations.md` (what is off, dark or unproven today),
`docs/ops/evidence-classification-guide.md` (how the result gets counted), and
`docs/ops/field-operator-day-sheet.md` (the day around the visit).

> **This runsheet reports rules; it does not set them.** Fees, the credit, the
> grace period, the dispute SLA and the evidence doctrine are frozen in
> `docs/maanta-decisions-log.md` and `CLAUDE.md`. If this sheet and those
> disagree, they win and the difference is a finding — write it down.

---

## 0. Configuration verified 2026-09-01 (CURRENT REALITY)

Read from production `app_config` on 2026-09-01. **Re-read it on the day** —
these are live rows, not constants, and a stale copy here is exactly the failure
mode this project keeps re-learning.

| Setting | Value | What it means on the day |
|---|---|---|
| `success_fee_kes` | `30.00` | KES 30 per verified redemption, all plans |
| `node0_opening_credit_kes` | `300` | Ten redemptions before the merchant spends their own money |
| `node0_opening_credit_merchant_cap` | `100` | Merchant 01 is far inside the cap |
| `demo_mode_enabled` | `true` | The shopper feed shows a synthetic marketplace — see §2 |
| `fast_visit_enabled` | **`false`** | **Fast Visit and MAANTA Points are OFF.** No points are awarded and no reward eligibility is stamped |
| `fast_visit_points` | `50` | The award size *if* the gate is ever turned on. Not in effect today |

Also verified on production the same day: **arrivals = 0, queue entries = 0,
reward events = 0.** QR check-in and the counter queue are shipped and live, and
**no shopper has ever used them in production.** Merchant 01 is the first run.

**Say this out loud before the visit:** the QR is live, the reward is not.

---

## 1. What Merchant 01 is for

It establishes, once, with real people:

merchant self-onboards → real shop location → genuine deal published →
shopper discovers and claims → shopper physically arrives → arrival recorded →
staff see them at the counter → shopper presents the 6-digit code →
authorised staff verify → redemption succeeds → KES 30 debits the wallet →
the evidence is classified correctly.

**It does not test demand.** Shopper 01 is recruited, so cohort one is pushed by
construction (`docs/ops/node0-evidence-protocol-2026-08-24.md` §7). Nothing that
happens here is evidence that shoppers want MAANTA. Do not report it as such.

**Assume it can fail.** Failure capture in §8 is written to the same standard as
success capture, on purpose.

---

## 2. The two hazards that will bite first

### Demo mode is ON

The feed shows hundreds of synthetic shops and deals alongside anything real,
and there is **no demo guard in `claim_deal`** — a tester browsing `/feed` can
claim a synthetic deal, and no real merchant can ever verify that code.

> **Shopper 01 opens Merchant 01's deal by direct link — `/deals/{id}` — never
> by browsing the feed.** Get the link from the merchant's own `/merchant/deals`
> list after the deal is published.

If the till says "not found", check for a demo claim before anything else.

Demo mode stays on by founder ruling (2026-08-26): with no genuine supply, an
empty marketplace shows a prospect nothing. **The founder decides whether it is
turned off for Merchant 01's own onboarding and Shopper 01's claim** — CLAUDE.md
says it must be, and doing so is a production configuration change, so it is the
founder's action, not the operator's and not Claude's.

### Fast Visit is dark

`fast_visit_enabled = false`. So:

- **No points are awarded**, for anyone, however fast they arrive.
- **No reward eligibility is stamped** at arrival — and eligibility is decided
  once, at arrival, never re-derived. A later flip to `true` does not
  retroactively qualify Merchant 01's shoppers.
- **The check-in itself still works.** Arrival is recorded, and the shopper
  appears in the counter queue. Only the reward half is off.

**Never tell a shopper or merchant that points are available.** They are not.

---

## 2b. One thing to brief the merchant on before it happens

**A fully claimed deal can reopen on its own.** An unredeemed claim occupies one
of the merchant's claim places while it is valid; when it expires unused, that
place is released and the deal accepts claims again. A redeemed claim never
frees its place — that one was a sale.

This went live on 2026-09-03 (D223/D236 with the D224 ruling). It is correct
behaviour, and it is also the single most misreadable thing about the new
allocation model: a merchant who has not been told will conclude MAANTA added
stock, moved their limit, or is overselling them.

**Brief it during onboarding, in the merchant's own terms**, alongside the claim
limit itself. Wording that works is in `merchant-welcome-pack.md` §"Your claim
limit, and why a full deal can reopen" and `field-operator-day-sheet.md`.

Never describe it as MAANTA adding or topping up claims. The limit is the
merchant's and it has not changed.

## 3. Before you travel

- [ ] Re-read `app_config` (§0) — or ask the founder to. Do not assume yesterday's values.
- [ ] Confirm with the founder whether demo mode is being turned **off** for this run.
- [ ] Merchant 01 is a **genuine independent shop** — not `aragagency+*`, not any
      `is_demo = true` row, not SKANDI SKAN, not E2E Full Sweep Shop. Those two
      non-demo merchant records already in production are **internal**; Merchant
      01 is the third row and the *first* genuine one.
- [ ] Merchant 01's account uses a **Gmail address** while D156 is open — Clerk's
      shared sender does not reach Microsoft mailboxes, and that failure looks
      like a MAANTA fault when it is not one.
- [ ] Both phones (yours and the merchant's) work on mall wifi **and** data.
- [ ] Printed: merchant welcome pack, staff counter card, shopper card. Your
      contact written on each.
- [ ] You know today's answer to *"who does a merchant call?"* (gate **O2** is
      still open — use the contact the founder gives you; do not invent one).
- [ ] You have something to write on that is not your phone.

---

## 4. The sequence

Run it in this order. Each step names what proves it.

### Step 1 — Merchant self-onboards, with no phone

At the shop, on **their** phone, at `/merchant/onboard`. You may coach; do not
take the phone. Follow `docs/ops/d158-self-serve-live-test.md` as an
**observation checklist, not a script** — record what actually happens rather
than steering the merchant into matching the documentation. A discrepancy
between the browser and the docs **is the finding**.

- Owner phone may be left blank when the account has a verified email (D158).
- **Locate my shop:** the owner taps it standing **at the shop entrance** — not
  at the till, not in the corridor. Check the pin on the map before they submit
  and drag it onto the door if it is off. A refused permission or a vague
  reading is never a reason to stop: place the pin by hand.
- what3words is derived afterwards, best-effort. If it comes back blank,
  onboarding still completes. That is correct behaviour, not a fault.

**Proof:** the shop appears in `/admin/merchants` as `pending`.
**Closes:** D158's outstanding browser evidence, and D162 (one real
coordinate-based self-onboarding at a real entrance).

### Step 2 — Admin approves

An admin approves at `/admin/merchants/[id]`. **You cannot approve it yourself.**

**Proof:** status `active`, attached to Node 0, and the wallet shows the KES 300
opening credit as a ledger entry.

### Step 3 — Print and place the counter QR

New in this runsheet; it did not exist when the earlier field docs were written.

The owner (owner only — a staff seat is redirected away) opens
`/merchant/qr/print` and prints the sheet.

- **One code, two placements.** The same token goes at the **entrance** and at
  the **till**. The shopper's own state decides what the scan does, so nothing
  on the sheet says where it hangs.
- Print at **A5 or larger**. Test it with your own phone before it goes up.
- The sheet deliberately promises **no reward** — do not write one on it.
- If the page says the shop has no check-in code, stop and report it. The
  6-digit code path still works meanwhile.

**Proof:** you scanned it yourself and landed on a MAANTA page naming this shop.

### Step 4 — Staff 01 seat

The owner invites the seat at `/merchant/staff/new`. A **verified email** works
as well as a verified phone (D154); phone is matched first. The seat links on
the staff member's first sign-in.

Leave the **counter card** (`docs/ops/merchant-staff-counter-card.md`) at the
till, contact written on it, and walk Staff 01 through §"Doing it" and the
queue section on the real screen.

**Proof:** Staff 01 signs in and can open `/merchant/redeem` on their own account.

### Step 5 — Genuine Deal 01

The merchant creates it themselves at `/merchant/deals/new`. If they cannot do
it unaided, **that is a finding worth writing down** — do not fix it by taking
the phone and then recording a pass.

- A **genuine** deal the shop actually wants to run. Not a test row.
- Set an expiry long enough to finish the visit and short enough that nothing is
  left live in the mall overnight.
- If deal creation is blocked, the wallet is empty: the zero-balance gate stops
  **new deals**. It never stops verification.

**Proof:** the deal is visible in `/merchant/deals` and you have its
`/deals/{id}` link.

### Step 6 — Shopper 01 claims

Shopper 01 opens the **direct link**, signs in, claims. A verified **email** is
an acceptable claim path (2026-08-22 ruling).

They now hold a **6-digit code** in `/my-deals`, valid until the deal expires
**plus 15 minutes**.

**Proof:** the code is on the shopper's own phone, on their own account.

### Step 7 — Physical arrival and QR check-in

The shopper walks to the shop and scans the QR **with their phone camera**,
landing on `/qr/<token>`.

What is true here, and worth being exact about:

- **The QR records arrival. The QR never redeems.** Scanning charges nothing,
  verifies nothing and completes nothing.
- The scan shows the shopper **only their own claims** at that shop.
- No claim is ever created by a scan.
- If the shopper has no claim at this shop, the page says so and links to the
  shop — it does not become a discovery surface.
- With `fast_visit_enabled = false`, **no eligibility is stamped and no points
  are earned.** Arrival is still recorded.

**Proof:** the shopper's row appears in the counter queue on the staff screen.

**If the scan fails** — bad light, cracked screen, no camera permission, the
sticker photographed rather than scanned — **skip to Step 8.** The 6-digit code
path is complete on its own and always was. A failed scan is a finding, not a
blocked pilot.

### Step 8 — The counter

On the merchant's or Staff 01's device, `/merchant/redeem`:

1. Staff see **Shopper queue** listing checked-in shoppers, **oldest first**,
   with a first name and last initial, the deal, and the arrival time. Staff see
   nothing more — full name, phone, email and history never leave the server.
2. **The queue is not redemption state.** A shopper in the queue has not
   redeemed anything, is not charged, and their claim is untouched. Dismissing a
   row removes it from the queue and **does nothing to the claim**.
3. Queue entries lapse after about **10 minutes**. A lapsed entry never expires
   a claim.
4. Staff tap the shopper's row **or** type the six digits — both lead to exactly
   the same place. **Typing or tapping never charges.**
5. The screen resolves and shows the deal, **what to collect from the shopper**,
   the **KES 30 success fee**, and the balance — *before* anything is charged.
6. Staff press **Confirm redemption**. **That is the only action that charges.**
7. The shopper pays the shop **in person, in full**, as normal. MAANTA never
   touches that money.

**Proof:** a green **Redeemed** result with a collect line and a time.

### Step 9 — Read the money back

- `/merchant/wallet` — exactly **one** `success fee −KES 30` entry for this
  redemption, and a balance lower by exactly that. One redemption, one fee.
- `/admin/redemptions` — the redemption reads as verified, right shop, right time.

### Step 10 — Classify the evidence

Do not skip this. It is what makes the run mean anything afterwards.

Follow `docs/ops/evidence-classification-guide.md`:

- Confirm the redemption is **genuine external** — merchant, deal and redemption
  all non-demo, and the merchant is Merchant 01 rather than one of the two
  internal records.
- Write the **prompted/organic** line for every event of the day (§6 of the
  evidence protocol). Onboarding is legitimately prompted; say so.
- Move the external counter from **0 → 1** only when all of that holds.

---

## 5. The seven money proofs (unchanged)

`docs/ops/first-merchant-loop-test.md` owns these and they are not superseded.
If any one cannot be shown, **the loop is not proven** — record which, and do
not tell the merchant they are live.

| # | Proof | Where |
|---|---|---|
| 1 | Shop exists, `active`, attached to Node 0 | `/admin/merchants/[id]` |
| 2 | Wallet can cover a fee | `/merchant/wallet` |
| 3 | Merchant published the deal themselves | `/merchant/deals` |
| 4 | A real shopper claimed on their own phone | shopper's `/my-deals` |
| 5 | Staff verified at the counter | `/merchant/redeem` |
| 6 | KES 30 debited, **once** | `/merchant/wallet` ledger |
| 7 | Auditable afterwards | `/admin/redemptions` |

Three additions this runsheet adds, which are **observations, not gates** — the
loop is proven without them:

| # | Observation | Where |
|---|---|---|
| 8 | The counter QR is printed and placed at entrance and till | the wall |
| 9 | The shopper's scan recorded an arrival | the staff queue |
| 10 | The evidence is classified external | §10, evidence guide |

---

## 6. When it does not go cleanly

| What you see | What it means | What you do |
|---|---|---|
| Code not found / already used | Wrong digits, already redeemed — **or a demo deal was claimed** | Re-read the code from `/my-deals`; check for a demo claim first |
| Code expired | Past deal expiry + 15 minutes | Cannot be verified. Whether the shop still honours the offer is the **owner's** call. No fee is charged |
| Fee shows as owed / arrears | Wallet could not cover KES 30 | The redemption **still completes**. Say so plainly; do not hide it |
| Fee outcome unknown | The debit result was uncertain | The redemption **still completes** and an admin fraud-review task opens. **Do not retry** — a retry risks a second fee |
| Claimed away from your shop | MAANTA is unsure the shopper is present | Confirm **only** if they are standing there |
| QR scan does nothing / camera won't read it | Sticker, light, or phone | Use the 6-digit code. Record it as a finding |
| Queue shows nobody, shopper says they checked in | Entry lapsed, was dismissed, or the check-in failed | Use the 6-digit code. Record it |
| Shopper asks about points | Fast Visit is **off** | "There's no reward on this yet." Do not promise one |

**The frozen rule above all of these: verify-anyway.** Finish the shopper's
redemption; sort the money out afterwards. **A shopper never waits at a counter
because of a problem between the shop and MAANTA.**

Never resolve a money question by editing a balance. The ledger is the record.

---

## 7. What you must not say

- Do not promise **M-Pesa top-up**. Card top-ups run against Stripe in
  **sandbox**; the IntaSend M-Pesa rail is prepared and **its availability must
  not be assumed**. The run works on the opening credit.
- Do not quote a **paid Elite monthly price**. There is none, and no replacement
  number is authorized. Where a price must appear the product says *"Pricing
  coming soon."* The KES 30 success fee is untouched and stays explicit — never
  blur the two together.
- Do not call the KES 30 a commission, a cut, a transaction fee or a listing
  fee. It is a **success fee**, per verified redemption.
- Do not promise **points or rewards**.
- Do not raise **the balance, the wall, or topping up** (§9).

---

## 8. Failure capture — the same standard as success

If the run stops, capture it properly. A vague failure produces another visit;
a precise one produces a fix.

- [ ] **Which step** (§4 number) and **what exactly the screen said** — the words,
      not a paraphrase. A photo of the screen is the best record.
- [ ] Time (with timezone), the shop, the deal, the account used, the device and
      browser, wifi or data.
- [ ] What the **merchant or shopper said**, in their words — including the ones
      that sting. **Never talk them out of a complaint.**
- [ ] Whether you could work around it, and how.
- [ ] Your own judgement: **blocker**, **defect**, **usability observation**, or
      **feature request**. Only the first two are fixed during field validation,
      and only on founder approval.
- [ ] Send it up the **same day**. Money and the mall relationship go to the
      founder same-day.

**Do not fix the product mid-test**, and do not coach the participant into a
pass. A run that was rescued is not a run.

---

## 9. Rung 3 — the wall, and the silence it needs

At around **ten** verified redemptions the KES 300 opening credit is spent and
the merchant cannot post a new deal. That is **expected and designed**.

> **Nobody raises the balance, the wall, or topping up. Say nothing and wait.**

Whether the merchant asks, **unprompted**, is the single most valuable thing
this pilot can produce, and it can only be measured once. If the operator
mentions it first, that measurement is gone permanently.

- **Pass (strong):** they ask, unprompted, how to keep going or how to pay.
- **Pass (weak):** they notice and ask what happened.
- **Fail:** they do not raise it within a week of hitting the wall. That is the
  most informative negative in the whole run — and only legible if nobody spoke
  first.

---

## 10. Reading the run — what stops the ladder

Both lines are pre-registered in `docs/ops/node0-evidence-protocol-2026-08-24.md`
and were ruled 2026-08-24. **They are not to be adjusted during the run.**

- **Claim → walk-in tripwire.** Read `success ÷ all genuine field claims` at
  every rung. Under roughly **1 in 3**, the ladder **stops for a diagnosis**
  before any further merchant is added. It is a tripwire, not a target — there
  is deliberately no pass percentage, because at n≈10 a precise line is false
  precision. Count **genuine field claims only**; the internal E2E survivor must
  stay out of the ratio.
- **Kill criterion, whichever comes first.** If Merchant 01 plus two further
  genuine merchants have run, **or** eight weeks have passed since Merchant 01
  went live — and there has been no unprompted repost, no unprompted payment
  question and no unprompted claim — the pull hypothesis is unsupported at this
  density. The next decision is **density or premise**, not another merchant and
  not more time.

"Unprompted" means the day sheet's prompted/organic record says `N`. Not that
anyone remembers it that way.

---

## 11. Close-out

- [ ] Test deal ended or expired — nothing left live overnight.
- [ ] Welcome pack, counter card and shopper card left behind, contact on each.
- [ ] Seven proofs recorded pass/fail, individually.
- [ ] Anything the merchant could not do unaided, written down.
- [ ] Every promise made, with the date promised by.
- [ ] Prompted/organic line for every event.
- [ ] Evidence classified (§10 of §4) and the external counter updated **only**
      if it genuinely qualifies.
- [ ] Findings sent to the founder the same day.

---

## What this runsheet does not decide

- **Whether demo mode is off for the run** — founder.
- **Whether `fast_visit_enabled` is flipped on** — founder. It should not be
  flipped mid-run; qualification is stamped once, at arrival, and a mid-run flip
  would split the cohort into two incomparable halves.
- **Who owns merchant support** (gate O2) — founder, still open, "good for now".
- **Whether the pilot proceeds past Merchant 01** — the readiness tracker and
  the evidence protocol, not this file.
- **Any fee, credit, grace period or SLA** — frozen in the decisions log.
