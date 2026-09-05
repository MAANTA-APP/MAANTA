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

---

# Addendum — the Supabase mirror, and the production apply (same day)

Three founder instructions after the first build: mirror the waitlist to Supabase,
apply the migrations, and fix what was flagged. All three are done. **Both
migrations are applied; the ledger reconciles at 112/112.**

## D261 is closed by mirroring, not by working around the cap

`public.waitlist_signups` is now the queryable record. The split is explicit and
neither store is authoritative for everything:

- **Resend** owns deliverability and the join date. It decides whether an address
  already exists and it sends the confirmation.
- **Supabase** owns counting. Everything the console filters, groups or exports
  reads from here, unbounded, the same shape as `readLeads`.

Every column prefixed `resend_` describes *our knowledge of Resend*, not a fact
MAANTA owns. The 500-cap machinery is gone.

**`complete` was re-pointed, not deleted.** It used to mean "the read was not
truncated". It now means "the mirror is known to hold everyone Resend holds", and
it requires BOTH that no row is unconfirmed AND that a confirmed sync has actually
run — derived from `admin_ops_log`, because nothing in this repo writes
`app_config` from a route and `/admin/operations` tells operators exactly that.
Export still refuses while it is false.

## Three defects that would have shipped, and how each was caught

**1. The mirror upsert could never have worked.** `ON CONFLICT (email)` against a
`lower(email)` functional index raises *"there is no unique or exclusion
constraint matching the ON CONFLICT specification"*. I found this by running it on
the project's own Postgres before applying, not by reasoning. Because the mirror
write is deliberately non-fatal, **every signup would have failed silently and
left the console empty**. Identity is now a plain `UNIQUE` column plus
`CHECK (email = lower(email))` — the invariant is in the database, not in two call
sites that happen to agree.

**2. The backfill would have imported nobody, forever.** The sync's payload
omitted `resend_status`, which is `NOT NULL` with no default; every insert died
23502, was counted as `failed`, and the **dry run reported `failed: 0`** because it
skips the write. Since the mirror only collects from the cutover, that route is
the *only* way a pre-cutover signup arrives. Found by the adversarial review,
upheld 3/3. It is now insert-then-targeted-update, which also fixes a second
defect in the same code: a blind upsert's `DO UPDATE` would have rewritten a live
`public_form` row's provenance and reset its `is_test` from whatever Resend held —
laundering a real signup into the test population, the D188 failure mode.

**3. An empty mirror reported itself complete.** `unsynced === 0` is trivially
true of a table with no rows, so before any sync the console would have called
itself fully synced and unlocked CSV export. See `complete` above.

Guard for (2) and its cousins: `growth-waitlist-sync-guard.test.ts` — a source
ratchet, because the route needs Resend and a database and is not unit-testable.

## Security changes the mirror made load-bearing

Both were cosmetic while the only store was a third party. They are not now.

- **`is_test` is server-derived.** It was `b.isTest === true` — anyone reading the
  JSON could file rows the console excludes from its counts. It now comes from
  `/waitlist?test=<token>` checked against `WAITLIST_TEST_TOKEN`, on the page and
  again in the API; `validateWaitlistSubmission` takes it as a parameter, so the
  body cannot set it at all. Both operands are SHA-256 hashed before
  `timingSafeEqual` — that function throws `RangeError` on unequal lengths, and a
  `String.length` guard does not save it (UTF-16 units vs bytes), so an
  attacker-chosen length would have been an unauthenticated 500.
- **The rate-limit bucket carries the normalized email.** `x-forwarded-for`'s
  first hop is client-supplied and the fallback was a single shared
  `waitlist:unknown` bucket. Junk contacts in Resend was tolerable; unbounded
  attacker-controlled rows in the table the console counts as traction is not.

**`WAITLIST_TEST_TOKEN` is a new required env var** for the TEST treatment. Unset,
it fails closed and no submission can mark itself as a test — which is the safe
direction: an unmarked test row is visible noise a human notices, while a real
signup wrongly marked test disappears from every count silently.

## What was applied, and how

Procedure, in order, per CLAUDE.md's two hard-earned rules:

1. Read production `supabase_migrations.schema_migrations` — **not** the directory.
   110 rows at `20260903140000`, so both versions were genuinely next.
2. Applied `20260904120000`, then `20260904130000`.
3. **Each apply minted its own version** (`20260904202546` for the first) —
   seventeen and eighteen for eighteen — and each was **repaired to the repo
   filename before anything else**.
4. Full version+name read-back: **112/112, identical to `ls supabase/migrations/`**.
5. Schema read back: 3 tables, RLS on, 3 policies, `anon` cannot SELECT,
   `authenticated` cannot INSERT, `service_role` can, `joined_at` nullable,
   `resend_status` with no default, the `captured_lead_id` FK present, and
   `public.leads` untouched at 0 rows.
6. A live smoke test of the exact statements the application issues, cleaning up
   after itself (0 rows remaining): signup insert, `ON CONFLICT (email)` upsert, a
   repeat submission proving it is a no-op, the corrected backfill insert, and both
   refusals — missing `resend_status`, and a non-lowercase address.

## Still owed

- **`make db-verify` has never run** — no Docker in this container, so both SQL
  suites are unexecuted. CI's `db-tests` job is the gate.
- **The backfill has never been run against the real audience.** Do the dry run
  first (`{confirm:false}` is the default) and read the `unreadable` count before
  confirming: whether this Resend account returns custom properties on the
  single-contact endpoint is still unproven, and that count is the proof.
- **No browser proof.** Nothing here has been rendered or walked at phone width.
- **The adversarial review was truncated.** 109 of 123 agents died on a session
  limit, so only one finding got full 3/3 verification and roughly two dozen
  candidate findings were never adjudicated. The unverified list is in the run's
  journal; treat this diff as reviewed-in-part, not reviewed.


---

# Addendum 2 — the dry run against the real audience (same day)

Run read-only through the Resend connector, because this container has no
`RESEND_API_KEY` and the route could not be executed. Nothing was written.

## What the audience actually holds

**2 contacts**, both internal: the founder's own address (an end-to-end test
signup, 2026-07-10) and one other (a form signup, 2026-07-26). There is no
genuine external waitlist yet. That is consistent with the D174/D184 split and
should be read the same way — **external waitlist signups: 0**.

The backfill is therefore a small job. Its value right now is proving the path
works, not the rows it moves.

## D261's stated unknown is resolved: properties ARE returned

The single-contact endpoint returns custom properties. The mirror can hydrate,
and the console will not be permanently blind. The account has **ten** configured
properties, created 2026-07-10: `segment_type`, `phone`, `node_interest`,
`business_name`, `note`, `source_channel`, `source_medium`, `source_campaign`,
`consent_at`, `consent_text`.

## Two real bugs the dry run caught, both now fixed

**1. Resend writes flat and reads back TYPED.** `addWaitlistContact` sends
`{segment_type: "merchant"}`, but the read returns:

```json
{"segment_type": {"value": "merchant", "type": "string"}}
```

Every reader in this change did `typeof props.segment_type === "string"`, which is
`false` for that shape. The backfill would have imported both real people with a
null segment, null phone and null consent — **and `properties_unreadable: false`**,
because the object is not empty. So the console would have rendered two genuine
consenting people as consent defects: precisely the "we could not read it" versus
"they did not provide it" confusion the mirror was built to keep apart.

Fixed with `resendPropertyValue()`, which accepts both shapes, plus a fourth
unreadable state: a non-empty properties object carrying **none** of the keys this
audience is configured for is treated as unreadable rather than empty. Guard:
`growth-waitlist-mirror.test.ts`, using the exact JSON the live account returned.

**2. The TEST marker was being written to an unconfigured property.** `is_test`
and `test_label` are not among the ten. Sending an unconfigured property risks the
4xx that triggers `addWaitlistContact`'s strip-and-retry — which drops **every**
property from the contact, not just the unknown one. One internal test signup
could have cost a real signup its segment and consent record.

They are no longer sent to Resend at all. The mirror owns the population split
now, so Resend has no need of them. (I did not prove Resend rejects unknown
properties — I did not write to the live audience to find out. The property is
redundant either way, so removing it is strictly safer and loses nothing.)

## What the dry run would now report

For this audience: `scanned: 2, imported: 2, updated: 0, unreadable: 0, failed: 0`.
Both contacts carry readable `segment_type` and `consent_at`; the 2026-07-26 one
has no `source_*` properties and would correctly land as `unattributed`.

## Still owed

- **The confirmed run has not happened.** Only the read side has been exercised.
- `make db-verify` still has never run — no Docker here.
- One caveat on the connector path: the MCP's `list-contacts` is not
  audience-scoped, while the route reads `/audiences/{id}/contacts`. With two
  contacts on the account the distinction did not bite, but the confirmed run is
  the first thing that would surface a difference.

---

# Addendum 3 — the confirmed backfill (same day)

**Ran. `scanned: 2, imported: 2, updated: 0, unreadable: 0, failed: 0`** — exactly
what the dry run predicted.

Executed through the Resend connector plus direct SQL, because the build
container has no `RESEND_API_KEY` and `/api/admin/growth/waitlist/sync` could not
run. The route's contract was followed rather than bypassed: the `admin_ops_log`
entry (`growth.waitlist.sync`, id `313451c9`) was written **before** any row, so
an unwritable audit would have meant no backfill; the write was
insert-then-targeted-update; and `note` was not mirrored.

Read back: both rows carry `joined_at` (so both appear in the chart rather than in
the unknown-join-date count), `resend_synced_at` is set on both, `unsynced` is 0,
`properties_unreadable` is 0, and `consent_at` is present on both — so the
typed-property fix from addendum 2 is confirmed working against real data. One row
is legitimately `unattributed` (that contact carried no `source_*`).

With one confirmed sync in `admin_ops_log` and zero unsynced rows,
`loadWaitlistDirectory` now reports **`complete: true`**, and CSV export unlocks.

## The finding this run produces, and it is the important one

**Both imported rows are internal, and the console now counts them as real.**

- One is the founder's own address, carrying `source_channel = e2e` and a Resend
  note that read "End-to-end test signup".
- The other is a `+47` number — not a Nairobi shopper.

`Waitlist total: 2` under *Real only · TEST excluded* is therefore the same false
reading D174 and D184 exist to prevent: an internal row incrementing a counter
that is supposed to mean external demand. The backfill is not at fault — Resend
does not carry the TEST marker, so `is_test: false` is the only honest default for
a backfilled contact, and deviating would have made this run unrepresentative of
what the route does.

**External waitlist signups remain 0.** Marking these two rows TEST is a founder
classification, not an engineering fix.

### Ruled and applied the same day

The founder ruled: mark them test. Both rows now carry `is_test = TRUE` and
`test_label = 'internal'`, applied as an audited admin action — **one
`admin_ops_log` entry per row**, keyed to that row's id, recording the before and
after value and the reason, with only the email DOMAIN in the details rather than
the address (SEC-011). A blanket "tagged some rows" entry would not have said
which person was reclassified.

The console now reports, under its default *Real only · TEST excluded*:

| Population | Rows |
|---|---|
| Real | **0** |
| Test | 2 (both `internal`) |

**Waitlist total: 0 is the correct reading**, and it is the case the console was
built to render honestly: the empty state says "nothing yet, and that is
expected" rather than drawing a flat line that looks like a broken feed. The Data
quality card shows `TEST rows held back: 2`, so the exclusion is visible rather
than silent — which is the whole point of the population chip.

This is the waitlist counterpart of the D174/D184 split, and it now holds on all
three counters: internal redemptions, internal merchant records, and internal
waitlist signups are each visible, each retained, and none of them increments the
number that means external demand.

## Still owed after this run

- `make db-verify` has never run — no Docker here, so both SQL suites are
  unexecuted and CI's `db-tests` job remains the gate.
- The sync ROUTE itself has still never executed. Its logic has now been exercised
  against real data, but the HTTP path, its admin guard and its dry-run branch
  have not.
- The connector's `list-contacts` is not audience-scoped while the route reads
  `/audiences/{id}/contacts`. With two contacts that could not bite; on a larger
  audience it would be the first thing to check.

---

# Addendum 4 — security review, 2026-09-05

## Read the automated output correctly first

The adversarial review workflow ran to completion and produced 28 candidate
findings. **Every one of its 42 verification agents then died on a session
limit.** Its "refuted" list is therefore a list of findings that received zero
votes, not findings that were examined and dismissed. Presenting that as a
verdict would have been the exact failure the register exists to catch. What
follows is a hand review of those candidates against the code, with the fixes
made on the branch. It is a hand review; it is not the automated verification
the PR originally promised, and the PR now says so.

## Seven were real, and are fixed (D268)

1. **A repeat signup planted the caller's data against someone else's address.**
   `mirrorWaitlistSignup` ran for `already_exists` too, inserting the CURRENT
   body's name, phone, segment and a fresh `consent_at` for an address the
   caller had only shown they *know* — and `alreadyJoined` in the public
   response tells anyone which addresses those are. The mirror now writes only
   for a contact Resend just CREATED and returns `skipped` otherwise; a
   pre-cutover contact who signs up again is imported by the sync from Resend's
   own record of them. Guard: `growth-waitlist-mirror.test.ts`, whose mocked
   client throws on any table access.
2. **The rate-limit key was the raw email.** `api_rate_limit_buckets` keeps its
   rows after the window and has no reaper, so this was a second, unmanaged
   copy of the waitlist (SEC-011). The key is now the IP plus a 32-hex SHA-256
   digest of the address, with the IP component character-restricted and
   bounded — it becomes a primary key. Verified while here: Vercel overwrites
   `x-forwarded-for` and does not forward an external value, so the "spoofable
   first hop" candidate is unfounded on this platform; the email component
   still matters for any other deployment and for SEC-011.
3. **The sync would have failed a live-path contact forever.** Its update
   carried `properties_unreadable` into whichever row matched the address, and
   the table's CHECK forbids that flag on a `public_form` row. One such contact
   would then fail on every sync, counted under `failed`, until Resend changed
   shape. Backfilled rows now get the full patch; live rows get the same patch
   minus the flag. Guard: `growth-waitlist-route-guards.test.ts` plus scenario F
   of the SQL suite, which is the CHECK itself.
4. **The TEST token went to PostHog on every event.** `/waitlist?test=<token>`
   is the page URL, and autocapture records it as `$current_url`, `$referrer`
   and their `$initial_*` cousins. `before_send` now redacts any `test=`
   parameter in any string property at any depth, shape-agnostically, and
   `test` / `test_token` join Sentry's sensitive-key list (the request query
   string was already scrubbed; the key was not in the list). Guards:
   `analytics-scrub.test.ts` (including that the hook is actually registered)
   and `sentry-scrub.test.ts`.
5. **The CSV export audited after the fact, best-effort.** A single phone reveal
   audits before it answers and refuses when it cannot; the bulk version of that
   act — every name, address and number in a population, leaving the system —
   did not. It now does, with a 503 and no file. The search term is deliberately
   not recorded: it is usually a name.
6. **The lead stage route logged `error.message`.** Constraint messages on
   `growth_merchant_leads` render the row. Code only now, and a malformed id is
   a 400 rather than a cast error that reads like the database is broken.
7. **Two small ones.** `WAITLIST_TEST_TOKEN` has a 32-character floor — below
   it the module fails closed and logs once, never the value (a constant-time
   comparison protects against a timing oracle, not against enumeration). And
   the admin Waitlist page coerces a repeated query key instead of throwing on
   `.trim()`.

## One real gap that needs a migration (D267)

The mirror has no `unsubscribed` column. Resend carries the flag and
`getAudienceContact` reads it, but nothing stores it, so the counts and the CSV
include people who have opted out. **Until the column exists, the export is not
a suppression-checked list.** The fix is a migration and is a founder-authorised
act; it is recorded, not applied.

## Left as notes

Pre-existing or house pattern, not changed: consent is recorded at signup for
whatever address was typed (double opt-in is a product decision, not a patch);
UTMs come from the body (inherent to attribution); `healthz` returns presence
booleans; `GRANT SELECT` to `authenticated` behind RLS is how every admin table
here is shaped; stage changes audit best-effort like every other `logAdminOp`
call; `api_rate_limit_buckets` has no cleanup job.

## Verified after the fixes

`tsc --noEmit` clean · `next lint` clean · **2064 tests across 202 files** ·
`npm run build` green with `check:tokens`, `check:canonicals`, `check:forms`.
Still owed from the earlier addenda: `make db-verify` locally, the sync route
end to end, and browser proof.
