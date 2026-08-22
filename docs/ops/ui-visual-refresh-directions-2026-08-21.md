# UI visual refresh — direction canvases (2026-08-21)

Follow-up to the 2026-08-20/21 polish program (PRs #240–#244, all merged): the
polish was deliberately invisible (behaviour/a11y under the frozen design
system), so the founder asked for visible before/after directions. Two design
canvases now exist, both built from the real components, tokens and copy, and
both reviewed against the frozen UI rules by an independent pass (findings
fixed before publish).

## The canvases

1. **Before/after, all roles** — every surface family as shipped-today +
   Direction A + Direction B:
   https://claude.ai/code/artifact/2862479b-8416-443b-ad1a-a8b4b1b7771f
2. **Directions only** (the decision canvas — A vs B side by side, no
   "before" column), extended to all screens: feed, deal detail, my-deals
   ticket/code card, till, wallet, merchant deals list, admin monitoring,
   agent home, founder overview, marketing landing `/`, sign-in:
   https://claude.ai/code/artifact/0bb99841-5d36-494d-973b-e262de28374a

## The two directions

- **A · Editorial calm** — stone wash (`#F4F2ED`), borderless white cards on
  soft shadows, larger type with tight tracking, image-forward, price
  anchored beside the action. Premium and unhurried; fewer items per screen.
- **B · Market board** — ink (`#141414`) header/money bands, dense ledger
  rows with hairline dividers, right-aligned tabular money columns, uppercase
  micro-labels with counts. High energy; most information per screen.

Both stay inside the frozen UI rules (≤1 amber action, money never coloured,
state = icon + word, rust for urgency, DM Sans / JetBrains Mono for codes)
and the demo-mode honesty rules (no "Live at", no live dot, facts.ts numbers
only, illustration disclosures on synthetic deal rows).

## Status and next step

**Decided 2026-08-22: Direction A everywhere** — founder instruction
("i want version A for everything") after the directions canvas reached all
22 boards; recorded in `docs/maanta-decisions-log.md` (2026-08-22 row).
Implementation proceeds surface-by-surface through the same gated PR
workflow as the polish passes; the frozen rules are not up for change.

Slices:

1. **App-wide borderless-shadow card flip — shipped 2026-08-22** (guard:
   `maanta-app/src/lib/__tests__/direction-a-cards.test.ts`).
2. Shopper feed: image-forward lead deal — pending.
3. Deal detail / tickets: price anchored beside the action — pending.
4. Marketing landing Direction A slice — pending (own accent budget).

Related drift closed while recreating surfaces: **D150** (Home docblock's
amber enumeration undercounted the shipped page — comment-only fix).
