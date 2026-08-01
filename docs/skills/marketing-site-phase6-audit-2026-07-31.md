# Marketing site — Phase 6 audit follow-up (2026-07-31)

Cursor audit per `docs/ops/CURSOR-AUDIT-BRIEF.md` against
`docs/ops/IMPLEMENTATION-REPORT.md`. Draft PR: [#154](https://github.com/MAANTA-APP/MAANTA/pull/154).

## Guard fixes applied

### Critical — `marketing-shell.test.ts` wa.me guard was vacuous

`codeOnly()` treated `//` inside `https://wa.me/…` as a line comment, so
hardcoded WhatsApp URLs were invisible. Fixed with `lineCommentAt()` that skips
`//` when preceded by `:`.

### High — `pricing-copy.test.ts` Elite-trial guard skipped rendered copy

`copyText()` included JSX comments; `/merchants` triggered on a comment
("Opening credit and Elite trial") rather than rendered `"days of Elite"`.
Fixed by stripping comments before scan and adding `/days of Elite/i` to the
trigger list.

## Verified clean (no finding)

- Demo banner absent from marketing HTML; present on shopper + merchant app shells
- Scenario figures absent in production build
- Token gate (`check:tokens.mjs`) fails build on planted tokens
- No legal drafting sections in rendered HTML
- Clerk scoped to auth shells only
- Offer gate removes copy when `expiresOn` is past
- Redirects: three 308s; `/merchants` returns 200

## Report corrections

`docs/ops/IMPLEMENTATION-REPORT.md` updated for: offers rendering (dates set),
response times published (§14.3), test count 481/61, FAQ "last hardcoded surface"
wording, D36 guard caveat.

## Still open from audit

- Live site tensions: "Live at BBS Mall" vs prelaunch footer; refund claim vs CBK
- Counsel review, Lighthouse on `/` (87), Vercel deploy email on `d4906be`
