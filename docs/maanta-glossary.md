# MAANTA glossary

**Status:** CURRENT — written 2026-09-01 from the product's own vocabulary,
verified against code and production configuration.
**Audience:** everyone. Shoppers, merchants, staff, agents, admin, marketing,
legal and investors should all use these words to mean the same things.

MAANTA has a **closed vocabulary**. Using a near-synonym is not a style
preference — several of the substitutions below change the commercial or legal
meaning of a sentence.

---

## Core loop

**Deal** — an offer a merchant publishes. Not a voucher, a coupon or an offer
code.

**Claim** — a shopper reserving a deal and receiving a code. Claiming costs
nothing and moves no money. Not "book", "buy", "reserve" or "order".

**Code** — the **6-digit** number a shopper presents at the counter. The
canonical verification mechanism. It is **presented and typed, never scanned to
pay**.

**Redeem / redemption** — the completed event: staff verified the code and the
shopper was served. Not "sale", "transaction" or "purchase".

**Verify / verification** — the staff action that completes a redemption. **Staff
verification is authoritative.** Typing or resolving a code charges nothing; only
an explicit **Confirm** charges.

**Grace period** — **15 minutes** after a deal ends during which a claimed code
is still valid.

**Attribution** — MAANTA's core output: the record that *this shopper* physically
came to *this shop* because of *this deal*.

---

## Money

**Success fee** — **KES 30** per verified redemption, all plans, debited from the
merchant's wallet at verification. **Never** a commission, a transaction fee, a
cut, a take rate, a listing fee or a percentage of the sale. MAANTA is paid for
an attributed visit, not for the transaction.

**Wallet** — the merchant's prepaid balance that success fees are drawn from.

**Top up** — adding funds to a wallet. Card top-ups run in **sandbox**; the
M-Pesa rail is prepared and **its availability must not be assumed**.

**Arrears** — a success fee recorded as owed because the wallet could not cover
it. The redemption still completed. Top-ups settle arrears first.

**Opening credit** — **KES 300** of MAANTA credit granted to a Node 0 merchant at
activation. Ten redemptions before they spend their own money.

**Zero-balance gate** — an empty wallet blocks publishing **new deals**. It
**never** blocks a verification.

**Verify-anyway** — the frozen rule that the shopper's redemption completes even
when the fee outcome is uncertain. Billing is resolved afterwards, auditably.

**Fee reversal** — an admin crediting KES 30 back after upholding a dispute.
Resolved within **72 hours**. The original redemption and fee rows are never
modified.

**Boost** — a paid placement, **KES 500** per 24-hour window.

**Elite** — the paid merchant tier. **30-day trial**, then a 7-day grace period,
then auto-downgrade to Standard. **No published price**, and none is authorized —
surfaces read *"Pricing coming soon."*

**Standard** — the default merchant tier.

---

## Arrival, queue and rewards

**Counter QR** — the printable MAANTA code a merchant puts at their **entrance
and their till**. One token per merchant; the same code in both places.

**Check in / arrival** — a shopper scanning the counter QR. It records **arrival
only**. **The QR never redeems**, never charges and never completes anything.

**Shopper queue** — the list of checked-in shoppers on the staff Redeem screen,
oldest first. **The queue is not redemption state.** A shopper in the queue has
not been served, and dismissing their row does nothing to their claim. Entries
lapse after about 10 minutes without affecting anything.

**Fast Visit** — a qualifying **arrival within 15 minutes of claiming**. It is
about how quickly the shopper *arrived*, **not** how quickly staff verified.
Qualification is decided **once, at arrival**, and never re-derived. **Currently
switched off** (`fast_visit_enabled = false`, verified on production 2026-09-01).

**Reward window** — the 15-minute Fast Visit window. **Its expiry does not expire
the claim** — the claim continues untouched; only the reward is off the table.
Never describe it as expiry.

**MAANTA Points** — promotional loyalty rewards. **Not cash, not KES, not
transferable, not purchasable, not withdrawable, and never a purchasing
currency.** Never rendered as money or with money styling. Currently **none are
available**.

---

## People and roles

**Shopper** — the person who claims and redeems. Pays the merchant directly, in
person, in full. MAANTA is free for shoppers.

**Merchant / shop** — the business. "Partner" is reserved for a signed
relationship, and none exists.

**Merchant owner** — the account that onboards, publishes deals, holds the
wallet, invites staff and prints the QR.

**Merchant staff / staff seat** — a counter user who can verify codes. Linked by
verified phone **or** verified email.

**Agent** — a MAANTA field person doing merchant acquisition and floor support.

**Node manager** — the operator running a node's floor team.

**Field operator** — the person running a pilot visit; node manager or agent.

**Admin** — approves merchants, reviews fraud and disputes, reverses fees.

**Founder** — the decision layer. Every product, commercial and evidence ruling.

---

## Places and phases

**Node** — one mall. The unit of expansion.

**Node 0** — BBS Mall, Eastleigh, Nairobi. The sole proving ground until product
market fit.

**Merchant 01** — the first genuine independent merchant. Not SKANDI SKAN and not
E2E Full Sweep Shop, both of which are internal records.

**Node 0 Field Validation Mode** — the operating state from 2026-08-22. Product
design and general engineering are **frozen** unless field evidence shows a
genuine blocker or defect.

**Cohort one** — Merchant 01 plus the recruited shoppers. Tests the **mechanism**.
It **cannot** test demand, because every participant is pushed by design.

**Pull phase** — the separate, named phase after cohort one: a deal goes live,
nobody is messaged, and the question is whether anything happens at all.

---

## Evidence

**Demo** — synthetic seed data. Never evidence.

**Internal** — real rows MAANTA created while testing itself. **Technical
evidence, never market evidence.** Kept, never deleted.

**Unclassified** — a row whose provenance nobody recorded. Unusable, not a mild
form of external.

**External** — a genuine independent participant. The **only** class that counts
toward field validation.

**Genuine** — non-demo across merchant, deal and redemption. **Genuine is not the
same as external** — see Internal.

**Prompted / organic** — whether the team asked, reminded or suggested first.
Recorded on paper, at the time; it cannot be reconstructed later. A prompted
claim measures the operator, not the shopper.

**Claim → walk-in** — successful redemptions ÷ all genuine field claims. A
**tripwire, not a target**.

**The wall** — the point at ~10 redemptions where the opening credit is spent.
**Nobody raises it with the merchant.**

**Kill criterion** — the pre-registered failure line, set 2026-08-24 and not
adjustable during the run.

---

## Product mechanics

**Demo mode** — `app_config.demo_mode_enabled`. When on, synthetic rows appear in
shopper discovery. **Currently on**, deliberately. Note it is a **database row**,
not an environment variable, so it cannot be checked by reading `.env`.

**Paused** — a merchant has temporarily withdrawn a deal. It disappears from
**all** shopper discovery immediately and new claims are blocked; codes already
claimed stay valid and verifiable.

**Fully claimed** — a deal has reached its claim cap. It remains **discoverable
and browsable** — "discoverable is not claimable" — but a surface advertising an
available claim must exclude it.

**Guardian** — the verify-time fraud checks (velocity, geofence, collusion). It
raises holds and flags. **It is not a guarantee.**

**Drift register** — `docs/maanta-drift-register.md`, the open/closed record of
every known gap between what MAANTA claims and what is true. **Search it before
reporting anything as new.**

---

## Words that are wrong

| Wrong | Right |
|---|---|
| commission, cut, take rate, listing fee, % of sale | **success fee** |
| sale, transaction, purchase, conversion | **verified redemption** |
| book, buy, reserve, order | **claim** |
| scan to pay, check out | **redeem** / **verify** |
| redeem (of a QR scan) | **check in** |
| credit, cashback, currency, KES (of Points) | **MAANTA Points**, promotional, no cash value |
| voucher, coupon, offer code | **deal** |
| vendor, partner | **merchant**, **shop** |
| launch, rollout, going live | **Node 0 pilot**, **field validation** |
| customers, users (as a traction count) | say the **class** — demo, internal or external |
