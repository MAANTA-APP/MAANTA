# D14 — Live Shopper Discovery Resolution

**Date:** 2026-08-10 · **Mode:** Builder · **Branch:** `claude/maanta-launch-baseline-b9ytep`

## Decision

**Founder ruling, 2026-08-10.** The primary signed-out shopper CTA must lead to
the **real public shopper-discovery experience for BBS Mall**, not to demo mode.
Demo mode may remain only as an explicitly labelled internal/sales/QA preview,
excluded from the public conversion path. Rationale: MAANTA's near-term objective
is to prove the complete loop — discover, claim, visit, verify, report — and a
CTA that lands in a demo blocks the evidence the mall-operator pilot depends on.

**The ruling is right, and its premise about the code was not.** Verifying before
editing found that the shape of demo mode in this repository is the opposite of
what the instruction assumed. That changes what "implementing" the ruling means,
so it is stated plainly here rather than resolved silently.

### What demo mode actually is

There is **no demo route the CTA points at.** There is no demo copy of the feed,
and demo mode is not a data-source swap.

- `/feed` **is** the canonical public shopper-discovery route. It is already what
  `HEADER_CTA` (`lib/marketing/nav.ts`) and both hero CTAs target.
- Deals carry an `is_demo` column. `withPublicMerchant` and
  `withPublicMerchantRows` in `src/lib/data.ts` filter `.eq("is_demo", false)`
  **by default**; a surface can only show synthetic rows by naming
  `includeDemo` at its own call site.
- `getLiveDeals()` sets `includeDemo` from `isDemoModeEnabled()`, which reads
  `app_config.demo_mode_enabled` from Postgres.
- So real deals **always** render. The flag **adds** synthetic rows on top of
  them; it never replaces or hides real ones.
- `/demo` is an unrelated page: a rehearsal-logins index for seeded accounts.

**Consequence: the code half of the ruling was already satisfied**, and D14 is
not a code defect. D14 is the single sentence its row has always carried —
`app_config.demo_mode_enabled` is `true` in the **production database**. That is
a row in a table, not a fact about this repository, and `CLAUDE.md` reserves
production database changes for a human operator. No code change in this branch
can close it.

## Canonical public shopper route

**`/feed`** — `maanta-app/src/app/(shopper)/feed/page.tsx`.

Verified this session, from source:

| Property | Evidence |
|---|---|
| Renders signed out | `getAppUser()` may be null; the page guards on it (`{user ? <NotificationOptIn /> : null}`) and favourites resolve to an empty set for a null user |
| Node-scoped | `getSelectedNode()` threads a node into all three bucket queries |
| Real production data path | `getLiveDeals(node)` → `selectLiveDealBucket` → `deals` with a `merchants!inner` join |
| Claim gate preserved | Unchanged. Claiming remains gated by the existing auth/phone-verification flow and enforced server-side by the `claim_deal` RPC |
| Not indexable | Disallowed via `NON_INDEXABLE_PREFIXES` (D89), which is correct while demo rows can appear and is a separate decision from whether humans should land there |

## CTA inventory and final destinations

**No CTA destination was changed.** Every one already resolved to the canonical
route; changing any would have been churn.

| CTA | Location | Destination | Changed? |
|---|---|---|---|
| Header CTA ("Browse deals") | `lib/marketing/nav.ts` → `SiteHeader`, desktop + mobile sheet | `/feed` | No |
| Home hero primary | `(marketing)/page.tsx` | `/feed` | No |
| `/shoppers` hero primary | `(marketing)/shoppers/page.tsx` | `/feed` | No |
| `/shoppers` closing band | `(marketing)/shoppers/page.tsx` | `/feed` | No |
| `/shoppers` sticky mobile CTA | `StickyCta`, added earlier this session | `/feed` | No |
| Footer "Browse deals" | `FOOTER_COLUMNS` → `SiteFooter` | `/feed` | No |

## Demo-mode boundary

| Boundary | State before | State after |
|---|---|---|
| Linked from any marketing surface | Not linked | Not linked, **now guarded** |
| In `sitemap.xml` | Absent | Absent, **now guarded** |
| `robots.txt` | `Disallow: /demo` | Unchanged |
| `noindex` meta | **Missing** | **Added** |
| Visible labelling | `<h1>Demo & rehearsal logins</h1>`, "Dev/rehearsal aid only — not linked from the product" | Unchanged, now guarded |

**The one real gap, and why it mattered.** `/demo` was `Disallow`ed but not
`noindex`ed. `robots.ts`'s own docblock already makes the argument that settles
this, for the four legal routes: **a disallow stops a crawl, not an index.** A
disallowed URL linked from anywhere can still be listed as a bare URL with no
snippet — precisely because the crawler was forbidden from reading the page that
would have said `noindex`. A result titled "Demo & rehearsal logins" under
MAANTA's domain is exactly the impression the ruling forbids. It now carries
`robots: { index: false, follow: false }` as well as the disallow, not instead
of it.

`/demo` was deliberately **not** put behind auth. It is a login index for seeded
accounts, exposes no data of its own, and every account it names is already
gated by the real auth flow. An auth wall there would be a new access-control
system guarding a page that grants no access — and the task explicitly ruled out
introducing authentication for this.

## Empty-state behavior

**Already correct; left alone.** `/feed` renders, when no eligible deals exist:

> **No deals live right now** — Merchants drop new deals through the day.

That is honest, in the product's closed vocabulary, promises no availability, and
offers no waitlist or notification commitment. The ruling's suggested copy was
adapted-to-voice rather than adopted verbatim, per its own instruction; the
existing string already satisfies every constraint, so changing it would be
cosmetic churn on a surface real shoppers are about to be sent to.

**Worth stating plainly:** once the flag is flipped, this empty state is the
*likely* first thing a shopper sees, because turning off demo mode reveals only
the real non-demo deals at Node 0 — which may be none. That is a merchant
acquisition and seeding question, not a defect, and it is the reason the flip
should be sequenced with real merchant deals rather than done in isolation.

## Eligibility and paused-deal safeguards verified

All confirmed in `selectLiveDealBucket` (`src/lib/data.ts`), and now guarded:

- **Paused** — `.eq("is_paused", false)`. Mirrors the `claim_deal` pause gate so
  discovery never advertises a CTA the backend will refuse (D25,
  `docs/skills/paused-deal-semantics.md`).
- **Expired** — `.gt("expires_at", nowIso)`.
- **Inactive** — `.eq("is_active", true)`.
- **Merchant visibility** — `status = active`, `is_visible = true`,
  `is_shadow_banned = false`.
- **Synthetic** — `is_demo = false` on both the deal and its merchant, unless
  the caller opts in.

Claim enforcement remains server-side in the `claim_deal` RPC; the UI filter is
a safety layer, unchanged. **No Supabase schema, migration, RLS policy, RPC
definition or payment flow was touched.**

## Tests and commands run

| Command | Result |
|---|---|
| `npm run lint` | see final run below |
| `npm run typecheck` | see final run below |
| `npm test` | see final run below |
| `npm run build` | see final run below |
| `npx vitest run demo-boundary.test.ts` | ✅ 10 passed |
| `npx vitest run drift-register.test.ts` | ✅ after this document existed — the guard failed first, correctly, because D14 cited a file not yet written |

New suite `maanta-app/src/lib/__tests__/demo-boundary.test.ts` asserts:

1. Header and footer shopper CTAs resolve to `/feed`.
2. No marketing page or component links to `/demo` or a `demo=true` query flag.
3. `/demo` is disallowed, **noindex**, and absent from the sitemap.
4. `/demo` identifies itself as a rehearsal surface in visible copy.
5. Public visibility helpers exclude `is_demo` rows by default.
6. Demo mode reads the database (not an env var) and fails closed — anything
   but the exact string `"true"` resolves to off.
7. Discovery excludes paused, expired and inactive deals.

**Proven non-vacuous:** removing the `robots` export from `/demo` failed
assertion 3 alone, on the right line, and nothing else.

**E2E not run.** `npm run test:e2e` needs `E2E_BASE_URL` and stored auth state,
which this container does not have. The signed-out navigation path
(marketing → CTA → `/feed` → deal or empty state) is therefore verified from
source and not from a browser. No production data was mutated to test anything.

## Analytics limitation retained under D88

**D88 is explicitly not resolved here**, per instruction.

No new event, cookie, SDK configuration, tracking pixel, consent UI or
persistence change was added. Source attribution already exists and is
non-breaking: `trackMarketing` emits `marketing_cta_clicked` with `surface`,
`name`, `location` and `href`, and the shopper CTAs are separable today by
`location` — `hero`, `cta-band`, and `sticky-mobile` from this session's earlier
work. Existing PostHog queries keep working; renaming these to
`homepage_hero`-style labels would break them for no gain.

**The limitation that remains, unchanged:** `persistence: "memory"` means
`serverPosthogDistinctId()` returns `null` for every signed-out request, so
server-side events fall to `distinct_id_source: 'none'`. Client-side CTA clicks
are attributed within a session; signed-out server events are not attributable
across one. So MAANTA can measure *which CTA was clicked* but not reliably join
that to what the same visitor did next on the server. That is D88, and it is the
right next task now that this CTA is sending real traffic into the loop.

## Drift-register update

**D14 stays `open`.** The code evidence is recorded on the row and the close
conditions are now explicit:

1. A human flips `app_config.demo_mode_enabled` to `false` on production, per
   `docs/ops/demo-mode-runbook.md`.
2. The value is read back from `app_config`, **and** `/feed` is fetched
   anonymously on `https://www.maanta.app` and shown to render zero synthetic
   rows.
3. Timestamp, operator and that read-back are recorded on the row.

Closing it on "no public CTA routes to demo mode" was considered and rejected:
that criterion is true, but it is not what the row says, and the register's rule
is that `closed` means fixed, live and evidenced. The product still shows
synthetic deals to anyone who visits.

## Remaining risks or manual checks

- **The flip is the whole remaining task, and it is founder-owned.** Everything
  in this branch is preparation for it.
- **Sequence the flip with real deals.** Flipping in isolation most likely yields
  an empty feed at Node 0. Confirm at least one real, active, unpaused,
  unexpired deal from an active visible merchant exists before or alongside the
  flip.
- **`/feed` stays `Disallow`ed after the flip.** That was decided under D89 while
  demo rows could appear. Once real deals are live, whether public deal
  discovery should be indexable is a genuine product-SEO decision — the
  `NON_INDEXABLE_PREFIXES` docblock already flags `/deals` as disallowed
  "deliberately, not by omission" pending exactly this call. It is not covered
  by the D14 ruling and should not be changed as a side effect of it.
- **The demo banner keeps working after the flip.** `DemoModeBanner` reads the
  same flag, so it disappears with the synthetic rows in one change.
- **Not verified in a browser.** Signed-out `/feed` behaviour and the empty state
  are verified from source only, for the reason given above.
