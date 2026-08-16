# Wireframe update request to Claude Design — 2026-08-16

**What this is:** the second outbound handoff of 2026-08-16, asking the design
side to bring the wireframe canvas up to shipped reality. The first
(`claude-design-followup-2026-08-16.md`) covered the merchant wallet and the
first console changes; this one covers everything merged after it, including
three new admin surfaces and a reclassification of the agent console.

**Why it is a file:** same reason as the first. D103 happened because the design
side formed a premise from an artifact this repo owns and nobody could later
reconstruct what they had been told. The repo keeps the outbound half.

**Status:** sent 2026-08-16. Everything below is **current-reality, not
proposal** — the frames belong in the build sections (§13–17); §1–12 stay frozen
history per the 2026-08-09 ruling.

**Merges it describes**, all squashed to `main`:

| PR | Squash | Subject |
|---|---|---|
| #209 | `a082051` | Programme verification; D103, D104 closed |
| #210 | `68bf077` | D105 trigger ruling |
| #211 | `9b63f49` | Admin/founder navigation + role gating |
| #212 | `8c1617b` | The first design handoff (docs only) |
| #213 | `8b39b22` | Agent detail, ticket intake, resource centre, agent lite console |
| #214 | `0bf16e3` | Operations overview; approvals moved |

`a082051`, `68bf077` and `9b63f49` were verified live in production by healthz
read-back. `8b39b22` and `0bf16e3` merged after the Vercel connector dropped out
of the session, so they are expected-live rather than verified — **verify before
capturing anything from production.**

---

## The prompt as sent

### Wireframe update request — repo side, 2026-08-16

Six merges are live on `main` since the last sync. This asks for the wireframe
canvas to catch up with shipped reality. Every item is current-reality, so frames
belong in the build sections (§13–17). §1–12 stay frozen history.

#### Merchant wallet (M6 family, 10v detail)

- **Ledger row**: the Node 0 opening credit renders as **"Opening credit"** —
  never the raw description, which carries an internal config key.
- **10v transaction detail**: for the opening credit, merchant-voice description
  ("Added by Maanta when your shop was activated. It spends on success fees like
  a top-up, and is not refundable."), **no Reference row** — a manual grant has
  no payment reference. Other rows unchanged.
- **New-merchant wallet state** (new frame): neutral `info` InlineAlert under the
  balance — *"KES 300 starting credit — your first 10 verified redemptions
  covered; thereafter a transparent KES 30 success fee."* All three numerals are
  DERIVED (credit from the ledger row, fee from `app_config`, count = floor);
  annotate the frame so the literals are never pinned. Renders **last** in the
  state chain (arrears/empty/low always win) and **only while the credit is
  unspent**. There is deliberately **no partly-spent state** (founder ruling,
  2026-08-16) — do not draw one.

#### Admin shell (11-series)

- **Front door changed.** `/admin` is now the **Operations overview**; the
  approvals queue moved to `/admin/approvals`, content unchanged. Sidebar reads
  **Overview** then **Approvals**.
- **Operations overview** (new frame, `/admin`): node switcher pills (All nodes ·
  BBS Mall · CBD Galleria · Westlands Hub — live nodes only) · **"Needs a human"**
  four cards, each a link to its queue (Pending approvals, Held redemptions, Open
  support tasks, Merchants in arrears) · **"The loop (7 days)"** (Claims,
  Verified, Success fees, Arrears outstanding) · **"Supply"** (Active merchants,
  Live deals) · latest five approvals waiting · a scoped-state line explaining
  that redemptions, fees and tasks are counted through the node's merchants.
  Every windowed KPI carries its window in its own label. No amber: every card is
  navigation.
- **Sidebar**: additionally a separated **"Live product"** group at the bottom
  (View site → `/`, Shopper feed → `/feed`; icon + word, quiet, new tab, never
  amber) and a **Resources** item.
- **Agents overview**: rows are **clickable** → agent detail; chevron right.
- **Agent detail** (new frame, `/admin/agents/[id]`): back link · name +
  Active/Inactive chip · contact and role line · four KPI cards (Converted 7d vs
  target, Leads total, Conversion rate, Merchants assisted) · **Merchants
  assisted** list (each row → merchant detail 11b) · full lead list with
  status/lock chips · closing note that HR records (rota, employment) are **not
  in the product**. Read-only — no action buttons. Conversion rate shows **"—"
  with zero leads**, never "0%".
- **Support queue (11e)**: header gains a quiet ghost link **"Log an issue"** —
  the queue's override buttons own the amber budget.
- **Log an issue** (new frame, `/admin/support/new`): merchant select · issue type
  (the six queue types) · priority · **"How it reached you"** (Stall visit /
  WhatsApp / Social media / Email / Phone call) · **"Escalation"** (Direct to
  admin / Escalated from agent / Escalated from node manager) · description · one
  amber **Create ticket**. Error state is the `error` InlineAlert. Success lands
  on the open queue — no celebration takeover.
- **Resources** (new frame, `/admin/resources`): five audience sections
  (Shoppers, Merchants, Agents, Mall operators, Ops). Three row states, drawn
  distinctly: **live** (hover row, mono route, new tab) · **reference** (no link;
  mono location like `repo: docs/ops/…` or `Notion: …`) · **missing** (dashed
  border, "NOT WRITTEN YET · FOUNDER"). Legal rows carry **(DRAFT)**. Closing
  note: live legal pages are the less-sensitive versions — draft set, no counsel
  note.

#### Founder shell

- **Header** (new frame): MAANTA · FOUNDER label · right-aligned quiet nav —
  Admin console (admin role only), View site, Shopper feed (new tab). The shell
  previously had no navigation at all.
- **Operations block**: two states now exist. Admin — four linked cards.
  **Co-founder — same cards, same counts, no links**, plus one line: "Read-only.
  These queues are worked in the admin console, which this role does not open."
  Pattern to reuse anywhere a co-founder meets an admin-only destination: **keep
  the information, drop the action.**
- Still owed from the last handoff: is this header the Phase 0 Operations shell
  in embryo, or does Phase 0 replace it? Please answer rather than drawing a
  second shell.

#### Agent console (11h/11i family) — reclassified

Founder ruled 2026-08-16 (decisions log): the agent console **is the agents' lite
admin console** — onboard and monitor the pipeline. This supersedes the R4 note
("`/agent/*` is routes, not a product"). Update the classification wherever your
side carries it.

- **Lead detail** (amend): the unconverted state now carries the **onboarding
  handoff** — explanatory copy ("…hand this device to the owner — they sign in
  and submit it themselves, and the form's agent question records your assist")
  plus a ghost button **"Onboard this shop"** → `/merchant/onboard?shop=<name>`
  (prefilled, survives login). The screen's one amber action remains **Link to
  merchant**. The merchant-authored boundary is frozen — the agent is never the
  submitter; do not draw an agent-driven onboarding form.
- Scope stays narrow: leads plus handoff only; no money surfaces, no admin
  queues; an agent sees only their own leads. Co-founder variant is read-only
  pipeline.

#### Design-system deltas to record

1. **InlineAlert gains `info`**: neutral line border, secondary "i" icon, ink
   body, `role="note"`. For persistent states that are not be-careful states —
   good news is never rust (the D80 colour-semantics lesson generalised).
2. **Ghost nav-out pattern**: leaving a console for a live surface is icon + word,
   quiet, new tab, with a screen-reader "(opens in a new tab)" hint.
3. **Small text on ink floor**: labels at ~11px on the black sidebar are white/70
   minimum — white/40 composites to ~3.3:1 and fails 4.5:1.

#### Do not draw

Partly-spent credit state (needs a new ruling and copy) · escalation workflow or
ticket routing beyond the intake dropdowns (node manager is staffing, not a DB
role) · merchant-less tickets (schema forbids; founder-held) · welcome-pack
contents (mark as gaps; founder-held) · any agent-driven onboarding form ·
landing captures (D50 still open — no product photography exists).

#### Still open from the first handoff

The `b10f454` → `a082051` citation fix · the Phase 0 shell ruling above ·
design-side current-reality updates for the wallet and console shells. And the
standing rule from D103: **describe what renders, not what is guaranteed** — the
repo's `frames.json` is now test-pinned to the code, so your inventory and ours
must move together.

---

## Notes on what this prompt deliberately does not do

**It assigns no frame numbers.** The canvas owns its numbering; inventing "11m"
from here risks colliding with frames this session cannot see. New surfaces are
described by route and content instead.

**Every "do not draw" traces to a ruling or a schema fact**, not to taste, so the
design side can challenge any of them by name rather than having to argue with a
preference.

## Repo-side references for anything that comes back

| Topic | Where it is settled here |
|---|---|
| Opening-credit copy, derivation, unspent-only trigger | `maanta-app/src/lib/merchant-ledger-copy.ts` and its sibling test; decisions log 2026-08-16; drift row **D105** |
| `InlineAlert` variants | `maanta-app/src/components/ui/inline-alert.tsx` |
| Console navigation and the live-product links | `maanta-app/src/components/nav/live-product-links.ts` |
| Co-founder gating pattern | `maanta-app/src/components/founder/operations-links.tsx` |
| Operations overview and node scoping | `maanta-app/src/app/admin/page.tsx`, `maanta-app/src/lib/admin-dashboard.ts` |
| Agent detail and its arithmetic | `maanta-app/src/app/admin/agents/[id]/page.tsx`, `maanta-app/src/lib/agent-summary.ts` |
| Ticket intake vocabulary | `maanta-app/src/lib/support-intake.ts` |
| Resource registry | `maanta-app/src/lib/admin-resources.ts` |
| Agent lite-console ruling | `docs/maanta-decisions-log.md`, 2026-08-16 |
| Surface inventory | `maanta-app/design/current-reality/frames.json`, ratcheted in `src/lib/__tests__/parity-sync.test.ts` |
