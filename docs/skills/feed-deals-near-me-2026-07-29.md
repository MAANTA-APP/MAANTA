# Skills: Deals Near Me — founder decision D-01

Date: 2026-07-29 · Session mode: **Builder** · Branch: `claude/maanta-role-hardening-62ut64`

## The decision

The third feed section is **Deals Near Me**. It carries **nearby standard deals
only**: a Standard merchant's one standard deal, plus an Elite merchant's
standard deals that are **not** boosted.

Feed order stays frozen (`R-FEED-ORDER`):
**Flash deals → Priority placements → Deals Near Me.** The three are distinct
product concepts and must not blur — Flash and Priority placements are
promotional surfaces; Deals Near Me is proximity-led local discovery.

Rationale is behavioural: shoppers engage with deals in the area they are in or
travelling to, so the default standard rail should be proximity-led. This
supersedes the "All active deals" label the repo briefly rendered.

## Audit — what the third rail was doing first

| Question | Answer |
|---|---|
| What was it called? | "All active deals" / "Every live deal at your mall" — renamed a week earlier on the reasoning that it wasn't distance-*filtered*. |
| What powered it? | `getLiveDeals(node).nearMe` → `selectLiveDealBucket(node, "standard")` in `src/lib/data.ts`. |
| What did the query return? | **Already exactly right:** `deal_type = 'standard' AND boost_active = false`, scoped to the node. Boosted and flash are separate buckets. Merchant tier was never filtered — so Elite non-boosted standard deals were already included. |
| Was it proximity-based? | Partly, and confusingly. `getLiveDealsUncached` pre-sorted by verified-redemption count, then the feed page **immediately re-sorted** by distance — so the verified-count sort was dead code. Distance came from `sortDealRows(…, "nearest", origin)`. |
| Did far-away deals leak in? | No — node scoping already bounded it. |
| Did boosted/flash leak in? | No. |

**So the content rule needed no change.** What was wrong was the label, an
ordering that was half-dead and unexplained, and a subtitle that said nothing
about proximity.

## What changed in code

`src/lib/feed-sections.ts` (new) is the single home for the rule:

- `FEED_SECTIONS` — the three frozen titles, read by the feed so a label cannot
  be edited in one place and missed in another.
- `isNearMeDeal` / `selectNearMeDeals` — standard **and** non-boosted. Defence in
  depth over the query: if a bucket is ever widened, flash and boosted still
  cannot leak into this rail.
- `orderNearMeDeals` — located shops first, nearest to the node centre; then
  shops with no coordinates, newest first. They are genuinely at the same node,
  just unrankable, so they follow rather than being dropped or lumped at
  `Infinity` in arbitrary order.
- `nearMeSubtitle` — names the mall and claims "nearest first" when there is an
  origin; **drops the proximity claim entirely** when there is none.

`src/app/(shopper)/feed/page.tsx` renders the three rails from `FEED_SECTIONS`
and orders the third with `orderNearMeDeals`. `src/lib/data.ts` lost the dead
verified-count pre-sort.

## What "near me" actually means today

**Node-scoped, not device-located.** The rail is filtered to the shopper's
selected mall, then ordered by each shop's distance from that node's centre. The
feed reads **no device geolocation** — the only `getCurrentPosition` in the app
is the claim-time geofence check (`deals/[id]/claim-flow.tsx:40`).

For MAANTA's in-mall model that is the meaningful sense of nearby: a shopper at
home browsing BBS Mall sees BBS Mall deals ordered by where the shops sit inside
it. It is deliberately not overclaimed in copy.

### Limitations, stated plainly

- **No device location on the feed.** Adding it means a permission prompt on the
  primary shopper surface and a consent decision — new infrastructure, not in
  scope here. Until then "near" means "at the mall you selected".
- **`merchants.lat`/`lng` are nullable and sparsely populated.** Shops without
  coordinates cannot be distance-ranked; they sort after the located ones.
- **The bucket is `ORDER BY created_at DESC LIMIT 40` before ordering.** So the
  rail is "the 40 newest standard deals at this node, nearest first" — not the 40
  nearest. True nearest-N needs geo ordering in SQL (PostGIS is installed but
  `lat`/`lng` are plain `double precision`, with no geography column or index).
  At Node 0 volumes the two are the same set; it will matter at scale.
- **The sort control still offers Newest / Ending soon**, which override the
  proximity order for this rail by explicit user choice. That is intended — the
  default is proximity-led, not proximity-only.

## Tests

- `src/lib/__tests__/feed-sections.test.ts` (17) — the label is `Deals Near Me`
  and is never a generic all-deals name; flash, boosted and boosted-flash are all
  excluded; **merchant tier is not a filter**; `selectNearMeDeals` strips leaks;
  nearest-first ordering, unlocated-after-located, no-origin fallback, no input
  mutation, stable tiebreak; and the subtitle drops "near" when nothing is
  measured.
- `src/lib/design-truth/design-truth.contract.test.ts` — a D-01 block asserting
  the drift row stays closed, `R-FEED-ORDER` names all three sections **in
  order**, and the rule never says "all active deals".

## Design truth

- **D-01 closed** — `historical / blockedOn: none`, with the decision and
  rationale in the row.
- **`R-FEED-ORDER` rewritten** to name the third section and its contents,
  including that tier is not a filter and that proximity is node-scoped.
- **Frame 8f** — `job` names the three rails; `sourceFiles` adds
  `src/lib/feed-sections.ts`; notes record the ordering and subtitle behaviour.
- Recorded in `landedInRepo.corrections`.

Docs re-pointed (none still claim "All active deals" as intended):
`frozen-ui-overall-handoff.md`, `claude-design-system.md`, and the two dated
sync docs, which are annotated as superseded rather than rewritten.

**Open drift after this pass: D-06** (M-Pesa order, blocked on IntaSend
credentials) and **D-12** (two surfaces intentionally documentation-only).
