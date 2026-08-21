# Marketing landing page polish audit — 2026-08-20

Fourth and final pass in the series (`shopper-`, `merchant-`,
`admin-ui-polish-2026-08-20.md`). Same method: UI-UX-PRO-MAX queries
(`product`, `landing`, `ux` domains) audited against `/` in
`(marketing)/page.tsx` and its shell (`sections.tsx`, `SiteHeader`,
`SiteFooter`, `HeroShot`, `landing-early-access.tsx`).

## Verdict: PASS — no code changes warranted

This is the honest outcome, not a skipped pass. Every candidate finding the
skill's checklist raised is already handled in the source, almost always with
a comment naming the rule it serves:

| Guideline (skill) | Where it is already satisfied |
|---|---|
| Skip link on nav-heavy pages | `(marketing)/layout.tsx` — visually hidden until focus, guarded by `marketing-a11y.test.ts` ("the shell needs a skip link") |
| Single H1, sequential headings | `AudienceHero` h1 → `SectionHeading` h2 → card h3; TrustBar is a `<dl>` |
| CTA above the fold, repeated after key sections | Hero → merchant band → early-access close; accent budget (3 uses) documented in the page docblock |
| Forms: visible label, error announced, described-by | `landing-early-access.tsx` — `htmlFor`, `role="alert"`, `aria-invalid`, `aria-describedby` swapping hint/error, flame on icon only |
| Reduced motion respected | Global `prefers-reduced-motion` reset in `globals.css`; guarded by `marketing-a11y.test.ts` |
| Mobile nav keyboard parity | `SiteHeader` — Escape close, `aria-expanded`/`aria-controls`, guarded by `marketing-a11y.test.ts` |
| Contrast ≥4.5:1 incl. small text | Tokens carry measured ratios in `tailwind.config.ts` (`faint` 5.33:1 is the floor) |
| Honest imagery | `HeroShot` is `aria-hidden` with a visually-hidden honest description; synthetic rows tracked as **D50** |
| No stale urgency | Opening-credit line renders only while `isOfferLive` (**D51** owns the expiry-gate proof) |
| Trust content is real, not decorative | TrustBar deliberately restates commercial facts instead of modelled social proof; metrics route through `ScenarioStat`/`ScenarioNotice` |
| Anti-patterns (AI gradients, emoji icons, colour-only state) | Absent; the one broad wash is the documented paper-to-white hero gradient, and the `☰`/`✕` glyphs are a documented no-icon-dependency decision |

The deeper reason nothing needed fixing: this surface already has its own
ratchet layer — `marketing-a11y.test.ts`, `marketing-shell.test.ts`,
`held-claims.test.ts`, `pricing-copy.test.ts`, `marketing-hero-shot.test.ts` —
plus the three post-build gates. The polish debt the first three passes found
(silent failures, unconfirmed destructive actions, unannounced errors) had no
marketing equivalent left to find.

## Verified this session

`npx vitest run` on the five marketing guard suites: 5 files / 56 tests
passed. Full gates (`lint`, `typecheck`, `test`, `build` + token/canonical/
form checks) last ran clean on this exact tree at the admin pass
(`admin-ui-polish-2026-08-20.md`); no file changed since.

## Drift

None found, none opened. D50 (hero mockup synthetic rows) and D51 (offer
expiry gate unproven) remain open and are correctly owned by their existing
rows — nothing here re-reports them.

## Open decisions

None. This closes the four-surface polish series on
`claude/ui-polish-multi-screen-3ukk8q`: shopper (`b42d4a7`), merchant
(`b54c126`), admin (`a287a6f`), marketing landing (this audit).
