# Admin Growth console — build record, 2026-09-04

**Status:** built, green on `lint` / `typecheck` / `test` / `build`. **Two tables
are not applied** — see D264. Not deployed, not browser-proven.

**Authorisation.** Node 0 Field Validation Mode (CLAUDE.md, from 2026-08-22)
freezes product design and general engineering: Claude Code "wakes only for
demonstrated technical problems or specifically authorized work." This is the
authorised exception — the founder exported design board 3 of 4 from Claude
Design (`MAANTA Admin Growth.dc.html`) with an explicit instruction to implement
it, and chose the depth (UI plus data layer, with TEST segregation real) before
any code was written. It is not an unprompted improvement, and nothing outside
the board's five screens was touched beyond what those screens require.

---

## What shipped

Five screens under `/admin/growth`, inside the existing admin shell.

| Screen | Route | Data source |
|---|---|---|
| Overview | `/admin/growth` | Resend audience + both new tables + `nav.ts` |
| Waitlist | `/admin/growth/waitlist` | Resend audience |
| Merchant leads | `/admin/growth/leads` | `growth_merchant_leads` |
| Campaigns | `/admin/growth/campaigns` | `growth_campaigns` + Resend UTMs |
| Content & SEO | `/admin/growth/content` | `lib/marketing/nav.ts`, computed |

`GROWTH_ITEMS` is a new group in `admin-sidebar.tsx`, above the System divider —
it is real recurring work, unlike Billing and Reports. `isActive` gained an exact
-match branch for `/admin/growth`, which is both a page and the parent of four
others; without it Overview lit up on every Growth screen.

## The three rules the board is really about

**1. Amber is inverted in the console.** In the admin shell amber already means
"the sidebar item you are on". A second amber meaning inside the page would make
frozen rule 1 unresolvable, so every Growth action is **ink-filled**, and amber
survives in exactly two places: that active nav item, and the merchant series in
the signups chart — the series that decides whether Node 0 opens.

**2. TEST is segregated, never hidden.** Every screen states which population it
counted, `DEFAULT_POPULATION` is `real`, and `PopulationChip` renders at every
breakpoint. `growth-population-chip-visible.test.ts` fails if the chip gains a
responsive-hide utility, or if a population-dependent screen stops rendering it.
The reason is concrete: a figure whose population is stated only on desktop gets
screenshotted on a phone and quoted without the qualifier — which is how an
internal test count becomes a traction claim. Same failure class as **D188**,
where `claim_deal` never set `redemptions.is_demo` and every claim silently
counted as real.

**3. Zero is a real answer, and so is "unreadable".** Pre-launch most conversion
metrics are legitimately zero, so empty states say "nothing yet, and that is
expected" rather than drawing a flat line that looks like a broken feed. Separately,
every read returns `{ rows, readable }` and no surface turns an unreadable read
into a confident zero — the register already carries D242, D246, D251 and D253
for exactly that.

## The architectural constraint (D261) — read this before changing the Waitlist screen

**The waitlist has no queryable store.** Signups live in a Resend audience by
founder decision 2026-07-10; there is no `waitlist_signups` table and
`/api/waitlist` is a stateless proxy. The Growth console reads back out of Resend
rather than growing a second copy, which keeps that decision intact — but
Resend's audience-list endpoint returns `id`, `email`, `first_name`, `last_name`,
`unsubscribed`, `created_at` **only**. `segment_type`, `phone`, `node_interest`,
the `source_*` trio and the consent fields are custom properties, reachable one
contact at a time.

So the directory costs one list call plus one call per contact, and:

- the walk is capped at `MAX_DIRECTORY_CONTACTS` (500), hydrated 8 at a time,
  cached 60s in-process;
- a capped or partly-failed read sets `complete: false`, every figure renders as
  a lower bound with a rust banner saying so, and **CSV export is withheld
  entirely** — a spreadsheet has nowhere to carry that warning, and a lower bound
  in a spreadsheet becomes a total;
- an absent `properties` object reads as **unreadable**, never as an empty field.
  "We could not read it" and "they did not provide it" are different facts, and
  only one of them is a consent defect.

This does not scale past a few hundred contacts. Amending it is a founder call
(D261), not an engineering fix — the options are leave it, mirror to Supabase, or
move the store.

## Personal data

Numbers are **masked in the page and never sent to the browser unmasked**.
`RevealNumber` fetches one number from `POST /api/admin/growth/waitlist/reveal`,
which writes an `admin_ops_log` entry **before** returning it — the audit write is
not best-effort here, so a reveal that cannot be logged does not happen. The
logged detail records the email *domain*, not the number: an audit trail that
accumulates the data it exists to protect is a second copy of the exposure.

CSV export inherits the active filter and names the population in the filename
(`maanta-waitlist-real-2026-09-04.csv`), and every cell is quoted with leading
`=`/`+`/`-`/`@` prefixed — a waitlist note is attacker-supplied text and this file
gets opened in Excel.

## The SLA is the published promise

Overdue is measured against `RESPONSE_TIMES.form` — "1 business day" — parsed at
import, not retyped, so the console holds the company to its own public copy.
`businessDaysElapsed` skips Saturday and Sunday: a naive 24-hour clock marks every
Friday-afternoon lead overdue on Sunday, and a weekly false alarm is one the
operator learns to ignore. Only `new` leads with no `first_contacted_at` can be
overdue — the promise is about the *first* reply.

## Content & SEO is a window, not a second opinion

`lib/marketing/nav.ts` already owns the crawl policy in two halves
(`SITEMAP_ROUTES`, `NON_INDEXABLE_PREFIXES`) and `marketing-crawl-policy.test.ts`
already asserts full coverage. The screen renders that, read-only, and says where
it lives — re-deriving it would be the third opinion about one question, which is
how `/feed` once ended up excluded from discovery and crawlable at the same time.

**The claims-guard panel is an inventory, not a live scan.** Those guards read
`.tsx` source, and source is not on disk in a deployed build — a request-time scan
would find nothing to scan and report a perfect score *for that reason*. A green
light meaning "I could not look" is the exact failure that made
`check-server-forms.mjs` necessary (D41). The panel names each guard and where it
runs instead.

## Two frozen-UI rules caught this build, and both were real

Worth recording, because both were caught by ratchets rather than by review:

- **Direction A** — `GrowthCard` and three tables shipped
  `rounded-card border border-line bg-white`. App-surface cards are borderless
  white on `shadow-card`. Fixed by removing the borders, not by reordering the
  classes past the matcher.
- **Frozen rule 4** — nine sites rendered error *body text* in `text-flame`. Red
  is for borders and icons; the message stays `#111` so a state is never carried
  by colour alone. Fixed by moving red to a `border-l-2 border-flame` and keeping
  the text ink. `StatRow`'s error tone was additionally reworked so it no longer
  passes only by matching an allowlist entry written for `cards.tsx`.

## Files

**New libs** — `src/lib/growth/{population,waitlist-directory,leads,campaigns,content-health,data}.ts`
**New components** — `src/components/admin/growth/{population-controls,growth-ui,signups-chart,reveal-number,lead-stage-actions,utm-builder}.tsx`
**New routes** — `src/app/admin/growth/{,waitlist,leads,campaigns,content}/page.tsx`,
`src/app/api/admin/growth/waitlist/{reveal,export}/route.ts`,
`src/app/api/admin/growth/leads/[id]/route.ts`
**Changed** — `admin-sidebar.tsx` (Growth group + exact-match active), `admin-audit.ts`
(three new target types), `resend.ts` (read side + `is_test` property), `waitlist.ts`
(`isTest` / `testLabel`, additive, default false)
**Migration** — `supabase/migrations/20260904120000_growth_leads_and_campaigns.sql`
plus `supabase/tests/growth_leads_and_campaigns_test.sql` (6 scenarios)
**Guards** — six new vitest files under `src/lib/__tests__/growth-*.test.ts`

## What was verified, and what was not

**Ran, green:** `npm run lint` (no warnings), `npx tsc --noEmit`, `npm test`
(196 files / 2022 tests), `npm run build` including `check:tokens`
(53 rendered files, 485 chunks), `check:canonicals`, `check:forms`.

**Not run:** `make db-verify` — this container has no Docker, so the SQL suite has
never executed. The CI `db-tests` job is the gate.

**Not done, deliberately:** the migration is not applied (D264 — a human reads
`supabase_migrations.schema_migrations` first, then repairs the minted version to
the repo filename; fifteen for fifteen applies have minted their own). No browser
proof: nothing here has been rendered in Chromium or walked at iPhone width, so
the responsive behaviour — the `<details>` stage accordions, the sticky-header
tables, the chart's degrade to a sentence — is reasoned, not observed. Treat it
the way D240 treats the redesign: built and unit-guarded, not deploy-ready.

**Also not built:** the board shows bulk actions on the Waitlist toolbar
("Tag as test", "Merge duplicates", "Delete"). Those are writes against the Resend
audience with no undo, and merging duplicates in particular has no defined
semantics for which contact's properties survive. They are omitted rather than
guessed at; the flags that would drive them (`duplicate`, `test`, `no_consent`)
are computed and shown, so the information is there when the semantics are ruled.
