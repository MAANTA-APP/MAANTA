# MAANTA Mobile Wireframes — Claim & Till

Self-contained wireframe canvas for the two moments that make the KES 30 success
fee real: the shopper **claims** a code, and the merchant redeems it at the **till**.

Open `MAANTA Mobile Wireframes - Claim and Till.html` in any browser — no build,
no network. It is the repo-side implementation of the Claude Design file
`MAANTA Mobile Wireframes - Claim and Till.dc.html`
([project](https://claude.ai/design/p/be022a3c-9a0a-4269-8c6d-6095c3114e4d)).

## Files

| File | Role |
|---|---|
| `MAANTA Mobile Wireframes - Claim and Till.html` | The wireframe canvas |
| `assets/logo-a.svg` | MAANTA mark (rounded amber shield-check) |
| `assets/logo-b.svg` | MAANTA horizontal lockup (mark + wordmark), used in the masthead |
| `support.js` | Progressive-enhancement interactivity (degrades to a static wireframe if JS is off) |

## What's interactive

- **Till keypad** (`9k`) — tap digits to fill the 6 OTP cells; `clear` / `⌫` edit; a status line appears when all six are entered.
- **State chips** — flip a frame between labelled variants: Deal detail Live/Fully-claimed, Redemption outcome Verified/Expired/Flagged, Redemption result Verified/Rejected.
- **Claim deal** — opens the confirm bottom sheet (`8h`).

## Screen map (IDs from `design/Maanta_Wireframe_System.pdf`)

**Claim (shopper):** `8g`·`8ae` deal detail · `8y` location check · `8i` claimed ticket ·
`8j` full code counter · `8h` claim confirm sheet · `8z`·`8k`·`8aa` redemption outcome.

**Till (merchant):** `9k` redemption keypad · `9t` location-mismatch verify · `9l`·`9m` redemption result.

## Design fidelity

Tokens mirror `maanta-app/tailwind.config.ts` (Frozen UI Pass 2): one amber action
per screen (`#FDBF2D`), codes in slashed-zero tabular mono, warnings in rust/flame
(never yellow), the R3 amber pulse on the live claimed-code border. These honour the
frozen business rules — KES 30 fee debited only on a **verified** redemption, the
15-minute grace period, and **verify-anyway** (a mismatch still redeems at the
counter; the dispute routes to admin review afterward).
