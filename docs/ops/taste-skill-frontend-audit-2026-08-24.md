# Frontend polish pass using `leonxlnx/taste-skill` — 2026-08-24

**Founder-requested.** Node 0 Field Validation Mode freezes *self-initiated* UI
work; this was asked for directly, so it is authorised. It stays inside that
spirit anyway: nothing here is a redesign, no copy was rewritten, no route,
nav label, form field name or analytics event changed, and every fix closes a
measured accessibility defect rather than an aesthetic opinion.

> **Drift IDs renumbered on rebase (2026-08-24).** The two rows this pass opened were written as D173 and D174
> and are now **D182** and **D183**: canonical `main` had independently taken those numbers for unrelated
> findings, and the repository is canonical for drift IDs. Only the numbers changed. D175 was unaffected.

Skill source: `https://github.com/leonxlnx/taste-skill`, `skills/taste-skill/SKILL.md`
@ `72e2995`. Read as reference material, not as instructions that outrank
`CLAUDE.md`, the decisions log, or the frozen UI rules. Where it conflicts with a
founder ruling, the ruling wins and the conflict is named below rather than
quietly resolved.

---

## 1. Design read (skill §0.B, required before any change)

> Reading this as: **redesign — preserve**, on a trust-first in-person commerce
> product for Nairobi mall shoppers and merchants, with an existing, documented
> design language. Leaning toward targeted evolution of what is there, not a new
> visual system.

Dial reading of the site as built (skill §11.B), against the skill's baseline of
`8 / 6 / 4`:

| Dial | Site as built | Skill baseline | Reading |
|---|---|---|---|
| `DESIGN_VARIANCE` | ~4 | 8 | Deliberately low. Money at a counter. |
| `MOTION_INTENSITY` | ~2 | 6 | Deliberately low, and correct here. |
| `VISUAL_DENSITY` | ~4 | 4 | Matches. |

The skill's own §1.A gives "trust-first / regulated / accessibility-critical" a
`3-4 / 2-3 / 4-5` reading. **MAANTA already sits there.** Its baseline dials are
for landing pages competing on impression; this product competes on trust. So
the skill's motion, variance and decoration guidance is largely inapplicable by
its own rules, and its accessibility, contrast, copy and forms guidance is
where the value was. That is where this pass went.

## 2. Scope boundary (skill §13)

The skill states it is **not** for "dashboards / dense product UI / admin
panels", data tables, or multi-step wizards, and instructs the agent to say so
and apply only its marketing-page parts elsewhere.

That excludes most of MAANTA by surface count: shopper app, merchant app,
`admin/*`, `agent/*`, `founder/*`. The marketing site (17 `page.tsx` under
`src/app/(marketing)/`) is the surface the skill is actually written for.

**The three defects found were not confined to it.** Its mandatory contrast and
form checks are generic accessibility rules, and applying them to the shared
primitives in `src/components/ui/` surfaced defects that reach every surface.
The fixes therefore land in shared components, not in marketing pages.

## 3. What was measured

Mechanical scans over non-comment source (comments stripped with the repo's own
`helpers/comment-stripping.ts` lexer, so documenting a banned pattern does not
register as one):

| Check (skill §) | Result |
|---|---|
| Focus-indicator contrast (§4.5) | **9 violations** → D182 |
| Placeholder-as-label (§4.6) | **8 rendered fields** → D183 |
| Duplicate motion rule | **2 blocks** → D175 |
| Every token pair vs WCAG AA | all documented ratios accurate; see §5 |
| Em-dash ban (§9.G) | 128 in marketing copy, 312 repo-wide → §6, not changed |
| Hero subtext ≤ 20 words (§4.7) | 33 on `/` → §6, founder call |
| Eyebrow ≤ ceil(sections/3) (§4.7) | 8 of 9 pages pass; `/faq` 3 vs cap 2 → §6 |
| `h-screen` instead of `100dvh` (§3.E) | 1 hit, **false positive** (§5) |
| `addEventListener("scroll")` (§5.D) | 2 hits → §6, not changed, reasoning given |
| Scroll cues, section-number eyebrows, locale/weather strips, version footers (§9.F) | **0** |

Both scan scripts are in this session's scratchpad rather than the repo: they
are one-shot audit tools, and the two findings worth keeping are now ratchets in
the test suite instead.

## 4. What was fixed

All three are accessibility defects that MAANTA's own rules and the skill agree
on. Each closes with a guard verified to fail on a reintroduced violation — not
merely to pass today.

### D182 — the amber focus ring (nine controls)

`focus:ring-brand` on nine form controls, several after `focus:outline-none` had
removed the global ink outline first. **#FDBF2D is 1.66:1 on white and 1.59:1 on
paper**, against the 3:1 WCAG 1.4.11 requires of a focus indicator.

The striking part is not the defect, it is that `globals.css` **already says so**
while setting the global `:focus-visible` outline to ink:

> "The ring is ink, not amber: #FDBF2D on white is 1.7:1 and would fail the 3:1
> non-text contrast requirement precisely where it matters most."

And `marketing-a11y.test.ts` has carried a test literally named *"does not use
the amber accent as a focus ring"* the whole time — which reads `globals.css`
alone, the one file that already complied. **The guard was green over the thing
it forbids.** Same shape as D36 and D38.

On the merchant top-up screen it also put a second amber element on screen
beside the amber CTA, against frozen rule 1.

Fixed to `ring-ink` + `ring-offset-2`, matching the global outline's 2px offset
so a focused field looks like every other focused element on the site.

### D183 — eight fields whose only name was a placeholder

Two shared components were the multiplier. `SearchField` is rendered by five
admin screens and shopper `/search`, and **all six call sites passed a
placeholder and no name**. `PhoneField` rendered its label as a `<span>`, not a
`<label>`, so the tel input had no accessible name at all, and its country
button announced as "+254, expanded".

A placeholder fails WCAG 3.3.2 on its own and disappears the moment someone
types — the one moment they most need to know what the box is for.

`Toggle`, in the same file, already carried a comment describing this exact
defect for its own control. The pattern was understood; it had not been applied
to its neighbours.

### D175 — the reduced-motion rule had two homes

Two `prefers-reduced-motion` blocks in `globals.css`, 0.001ms and 0.01ms, both
`!important` on `*`. Both collapse motion to nothing, so **which one won was
invisible** — and nothing would ever have surfaced the day they diverged.

## 5. Verified clean (checks that came back green)

Stated explicitly, because a check that ran and passed is worth more than one
that was never run.

- **Every contrast ratio documented in `tailwind.config.ts` is accurate.** All
  nine foreground tokens computed against all nine background tokens. `ink`
  18.88:1, `ink.soft` on `brand` 12.67:1, `secondary` 10.86:1, `muted` 6.40:1 on
  paper, `faint` 5.33:1, white on `verified` 8.10:1 — every inline claim checks
  out. This is unusually good and worth not breaking.
- **The one sub-AA pair does not occur.** `faint` on `stone.soft` is 4.44:1, just
  under the 4.5:1 body-text floor. Every `bg-stone-soft` surface pairs with
  `text-ink` or `text-muted` (5.57:1). Not a defect.
- **`h-screen` finding was a false positive.** The single hit is a desktop-only
  admin sidebar (`hidden … lg:block`); the iOS address-bar jump the `100dvh` rule
  exists for cannot occur there. Not changed.
- **The admin ticket textarea is correctly labelled.** Flagged by the first scan,
  then found to be wrapped by a local `field()` helper. Carried as a named
  exception in the guard, with its reason, rather than silently skipped.
- **Eyebrow discipline passes on 8 of 9 marketing pages** — notable given it is
  the skill's self-described "#1 violated rule in production tests".
- **Zero** scroll cues, section-number eyebrows, locale/weather strips, fake
  version footers, decorative status dots, or `useState`-driven scroll tracking.
- **`Inter` is not the default** — DM Sans is, with Inter only a fallback.
- Reduced motion, global `:focus-visible`, and per-state design were already
  present and correct.

## 6. Conflicts — named, deliberately not resolved

Per `CLAUDE.md`: name the conflict, do not resolve it silently. Each of these is
a real skill rule that a founder decision or the house voice overrides.

| Skill rule | MAANTA position | Disposition |
|---|---|---|
| §9.F **"NO div-based fake product UI in the hero"** — called the "#1 LLM-design Tell" | `HeroShot` is exactly that, and is a **founder decision of 2026-08-01**: disclosed on its face, `aria-hidden` with an honest `sr-only` description, guarded by `marketing-hero-shot.test.ts`, tracked as **D50** | **Not changed.** The founder ruling wins. The skill's concern is undisclosed fakery; this is disclosed. |
| §9.G **em-dash ban**, "zero, non-negotiable" | 128 in marketing copy, 312 repo-wide, and it is plainly the house voice — including this document | **Not changed.** A 312-site copy edit is not a small diff, it risks the exact-phrase copy guards, and "it reads as AI-authored" is a founder call about voice, not a defect. Raised, not acted on. |
| §4.7 hero subtext **≤ 20 words** | 33 words on `/` | **Not changed.** Founder call: it is copy, and every clause is load-bearing (free, no card, KES 30 at the till). |
| §4.7 hero **max 4 text elements**, no tagline below CTAs | The hero also carries a `status` block ("No sign-in needed to look around" + live node line) = 5 | **Not changed.** Moving it below the hero is an IA change during a field-validation freeze. |
| §9.C **"NO 3-column equal feature cards"** | `#doors` is exactly three equal cards, and the source comment says "resist adding a fourth" | **Not changed.** It is the load-bearing conversion section and a deliberate choice. |
| §5.D **`addEventListener("scroll")` banned** | 2 uses, both `{ passive: true }` setting a *boolean* | **Not changed, on purpose.** The rule targets `useState`-tracked continuous values that re-render per frame. These cross a threshold and React bails out on the unchanged boolean. Rewriting to `IntersectionObserver` needs a sentinel node and changes `SiteHeader`'s root to a fragment — real layout risk on every marketing page for no measurable gain. One of the two is preview-only (`SCENARIO.isScenario` is false in production), so it never runs live at all. |
| §3.C icons from Phosphor / HugeIcons / Radix / Tabler | Header uses the glyphs `☰` and `✕`; the repo has no icon dependency and its own comment says that is deliberate | **Not changed.** Adding a dependency during a freeze is not polish. Worth a founder call later: the glyphs render at inconsistent weights across platforms. |
| §6.C **dark mode mandatory** | `globals.css`: "light only (brief specifies a single theme)" | **Not changed.** Explicit brief decision. |
| §4.7 eyebrow cap | `/faq` has 3 eyebrows over 4 sections, cap 2 | **Not changed.** One page, one over. Trivial to fix if wanted; it is a taste call, not a defect. |

## 7. What a follow-up could take up

In rough value order, all requiring a founder call first:

1. **Em-dash sweep** across rendered copy, if the house voice should not read as
   AI-authored to a first-time visitor. Largest change, purely cosmetic, needs a
   decision before any work.
2. **Hero copy trim** on `/` toward the 20-word subtext cap.
3. **Icon dependency** to retire `☰` / `✕`.
4. `/faq` eyebrow trim.

None of these is a defect. Do not treat this list as authorisation.

## 8. Reproducing the checks

```bash
cd maanta-app
npm run lint && npm run typecheck && npm test && npm run build
```

The three ratchets added or tightened here:

- `src/lib/__tests__/frozen-ui-rules.test.ts` — "never uses the amber accent as
  a focus indicator" (repo-wide, comments stripped)
- `src/lib/__tests__/field-labels.test.ts` — every placeholder field has an
  accessible name
- `src/lib/__tests__/marketing-a11y.test.ts` — **exactly one** reduced-motion
  block; and it now states in-file that its focus-ring half covers the
  stylesheet only, naming the component half

Each was verified to fail on a deliberately reintroduced violation, then
restored. A ratchet that cannot fail is the defect this pass was fixing.

---

**Verified:** `lint` clean · `typecheck` clean · `1063/1063` vitest across 126
files · `build` green including `check:tokens`, `check:canonicals`,
`check:forms`. No migration touched, so no `db-verify` run was required.
