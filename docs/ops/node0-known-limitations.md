# Node 0 — known limitations and pilot constraints

**Status:** CURRENT — compiled 2026-09-01 from production configuration read the
same day, the open drift register, and locked founder decisions. Amended
2026-09-05: the no-offline limit and its operator mitigation added (**D276**).
**Audience:** field operator, admin/founder, agents, and anyone about to promise
something to a merchant or a shopper.
**Re-verify:** the configuration table is live database state. Re-read it before
any pilot day; a stale copy of it here is worse than no copy.

This is the honest list. Nothing here is a defect to fix during field
validation — most of it is deliberate. It exists so nobody promises what MAANTA
cannot currently do.

---

## 1. Configuration, verified on production 2026-09-01

| Setting | Value | Consequence |
|---|---|---|
| `demo_mode_enabled` | `true` | The shopper feed shows a synthetic marketplace. **Deliberate** (founder ruling 2026-08-26): with no genuine supply, an empty marketplace shows a prospect nothing |
| `fast_visit_enabled` | **`false`** | **Fast Visit and MAANTA Points are OFF.** No points awarded, no eligibility stamped, no reward UI |
| `fast_visit_points` | `50` | The award size if the gate is ever turned on. Not in effect |
| `success_fee_kes` | `30.00` | The frozen success fee, all plans |
| `node0_opening_credit_kes` | `300` | Ten redemptions before the merchant spends their own money |
| `node0_opening_credit_merchant_cap` | `100` | Not close to binding at Node 0 |
| `boost_fee_kes` | `500` | Boost price per 24h window |

Also verified the same day: production migration ledger **107/107** (latest
`20260830120000`); **arrivals 0, queue entries 0, reward events 0** — the QR
check-in and counter queue are live and have **never been used in production**;
**215 merchants hold a QR token**, so every shop already has one.

---

## 2. What is live, what is dark, what is unproven

| Capability | State | Note |
|---|---|---|
| Claim → 6-digit code → staff verification → KES 30 fee | **LIVE and proven** | Proven once in production (internal E2E, 2026-08-23) and by the CI money-path SQL suites |
| Merchant self-serve onboarding, phone optional with verified email | **LIVE** | D158 applied 2026-08-23. **Never completed by a real merchant** |
| Shop location by browser geolocation | **LIVE** | D162 applied 2026-08-24. **Never completed by a real merchant at a real entrance** |
| Staff seats by verified email or phone | **LIVE and exercised** | D154; proven in the internal E2E |
| Counter QR + arrival check-in | **LIVE, ungated** | Live the moment a QR is printed. **Zero production use** |
| Counter queue (call-forward) | **LIVE, ungated** | Ships with the QR. **Zero production use** |
| Fast Visit reward + MAANTA Points | **DARK** | `fast_visit_enabled = false`. Shipped, switched off |
| Card top-up (Stripe) | **SANDBOX** | Not live money |
| M-Pesa STK top-up (IntaSend) | **NOT AVAILABLE** | Code and webhook ready; **availability must not be assumed** |
| Paid Elite subscription | **NO PUBLISHED PRICE** | Founder ruling 2026-08-24. Surfaces read "Pricing coming soon" |
| Automated browser E2E in CI | **HAS NEVER EXECUTED** | 167 of 167 runs skipped (D172/E14). Not a Merchant 01 gate by founder ruling; becomes a hard gate before scaled releases |

---

## 3. The hazards, in the order they will bite

### Demo mode is on, and `claim_deal` has no demo guard

A tester browsing `/feed` can claim a synthetic deal, and **no real merchant can
ever verify that code**. During any test the shopper opens the merchant's deal by
**direct link** (`/deals/{id}`), never by browsing.

This has already happened once for real: **D189** — a prospect claimed a
synthetic deal within about eight hours, and it landed in the non-demo count via
**D188**.

### Fast Visit is off, so points do not exist today

Qualification is decided **once, at arrival**, and never re-derived. A later flip
to `true` does **not** retroactively qualify anyone who arrived while it was off.
Never tell a shopper or merchant that points are available.

### The QR never redeems, and the queue is not redemption state

- Scanning the QR records **arrival**. It charges nothing and completes nothing.
- A shopper in the counter queue **has not redeemed**. Dismissing their row does
  **nothing** to their claim.
- Queue entries lapse after about 10 minutes. A lapsed entry never expires a claim.
- The **6-digit code presented to staff** remains the only verification
  mechanism, and staff verification remains authoritative.

### Email is the working authentication path; SMS is not

Phone/SMS sign-in sits behind a paid Clerk plan and is **deferred** — do not
purchase it, do not enable it, and do not tell an operator to wait for SMS.
Verified **email** is an acceptable claim path and an acceptable staff-seat key.

**Use Gmail addresses for the first field accounts** while **D156** is open:
Clerk's shared sender does not reach Microsoft-hosted mailboxes, and that
failure presents as a MAANTA fault when it is not one.

### There is no top-up rail you can promise

The run works on the KES 300 opening credit. Do not promise M-Pesa top-up unless
the founder has confirmed the rail is live.

### The claimed code needs a network to load

`/my-deals` is rendered on the server for every request, and the service worker
on `main` handles push only — it has no `fetch` handler, so nothing is cached.
A shopper with no signal at the counter cannot open or reload their ticket. The
shell says "You're offline. Reconnect to load live deals." rather than
pretending otherwise (D92). **Operator mitigation:** have the shopper open the
ticket while connected and screenshot the six-digit code before walking to the
counter. Offline ticket access exists only in unmerged PR #317 and is unproven
for a signed-in shopper (**D277**). Do not promise it, and do not gate
Merchant 01 on it.

---

## 4. Open items that constrain what may be said or done

Drawn from `docs/maanta-drift-register.md`. Each is open as of 2026-09-01.

| Row | Constraint on the pilot |
|---|---|
| **D136** | "One claim per phone per day" is stated as a frozen product rule and is **implemented at no layer**. Do not describe it as enforced |
| **D144** | The published privacy policy promises erasure "within 14 days" and a retention table that **nothing implements** |
| **D146** | Every page states ODPC registration "is in progress" and **nobody owns the truth of that sentence** |
| **D145** | "Managed backups on" is claimed and has **never been verified**; no restore has ever been performed |
| **D151** | Clerk SMS delivery to +47 / +44 / +254 is unmeasured. Deferred, non-blocking |
| **D156** | Clerk's shared sender does not deliver to Microsoft mailboxes |
| **D159** | Agent attribution (`merchants.onboarded_by`) is not written by `onboard_merchant`, so the agent RLS read does not resolve. **The four-agent acquisition phase must not begin until this is resolved** |
| **D162** | Closes only when a real merchant completes a coordinate-based self-onboarding at their own entrance |
| **D170** | A merchant can enroll any shopper as staff knowing only their email; the shopper's role changes without consent |
| **D171** | `users.is_blacklisted` is displayed in admin and **enforced nowhere** |
| **D188** | `redemptions.is_demo` is not a discriminator — never count on it alone |
| **D134** | Expired `pending` redemptions are never swept and sit in a state nothing resolves |
| **D133** | An admin's Feature action on a merchant is silently reverted by the next redemption outcome |
| **D14/D18/D19** | Demo mode has two independently flippable switches; `make demo-off` touches only `app_config` |

Full detail and current status: `docs/maanta-drift-register.md`. **Search it
before re-reporting anything.**

---

## 5. What is deliberately not built yet

Stating these prevents them being read as omissions:

- Multi-mall / multi-node rollout beyond BBS Mall.
- A mall-operator reporting dashboard.
- Deal drafts and a self-serve Elite payment rail.
- Incrementality measurement — stays out until a merchant asks for it.
- A provenance column recording whether an action was operator-prompted. The
  ruled solution is a **paper** record in the day sheet, not schema.
- Scaled merchant acquisition. Node 0 is **one** genuine independent merchant
  initially, and that is not authorization for more.

---

## 6. The operating state this sits inside

Product design and general engineering are **frozen** (Node 0 Field Validation
Mode, from 2026-08-22) unless field evidence shows a genuine blocker or defect.
Observations are never converted into features without founder approval.

When a field issue is reported: preserve the evidence → reproduce it →
classify it (**blocker / defect / usability observation / feature request**) →
fix only genuine blockers and founder-approved defects → add a regression guard
where warranted → verify → return to rest.
