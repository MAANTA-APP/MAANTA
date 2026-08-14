# Design-engineering skills (emilkowalski/skills)

Date: 2026-08-14 · Status: **installed state, not a recommendation.**

Ten agent skills from [`emilkowalski/skills`](https://github.com/emilkowalski/skills)
(MIT) are now vendored into this repo. This file records what landed, what each
one is for on MAANTA, and — the part that matters — **which rules win when a
skill's default disagrees with this product.**

Installed by founder ruling 2026-08-14 (decisions log, Recent decisions). That
ruling supersedes the "Avoid motion, video, animation and 3D skills" line that
`docs/ops/claude-stack-setup.md` had carried since 2026-07-30; drift **D98**.

## What landed

Installed with `npx skills@latest add emilkowalski/skills`, the same tool that
pins the two Supabase skills. Do not hand-edit `skills-lock.json` — re-run the
CLI.

| Skill | What it is | Where it earns its place on MAANTA |
|---|---|---|
| `emil-design-eng` | The umbrella skill: UI polish, component design, animation decisions, invisible details | The general taste layer for shopper and merchant surface work |
| `animate` | Builds an animation from scratch — purpose, tool, properties, curve, duration, interruption, exit | Only for the five motions this app already owns (below). Not a licence to add a sixth |
| `review-animations` | Critiques motion in a diff against a high craft bar. `disable-model-invocation: true` — explicit invoke only | Useful on any diff that touches `tailwind.config.ts` keyframes or a `transition-*` class |
| `improve-animations` | Read-only codebase motion audit → prioritised plan | Low value here today: 19 `.tsx` files use `transition`, and the motion set is deliberately tiny |
| `find-animation-opportunities` | Sweeps a UI for places that *should* animate; read-only, proposes only | **Highest collision risk.** Its own premise is restraint, but its output is a list of new motion. Treat every suggestion as a proposal to be refused by default on money surfaces |
| `animation-vocabulary` | Reverse-lookup glossary: vague description → correct term | Harmless. Useful when briefing design |
| `apple-design` | Apple's fluid-motion and design foundations, translated to web | Read the *foundations* half (feedback, spatial consistency, restraint, typography). The springs/gestures half assumes a spring library this repo does not have |
| `pick-ui-library` | Curated library picks per task. Explicit invoke only | Advisory. A new dependency here is a stack decision, not a styling decision — see below |
| `prototype` | Builds several variants behind a visual picker. Explicit invoke only | Fine for exploring a surface before building it. The winner still has to pass the frozen rules |
| `ask-sonner` | Guide to the Sonner toast library | **Collides with frozen UI rule 3 head-on** — see below |

## Where it lives

- `.agents/skills/<name>/` — the vendored source, committed (~220 KB total).
- `.claude/skills/<name>` — relative symlinks into `.agents/skills/`, created by
  the CLI so Claude Code discovers them.
- `skills-lock.json` — pins source repo, skill path and content hash. Now holds
  12 entries: these 10 plus `supabase` and `supabase-postgres-best-practices`.

**Known inconsistency, left alone deliberately:** the two Supabase skills predate
`.claude/` and are *not* symlinked there, so Claude Code sees 10 of the 12 pinned
skills. They remain discoverable to every other agent via `.agents/skills/`.
Symlinking them would be a behavioural change nobody asked for; do it in its own
change if you want it.

Nothing in CI depends on any of this. The gates are `lint`, `typecheck`, `test`,
`build`, `db-tests`, unchanged.

## Precedence — read this before applying any of these skills

In descending order. Where two disagree, the higher one wins and you say so in
your summary rather than resolving it silently.

1. **The seven frozen UI rules** in `CLAUDE.md`. Colour and copy rules among them
   are ratcheted by `maanta-app/src/lib/__tests__/frozen-ui-rules.test.ts` — a
   skill's suggestion that breaks one fails CI, not review.
2. **`CLAUDE.md`'s UI quality bar and its "Do not" list** — no over-animation, no
   parallax, no confetti, no celebratory motion, and never motion on a money
   surface.
3. **`docs/skills/money-trust-engineering-guardrails.md`** for any diff that shows
   a price, moves money, or gates a role.
4. **These skills**, for everything left over: hierarchy, spacing, easing choice
   *within* the existing motion set, component structure, empty and error states.

### Stated plainly: motion restraint is prose, not a CI gate

`frozen-ui-rules.test.ts` enforces colour usage and the closed copy vocabulary.
It does **not** enforce anything about motion. The only motion-adjacent guard in
the suite is `marketing-a11y.test.ts`, which asserts the stylesheet contains a
`prefers-reduced-motion` block — it says nothing about what animates or how much.

So CLAUDE.md's anti-motion bullets are taste guidance carried by review, and they
are honest about that: they sit under the quality bar, not under "enforced in
code, not taste". With ten motion skills now in the repo, that asymmetry is worth
knowing before you trust a green CI run as approval of a motion diff. It is not
recorded as drift because nothing ever claimed those bullets were enforced.

## MAANTA's existing motion vocabulary

The whole of it, in `maanta-app/tailwind.config.ts`:

| Token | Timing | Used for |
|---|---|---|
| `sheet-up` | `0.25s ease-out` | Sheet / modal entry |
| `fade-in` | `0.2s ease-out` | Content appearing |
| `fade-in-up` | `0.4s ease-out both` | Entry with a small rise; `both` so nothing flashes untransformed |
| `otp-pop` | `0.15s ease-out` | A code digit landing in an OTP cell — a settle, no colour |
| `r3` | `2s ease-in-out infinite` | The one amber liveness pulse, on the claimed-code border |

Two reduced-motion blocks in `maanta-app/src/app/globals.css` collapse every
animation and transition to ~0ms under `prefers-reduced-motion: reduce`, and the
comment states the invariant that makes that safe: **state is always carried by
icon + word + structure, never motion alone.** Any motion these skills produce
must hold that line — if a state reads only while it is moving, it is wrong here.

Extend this set; don't start a second one. A new named animation is a design
decision worth a line in a handoff doc, not an inline `duration-300`.

## The three collisions worth naming

**`ask-sonner` vs frozen rule 3.** Rule 3 is "Money is never coloured, never in a
toast, never celebrated." The skill is a competent guide to a toast library, and
the library is not installed — `sonner` appears nowhere in
`maanta-app/package.json`. Use the skill for non-money notification patterns if a
task ever calls for one; a toast carrying an amount, a fee, a balance or a
redemption outcome is out regardless of how well the skill argues for it.

**`animate` / `find-animation-opportunities` / `prototype` vs the money
surfaces.** These skills produce more motion by construction. The merchant till,
the wallet, the top-up flow, the claimed-code card and every fee display are
surfaces where the answer is no by default. `find-animation-opportunities` leads
with Emil's own "You Don't Need Animations" and is built to reject — hold it to
that.

**Any skill that recommends a dependency.** There is no motion library and no
toast library in this app: no `framer-motion`, no `motion`, no `sonner`. Adding
one changes the bundle, the CI surface and the house style at once. That is a
stack decision for the decisions log, not something a styling session absorbs.

## Updating or removing

```bash
npx skills@latest add emilkowalski/skills   # re-run to update; re-pins the hashes
```

To remove: delete the `.agents/skills/<name>` directory, its `.claude/skills/<name>`
symlink, and its `skills-lock.json` entry — or re-run the CLI without it.

Skills run with full agent permissions. Read a SKILL.md before trusting it, and
re-read the diff when updating — a pinned hash detects change, it does not judge
it.

## What was verified

- Install completed via the pinned CLI; `skills-lock.json` now carries 12 entries.
- `git check-ignore` confirms neither `.agents/skills/` nor `.claude/skills/` is
  ignored, so both are committed rather than silently local.
- Symlinks are repo-relative (`../../.agents/skills/<name>`), so they survive a
  fresh clone.
- No file under `maanta-app/` changed, so `lint`, `typecheck`, `test`, `build`
  and `db-tests` are unaffected by this change. **They were not run** — there was
  nothing in their scope to run them against.
- Motion posture read directly from source, not from docs: five named animations
  in `tailwind.config.ts`, two `prefers-reduced-motion` blocks in `globals.css`,
  no motion or toast dependency in `package.json`, and no test in
  `maanta-app/src/lib/__tests__/` asserting anything about animation.
