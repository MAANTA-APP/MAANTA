# Motion system and app-surface polish — 2026-08-24

**Founder-requested**, second pass the same day. Sources:
`kylezantos/design-motion-principles` @ `4a9ca87` and the `webapp-testing` skill
from `ComposioHQ/awesome-claude-skills` @ `be2a406`. Read as reference material;
where either conflicts with a founder ruling or the frozen UI rules, the ruling
wins and the conflict is named rather than quietly resolved.

The brief was "make the app look and feel like a VC funded app". That is the
repo's own stated bar, near-verbatim: *"premium, trustworthy, investor-grade,
merchant-safe, shopper-clear — a product a VC-funded team shipped, not a
template."*

---

## 1. What each source actually contributed

**`design-motion-principles`** carried the substance. Its context table puts
MAANTA under **Emil Kowalski primary** for app surfaces (productivity /
money-handling: restraint, speed, "should this animate at all?") and **Jakub
Krehel primary** for marketing (production polish). Its frequency gate — rare
motion may be expressive, frequent motion should be instant — and its "don't
animate just because you can" line agree with MAANTA's own bar, so it added no
pressure to decorate. Its value was in *how existing* motion is built.

**`awesome-claude-skills`** is a curated directory rather than a design
rulebook, and most of it (invoice organisers, resume generators, Twitter
optimisers) does not apply. Several entries duplicate skills already available
here. One earned its place: **`webapp-testing`** — Playwright against the
running app.

That mattered more than the rest of this document. Every prior pass, including
this morning's, judged the product by reading source. **D178 below is invisible
in source and obvious on screen**, and it was found in the first minute of
actually looking.

## 2. Designer weighting used

| Surface | Primary | Why |
|---|---|---|
| Merchant till, claim/redeem, wallet | Emil | High-frequency, money at a counter. Instant beats animated. |
| Shopper feed / browse / tickets | Emil, Jakub second | Frequent use; polish must not cost speed. |
| Marketing site | Jakub | Seen once, first impression, polish is the job. |
| Admin / agent / founder | Emil | Operational. Boring is correct. |

Nothing here is weighted to Jhey Tompkins (playful experimentation). MAANTA
handles other people's money at a physical counter; delight is not the goal on
any surface it owns.

## 3. What was measured

| Check | Result |
|---|---|
| Transitions using the declared house easing | **2 of 44** → D176 |
| `transition-all` (animates layout properties) | **3** → D177 |
| Animating `left` / `width` / `top` / `height` | Toggle knob on `left` → D177 |
| Error-state composition, rendered at 390x844 | **5 boundaries top-anchored** → D178 |
| Looping attention motion (skill bans it outright) | 1, deliberate — §6 |
| `prefers-reduced-motion` coverage | Already global and correct |
| Press feedback (`motion-safe:active:scale-*`) | Already present on 11 controls, correctly gated |
| Decorative pulsing status dots | **Zero** — `LiveDot` is static |

## 4. What was fixed

### D176 — one easing curve, declared and ignored

`globals.css` has defined `--ease-standard` since the Frozen UI pass, with the
instruction *"Keep new transitions on this so overlays, presses, and fades feel
like one system."* Two call sites did. The other 42 used a bare `transition`,
which resolves to Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)` — an
ease-in-out that **starts slow**.

That curve was running the marketing primary CTA's hover-lift and press
response, every card hover, and every chip. On a press, ease-in-out reads as
lag: the control lifts late rather than answering the finger. This is the single
biggest "feel" lever in the codebase and it cost one line.

Fixed by wiring the token as `transitionTimingFunction.DEFAULT`, **not** by
editing 42 call sites — a rule each author has to remember is a rule that
drifts, and this one already had.

Verified in the compiled stylesheet:

```
.transition{ … transition-timing-function:var(--ease-standard,cubic-bezier(.22,1,.36,1)); … }
```

with **zero** remaining occurrences of the Tailwind default. Resting-state
renders are byte-identical before and after, mobile and desktop — the change is
motion-only, which is exactly what it should be.

### D177 — the Toggle knob re-ran layout every frame

It slid between `left-0.5` and `left-[calc(100%-1.625rem)]` under
`transition-all`: the one property class the guidance singles out as never worth
animating. Now `translate-x-5` from a fixed `left-0.5`, composited on the GPU.

Geometry verified pixel-identical by rendering both rules side by side in
Chromium: 22px left-inset, 2px right-inset in each.

### D178 — five error states pinned to the top of an empty screen

The content was right — icon plus word, body in ink, red only on the glyph,
readable in greyscale, per frozen rule 4. The composition was not. All five
boundaries used `<main className="px-4 pt-10">` with no height, so on a phone
the block sat in the top 240px and left ~600px of void above the tab bar. It
read as a broken page rather than a designed state.

Now `flex min-h-[70dvh] flex-col items-center justify-center` — **the pattern
this repo already uses** in `redeem-keypad.tsx`, `staff/new/page.tsx` and the
download page, so the fix extends a convention instead of inventing one.

Measured at 390x844: block moved from y=100 in a 240px `<main>` to y=239 in a
591px one.

## 5. A wrong turn, kept in the record

The first attempt used `min-h-full`. It built, typechecked and looked plausible.
Measured in the browser, `<main>` was still 240px: the shells wrap children in a
`flex-1` block whose flex-derived height is not definite, so the percentage
resolved to zero. Had I not rendered it, this document would be claiming a fix
that did nothing.

Same for the Toggle. The first geometry harness reported a 2px shift and I
nearly recorded a regression — the harness was wrong, because the class it was
testing (`left-[calc(100%-1.625rem)]`) had already been deleted from source, so
Tailwind no longer generated it and the rule silently fell back to `auto`.

## 6. Conflicts — named, deliberately not resolved

| Skill rule | MAANTA position | Disposition |
|---|---|---|
| "No looping attention-seeking motion — no pulsing dots, glowing status rings, breathing CTAs" | `animate-r3`, the claimed-code border pulse, is the one looping animation. It is a frozen design element and is reduced-motion neutralised | **Not changed.** It marks a live credential the shopper holds up at a counter, which is state, not decoration. A founder call if it is ever revisited. |
| Duration: Emil's 180ms ideal for productivity UI | House default is Tailwind's 150ms; four sites set 200ms explicitly | **Not changed.** 150ms is inside Emil's "under 300ms" and unifying on a third number is taste, not defect. |
| Keyframed animations (`fade-in`, `sheet-up`, `otp-pop`) use `ease-out`, not the house token | Directionally the same (decelerating) | **Not changed.** More churn than gain; noted so the next author knows it was seen. |

## 7. Honest assessment of the look

The marketing site was rendered at 390px and 1440px before any change. **It
already meets the bar.** Calm palette, real hierarchy, restrained accent,
generous spacing, no gradient slop, no fake-glass, no template feel. There was
nothing to rescue, and manufacturing visual changes to look busy would have
violated both the freeze and the skill's own first rule.

The gap between MAANTA and a top-tier product was never the look. It was the
feel — 42 transitions on a library-default curve — and one genuinely unfinished
surface, the error state, that only rendering exposed.

Two things stayed on the founder's desk from the morning pass and are unchanged:
the hero subtext runs 33 words against a 20-word guideline and 6 lines on
mobile, and the hero mockup's three empty grey image placeholders are the one
element that reads unfinished. Both are copy/content calls tracked at **D50** and
in `docs/ops/taste-skill-frontend-audit-2026-08-24.md` §6.

## 8. Reproducing

```bash
cd maanta-app
npm run lint && npm run typecheck && npm test && npm run build
```

Guard added: `maanta-app/src/lib/__tests__/motion-system.test.ts` — asserts the
token exists, that it is wired as the Tailwind default *with its literal
fallback* (an undefined `var()` silently reverts to `ease`), and that no
`transition-all` returns. Verified to fail on a sabotaged config, then restored.

To render the app locally, `.env.local` with the CI placeholders from
`.github/workflows/ci.yml` is enough for marketing plus the app shells; the
data-backed surfaces need a real Supabase.

---

**Re-verified after rebasing onto canonical `main` `5ee90ba` (2026-08-24):**
`lint`, `typecheck`, `build` and the three post-build gates all exit 0, and
vitest is **1121/1121 across 129 files** on the new base. The figures below are
what was measured before the rebase, on the older base, and are kept as the
record of that run rather than silently overwritten.

**Verified (pre-rebase):** `lint` clean · `typecheck` clean · `1066/1066` vitest across 127
files · `build` green including `check:tokens`, `check:canonicals`,
`check:forms` · compiled CSS inspected · before/after renders compared at 390px
and 1440px. No migration touched.
