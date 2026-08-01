# Marketing site — finish plan

**Companion to:** `docs/ops/marketing-site-gap-audit.md` (read it first)
**Date:** 2026-08-01
**Baseline:** production `dpl_8PvconvVT9ns66aF4YjQek7rTosi`, commit `038e3bc0`, build `sxaguL-wUiFwrRQgXcPHW`
**Audience:** Claude Code / Cursor

---

## 0. How to use this document

The IA is done. **Do not restructure the site.** Every step below is a repair or a
completion of something that already exists.

Rules for whoever executes this:

1. **Work the steps in order.** They are ordered so that each one shrinks the blast
   radius of the next. Step 1 is not code.
2. **One step, one PR.** Each step lists an acceptance check. A step is done when its
   check passes against **built HTML**, not against source.
3. **`VERIFY IN REPO` means verify.** File paths in this plan are inferred from Next.js
   chunk names and commit messages, not read from disk. Confirm before editing.
4. **Never assert a fix from source alone.** This build has produced three defects that
   were correct in JSX and wrong in the rendered HTML. Every acceptance check below is
   written against `curl`-able output for that reason.
5. **Do not write legal copy.** Step 5 is the only legal-adjacent work and it is
   fact-filling and configuration, nothing else.
6. **Update the drift register in the same commit as the fix**, not after. D34 sat
   `open` for four commits while the report called it closed.

**Definition of done for the whole plan:** the six target pages plus `/pricing` render
with authored metadata, a canonical, and a correct OG card; `/contact`'s form exists in
server HTML; there is exactly one URL per page; and no page carries copy that instructs
a colleague to do something.

---

## 1. The smallest safe completion sequence

Seven steps. Steps 1–4 are the minimum to call the site correct. Steps 5–7 are the
minimum to call it finished.

| # | Step | Type | Blocking? | Est. |
|---|---|---|---|---|
| 1 | Reconcile branch and `main` | Release hygiene | **Yes — do first** | 15 min |
| 2 | Re-verify the nine guards by mutation | Testing | Yes — gates 3–7 | 1–2 h |
| 3 | Collapse the duplicate URL | 1-line config | No | 20 min |
| 4 | Fix metadata: canonical, `og:url`, OG pairs | Site-wide | No | 2–3 h |
| 5 | Server-render the `/contact` form | Component | No | 2–4 h |
| 6 | Finish `/pricing`, `/merchants/join`, `/feed` metadata | Content | No | 3–5 h |
| 7 | Legal fact-fill + robots decision | Content + config | Needs founder | 1 h + decision |

Then a polish backlog (§3) that is explicitly **not** required for done.

---

### Step 1 — Reconcile the branch with `main` *(do this before anything else)*

**Why first:** production is currently a *promotion of a branch deployment*. The commit
it serves, `038e3bc0`, landed after PR #154 merged. If it is not on `main`, then `main`
is missing a fix to two guard tests that were passing vacuously — and every subsequent
step in this plan would be built on a trunk whose test suite is green for the wrong
reason.

**Do:**

```bash
git fetch origin
git log --oneline main..origin/claude/maanta-marketing-site-y8fesm
git log --oneline origin/claude/maanta-marketing-site-y8fesm..main
```

- If the first command prints nothing → the branch is merged. Redeploy production from
  `main` so the promoted deployment and the trunk agree. Then delete the branch.
- If it prints commits → open a PR for them, merge, deploy `main` to production.

**Acceptance check:**

```bash
# the SHA Vercel reports for the production deployment must be an ancestor of main
git merge-base --is-ancestor <production-sha> origin/main && echo OK
```

and the Vercel production deployment's `githubCommitRef` reads `main`, not
`claude/maanta-marketing-site-y8fesm`.

**Risk if skipped:** silent divergence. Everything downstream is unreliable.

---

### Step 2 — Re-verify the nine guards by mutation *(gates every later step)*

**Why:** two of the nine guards were found to pass vacuously — a comment stripper that
treated `://` as a line comment, and a pricing-copy test that scanned JSX comments
instead of rendered copy. Both were written by the same process that wrote the other
seven. A guard that passes vacuously is worse than no guard, because it converts an
unchecked property into a checked one on paper — and steps 3–7 will lean on these guards
to prove they did not regress anything.

**Do:** for each of the nine test files, **break the thing it protects and confirm the
test fails.** Not "read the test and agree with it" — run it red.

Suggested mutations, from what the guards are known to cover:

| Guard covers | Mutation that must turn it red |
|---|---|
| WhatsApp number constant | Change one call site to `wa.me/254700000000` |
| Pricing copy | Change `KES 30` to `KES 40` in rendered JSX (**not** in a comment) |
| Elite trial terms | Change `30-day` to `60-day` |
| Held claims / demo disclosure | Delete the footer pre-launch paragraph |
| Analytics payload privacy | Add a `name` or `phone` field to a `trackMarketing` call |
| Demo-mode switch | Flip the DB-row default |
| Node-staffing model copy | Change "up to four agents" to "our team" |
| Legal draft banner | Remove the banner from one legal page |
| Route/footer link integrity | Point a footer link at a non-existent route |

**Critical:** any guard that reads `.tsx` source must be rewritten to read **built HTML**
from `.next/server/app/**/*.html` or a fetched response. That is the lesson of the two
failures and of GAP-01. **`VERIFY IN REPO`** — `CLAUDE.md` has a "Marketing site" section
naming the four enforced rules and the tests that enforce them; start there.

**Acceptance check:** a documented table of nine rows — guard name, mutation applied,
`FAIL` observed, mutation reverted. Commit the table. If any guard cannot be made to
fail, it is not a guard; fix or delete it, do not leave it green.

---

### Step 3 — Collapse `/how-it-works` into `/shoppers` *(smallest high-value change)*

**Why:** `/how-it-works` returns 200 with `x-matched-path: /shoppers` and a body
byte-identical to `/shoppers`. PostHog recorded 10 pageviews at `$pathname =
/how-it-works` in 14 days, which means the URL stays in the bar — so it is a **rewrite**,
not a redirect, and `/shoppers` is live at two URLs with no canonical on either. One line
removes the duplicate at source and makes Step 4 simpler.

**Do:** find the `/how-it-works` entry — almost certainly `rewrites()` in `next.config`.
Move it to `redirects()`:

```js
{ source: '/how-it-works', destination: '/shoppers', permanent: true }
```

**`VERIFY IN REPO`** — also grep for `how-it-works` across the repo. Nothing on the live
site links to it (zero occurrences in the HTML of `/`, `/shoppers`, `/merchants`,
`/contact`, `/login`, and absent from nav, footer and sitemap), but confirm no email
template, QR code, print asset or PostHog dashboard depends on the URL. If a printed
asset uses it, the 308 keeps it working — that is the point of choosing a redirect over
deleting it.

**Acceptance check:**

```bash
curl -sI https://www.maanta.app/how-it-works | head -3
# expect: HTTP/2 308  +  location: /shoppers
```

and `/sitemap.xml` still contains `/shoppers` exactly once and `/how-it-works` zero times.

---

### Step 4 — Fix canonical and Open Graph across the site

**Why:** zero `<link rel="canonical">` tags exist site-wide, and `og:url` is never the
page's own URL. On `/`, `/shoppers`, `/merchants`, `/mall-operators` and `/about` it is
missing entirely, along with `og:site_name`, `og:locale` and `og:type`.

**The actual bug is small.** `/contact` and `/pricing` *do* emit those four fields. The
five that lose them are exactly the five that declare a page-level `openGraph` object —
and in the App Router, a page-level `openGraph` **replaces** the parent's wholesale
rather than merging field-by-field. So the five richest pages silently discard the root
layout's OG fields.

**Do:**

1. Set `metadataBase: new URL('https://www.maanta.app')` in the root layout metadata if
   it is not already set. **`VERIFY IN REPO`**
2. Add a shared helper — e.g. `lib/seo/page-metadata.ts` — that takes
   `{ path, title, description, ogTitle?, ogDescription? }` and returns a `Metadata`
   object with `alternates.canonical` set and the shared `openGraph` base spread in
   before the page's overrides.
3. Route every marketing page through it: `/`, `/shoppers`, `/merchants`,
   `/mall-operators`, `/about`, `/contact`, `/pricing`, `/faq`, `/help`, `/waitlist`,
   `/download`, `/malls/bbs-mall`, `/merchants/join`, and the four legal pages.
4. **Fix the split-sentence OG pairs (GAP-05) in the same pass** — they are one edit away
   once every page routes through the helper:
   - `/mall-operators`: `og:title` = *"Your mall runs hundreds of promotions a month."*,
     `og:description` = *"None of them are measured."* — the H1 cut at the full stop.
   - `/about`: `og:title` = *"What MAANTA is, and how it makes money."*,
     `og:description` = *"Live at BBS Mall, Eastleigh, Nairobi."*

   Both pages already have a well-written `<title>`/`<meta description>` pair. Reuse that
   register: the OG title should stand alone and the OG description should be a sentence,
   not the second half of the title.

5. **Do not** add a canonical to the 404.

**Acceptance check** — run against every route and assert all three:

```bash
for p in "" /shoppers /merchants /mall-operators /about /contact /pricing \
         /faq /help /waitlist /download /malls/bbs-mall /merchants/join \
         /privacy /terms /merchant-terms /cookies; do
  echo "== $p"
  curl -s "https://www.maanta.app$p" \
    | grep -oE '<link rel="canonical"[^>]*>|<meta property="og:url"[^>]*>'
done
```

Every route must print a canonical whose `href` is `https://www.maanta.app<path>` and an
`og:url` with the same value. **Add a guard test that fails if any marketing route emits
zero canonicals or an `og:url` equal to the bare origin.** Assert against built HTML.

---

### Step 5 — Server-render the `/contact` enquiry form *(the highest-value content fix)*

**Why:** `/contact` is a target page and its form does not exist in server HTML. What
ships is:

```html
<!--$!--><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
<div class="h-96 animate-pulse rounded-card border border-line bg-paper"></div><!--/$-->
```

Zero `<form>`, zero `<input>`. Without JavaScript the page renders a grey rectangle that
pulses forever — directly above server-rendered copy promising *"This form and email — We
reply within 1 business day."*

This is drift D28's successor. D28 was a form that POSTed nowhere while telling the
sender it had arrived; that was fixed by wiring `/api/contact` to Resend. The form is now
wired but is no longer rendered. **Record it in the drift register in those terms** — the
same failure mode reappearing in a new place is the thing the register exists to catch.

**Do:**

1. Find why `EnquiryRouter` bails. Chunk: `app/(marketing)/contact/page-*.js`. The
   signature — a Suspense bailout on an otherwise prerendered page, on a component named
   for routing by enquiry topic — is the classic `useSearchParams()` case.
   **`VERIFY IN REPO`**
2. Restructure so the **form markup is server-rendered** and only the topic-dependent
   behaviour is client-side. Options, cheapest first:
   - Render the full form server-side with a sensible default topic; hydrate the topic
     selector on the client. Read `?topic=` in a small client child that only *sets* the
     select value.
   - Or make `/contact` accept `searchParams` as a server-component prop, which needs no
     client hook at all for the initial render.
   - Or, if the client boundary must stay, give Suspense a **real fallback**: the actual
     form markup, not a pulsing rectangle.
3. `/waitlist` already gets this right — its form is fully server-rendered including a
   `hp_url` honeypot. **Copy that pattern.** **`VERIFY IN REPO`**
4. Add a `<noscript>` block naming WhatsApp and `admin@maanta.app`, so the section is
   never empty.
5. While in here, confirm the **form-submit analytics event** exists and fires. PostHog's
   event schema contains `marketing_section_viewed`, `marketing_cta_clicked` and
   `marketing_faq_opened` — but **no form-submit event of any name**, and `/contact` had
   zero pageviews in 14 days. The implementation report describes five events including
   form submits. Either it is named outside the `marketing_*` prefix or it has never
   fired. **`VERIFY IN REPO`** — there is a marketing event-constants module.

**Acceptance check:**

```bash
curl -s https://www.maanta.app/contact > /tmp/contact.html
grep -c 'BAILOUT_TO_CLIENT_SIDE_RENDERING' /tmp/contact.html   # must be 0
grep -oE '<form[^>]*>' /tmp/contact.html                        # must print a form
grep -oE 'name="[^"]+"' /tmp/contact.html | sort -u             # must list every field
```

Plus a manual pass with JavaScript disabled: the form must be visible and legible.
Then submit one real enquiry end-to-end and confirm **both** emails arrive (enquiry to
`admin@maanta.app` with `reply_to` set, and the autoresponder), and that the submit event
appears in PostHog.

**Guard to add:** a test asserting `/contact`'s built HTML contains a `<form>` and zero
`BAILOUT_TO_CLIENT_SIDE_RENDERING` markers.

---

### Step 6 — Finish `/pricing`, `/merchants/join` and `/feed` metadata

Three routes are indexable with the **root-default** `<title>` (`Maanta — The mall, made
live.`) and description. The casing is a useful tell: root default says "Maanta", the
homepage says "MAANTA". Any tab showing "Maanta" is inheriting root metadata.

**6a — `/pricing` (confirmed in scope).** It is in the primary nav, so it is the one that
matters. Today: no authored metadata, no page-specific OG image, ~90 words, two cards and
a pill.

- Add authored `title` + `description` via the Step 4 helper.
- Add a page-specific OG image alongside the existing six. **`VERIFY IN REPO`** — the
  pattern is a route-level `opengraph-image` file (URLs render as
  `/shoppers/opengraph-image-azkhd6`).
- Bring the page up to the structure the other pages use: who each plan is for, what a
  "verified redemption" is, the boost mechanic, and the merchant FAQ. **Reuse the
  `/merchants` copy — do not write new commercial claims.** The numbers already agree
  across both pages (KES 30 success fee, KES 3,500/mo Elite, KES 500 per 24h boost,
  30-day trial for the first 100 BBS Mall merchants, 7-day grace, then Standard).
- Add a CTA to `/merchants/join`. The page currently has none.
- Re-confirm the pricing-copy guard now reads **rendered** copy — it was one of the two
  fixed in `038e3bc0` for scanning JSX comments.
- **`VERIFY IN REPO`:** a superseded deployment logged a `fetch failed` while revalidating
  a `live-deals,BBS Mall` cache key on `/pricing.rsc`. Today's page is fully static.
  Confirm no live-deals fetch remains.

**6b — `/merchants/join`.** ~59 words, sitemap priority 0.8. Add authored metadata. Its
OG image currently inherits `/merchants`' — so the card shows *"You only pay when a
customer walks in"* over a title reading *"Maanta — The mall, made live."* Either give it
its own image or make the title match the inherited one.

**6c — `/feed`.** Sitemap-listed, indexable, second-most-visited page (220 views / 48
people in 14 days). Three defects, all cheap:

- Add authored `title` and `description`.
- Add an `og:image` — it currently has **none at all**, so shares produce an imageless
  card.
- Add an `<h1>`. The page starts at `<h2>`.
- Remove the **duplicate `<main>`** — there is an empty `class="px-4 pt-4"` skeleton plus
  the real `max-w-mobile` one. Two `main` landmarks is an a11y defect.

`/feed` sits in the app shell, not the `(marketing)` layout. That is correct — do not
move it. Note it publicly serves demo fixture data behind an honest *"Demo mode — sample
data for rehearsal"* banner; the switch is a DB row, not an env var. Leave the data alone;
**consider a pre-deploy check that fails if demo mode is on for production.**

**Acceptance check:** no route in `/sitemap.xml` may return the root-default title.

```bash
curl -s https://www.maanta.app/sitemap.xml | grep -oE '<loc>[^<]+</loc>' \
  | sed 's/<[^>]*>//g' | while read u; do
    t=$(curl -s "$u" | grep -oE '<title>[^<]*</title>')
    echo "$t  <-  $u"
  done | grep -i 'Maanta — The mall, made live' && echo "FAIL" || echo "OK"
```

---

### Step 7 — Legal: fact-fill and the robots decision

**Do not write legal copy.** Two items only.

**7a — Fill the three unfinished cells (LEG-01).** Three table cells shipped reading
**`to be confirmed with engineering`**. These are engineering facts, not legal drafting:

| Page | Table | Row | Column | What to fill |
|---|---|---|---|---|
| `/privacy` | Sub-processors | Clerk — Account authentication | Processing location | Where Clerk processes data |
| `/privacy` | Sub-processors | Sentry — Error monitoring | Processing location | Where Sentry processes data |
| `/cookies` | Retention | Session cookies — Authentication | Retention period | Session cookie lifetime |

Sibling rows are already filled ("the EU (Ireland)", "Kenya", "the United States",
"European Union"), so the format is set. Get the two locations from the Clerk and Sentry
project settings; get the session lifetime from the Clerk session configuration.
**Change nothing else on those pages.** If a value genuinely is not decided, write the
stated decision — not an instruction addressed to a colleague, which is what the current
text is.

**7b — Resolve robots vs noindex (LEG-02).** **`DECISION REQUIRED — FOUNDER`. Do not
guess.**

The four legal pages are `Disallow`ed in `robots.txt`, absent from the sitemap, and carry
**no `noindex`**. `Disallow` blocks crawling, not indexing — and all four are linked from
every page's footer, so they can surface as bare URLs with no snippet. Separately, some
app-store and payment-provider reviews require the privacy policy to be publicly
fetchable, which the current `Disallow` can fail.

| Option | Change | Consequence |
|---|---|---|
| **A — genuinely hidden** | Add `noindex` to all four; keep the `Disallow` | Consistent; may block reviewers |
| **B — public but unranked** | Remove the four `Disallow` lines; add `noindex` | Reviewers can fetch; search will not rank. **Recommended if any store or PSP submission is near.** |

**Leave `DEMO-ODPC-NOT-REGISTERED` on `/privacy` exactly as it is.** It is a deliberate,
self-labelled placeholder. Nobody should "fix" it by inventing a number.

**Acceptance check:** zero occurrences of `to be confirmed` in the built HTML of any
route; `robots.txt` and the four legal pages' `<meta name="robots">` agree with whichever
option was chosen.

---

## 2. Suggested batching

| PR | Contains | Gate |
|---|---|---|
| **PR-A** | Step 1 | Merge before anything else |
| **PR-B** | Step 2 (guard mutation table + any guard rewrites) | Merge before PR-C |
| **PR-C** | Step 3 + Step 4 (+ new canonical guard) | — |
| **PR-D** | Step 5 (+ new contact-form guard) | — |
| **PR-E** | Step 6 | — |
| **PR-F** | Step 7a; 7b only once the founder has ruled | Founder decision |

PR-C through PR-F are independent of each other once PR-B lands, so they can run in
parallel if more than one agent is working.

---

## 3. Polish backlog — explicitly not required for "done"

Ordered by value per hour. None of these blocks launch.

1. **GAP-11 — mobile nav without JS.** The primary nav is `hidden … lg:flex`; below `lg`
   the only control is a hamburger whose `aria-controls="marketing-mobile-nav"` points at
   **an id that does not exist in server HTML**. Under 640px the "Browse deals" CTA is
   hidden too, so the header is a logo and a dead button. Server-render the mobile panel
   (a `<details>`/`<summary>` disclosure needs no JS at all), or at minimum stop emitting
   `aria-controls` for an absent element. Mobile-first product; worth doing.
2. **GAP-10 + FOOT-01 — heading outline.** `/help` has no `<h1>` (its "Help" heading is an
   `<h2>`), and the footer's four column headings are document-outline `<h2>`s — so on
   `/help` the most prominent headings on the page are "Product / Company / Resources /
   Contact". Promote `/help`'s heading to `<h1>`; demote the footer headings to visually
   identical non-outline elements with `aria-labelledby` on each `<nav>`.
3. **GAP-08 — add `/contact` to the primary nav.** Five items today; Contact is a target
   top-level page reachable only from the footer. Design call, but it is the one target
   page with no route from the top of the page.
4. **GAP-09 — `/malls/bbs-mall`.** ~75 words for the flagship location page, linked from
   every footer. Add the address (already in the footer of the same page), opening hours,
   how to find the desk, and what Node 0 means.
5. **GAP-13 — JSON-LD.** Zero structured data site-wide. `FAQPage` on `/faq` (16 Q&A
   already written) and `LocalBusiness`/`Place` on `/malls/bbs-mall` are near-free once
   item 4 lands. `Organization` in the root layout anchors the brand.
6. **GAP-12 — 404.** Renders and is correctly `noindex`ed, but inherits root metadata and
   drops the header and footer entirely. Give it its own title and the shared chrome so a
   mistyped URL does not lose the site.
7. **GAP-14 — `/login`.** No `<a>` element anywhere in the body, so before Clerk's script
   loads there is no way off the page. Add a logo link home. Outside the marketing
   surface but linked from `/download`.
8. **RISK-04 — re-measure Lighthouse against production.** The recorded numbers (a11y /
   best-practices / SEO 100 on all six, perf 92 avg, **Home 87 — below the bar**) were
   taken under the *supabase* auth strategy, where `ClerkProvider` never renders.
   Production runs *clerk*, and every marketing route still returns
   `x-clerk-auth-status: signed-out`, so middleware runs on them. Re-measure before
   claiming the perf bar is met, and treat Home 87 as open until it is re-measured.
9. **RISK-06 — `/waitlist` is dynamically rendered** (`private, no-cache, no-store`,
   `x-vercel-cache: MISS`) while sibling marketing pages are `PRERENDER`. Its form is
   correctly server-rendered, so this is cost and latency, not correctness. Find what
   opts it out of static rendering.
10. **RISK-07 — sweep the drift register.** D34 sat `open` for four commits while the
    implementation report described it as closed. Reconcile every open row against
    reality, and add rows for GAP-01 and GAP-03.

---

## 4. Things to deliberately NOT do

Listed so nobody spends a day undoing finished work:

- **Do not restructure the IA.** Six target pages, shared layout, shared footer — all
  present and correct. The target scope is met structurally.
- **Do not redesign the footer.** It already covers all four required categories plus a
  brand column and the pre-launch disclosure.
- **Do not rewrite any legal document.** Step 7a fills three factual cells. Nothing else.
- **Do not remove the pre-launch demonstration notice** or the DRAFT banners.
- **Do not invent a registration, licence or ODPC number.** `DEMO-ODPC-NOT-REGISTERED`
  stays.
- **Do not move `/feed` into the `(marketing)` layout.** It is an app surface with an app
  shell; only its metadata and heading structure are in scope.
- **Do not delete `/how-it-works`** — redirect it, so any printed or external asset using
  the URL keeps working.
- **Do not re-hunt the WhatsApp placeholder.** `254700000000` (drift D36) is gone from
  every rendered page; `447746170752` is used sitewide. That fix held.
- **Do not chase unresolved template tokens.** There are none — no `{{`, `TBD`, `TODO`,
  `Lorem`, `XXX` or bracket placeholders in any rendered page.

---

## 5. Final acceptance — run before calling it done

```bash
BASE=https://www.maanta.app
ROUTES=$(curl -s $BASE/sitemap.xml | grep -oE '<loc>[^<]+</loc>' | sed 's/<[^>]*>//g')

for u in $ROUTES; do
  h=$(curl -s "$u")
  printf '%-45s' "$u"
  echo "$h" | grep -q '<link rel="canonical"'                        || printf ' NO-CANONICAL'
  echo "$h" | grep -q "og:url\" content=\"$u\""                      || printf ' BAD-OG-URL'
  echo "$h" | grep -q '<title>Maanta — The mall, made live.</title>' && printf ' DEFAULT-TITLE'
  echo "$h" | grep -q 'BAILOUT_TO_CLIENT_SIDE_RENDERING'             && printf ' SSR-BAILOUT'
  echo "$h" | grep -qi 'to be confirmed'                             && printf ' UNFINISHED-COPY'
  echo "$h" | grep -c '<main' | grep -qv '^1$'                       && printf ' MAIN-COUNT'
  echo
done

curl -sI $BASE/how-it-works | head -1   # expect 308
curl -s  $BASE/contact | grep -c '<form'  # expect >= 1
```

A clean run prints every sitemap URL with nothing after it, `/how-it-works` returns 308,
and `/contact` reports at least one form.

**Also confirm, by hand:**

- `/contact` with JavaScript disabled shows a usable form.
- One real enquiry submitted end-to-end produces both emails and a PostHog submit event.
- Production's Vercel deployment reports `githubCommitRef: main`.
- The nine-row guard mutation table from Step 2 is committed, with `FAIL` observed on
  every row.
