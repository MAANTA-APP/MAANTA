# Deal categories — what is true, and what is not decided

Last updated: 2026-08-18

Founder ruling 2026-08-18, from an annotated `/feed` screenshot: shoppers filter
the deal feed by category. The taxonomy is **ten buckets** and it is attached to
the **deal**, not the merchant.

It started at three — the three the pilot merchants sell (Nuur Fashion House,
Bilan Beauty & Cosmetics, Macmacaan Sweets & Café). Building against it showed
three was too few within the hour: four of the sixteen demo catalogue items fit
no bucket at all. Widened to ten the same day (**D117**, closed). The original
three keep their keys and their labels unchanged.

| Stored key | Shopper label |
|---|---|
| `fashion` | Fashion & fabric |
| `beauty` | Beauty & perfume |
| `food` | Food |
| `electronics` | Phones & electronics |
| `shoes` | Shoes & bags |
| `home` | Home & living |
| `jewellery` | Jewellery & watches |
| `health` | Health & pharmacy |
| `kids` | Kids & baby |
| `services` | Services |

Order is chip order and is deliberate: the three the pilot sells first, then the
rest by how much of a mall floor they occupy.

Source of truth for the taxonomy is `maanta-app/src/lib/deal-categories.ts` and
the `CHECK` constraint in
`maanta-app/supabase/migrations/20260818150000_deal_categories.sql`. Those two
must agree; `deal-categories.test.ts` fails if only one of them is widened.

## Read this before you change anything here

**1. The column stores keys. Labels are copy.**
`fashion` is an identifier, not an abbreviation of "Fashion & fabric". Reword the
chip freely. Never write a label into the column, and never make a key mean
something new — that silently re-files every row already carrying it.

**2. Uncategorised is a state, not a backlog.**
`category IS NULL` is legal and shows under **All** and under no chip. Every deal
created before 2026-08-18 is in that state. Do **not** back-fill by guessing from
titles: filing a fabric deal under Food to empty the NULL set makes the filter
lie, which is worse than a deal that is only reachable without a filter. The
merchant wizard requires a category on new deals, so the set only shrinks.
`NOT NULL` is a later migration, once the tail is genuinely zero.

**3. The category is on the deal, deliberately.**
A fabric shop that sells snacks at the counter files each deal where a shopper
would look for it. Deriving the category from the merchant would also mean a
merchant changing what they sell silently re-files their whole history.

**4. The chip row is withheld when it cannot change the screen — with one exception.**
`dealCategoryChips()` returns `[]` when no live deal has a category, or when
every live deal is in the same bucket. Two things follow:

- A chip never leads to an empty screen from a standing start.
- It is what makes the feature safe on a database that has not had the migration
  applied — no column, no categories, no chips, feed unchanged.

The exception is **an active `?category=` with no options behind it** — a shared
link, a bookmark, or a refresh after the last deal in that bucket expired.
`DealCategoryChips` renders a lone **All** chip there rather than nothing.
Withholding the row in that state removes the only control that can clear the
filter, leaving an empty screen with nothing on it to undo.

**7. The empty state is derived from counts, never inferred from the UI.**
`feedEmptyState()` in `src/lib/feed-empty-state.ts` takes the deal counts at each
filtering stage and names the filter that actually emptied the screen. It exists
as its own module so it can be tested directly. The first version lived in the
page, decided between "quiet mall" and "your category" by asking whether any
chips were on offer, and was guarded by a test that grepped the page source for
that conditional. The conditional was present and wrong: a node with five live
fashion deals and `?category=food` rendered "No deals live right now" on a mall
that was open. `browseEmptyState` in `browse-client.tsx` takes the same input for
the same reason.

**5. Chips are derived from the UNFILTERED set.**
Both `/feed` and `/browse` compute the options from every live deal before
narrowing. Derive them from the filtered list and picking "Food" deletes every
other chip, stranding the shopper on a filter they cannot leave except by editing
the URL.

**6. A filtered-empty feed says so in its own words.**
`/feed` swaps its empty state when a category is selected and other categories
have deals. Reusing "No deals live right now" there tells a shopper the market is
dead when it is their own filter, and offers nothing to undo.

## The column ships before it exists

Claude does not apply migrations to production, so this code is deployed against
a database with no `deals.category` for a window whose length is a human's
decision. Everything that touches the column degrades:

| Path | Degradation |
|---|---|
| `selectDealsWithMerchants` (`src/lib/data.ts`) | Retries the select without `category`; can also shed `merchants.lat/lng` in either order |
| `insertDealDroppingUnknownCategory` (`src/lib/deal-category-column.ts`) | Publishes the deal **uncategorised** rather than failing at Review |
| `selectDroppingUnknownCategory` (same module) | Re-runs a select with a caller-supplied fallback column list |
| `PATCH /api/deals/[id]` | Applies the rest of the edit and reports `categorySaved: false`; refuses with 503 if the category was the whole edit |

Two rules those share:

- The retry fires **only** on an error that names the column. A permissions
  error, a dead connection, the zero-balance gate, the deal limit and the
  Elite-only flash rule are returned untouched — a commercial refusal must never
  be laundered into a second attempt. Pinned by `deal-categories.test.ts`.
- The **last** error surfaces, not the first. An earlier one is by construction a
  missing column the code deliberately worked around, so reporting it while the
  query is really failing on permissions points the operator at the wrong
  problem. `selectDealsWithMerchants` originally threw the first error, on the
  reasoning that a later one might be noise; that had it backwards, and all
  three helpers now agree.

**The edit path does not simply drop and continue.** The create path publishes a
deal uncategorised because the alternative is a deal that does not exist, which
is worth the trade. An edit is not the same bargain — this sheet is the
correction path, so the category may be the whole point of the request. So
`PATCH /api/deals/[id]` returns `categorySaved: false` when it applied the rest
without the category, the sheet stays open and says so, and an edit that was
*only* a category it could not store returns **503 with the deal unchanged**
rather than bumping a timestamp and answering `ok`.

**The migrations are applied to production as of 2026-08-18**, so on that
database the degradation paths are now dormant. Do NOT delete them yet: they are
what keeps a fresh environment, a `db reset`, or a preview branch working before
its own apply, and **D121** showed that "applied to production" and "applied
everywhere" are different claims. Until every environment has the column, a plain
`.select("… category …")` outside these helpers is a page that 500s.

## Where it is wired

| Surface | File |
|---|---|
| Taxonomy, parsing, filtering, chip derivation | `maanta-app/src/lib/deal-categories.ts` |
| Chip row (shared by both shopper surfaces) | `maanta-app/src/components/browse/deal-category-chips.tsx` |
| Feed | `maanta-app/src/app/(shopper)/feed/page.tsx` |
| Browse | `maanta-app/src/app/(shopper)/browse/page.tsx`, `maanta-app/src/components/browse/browse-client.tsx` |
| Merchant create (required) | `maanta-app/src/app/merchant/(app)/deals/new/new-deal-wizard.tsx`, `maanta-app/src/app/api/deals/route.ts` |
| Merchant correction | `maanta-app/src/app/merchant/(app)/deals/[id]/deal-actions.tsx`, `maanta-app/src/app/api/deals/[id]/route.ts` |
| Repost carries it forward | `maanta-app/src/app/api/deals/repost/route.ts` |
| Column, CHECK, index, view | `maanta-app/supabase/migrations/20260818150000_deal_categories.sql` |
| Demo catalogue | `maanta-app/supabase/migrations/20260818160000_demo_reseed_categories.sql` |

`Category` is no longer the label on any deal-type control. `/map`, `/feed` and
`/browse` all read **"Deal type"** for the Flash / Boosted / Standard filter. One
word cannot mean two axes in one app.

## Open, and not for a session to decide

- ~~**D116**~~ — **closed 2026-08-18. Both migrations are applied to production
  and read back**: the column, the ten-key CHECK, `deals_public_browse` carrying
  `category` and still filtering `is_paused`, and the reseed function inserting
  it. Ledger versions repaired to the filenames.
- **D122** — **applied is not the same as visible.** 0 of 260 live discoverable
  deals carry a category, so `dealCategoryChips` returns `[]` and no chip row
  renders. It will not self-heal fast: the reseed only tops up *below* the flash
  floor (27 live against a floor of 12), so it returns 0. Three options are
  recorded on the row — wait, force one reseed cycle, or back-fill the demo rows.
  A real merchant is categorised from their first deal, because the wizard
  requires it.
- **D121** — production was five migrations ahead of `main`, two of them owning
  the version numbers these files first used. **Read the ledger, not the
  migrations directory, before choosing a version.**
- ~~**D117**~~ — **closed 2026-08-18.** Three buckets could not describe the
  floor; the founder widened the set to ten. The four orphans now sit in Phones
  & electronics (screen protector, earbuds), Home & living (prayer mat) and
  Shoes & bags (suitcase). Adding an eleventh is still one entry in
  `DEAL_CATEGORIES` plus one value in the CHECK, and a test fails if only one of
  the two is widened.
- **D118** — the filter runs after the feed's per-rail row limits (20/20/40), so
  past those counts at one node a category under-reports. Dormant at Node 0; the
  fix is to push the predicate into `selectLiveDealBucket` and into the cache key.

## Verification

- `npm test` — `deal-categories.test.ts` (taxonomy ↔ CHECK agreement, URL
  parsing, uncategorised handling, chip derivation, every degradation path, the
  demo catalogue's keys, and that no surface labels a rail filter "Category")
  and `deal-category-chips.test.ts` (render).
- `make db-verify` / the CI `db-tests` job — `supabase/tests/deal_categories_test.sql`
  covers the CHECK (three keys and NULL only, case-sensitive) and re-asserts that
  the `deals_public_browse` recreate did not lose the pause predicate
  (**D25** / **D32**). Any future change to that view must keep that assertion.
