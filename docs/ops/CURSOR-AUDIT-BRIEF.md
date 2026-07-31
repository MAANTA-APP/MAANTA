# MAANTA — Phase 6: audit brief for Cursor

**Date:** 2026-07-31
**Branch under audit:** `claude/maanta-marketing-site-y8fesm` — PR #153
**Subject:** the six-page marketing site, four legal pages, and everything in
`docs/ops/IMPLEMENTATION-REPORT.md`

---

## Your job

Find what is wrong. Not what is missing from a wishlist — what is **claimed and
untrue**.

The implementation report is not your specification. **It is the thing under
test.** It was written by the agent that did the work, and it is long, confident
and internally consistent, which is exactly the shape a wrong document takes.
Assume it is accurate about 90% of the build and wrong somewhere in the rest, and
go looking for the rest.

A finding is only a finding if you can show it. "This looks fragile" is not a
finding. "Line 42 claims X, here is the command that shows not-X" is.

---

## Rules

**Do not rewrite the copy.** It came from 16 planning documents and is deliberate.
If copy contradicts a fact, that is a finding — report it, do not fix it.

**Do not "fix" deviations.** §5 of the report lists 17 places the build departs
from the planning documents, each with a reason. Your job is to check whether the
reason is true and the deviation is recorded — not to undo it. An unreported
deviation is a finding. A reported one you disagree with is a comment.

**Do not add features.** Nothing in §6 ("not implemented") is a defect unless the
report claims it was built.

**Verify against rendered output and live behaviour, not source.** Source can be
correct while the page is wrong. Two of the worst defects in this build reached
the production HTML through paths nobody would have found by reading components.

---

## Read in this order

1. `docs/ops/IMPLEMENTATION-REPORT.md` — §14 supersedes parts of §6, §8, §10, §11
2. `docs/maanta-drift-register.md` — rows D28, D33–D36 are from this work
3. `CLAUDE.md` — the frozen rules the site must not break
4. `docs/ops/website-handoff.md` §9 — the held claims
5. `docs/ops/demo-mode-spec.md` §2a — what production must not say about BBS Mall

---

## Setup

The middleware needs Supabase env vars or every route 500s, and
`NEXT_PUBLIC_*` values are inlined **at build time** — set them before building,
not after.

```bash
cd maanta-app
npm ci
cat > .env.local <<'ENV'
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
SUPABASE_SERVICE_ROLE_KEY=placeholder-service-key
MAANTA_AUTH_STRATEGY=supabase
NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=supabase
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV
npm run build && npm start
```

---

## A. The four hard rules — verify each against the build output

These are stated as enforced. Prove they are.

**A1 — the demo banner never renders on a marketing route.**
Check both directions. It must be absent from marketing *and* still present on
`(shopper)` and `merchant/(app)`, where synthetic rows actually render. Scoping it
must not have become deleting it.

Note the switch is the database row `app_config.demo_mode_enabled`, **not** an env
var — you cannot test this by editing `.env`.

**A2 — every number renders from `lib/marketing/facts.ts`.**
Grep the rendered HTML for `KES 30`, `KES 500`, `KES 3,500`, `15 minutes`,
`6-digit`, `100`. For each, confirm the source reads a constant. The claim is that
`facts.ts` re-exports `SUCCESS_FEE_KES` rather than redeclaring it — check that is
true and that nothing else declares the fee.

**A3 — modelled figures render only through `<ScenarioStat>` inside
`<ScenarioNotice>`.**
Build with `NEXT_PUBLIC_SCENARIO_MODE=true` and confirm the figures appear with
`Modelled` badges and a "Preview build" banner. Build **without** it and confirm
`121`, `190`, `6,400`, `78%`, `41%` appear **zero times**, and that nothing frames
BBS Mall as a signed partner.

**A4 — no `{{TOKEN}}` reaches rendered output.**
`npm run build` runs `scripts/check-tokens.mjs`. Read the script: does it scan the
right directory, and would it actually fail? Then **plant a token** in a page,
rebuild, and confirm the build fails.

---

## B. Try to break every guard

Nine test files were written to enforce this work. A guard that passes vacuously
is worse than no guard, because it converts an unchecked property into a checked
one on paper.

For each, **make the change it forbids and confirm it fails**:

| Guard | Break it by |
|---|---|
| `marketing-shell.test.ts` | mounting `<DemoModeBanner />` in `(marketing)/layout.tsx`; deleting it from `(shopper)/layout.tsx`; writing `KES 500` into a marketing page; writing "Boost any deal"; hardcoding a `wa.me/` number |
| `held-claims.test.ts` | pasting each §9 held claim back into a page and into a legal `.md` |
| `auth-provider-scoping.test.ts` | putting `AuthProviders` back in the root layout; removing `AppProviders` from one shell; importing `@clerk/nextjs` into a marketing page |
| `marketing-a11y.test.ts` | adding a second `<main>` to a page; removing a page's `metadata`; removing `noindex` from a legal route |
| `marketing-analytics.test.ts` | passing `message` into the contact submit event |
| `pricing-copy.test.ts` | dropping the first-100 cap from the Elite trial copy |
| `drift-register.test.ts` | flipping an open row to `closed` without evidence |

**Check the comment-stripping.** Several guards strip comments before scanning,
because they were failing on the comments that explained why a banned phrase had
been removed. Confirm the stripper is correct — a naive one breaks on `//` inside
a string or a URL, which would blind the guard silently.

---

## C. The five findings most likely to exist

Where I would look first, based on how this build went wrong before.

**C1 — a claim that is true in source and false in rendered HTML.**
Two defects reached the production build this way. The legal drafts ended with
"Copy alignment required" tables that quote held claims *inside an instruction to
withhold them*, and they rendered on the public page. Grep the built HTML, not the
components, for every §9 claim and for the strings `Questions for counsel`,
`Copy alignment`, `Counsel note`, and `copy/`.

**C2 — the drift register disagreeing with the report.**
This already happened once: D34 sat `open` for four commits while the report
called it closed. Walk every row opened by this work (D28, D33–D36) and confirm
status, evidence and cited paths all resolve. Then check the reverse — anything
the report describes as fixed that has no row.

**C3 — the auth scoping missing a route.**
14 shells mount `AppProviders`. A missed one throws at runtime for a signed-in
user and **no build or type check catches it**. Find every client-side Clerk
consumer (`useUser`, `useAuth`, `SignIn`, `SignUp`, `SignOutButton`,
`ClerkLoaded`) and confirm each sits under a shell that provides it. Then check
nothing under `(marketing)` imports `@clerk/`.

**C4 — a scenario fallback that is not actually gated.**
`/mall-operators`, `/about` and `/` branch on `SCENARIO.isScenario`. Read each
branch: does the production side really avoid the partner framing, or does it just
drop the numbers and keep the implication?

**C5 — the offer gate.**
`OFFERS.*.expiresOn` is `2026-10-31`. Set a past date, rebuild, and confirm the
opening-credit and Elite-trial copy **disappears** rather than going stale. Also
confirm the Elite-trial copy always carries all three qualifications: the
first-100 cap, BBS Mall scope, and that the success fee still applies.

---

## D. Claims in the report to check specifically

Each of these is asserted. Each is falsifiable.

1. §1 Q14 — Supabase is `eu-west-1`. Verify independently.
2. §2 — the homepage typo was already fixed before this work. Check `git log`.
3. §5 #2 — three redirects, not four, because redirecting `/merchants` would make
   the merchant page unreachable. Confirm all three resolve, and that `/merchants`
   serves the marketing page.
4. §5 #3 — redirects emit **308**, not 301. Confirm, and judge whether that
   matters to you.
5. §5 #9 — `/about` renders no founder biography token. Confirm no `{{` survives
   and that the bio prose contains nothing not supplied by the founder.
6. §13.1 — analytics never send field contents. Read the two `trackMarketing`
   submit calls and confirm.
7. §14.1 — the node staffing model is stated as *how a node is staffed*, never as
   a present-tense headcount in a named mall. Judge whether the copy holds that
   line.
8. §16 — the auth scoping proof. Reproduce it: build with
   `MAANTA_AUTH_STRATEGY=clerk` and a placeholder key, and confirm **no**
   `(marketing)` route appears in the prerender failures.
9. §16 — the report **declines** to claim a Lighthouse improvement, on the grounds
   that the measurement was blind to the fix. Check that reasoning. If you think a
   number could have been claimed honestly, say so.

---

## E. Things known to be open — not findings

Do not report these; they are already recorded.

- **3 tokens remain** — `{{AUTH_COOKIE_LIFETIME}}`, `{{CLERK_REGION}}`,
  `{{SENTRY_REGION}}`. Engineering, not legal. Deliberately not invented.
- **PostHog events have never reached a real project.** A placeholder token
  disables capture entirely. Unit-tested only.
- **Lighthouse on production is unmeasured.** Local runs vary ±9.
- **Legal documents are unreviewed drafts**, behind a banner and `noindex`.
- **`/malls/bbs-mall` shows no counts** — deliberate; the previous ones included
  synthetic rows in demo mode.
- **`admin@maanta.app` for all four contact roles**, and a **+44 WhatsApp number**
  — both flagged for launch.

---

## F. Report format

Ordered by severity, with reproduction for each:

```
SEVERITY   what is claimed / where
           what is actually true
           command or file:line that demonstrates it
           suggested fix — or "founder decision"
```

**Severities**

- **Critical** — a false public claim, a broken money path, a disclosure gap, or a
  guard that does not guard.
- **High** — a real defect a visitor or merchant would hit.
- **Medium** — an inaccuracy in the report or drift register.
- **Low** — style, consistency, or a suggestion.

Then answer three questions directly:

1. **Is anything on this site untrue?** The single most important question.
2. **Does any guard pass vacuously?**
3. **Is the implementation report accurate?** Name every place it is not.

---

## G. If you find nothing critical

Say so plainly, and say what you checked. A clean audit that lists its coverage is
useful. A clean audit that lists nothing is indistinguishable from one that was
not performed.

And if you find that the previous agent was **wrong about something it was
confident about** — there are several candidates in §5 and §14 — that is the most
valuable finding you can produce. It already happened twice in this build: a
"solo founder" answer was misread as "no team exists", and a drift row sat open
while the report called it closed. Neither was caught by a test.
