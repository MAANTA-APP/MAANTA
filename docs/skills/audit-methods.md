# Skills: audit methods

Last updated: 2026-08-09 · Three audit failures this project has now hit on
**both** the repo side and the design side, written once and keyed to the drift
rows that carry the full history. The design project's `github.md` carries the
twin "Audit methods" section keyed to the same row numbers, so the two sides
share vocabulary. Update both or neither.

## The generalisation

**Audit the artifact the user receives, not the text that produces it.**
Every failure below is an instance of checking the producing text and reporting
green about the received artifact. When designing any check — a vitest guard, a
canvas sweep, a doc correction — first ask which of the two it actually reads.

## 1. Audit for the rule, not the token — D36 / D38

Searching for the thing you are replacing proves the replacement ran; it does
not prove the rule holds. The check must be derived from the rule's full
statement, not from the diff you happen to be making.

- **Repo form:** copy guards carried private comment-strippers that truncated
  lines at the `//` in `https://`, so any banned claim sharing a line with a
  link was deleted before the scan — a guard reading a document it had already
  censored. Fix: one shared lexer, `maanta-app/src/lib/__tests__/helpers/comment-stripping.ts`,
  imported by every copy guard. A fourth private copy is how the defect returns.
- **Design twin (2026-08-09):** the error-red sweep rewrote `color:#E8431F`
  and never looked for `#8C1D18`-as-message-text — it audited for the token
  being replaced, not the rule being enforced (error red is borders/icons/chips
  only, never copy), and asserted "§16–17 already correct" without a run.

## 2. Grep the sentence everywhere before closing — D67

A claim corrected where the finding was written down, while an identical or
contradicting twin survives in another document, closes the row and keeps the
drift. Before closing any row that corrects a sentence, `rg` the sentence — and
its close paraphrases — across the repo. The verification bar already imposes
this on numbers; D67 extends it to claims.

- **Design twin (recurring, three times):** the label stating the rule while
  the body teaches the opposite — a canvas asserting "never message text" in
  three prominent places while demonstrating the violation 21 times two
  sections below. Relabelling a header without repairing the body is the same
  failure at document scale.

## 3. Computed / rendered output over source text — D41

Source-level checks pass on artifacts whose rendered form violates the rule,
because rendering adds behavior the source never spells out.

- **Repo form:** a `/contact` form present in JSX and absent from server HTML
  shipped, because every marketing guard read `.tsx` source. Fix: rendered
  output is checked by the three post-build scripts chained into `npm run build`
  (`check:tokens`, `check:canonicals`, `check:forms`) — a new guard that needs
  rendered output belongs there, **not** in vitest (CI runs `test` before
  `build`, so `.next/` does not exist at test time; source-reading vitest
  guards are a constraint, not a preference).
- **Design twin (2026-08-09):** source grep found 15 message-text uses of the
  error red; `getComputedStyle` found 21 — inherited colour has no source text
  to match. For anything colour-related on a rendered canvas, computed style is
  the authoritative audit.
