# Prompt: Claude Design — update the wireframes to the closed contract

Date: 2026-07-30 · For: **Claude Design** (project *Maanta Current Reality*) ·
Produced by: the repo-side design-sync sessions on `claude/maanta-role-hardening-62ut64`

## Why this exists

`maanta-app/design/current-reality/frames.json` is authored in Claude Design and
mirrored into the repo. Across four founder rulings (D-07, D-01, D-06, D-12) and
a set of evidence corrections, **the repo won every disagreement** — the code was
right and the frames described something else. All 12 drift rows are now closed
on the repo side; the canvas has not been redrawn to match.

One item below (**12d For merchants**) is not a drift row. It came out of applying
D-12's governance rule to the one live promise that was still hardcoded, and it
landed as a code change plus a production migration on 2026-07-30. It is in this
prompt because the *design* consequence is real: a promise that used to be
permanent page furniture is now a conditional block with states to draw.

Everything below is a *design-side* change. No code change is requested, and none
should be implied. Copy the prompt between the rules verbatim.

---

Continue as **MAANTA design truth maintainer** in the *Maanta Current Reality*
project. One objective: **redraw the wireframes and update the mirror so the
canvas matches the settled contract.** The repo is ahead of you on every item
listed here — this is you catching up, not a negotiation.

## Truth order (unchanged)

1. **Notion** — product and current-state decisions
2. **Repo** (`MAANTA-APP/MAANTA`) — implementation
3. **Design system** — visual

Where a frame and the repo disagree, the repo wins unless Notion says otherwise.
Four items below were settled by explicit founder ruling and are **not
reopenable** in this pass.

## What changed, frame by frame

### 12e Pricing — the launch offer is withdrawn (founder ruling, closes D-12)

`/pricing` used to ship **"Launch offer: first month of Elite free."** Nothing
backed it: no decisions-log entry, no `app_config` key, so nothing reconciled the
promise against what an Elite trial actually grants (30 days → 7-day grace →
auto-downgrade). Founder ruling 2026-07-29: **treat it as withdrawn until a
governed launch offer exists.**

- **Remove the launch-offer line from the 12e frame.** Do not soften it, date it,
  or move it to a footnote. It is gone.
- **The Standard plan's price reads "No monthly fee", never "Free."** This was a
  live `R-PLAN-NAMES` breach on two public pages and it also misstated the model —
  Standard carries the KES 30 success fee, so "Free" is wrong on the merits, not
  just on the naming rule.
- **The KES 30 success fee stays visible beside the Standard card**, so "no
  monthly fee" can never read as "costs nothing."
- Add to the frame notes: *a future Elite launch offer must be config/policy
  backed (an `app_config` key plus a decisions-log entry stating what it grants
  and when it ends) before it can be drawn or advertised again.*
- `captureReadiness` → `safe-now`; drop the `captureReadinessReason`.
  `prototypeStatus` stays `current-not-clickable` — it is simply not in the phone
  prototype, which is a scope decision, not a blocker.

### 12d For merchants — the launch credit is a conditional block, per node

**Read this immediately after 12e, because the two are easy to confuse and the
mistake is expensive in both directions.** Two different launch promises were
audited. One was withdrawn; the other stays. The difference is governance, not
generosity:

| | Elite launch offer (12e) | Node 0 opening credit (12d) |
|---|---|---|
| Backed by config? | No | Yes — `node0_opening_credit_kes` |
| In the decisions log? | No | Yes (2026-07-16) |
| Granted by code? | Nothing granted it | `activate_merchant`, at activation |
| Outcome | **Withdrawn — do not draw** | **Stays — but conditional** |

So do **not** delete the KES 300 opening credit while removing the Elite offer.
And do not draw the opening credit as permanent furniture either, which is what
the page used to do.

**What changed in the code (2026-07-30):** `/for-merchants` hardcoded the amount
(300) and the cap (100), so it kept advertising the credit after ops retuned
either number, after the launch window closed, after the cap filled, and even
with the promo switched off. Both promo blocks — the hero pill and the "your
first N are on us" card — now render **only** when the grant would actually
happen, and every number comes from the same `app_config` keys the grant reads.

**States the frame needs.** This is the substance of the change for design:

1. **Promo live** — hero pill *"First 100 shops start with KES 300 credit"* plus
   the card *"Your first 10 are on us."* The 10 is **derived** (credit ÷ success
   fee), not typed.
2. **Promo absent** — both blocks gone, the rest of the page unchanged. This is a
   real, reachable state with four causes: the window closed, the cap filled, ops
   set the amount to 0, or the config could not be read. **The page must not look
   broken or empty without them** — that is the state to design for, and the one
   the old wireframe never had.
3. **Uncapped variant** — when no cap is configured the copy drops the "first N"
   claim entirely (*"New shops start with KES 300 credit"*) rather than inventing
   a number.
4. **Credit smaller than one redemption** — the card keeps its body but drops the
   derived headline, because *"your first 0 are on us"* is worse than saying
   nothing.

**The node is a variable, not a label.** The cap is enforced **per node** as of
migration `20260730120000`: each node gets its own first-N allowance, so the
promo can be live at CBD Galleria after BBS Mall has filled. The promo copy
therefore names the launch node **from config** — *"the first 100 shops we
activate at {launch node}"* — and must not hardcode BBS Mall. Note the contrast:
the hero and closing sections legitimately say "BBS Mall, Eastleigh" because
those state Node 0's identity, which is a frozen decision. Only the **promo**
sentence is node-variable.

Two limits to draw honestly rather than around:

- **One node at a time.** `node0_launch_node` is a single value, so exactly one
  node's promo is live at any moment. Do not draw a multi-node promo comparison.
- **The credit lands at activation, not signup.** The existing "Credit is added
  when we activate your shop" line is correct and load-bearing — keep it.

**Contract note — a 12d row now exists, and it is the one frame in the file you
did not author.** It was added repo-side on 2026-07-30 (founder request), because
leaving the repo's most promise-heavy public page outside the contract meant
nothing checked it. It carries `evidenceSource: repo`, **no `canvasRef`**, and it
is declared in `landedInRepo.corrections` so its provenance is explicit rather
than passed off as design truth. A Layer 1 invariant now enforces exactly that:
**any frame without a `canvasRef` must be disclosed in
`landedInRepo.corrections`**, so a repo-authored row can never quietly masquerade
as canvas-authored.

What you owe on it, either way:

- **If the canvas carries the screen** — add the `canvasRef`, set a
  `prototypeRef` if it is in the prototype, and correct anything I got wrong. The
  frame's `prototypeBlockedReason` says the linkage is unconfirmed; replacing that
  with a real reason is the point.
- **If the canvas deliberately excludes it** — say so in the changelog and I will
  reconsider whether the row belongs. Do not silently delete it.

Fields I deliberately left conservative because I could not verify them from the
repo: no `canvasRef`, no `prototypeRef`, `prototypeStatus:
current-not-clickable`, and `captureReadiness: after-data` (a screenshot pins
whichever promo state happened to be live). Treat those four as questions, not
assertions.

### 8f Deal feed — the third rail is "Deals Near Me" (founder decision, closes D-01)

Frozen order (`R-FEED-ORDER`), never reorderable:

> **Flash deals → Priority placements → Deals Near Me**

The three are **distinct product concepts.** Flash and Priority placements are
promotional surfaces. Deals Near Me is proximity-led local discovery.

- Deals Near Me carries **nearby standard, non-boosted deals only** — a Standard
  merchant's one standard deal *plus* an Elite merchant's standard deals that are
  not boosted. **Merchant tier is not a filter.** What disqualifies a deal is
  being flash or boosted, because each already has its own rail.
- **Do not draw it as a global "all active deals" feed.** An earlier repo label
  said "All active deals" and that is superseded.
- **"Near" is node-scoped, not device-located.** The rail is filtered to the
  shopper's selected mall and ordered by each shop's distance from that node's
  centre. The feed reads **no device geolocation** — the only `getCurrentPosition`
  in the product is the claim-time geofence. Do not draw a location-permission
  prompt, a "locating you" state, or a distance-from-me chip on this rail.
- Shops with no coordinates **sort after** located ones; they are never dropped.
- When the node has no coordinates at all, the subtitle **drops the proximity
  claim entirely** rather than claiming a nearness it cannot compute. Draw both
  subtitle variants.

### 10a Redeem at counter — verify-anyway extends to a location mismatch (founder ruling, closes D-07)

The frames showed a wrong-shop claim as a **hard rejection with no fee.** That is
**superseded and must not be drawn.** The repo mirror
(`maanta-app/design/claim-and-till/README.md`) and the shipped code were right.

Settled behaviour:

- A claim made away from the shop **still redeems.**
- The merchant is shown **the mismatch and the distance before confirming**,
  confirms only with the customer at the counter, and **the reason is recorded on
  the redemption.**
- **The KES 30 fee applies**, because the redemption is verified. Reversing it is
  a separate, later, **note-required** admin action (`R-REVERSAL-NOTE`).
- The dispute routes to **admin / Guardian review after the fact**, auditably.

Actions: **add a `location-mismatch` state to 10a** (states are now `idle`,
`resolving`, `fee-disclosure`, `location-mismatch`, `success`, `rejected`,
`offline`); draw it as a **disclosure before confirm**, not a refusal; and move
any wrong-shop hard-reject frame into `superseded[]` with the reason. Update the
`R-VERIFY-ANYWAY` rule text — it currently reads "DISPUTED", and it no longer is.

### 13i Top-up — rail order is capability-driven, and pending never means credited (closes D-06)

The design system said M-Pesa is **always** primary. The shipped app runs card as
Phase 1. **Neither is a preference any more** — `isMpesaTopupConfigured()` reads
the real IntaSend credentials, so:

- **M-Pesa STK leads the moment credentials exist; card (Stripe Checkout) leads
  until then** — which is every environment today, so card is what a merchant
  sees now. M-Pesa going live is an **ops event, not a code change.**
- **An unprovisioned rail is not rendered as an option at all.** Do not draw a
  greyed-out or "coming soon" M-Pesa button.
- **Draw both orderings** and label which condition produces each. Do not draw
  M-Pesa-primary as the current state.

Closing this row exposed a real defect worth drawing correctly. A Stripe return
means *the checkout completed*, not *the wallet moved*. The five screens:

| Screen | What it means |
|---|---|
| `amount` | The form. |
| `card-checkout` | Stripe-hosted — the app owns the hand-off and both returns, not the page itself. |
| `pending` | The **confirming** screen. It polls for **both** rails. A return never lands on success. |
| `credited` | Shows the **observed balance delta** — never the amount the merchant typed. |
| **`unsettled`** | **New.** A charged card that has not credited yet: **"Payment received."** |

`unsettled` is the important one. A card payment that has not credited is
**never the failure screen** — the money left the merchant's account. An STK
timeout may say *"No money left your account"*; a **card** timeout must not,
because it would be false and would invite a second payment.

### 13j Staff verify gate — it renders at `/merchant/redeem`

The frame pointed at `/merchant/staff`. The gate screen actually renders **at
`/merchant/redeem`** when `permissions.can_verify` is false; `/merchant/staff` is
where the **owner grants** the permission. Draw the gate on the redeem route.

Anchor copy is **"You can't verify codes"**; the primary action is **"Contact the
owner."** Staff without the permission never see a keypad.

### 13b Agent lead detail — the primary action is "Send onboarding link"

`R-AGENT-NO-SUBMIT`: an agent **never submits the shop form on the merchant's
behalf.** They send an onboarding link and attribution stays intact. Frames 11h
and 11i modelled the agent as an in-person onboarder filling in the form — both
are already superseded by 13a/13b; make sure nothing on the canvas still shows
the old model.

### Smaller corrections, all verified against the repo

| Frame | Was | Now | Evidence |
|---|---|---|---|
| 8l | route `/tickets` | **`/my-deals`** | `src/app/(shopper)/my-deals/page.tsx` exists; `tickets/page.tsx` does not |
| 12a | `src/app/page.tsx` | `src/app/(public)/page.tsx` | landing lives in the `(public)` route group |
| 12e | `src/app/pricing/page.tsx` | `src/app/(public)/pricing/page.tsx` | same route group |
| **M8** | `prototypeBlockedReason`: "the repo create flow has no charge-disclosure step" | **status `live`** | That reason was **factually wrong.** Charge disclosure (M9) ships and is **unskippable**: `extrasChoice` starts `null` so neither option is preselected, and Continue is disabled until an explicit choice is made. Live preview and the Publish CTA both carry the summed YOU PAY number. |
| 11e | `stateCoverage: covered []` | both `open` and `resolved` covered | `?view=resolved` switch, per-state heading, per-state empty state, override on open only |
| 12e | `stateCoverage: covered []` | all three covered | the two side-by-side plan cards **are** the comparison |

### The mirror header is stale

Two `mirror` fields now describe a world that no longer exists — D-08 is closed:

- `location`: *"NOT committed to the app repo — see drift D-08."*
- `knownRepoDesignMirror`: *"There is no `maanta-app/design/current-reality/` on
  main as of this date."*

The contract **is** committed now, at `maanta-app/design/current-reality/`, with a
schema, a Zod mirror, and a CI-enforced static test (`npm run test:design-truth`).
Update both fields.

## Rules for this pass

- **Do not invent future-state behaviour.** If it does not ship, it is not a
  current-reality frame. If you believe something *should* change in the product,
  file it as a **new** drift row with `blockedOn` set — do not draw it as current.
- **Do not draw M-Pesa as the primary rail today.** Draw the capability rule.
- **Never draw a config-gated promise as unconditional.** This is the general form
  of both the 13i rail order and the 12d launch credit: where the product reads a
  live value to decide whether something happens, the frame must show the
  **absent** state as well as the present one, and must show the value as a
  variable rather than baking today's number into the copy. A number drawn as
  permanent furniture is how a page ends up advertising a promise the product has
  stopped keeping.
- **Do not reopen the four founder rulings** (D-07, D-01, D-06, D-12). If new
  evidence genuinely contradicts one, say so explicitly and stop — do not redraw
  around it.
- **Every drift row is currently `blockedOn: none`.** If you add a frame with
  `status: design-ahead`, it **must** be linked to an **open** drift row — the
  repo's Layer 1 test fails the build otherwise, by design. Closing a row while a
  frame still claims to be ahead of the code is exactly the fake-sync this
  contract exists to prevent.
- **Provenance stays honest.** `frames.json` is *authored in Claude Design, not
  extracted from the repo* — the schema enforces that string. Keep it. If you
  re-verify against the repo, update `mirror.verifiedAgainst` (`branch`,
  `treeSha`, `date`) to what you actually read, and bump `mirror.version`.
- **Leave `landedInRepo` alone.** That block is the repo side of the handshake —
  it records what landed, which drift rows closed, and each correction with
  file:line evidence. It is written by the code session, not by you.
- **No `data-testid`.** Behavioural coverage keys off accessible, user-visible
  anchors (headings and labels). If a frame carries `smoke: true`, its
  `expectedHeading` / `expectedAnchor` must be **stable, human-readable copy** —
  changing that copy in the canvas breaks the repo's smoke layer, so if a heading
  genuinely must change, say so loudly in the handoff.

## Deliverables

1. The updated canvas (*Maanta Current Reality.dc.html*) with the frames above
   redrawn, and superseded frames moved to the superseded list with reasons.
2. An updated `handoff/current-reality/frames.json` that validates against
   `frames.schema.json`, with `mirror.version` bumped and `verifiedAgainst`
   refreshed.
3. A short changelog: **frame → what changed → which ruling or evidence drove
   it.** One line each. This is what the next code session diffs against.
4. For 12d specifically: an explicit answer on whether the canvas carries the
   screen — and if it does, its `canvasRef`, its `prototypeRef` if any, and
   corrections to the four conservative fields listed in that section. The row
   already exists; what is missing is your half of it.

---

## Repo-side references

- Contract: `maanta-app/design/current-reality/{frames.json, frames.schema.json, README.md}`
- Protocol and update rules: `docs/design-truth-protocol.md`
- Rulings: `docs/maanta-decisions-log.md` (2026-07-29 entries for D-07, D-01, D-06, D-12; 2026-07-30 entries for the config-driven launch credit and its per-node cap)
- Per-row session notes: `docs/skills/{design-truth-contract-landing,feed-deals-near-me,topup-rails-d06,support-pricing-d12}-2026-07-29.md`
- 12d launch credit: `docs/skills/launch-credit-config-driven-2026-07-30.md` · the rule lives in `src/lib/launch-credit.ts` · the grant is `activate_merchant`, per-node cap since migration `20260730120000_node_scoped_opening_credit_cap.sql` (applied to prod 2026-07-30)
- Enforcement: `src/lib/design-truth/design-truth.contract.test.ts` (Layer 1, 130 assertions, every PR) · `e2e/design-truth-smoke.spec.ts` (Layer 2, seeded non-prod env) · `src/__tests__/cash-only-and-copy.test.ts` (public copy governance: plan names, no ungoverned offers, no hardcoded launch-credit numbers)
