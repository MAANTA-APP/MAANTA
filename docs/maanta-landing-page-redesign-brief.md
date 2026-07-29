# MAANTA landing page redesign brief

**Date:** 2026-07-29
**Scope:** `maanta-app/src/app/(public)/page.tsx` + `landing-early-access.tsx` + `/for-merchants`
**Status:** Analysis complete — awaiting founder ruling on Decision 1 before build
**Method:** Read of live code, live web research, WCAG audit against the actual token palette

---

## TL;DR — the five things that matter

1. **The hero has three competing CTAs.** Single-CTA pages convert ~13.5% vs ~10.5% for pages with five or more. This is the highest-leverage fix on the page.
2. **The homepage has no merchant door at all.** It is 100% shopper-facing. `/for-merchants` exists but is a 22-line stub with a `dashboard screenshot` placeholder div.
3. **There are zero trust signals.** No merchant count, no redemption count, no proof of any kind.
4. **`LandingEarlyAccess` hardcodes `segment: "shopper"`.** A merchant who types their email into the homepage box is tagged as a shopper. This contradicts a frozen business rule.
5. **The team already got the boring things right.** Buttons are 48px, reduced-motion is handled, the palette is contrast-audited. The gaps are structural, not cosmetic.

---

## STEP 1 — Competitive & evidence baseline

Live research, not recollection. Two things were checked: the Kenyan loyalty market, and what the conversion evidence actually says about hero structure.

### Kenyan market context

- Kenya's loyalty market is projected at **~US$194.3M in 2026**, growing ~15% CAGR to ~US$339.6M by 2030.
- The loyalty-software sector in Kenya is **thin — roughly 12 companies**. Named players: eGift Africa (coalition programs, multi-merchant point redemption, branded apps), Paid (points-based rewards, omnichannel comms).
- **Nobody in that set is doing in-mall, OTP-at-the-counter, pay-per-verified-redemption.** MAANTA's wedge is real and currently uncontested in the local software landscape.

**Implication for the page:** MAANTA does not need to out-feature anyone. It needs to explain a *new mechanic* (claim → code → counter) fast enough that a first-time visitor gets it in one screen. The competitive risk is comprehension, not differentiation.

### Conversion evidence (applies directly to the current hero)

| Finding | Source consensus |
|---|---|
| Single-CTA pages convert **13.5%** vs **10.5%** for 5+ CTAs | ~32% relative lift for single CTA |
| Whirlpool cut email CTAs 4 → 1 | **+42% clickthrough** |
| Same CTA repeated at each scroll fold | **+20–35%** vs one-and-done |
| Primary CTA above the fold | **+20–30%** conversion lift |

The critical nuance: **one *goal*, repeated at scroll folds, is not "multiple CTAs."** Three *different* destinations in one hero is. That is exactly what the current page does.

**Sources:** [Foundry CRO CTA benchmarks 2026](https://foundrycro.com/blog/cta-button-conversion-rate-benchmarks-2026/) · [SaaS Hero CTA placement](https://www.saashero.net/design/landing-page-design-cta-placement/) · [Landy hero design practices](https://www.landy-ai.com/blog/hero-section-design) · [Tracxn — Kenya loyalty startups](https://tracxn.com/d/explore/loyalty-software-startups-in-kenya/__V5UQ3KkTeOFPAjmMvoTysyqcpSBoYvuaM-gyUBUKg0o/companies) · [PayNXT360 Kenya loyalty databook](https://www.marketresearch.com/PayNXT360-v4075/Kenya-Loyalty-Size-Forecast-Spend-45433010/)

---

## STEP 2 — Messaging framework

### Decision 1 (needs a founder ruling before any build)

The brief asked for three *merchant* hero variants. Before writing them, the prior question has to be settled:

**Should the homepage be merchant-first, shopper-first, or split?**

The recommendation is **shopper-first hero + a persistent, prominent merchant door**, and here is why:

- Merchant acquisition at Node 0 is an **in-person and WhatsApp motion** at BBS Mall (per the O2 gate). Merchants are not arriving cold via organic web traffic. The website is not the merchant acquisition channel right now.
- Shoppers *are* arriving via the web and the installed PWA. They are the audience the homepage actually serves.
- A merchant-first homepage would optimise for traffic that does not yet exist, and degrade the experience for traffic that does.
- But a homepage with **no merchant door at all** fails the merchant who was told "check out maanta" by an outreach rep — which is exactly the O2 motion. That handoff is currently broken.

**Proposal:** homepage stays shopper-primary. `/for-merchants` becomes the *real* merchant landing page with its own full hero and its own three variants. The homepage carries one persistent, unmissable merchant entry point (header nav + a dedicated band lower on the page).

### Merchant hero variants — for `/for-merchants`

All three lead with the frozen KES 30 model, because "pay only when it works" is the single most trust-building fact MAANTA has for a cash-sensitive Nairobi SMB.

**Variant A — Risk reversal (recommended)**
> **You only pay when a customer walks in.**
> KES 30 per verified redemption. No listing fee, no percentage cut, no monthly minimum. Your first 30 days are free.
> `[List your shop]`

**Variant B — Outcome-led**
> **Turn your chalkboard offer into counter traffic.**
> Post a deal in two minutes. Shoppers claim it on their phone and bring a code to your till. You pay KES 30 only when a code is verified.
> `[List your shop]`

**Variant C — Peer proof** *(hold until real numbers exist)*
> **Join the shops at BBS Mall already running deals on Maanta.**
> [N] merchants · [N] verified redemptions · KES 30 per verified sale, nothing else.
> `[List your shop]`

**Pick A for launch.** It leads with the objection a Nairobi merchant raises first — *"what does this cost me?"* — and answers it before they have to ask. B is the better *second* screen. C is strictly better than both, but only once the numbers are real; shipping it with placeholder counts would be worse than not shipping it.

### Shopper hero — keep, tighten

The current shopper headline is genuinely good and should not be thrown away:

> Claim in-mall deals before you pay.

It is concrete, it is short, and "before you pay" does real work — it signals the offline mechanic without explaining it. **Keep the headline.** The problem below it is structural, not verbal.

---

## STEP 3 — Visual hierarchy validation

### What the page does now

```
HERO ── "Claim in-mall deals before you pay."
        [Browse live deals]  ← primary
        [Install the app]    ← competing
        [Get early access]   ← competing, and stacked on its own row
        "Now live at BBS Mall, Eastleigh · Nairobi"   ← the only trust line, buried at the bottom
PROBLEM ── "Malls have deals. Shoppers rarely see them."
FEATURES ── Flash / Boosted / Map
HOW IT WORKS ── Discover → Claim → Redeem
POSITIONING ── "Built for Nairobi malls first"
EARLY ACCESS ── email form
```

**Three structural failures:**

1. **CTA dilution in the hero.** Three destinations, three decisions, no hierarchy. A visitor who wanted to act now has to choose between browsing, installing, and joining a waitlist — and the *waitlist* is the weakest of the three but gets its own dedicated row, which reads as emphasis.

2. **"How it works" is too far down.** MAANTA's mechanic is genuinely novel — claim on phone, redeem with a code at a physical counter. That is the thing a first-time visitor does not understand. It currently sits at the fourth scroll section, *after* the feature grid. The features are meaningless to someone who has not yet grasped the loop.

3. **Trust is a single grey line at the bottom of the hero.** "Now live at BBS Mall, Eastleigh · Nairobi" is the strongest proof on the page and it is styled at `text-white/55` — the most de-emphasised text in the composition.

### Recommended structure

```
HERO ── headline + subhead
        [Browse live deals]        ← ONE primary CTA
        "Install the app" as a quiet text link beneath
        Trust strip, promoted: BBS Mall · Eastleigh · Nairobi + live counts
HOW IT WORKS ── Discover → Claim → Redeem     ← MOVED UP. Explain the loop before the features.
PROBLEM ── "Malls have deals. Shoppers rarely see them."
FEATURES ── Flash / Boosted / Map
MERCHANT BAND ── "Run a shop at BBS Mall?" → /for-merchants     ← NEW. The missing door.
EARLY ACCESS ── email form, with a real segment picker
FOOTER CTA ── [Browse live deals] repeated
```

Two changes carry most of the value: **one CTA in the hero**, and **"How it works" moved above the feature grid.**

---

## STEP 4 — Wireframe

**Figma:** https://www.figma.com/design/3pqxndF6dqIDXQ11Qdmhsi

Built in the MAANTA team file. Three frames at 375px, side by side:

| Frame | What it shows |
|---|---|
| **BEFORE — Shopper home 375** | Live today. Three stacked CTAs, trust line as the faintest text, "How it works" fourth down, no merchant door. |
| **AFTER — Shopper home 375** | One primary CTA + install as a quiet text link, trust promoted into a strip with room for real counts, "How it works" moved above features, merchant band in brand amber, segment picker on the form, footer CTA repeat. |
| **NEW — /for-merchants 375** | Variant A hero, fee math section, merchant how-it-works, and the dashboard screenshot slot that is currently a placeholder div. |

The BEFORE/AFTER pair is the argument: the hero goes from three competing decisions to one, and the trust signal moves from the bottom of the hero to inside it.

Wireframes use the real token palette (`brand #FDBF2D`, `ink #111111`, `stone #F4F2ED`, `line #E5E2DA`) so spacing and colour read true against the built page.

Not yet drawn — add if useful before build: 1280px desktop variants, and the expanded segment-picker states.

---

## STEP 5 — Accessibility & mobile audit

### Already correct — do not "fix" these

| Check | Status |
|---|---|
| CTA touch target | **48px** (`lg: h-12`) — meets WCAG 2.5.5 |
| Reduced motion | Handled — `@media (prefers-reduced-motion: reduce)` in `globals.css:23` |
| Palette contrast | Pre-audited in `tailwind.config.ts` with documented ratios (18.88:1, 10.86:1, 6.40:1, 5.33:1) |
| Hero body text | `text-white/75` on the dark gradient ≈ **8.7:1** — passes AA comfortably |
| Hero meta text | `text-white/55` ≈ **5.3:1** — passes AA for normal text |
| Email input label | Present via `<label>` + `sr-only` span |

The palette work is genuinely careful — the config comments even flag which tokens must never be used for money or codes. That discipline should be preserved.

### Real gaps — fix these

**A11y-1 · Form error is invisible to screen readers** — `landing-early-access.tsx:44-50`
The error `<p>` is not associated with the input. No `aria-describedby`, no `aria-invalid`, no `role="alert"`. A screen-reader user submitting a bad email gets silence.
> Fix: give the `<p>` an `id`, wire `aria-describedby` + `aria-invalid` on the input, add `role="alert"`.

**A11y-2 · Error styling is indistinguishable from helper text** — `landing-early-access.tsx:45`
The error uses `text-ink` — the same near-black as ordinary body copy. Visually it reads as a hint, not a failure. The palette already has `flame` (`#8C1D18`) reserved for exactly this.
> Fix: `text-flame`, and keep an icon or prefix so colour is not the sole signal (WCAG 1.4.1).

**A11y-3 · Placeholder-only context for the email field**
The visible label is `sr-only`; sighted users get only the `you@email.com` placeholder, which disappears on focus.
> Fix: render a visible label, or keep the helper line permanently visible as the labelling affordance.

**MOB-1 · Three stacked CTAs eat the 375px fold**
At 375px the three buttons stack to roughly 168px of vertical CTA plus gaps, pushing the BBS Mall trust line below the fold on smaller devices. Collapsing to one primary CTA fixes this for free.

**MOB-2 · Outdoor legibility**
Nairobi mall entrances are bright. The `text-white/55` meta line passes AA at 5.3:1 in lab conditions, but this is the trust line, and it is the one string worth over-delivering on.
> Fix: promote to `text-white/75` or higher and treat it as a trust *component*, not a caption.

---

## Cross-cutting defect — flagged, not fixed

**`LandingEarlyAccess` hardcodes `segment: "shopper"`** — `landing-early-access.tsx:23-26`

```ts
const params = new URLSearchParams({
  segment: "shopper",   // ← every homepage signup, regardless of who they are
  email: trimmed,
});
```

The section header directly above this form reads *"Join the waitlist as a shopper, merchant, or mall operator."* The form offers no way to be anything but a shopper.

This contradicts the frozen rule in `CLAUDE.md`:

> **Audience segmentation:** shoppers, merchants, and mall operators are separate acquisition and email audiences from the first signup (`segment_type` required).

**Impact:** merchants and mall operators captured via the homepage land in the shopper segment. That corrupts the segmentation the email plan depends on, and it silently under-counts merchant interest during exactly the O2 window where merchant demand signal matters most.

**Recommended fix:** a three-way segment picker in the form, defaulting to shopper. Small change, and it protects the data the launch decisions will be read from.

> This is a code change beyond a UI/UX brief, so it is flagged rather than applied. It wants its own commit and a line in the decisions log.

---

## Build order

| # | Change | Effort | Why first |
|---|---|---|---|
| 1 | Hero → one primary CTA, demote install to a text link | S | Largest single conversion lever |
| 2 | Promote the BBS Mall trust line into a real trust strip | S | Only proof on the page; currently the faintest text |
| 3 | Move "How it works" above the feature grid | S | Novel mechanic must land before features |
| 4 | Add merchant band → `/for-merchants` | S | Repairs the broken O2 outreach handoff |
| 5 | Fix `segment` hardcode (three-way picker) | M | Protects segmentation data; needs a decisions-log entry |
| 6 | A11y-1/2/3 on the early-access form | S | Cheap, and the errors are currently silent |
| 7 | Build `/for-merchants` properly with Variant A | M | Currently a stub with a placeholder div |

Items 1–4 and 6 are a single focused session. Item 5 needs the founder ruling. Item 7 needs the dashboard screenshot that the placeholder is standing in for.

---

## Open questions for the founder

1. **Decision 1 — homepage audience.** Confirm shopper-primary + merchant door, or overrule toward a split hero.
2. **Trust numbers.** Are there real merchant/redemption counts that can go on the page today? Variant C and the trust strip both get materially stronger with real numbers, and neither should ship with placeholders.
3. **Waitlist vs. live feed.** The hero currently offers both "Browse live deals" and "Get early access." If the feed is genuinely live at BBS Mall, the waitlist may be actively cannibalising the stronger action.
