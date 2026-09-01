# Evidence classification guide — what counts, and what never does

**Status:** CURRENT — written 2026-09-01 from founder rulings already made. It
restates and consolidates doctrine; it does not create any.
**Audience:** founder, admin, field operator, and anyone writing a number into a
report, a deck or a stakeholder update.
**Source of truth:** `docs/maanta-decisions-log.md` (2026-08-24 fifth entry,
2026-08-25 D184, 2026-08-26 D188), `CLAUDE.md` "Two counters, never one", and
`docs/ops/node0-evidence-protocol-2026-08-24.md`.

**Why it exists:** every wrong number MAANTA has reported about itself came from
a query that answered a *technical* question and was read as a *market* answer.
The queries below are the correct ones. Use them rather than writing your own.

---

## 1. The four classes

| Class | What it is | Counts toward external validation? |
|---|---|---|
| **Demo** | Synthetic seed data — shops, deals and rows created by seed scripts to make the marketplace look populated | Never |
| **Internal** | Real database rows MAANTA created while testing itself — E2E sweeps, founder registration exercises, rehearsal accounts | **Never** — kept as technical evidence, never as market evidence |
| **Unclassified** | A row whose provenance nobody recorded | **Never.** Unclassified is not a mild version of external; it is unusable |
| **External** | A genuine independent merchant or shopper who is not MAANTA and was not created by MAANTA | Yes — this is the only class that does |

**Genuine-tagged is not the same as external.** A row can be entirely real —
`is_demo = false` everywhere — and still be internal. See §3.

---

## 2. The rule that breaks naive queries

**`redemptions.is_demo` is not a discriminator. Never count on it alone.**

`claim_deal` never sets the column, so it takes the table default and **every
claim made through the product is tagged `is_demo = false`** — including a claim
against a synthetic merchant. Demo tagging on redemptions comes only from the
seed scripts.

Measured 2026-08-26 (**D188**): of 6 non-demo redemptions, **1** had a non-demo
merchant; **5 were claims against demo merchants**. The long-cited "5 real
redemptions" were one internal success plus four demo-merchant claims.

> **Count field evidence by joining through the parent, always.**

---

## 3. The two counters, never one

Production holds redemptions and merchant records MAANTA created while testing
itself. They are **kept, not deleted** — they are honest evidence that the money
path works — and they must never increment the market ladder.

### Merchants

Two non-demo merchant records exist, and **neither is an acquisition**:

- `bf66a041` **SKANDI SKAN** — created 2026-08-16, a founder registration
  exercise run with a family member. Not a BBS Mall merchant who chose MAANTA.
- `67fe233d` **E2E Full Sweep Shop** — created 2026-08-23 by the full-role E2E
  sweep. It owns the internal `success` redemption below.

A census counting `merchants WHERE is_demo = false` reads **2** and both are
internal. **External field validation: 0 genuine merchants.** Merchant 01 will
be the **third** non-demo merchant row, and the **first** genuine one.

Older documents reading "real merchants: 1 — SKANDI SKAN" predate this split and
mean "1 real *record*".

### Redemptions

- **Technical / internal: 1 non-demo `success`** — redemption `72f95ac8` against
  "E2E Full Sweep Shop", 2026-08-23 21:25 UTC, a survivor of the full-role E2E
  sweep. It proves the money path works.
- **External field validation: 0 genuine merchant successes.** This is the
  counter the 1 → 5 → 10 ladder measures, and it starts at zero until a real
  merchant serves a real shopper.

A query counting `redemptions.status = 'success'` answers the first question and
**never** the second.

---

## 4. The queries

### Genuine (non-demo across the whole chain)

```sql
SELECT count(*)
  FROM redemptions r
  JOIN merchants m ON m.id = r.merchant_id
  JOIN deals     d ON d.id = r.deal_id
 WHERE NOT r.is_demo AND NOT m.is_demo AND NOT d.is_demo
   AND r.status = 'success';
```

Verified on production 2026-09-01: **returns 1** — the internal E2E survivor.

### External (genuine, minus the internal records)

There is no column for this. **Exclude the internal merchants by id**, because
provenance is a fact about how a row was created and nothing in the schema
records it:

```sql
SELECT count(*)
  FROM redemptions r
  JOIN merchants m ON m.id = r.merchant_id
  JOIN deals     d ON d.id = r.deal_id
 WHERE NOT r.is_demo AND NOT m.is_demo AND NOT d.is_demo
   AND r.status = 'success'
   AND m.id NOT IN (
     'bf66a041-fb06-46a9-bcb0-2146e68d278d',  -- SKANDI SKAN, founder registration exercise (created 2026-08-16, now suspended)
     '67fe233d-563c-4d56-b81e-27ed78eb160f'   -- E2E Full Sweep Shop, full-role E2E sweep (created 2026-08-23)
   );
```

Verified on production 2026-09-01: **0**. Both UUIDs were read back from
production the same day.

> **This exclusion list is maintained by hand and that is a known weakness.** It
> is correct today because there are exactly two internal merchants and both are
> named in the decisions log. It will not stay correct by itself. If a third
> internal record is ever created, it must be added here **on the day it is
> created**, or every count after that is silently wrong. See §7.

### Claim → walk-in conversion (the tripwire)

```sql
SELECT r.status, count(*)
  FROM redemptions r
  JOIN merchants m ON m.id = r.merchant_id
  JOIN deals     d ON d.id = r.deal_id
 WHERE NOT r.is_demo AND NOT m.is_demo AND NOT d.is_demo
   AND m.id NOT IN ( /* the internal merchants, as above */ )
 GROUP BY r.status;
```

Conversion = `success ÷ all rows`. `expired` means **claimed and never came**.

Read it at every rung. Under roughly **1 in 3**, the ladder stops for a
diagnosis before another merchant is added — a tripwire, not a target, with
deliberately no pass percentage (`node0-evidence-protocol-2026-08-24.md` §4).

---

## 5. Failure is never zero

If a query, a page or a report cannot read its number, it says so. **It never
renders `0`.**

`0` is a measurement: nobody redeemed. *Unavailable* is the absence of a
measurement. Collapsing the second into the first invents evidence — usually
reassuring evidence, since a zero on a failure surface reads as "nothing bad
happened".

The same rule applies to prose. "No redemptions yet" and "we could not read the
redemption count" are different sentences. Write the true one.

---

## 6. Prompted or organic — the record that cannot be recovered later

Nothing in the schema records whether an action was operator-prompted. So push
and pull are indistinguishable in the data, **today and permanently**: in three
months nobody will be able to reconstruct whether a September claim was organic.

The fix is paper, in the day sheet's close-of-day notes — one line per event:

| Event (claim / redemption / repost / payment question) | Who | Prompted by us? Y/N |
|---|---|---|

- **"Prompted"** means we asked, reminded, suggested or brought it up first — in
  person, by phone, or on WhatsApp.
- **`Y` is not a failure** and is often the right answer during onboarding. An
  **unrecorded** `Y` is the failure, because nobody can tell afterwards which it
  was.
- **"Unprompted" is defined by this record, not by recollection.** A signal with
  a `Y` does not count. That is the entire reason the record exists.

Every other decision in the Node 0 protocol is reversible. This one is not — an
unrecorded provenance is gone.

---

## 7. Before you publish a number

- [ ] Which class is it — demo, internal, unclassified, or external?
- [ ] Did the query **join through merchant and deal**, not just read
      `redemptions.is_demo`?
- [ ] Are the two internal merchants excluded?
- [ ] Is the internal-merchant exclusion list still complete?
- [ ] Is it a **read failure** being reported as a zero?
- [ ] Does the sentence say whether the activity was prompted?
- [ ] Is the sample small enough that a percentage is false precision? At n≈10,
      report **counts**, not rates, and never a causal claim.
- [ ] Would a reader in three months be able to tell which class this was from
      the sentence alone? If not, rewrite it.

---

## 8. What this guide does not decide

- Whether to add a provenance column to the schema. That is engineering work and
  **is not authorized**; the paper record is the ruled solution.
- The ladder's pass lines — `node0-evidence-protocol-2026-08-24.md` §4 owns them.
- Whether a given merchant is internal or external. That is a founder judgement
  recorded in the decisions log, not something derivable from the row.
