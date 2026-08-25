# All-screens audit — every role, every screen, 2026-08-25

**Scope requested:** end-to-end test of all users and screens; confirm the
buttons work and the data is correct everywhere; fix what needs fixing.

**Result:** 2 genuine defects found and fixed, 1 systemic gap opened for founder
decision, and 4 whole classes of defect checked and found clean.

---

## Read this first: what this audit is, and what it is not

**No button was clicked. No screen was looked at.** The sandbox proxy denies
`maanta.app`, `clerk.maanta.app` and the Vercel host, and Chromium routes
through the same proxy.

A local full stack was attempted and got further than before — `dockerd
--bridge=none --iptables=false` started the daemon that `service docker start`
could not, and the Supabase CLI (2.109.1, the version CI pins) installed. It
still failed: **every container image pull is proxy-denied** (`ghcr.io` blob
storage and CloudFront both return 403), so `docker images` finished at zero and
PostgREST — which the app cannot read data without — never arrived. The
`config.toml` Clerk stub used during that attempt was reverted immediately;
`enabled = true` is unchanged in the repo.

So this is a **static and schema-truth audit**, not a click-through. That
distinction matters, because the two are good at different things:

| Finds | This audit | A click-through |
|---|---|---|
| A query naming a column that does not exist | **yes** — exhaustively | only if that screen is visited |
| A read failure rendering as a real number | **yes** — by shape | only if the read actually fails |
| A link pointing nowhere | **yes** — all 155 | only if that button is pressed |
| An RPC arg the function will not accept | **yes** — all 21 | only on that code path |
| A button that looks wrong, overlaps, or does nothing visually | **no** | yes |
| A broken flow across several screens | **no** | yes |
| Anything about how it renders | **no** | yes |

**The visual and interaction half is still owed and is still yours.** Nothing
below should be read as "the screens were checked".

---

## Coverage

| Role | Screens |
|---|---|
| merchant | 23 |
| marketing | 17 |
| admin | 17 |
| shopper | 16 |
| agent | 4 |
| founder | 2 |
| auth / bootstrap / other | 8 |
| **Total** | **87** |

Plus **40 API routes**. Every one was included in every check below.

---

## What was checked, and what it found

### 1. Does every screen read data that actually exists? — CLEAN

The D164 class: a query filtering or selecting a column that does not exist
type-checks, builds, and only fails against a real database.

Every Supabase query in the app was extracted with an exact method-chain walker
(balanced parens, string-aware — not a fixed window, which is what made the
first pass produce 26 false positives) and validated against **production's live
`information_schema`**.

- **190 query sites** across 72 files
- **0 unknown tables or views**
- **0 non-existent columns**

The only two flags were both my extractor's fault and were confirmed by reading
the source: PostgREST embedded relations (`merchants:converted_to(...)`) read as
columns, and one window bleeding into a helper definition.

### 2. Do the RPC calls match the real functions? — CLEAN

Every `.rpc()` call validated against production's `pg_proc`, by name **and**
argument name.

- **21 call sites**, 18 distinct functions
- **0 functions that do not exist**
- **0 argument names the function would reject**
- **0 functions with more than one overload** — the `onboard_merchant`
  ambiguity trap that `docs/skills/merchant-self-onboarding.md` warns about is
  clear; production holds exactly one 14-argument signature

### 3. Does every button and link go somewhere real? — CLEAN

Every `href`, `router.push`, `router.replace` and `redirect` target resolved
against the route tree built from the filesystem, with route groups stripped and
both catch-all forms handled.

- **155 internal link targets** across **131 routes**
- **0 that do not resolve**

(The first pass flagged 16 references to `/login`. That was my matcher not
understanding `[[...sign-in]]`, the *optional* catch-all, which matches `/login`
itself. Corrected, then clean.)

### 4. Is every privileged screen actually guarded? — CLEAN

| Group | Layout guard | Pages | Pages that also self-guard |
|---|---|---|---|
| admin | `requireAdminPage` | 17 | 17 |
| founder | `requireFounderPage` | 2 | 2 |
| agent | `requireAgentPage` | 4 | 2 |
| merchant | layout redirects unauthorised to `/login` | 23 | — |

Admin and founder have defence in depth — layout **and** page. Agent relies on
the layout guard for two of four pages, which is sufficient in the App Router
(a layout wraps every page beneath it); noted as an asymmetry, not a hole.

Of 40 API routes, 10 showed no auth signal to the first pass. Reading each: 8
do authenticate (401 + user resolution) via patterns the regex did not know.
The two that genuinely do not are `/api/contact` and `/api/waitlist` — public
marketing endpoints, correctly public, both carrying input validation. The
third, `/api/sentry-example-api`, is finding **D186** below.

---

## Defects found and fixed

### D185 — `/admin/reports` had D164's defect, on the money figure

The one that matters. `/admin/reports` destructured five reads straight off
`Promise.all`, discarding every `error`:

```ts
const [{ count: verified }, { data: feeRevenue }, … ] = await Promise.all([…]);
const revenue = Number(feeRevenue ?? 0) || 0;
```

A single failed query therefore rendered **"Verified redemptions 0"** and
**"Success-fee revenue KES 0"** as confident statements about the business.

This is precisely the shape D149 fixed on `/founder` and D164 fixed on `/admin`
two days ago. Reports was the **third** KPI surface and had never been covered
by either ruling — and it is the one that puts a zero next to money, which the
frozen UI rules treat as the most dangerous place for a false figure.

**Fixed.** `results` is inspected before any destructure; the page renders the
shared `LeadsReadError` with identical wording, so an operator learns one
failure shape. Unlike `/admin` there is nothing to exclude — every read here is
a metric, so the guarded set is the whole array.

**Guard.** `claims-metric.test.ts` now enumerates all three KPI surfaces
**explicitly rather than globbing**. A glob would pass silently the day someone
adds a fourth dashboard — which is exactly how this one went two rulings
uncovered. Verified to fail against the pre-fix source on all three new
assertions.

### D186 — a public 500-generator was shipping to production

`src/app/api/sentry-example-api/route.ts` threw `SentryExampleAPIError` on every
GET. `src/app/sentry-example-page/` rendered the page that calls it. Both were
compiled into the production build, with no middleware or config exclusion:

```
.next/server/app/api/sentry-example-api/route.js      present
"/sentry-example-page"  in routes-manifest.json       present
```

Sentry wizard scaffolding that was never removed. The blast radius is the
**error channel**, not data: anyone could generate unlimited 500s and Sentry
events on demand, and Node 0 field validation is exactly when a real error has
to be distinguishable from noise. A public page whose only function is to break
is also not something to leave live while the first genuine merchant is shown
the product.

**Fixed** — both deleted, build re-run, neither appears in the route manifest.
Sentry itself is untouched and still captures real errors.

---

## Opened, and deliberately not fixed

### D187 — nothing decides which screens owe a read-failure state

Of 62 data-reading screens, three inspect their query errors. The rest
destructure and render.

**Most of those are genuinely fine, and this is not a request to sweep them.**
The audit checked the dangerous shape specifically rather than counting
`try/catch`:

- `merchant/(app)/redeem` — a failed read hides an informational banner; the
  verify path is RPC-enforced regardless. Safe.
- `admin/agents`, `merchant/(app)/deals` — `Map.get() ?? 0`, a legitimate
  map-miss default, not a failed read. Safe.
- `admin/customers/[id]` — reads a column off an already-fetched row. Safe.
- **`merchant/(app)/deals/[id]`** — the one remaining instance of the dangerous
  shape: a failed `verifiedCount` read renders `0` verified against a deal.
  Merchant-facing, lower stakes than money, and **left alone deliberately**.

The real gap is that nothing decides where the guard belongs. D149 and D164
each fixed the surface in front of them; D185 found the third by audit rather
than by rule. Recommendation is the narrow rule — require the guard on any
screen rendering a count, sum or money figure, which would have caught all
three — **after first field evidence, not before.** A 60-file sweep the week of
Merchant 01 is the risk the freeze exists to prevent, and the money path is
enforced in `claim_deal` / `verify_redemption`, not in any of these reads.

---

## Verification

| Gate | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | **1173 passed / 133 files** (up from 1166 — 7 new assertions) |
| `npm run build` + 3 post-build gates | pass; sentry routes absent from the manifest |
| New ratchet vs pre-fix source | **fails on all 3 assertions**, as required |

Production was **not** mutated by this audit. It was read from — the live
`information_schema` and `pg_proc` were the ground truth every check ran
against — and nothing was written.

## Still owed, and still yours

1. **The click-through.** Every visual and interaction check in the table at the
   top. This audit cannot substitute for it and does not claim to.
2. The three operational checks from the freeze state: signed-out marketplace,
   `/admin` and `/founder` rendered, and `MAANTA_DEMO_MODE` removed from Vercel.

**`/admin/reports` is worth one extra look** when you do the click-through: it
is the screen this audit changed.
