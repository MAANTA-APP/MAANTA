# Wireframes-from-spec prompt — Claude Design session (2026-08-21)

Purpose: a complete, paste-ready prompt for a **fresh Claude Design session**
that wireframes MAANTA from the product specification alone — deliberately
**without** referencing `maanta-app/design/` (claim-and-till wireframes,
wireframe-system PDF, `frames.json`) or any prior design output. It bakes in
the combined method from `docs/ops/claude-stack-setup.md` ("the UI
optimization loop"): UI-UX-PRO-MAX proposes, the frozen rules veto, the
superpowers-style discipline (plan → per-screen acceptance checks → verify)
proves. Spec values below were read from `tailwind.config.ts`, root
`CLAUDE.md` and the route tree on 2026-08-21 — if the spec changes, update
this prompt, don't patch the output.

Scope note recorded at authoring time: the prompt covers the shopper and
merchant apps (the money path) as the required core, with admin/agent/founder
and the marketing site as explicitly optional later passes. The design
session must plan and confirm scope before drawing.

---

## THE PROMPT (copy everything below this line)

You are running a wireframe design session for MAANTA. Work **only** from
the specification in this prompt. Do not ask for, search for, reference, or
imitate any previous MAANTA designs, wireframes, or screenshots — this is a
clean-sheet pass against the spec. Where this prompt is silent, do not
invent a product rule: add the question to an "Open questions" list in your
deliverable and design the honest fallback state instead.

### 1. Product specification

MAANTA is an in-mall deals platform launching at BBS Mall, Nairobi. Shoppers
claim deals in the app and redeem them in person at the shop counter with a
6-digit code. Merchants create deals, prepay a wallet, and verify codes at
the till; a KES 30 success fee is debited from the wallet at verification
(recorded as arrears if the wallet can't cover it). Admins approve
merchants and handle billing, fraud and disputes; on-ground agents handle
merchant acquisition and dispute legwork.

Rules that shape screens (frozen — design around them, never against them):

- **YOU PAY is the shopper's number.** The final price a shopper pays is
  shown identically on the deal tile, the deal detail, and the claimed code
  screen. The itemised breakdown (original price, discount) appears **only**
  on deal detail.
- **Claim → ticket → redeem.** Claiming a deal creates a ticket with a
  6-digit code and an expiry. The shopper shows the code at the counter;
  the merchant enters it to verify. Verification is the moment money moves
  (the KES 30 fee).
- **Verify-anyway.** The counter experience is never blocked by a dispute:
  redemption completes for the shopper; problems route to admin/agent
  handling afterwards. Design dispute entry points as after-the-fact, not
  as counter blockers.
- **Zero-balance gate.** A merchant with no wallet balance cannot create
  new deals. This is a designed state, not an error: say why, show the top
  up path.
- **Paused deals.** A merchant can pause a deal: it disappears from all
  shopper discovery (feed, browse, map, search) and cannot be claimed; a
  stale link shows a plain "deal paused" state. Tickets claimed **before**
  the pause remain valid and verifiable until their own expiry — both
  sides' screens must make that asymmetry unsurprising.
- **Plans.** Merchants start on a 30-day Elite trial, then a 7-day grace
  period, then auto-downgrade to Standard unless they convert to paid
  Elite (KES 3,500/month). The KES 30 success fee applies on all plans.
  Trial/grace/downgrade are designed states on the merchant plan surface.
- **Categories.** Deals have a founder-locked ten-bucket category taxonomy;
  "uncategorised" is a real state. Category chips render only when
  categorised deals exist — design the chip row and its absence.
- **Payment methods.** Wallet top-up via M-Pesa STK push (phone-number
  driven) and card. Design the pending state for STK (the shopper-side
  push happens on the phone, outside the app).

Closed in-app vocabulary — use these words and no synonyms: **claim,
redeem, deal, ticket, code, wallet, top up, success fee, pause, verify**.
Copy is short and literal; no marketing voice inside the app.

### 2. Screens to wireframe

Plan first (see §5), then draw in passes. **Pass 1 (required — the money
path)**:

Shopper (mobile, 430px, bottom navigation):
- `/feed` — deal discovery; category chip row (present + absent states)
- `/browse` and `/search` — list + filter; search empty/no-results
- `/map` — deals by location in the mall
- deal detail — YOU PAY + itemised breakdown, claim action, paused state
- `/my-deals` / tickets — claimed tickets with expiry; ticket detail with
  the 6-digit code (the code card is its own moment: the code is the only
  bare numeral on it, no price on the card)
- `/you` — profile shell (name, phone, notifications entry, help entry)

Merchant (mobile-first, 430px):
- dashboard — wallet balance, today's redemptions, fee context
- `/redeem` — code entry and verification result (success / already
  redeemed / expired / invalid), fee shown **before** the confirming action
- deals list + create deal — including the zero-balance gate state and
  pause/resume with its consequence copy
- `/wallet` + `/topup` — balance, ledger of debits (each KES 30 fee
  attributable to a redemption), top-up flow with M-Pesa pending state,
  arrears state
- `/plan` — trial / grace / Standard / paid Elite states

**Pass 2 (only if asked): admin** (desktop, dense, boring-is-correct):
approvals queue, merchants list/detail, redemptions list/detail (dispute
handling), billing. **Pass 3 (only if asked): agent** (leads) and
**founder** (reports), and the marketing site (separate visual register;
honest claims only).

Every screen ships all applicable states: **loading, empty, error,
offline, expired, denied/blocked** — an empty state always names its next
step. A half-designed state is a defect, not a draft.

### 3. Frozen UI rules (hard constraints, enforced in code on the real product)

1. At most **one amber action per screen**; amber is fill or border only,
   **never** money text.
2. CTA = amber fill `#FDBF2D` + **black** label; a disabled control is
   never amber (use `#F1F1F1` fill).
3. **Money is never coloured** (ink `#111111` only), never in a toast,
   never celebrated.
4. Every state = **icon + word**, readable in greyscale. Failure surfaces
   are dark ink `#141414`, not red; error uses borders and icons in
   `#8C1D18` only — error **body text stays `#111111`**.
5. Warnings and urgency use rust `#9A4A0C` — never red, never yellow.
6. The 6-digit code is the **only** bare numeral on its card; no price on
   the code card.
7. YOU PAY renders identically on tile, detail and claimed code; the
   breakdown appears only on deal detail.

Palette (wireframes are greyscale + these accents only): page `#FAFAF8`,
hairlines `#E5E2DA`, text `#111111` / secondary `#3D3D3D` / muted
`#5C5C5C`, success `#0A5C34`, plus the amber/rust/error values above.
Cards radius 20px, bottom sheets 24px, mobile max width 430px. Motion is
near-zero: sheets slide up, content fades; the sole amber pulse lives on
the claimed-code card border. **No** gradients, glassmorphism, confetti,
celebratory motion, or emoji on money/error/loading surfaces; colour is
never the only carrier of state.

The bar: premium, calm, trustworthy — hierarchy, spacing and typography do
the work. Shopper screens optimise for "I always know what I pay, what I
claimed, how long I have." Merchant screens are sober: money in, money
out, fee before the action, never a surprise debit. Admin is dense and
auditable.

### 4. Using UI-UX-PRO-MAX in this session

Before each surface family, query the ui-ux-pro-max skill and apply what
survives the rules in §3 (on any conflict, §3 wins — treat its
style/palette/typography output as inspiration at most, its `ux` output as
the working material):

- Shopper: `"bottom navigation mobile" --domain ux` · `"card list
  scannable hierarchy" --domain ux` · `"countdown urgency honest" --domain
  ux` · `"empty state next action" --domain ux`
- Merchant: `"form inline validation error" --domain ux` · `"destructive
  action confirmation" --domain ux` · `"loading feedback optimistic"
  --domain ux`
- Admin (if in scope): `"data table dense dashboard" --domain ux` ·
  `"real-time dashboard" --domain chart`
- Pre-delivery, every screen: `"focus not obscured" --domain ux` ·
  `"contrast dark mode" --domain ux` · touch-target and thumb-reach checks

### 5. Working discipline

- **Plan before drawing.** First deliverable is a screen × state matrix
  for Pass 1 (every screen in §2 against loading/empty/error/offline/
  expired/blocked, marking which apply) plus, per screen, 2–4 written
  acceptance checks derived from §1 and §3 (e.g. "redeem result: fee
  visible before confirm; only amber element is the confirm button").
  Present the matrix for approval before wireframing.
- **One surface family per pass**, in the §2 order. Don't interleave.
- **Check before claiming done.** Before presenting a pass, run your own
  verification sweep and show the result: every matrix cell drawn; every
  screen passes its acceptance checks; ≤1 amber per screen; money
  uncoloured everywhere; code card carries no price; YOU PAY identical
  across its three surfaces; all copy inside the closed vocabulary;
  everything legible in greyscale. Report any check you could not perform
  as "not verified", not as passed.
- **Open questions, not inventions.** Anything the spec doesn't answer
  (e.g. exact ticket expiry duration, refund flows, notification content)
  goes on the Open questions list with your recommended default marked as
  *proposal, not spec*.

### 6. Deliverable

Lo-fi wireframes: greyscale + the §3 accents, real hierarchy and real copy
(no lorem ipsum — write the literal in-vocabulary copy), one artboard per
screen-state, grouped by surface family, annotated where a §1 rule shaped
the layout. End with: the completed matrix, the verification sweep
results, and the Open questions list.

---
*(end of prompt)*
