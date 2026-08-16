# Wireframe update request to Claude Design — 2026-08-16

**What this is:** the second outbound handoff of 2026-08-16, asking the design
side to bring the wireframe canvas up to shipped reality. The first
(`claude-design-followup-2026-08-16.md`, merged in #212) covered the merchant
wallet and the earliest console changes; this one covers everything merged after
it, and is written to be executed with the **`impeccable`** design skill.

**Why it is a file:** same reason as the first. D103 happened because the design
side formed a premise from an artifact this repo owns and nobody could later
reconstruct what they had been told. The repo keeps the outbound half.

**Status:** sent 2026-08-16. Everything below is **current-reality, not
proposal** — frames belong in the build sections (§13–17); §1–12 stay frozen
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
| #216 | `524a899` | Admin-assisted onboarding (inert until D106's migration is applied) |

`a082051`, `68bf077` and `9b63f49` were verified live in production by healthz
read-back. The rest merged after the Vercel connector dropped out of the session,
so they are expected-live rather than verified — **verify before capturing
anything from production.**

**A note on the skill:** `impeccable` is **not** installed in this repo
(`.claude/skills/` does not exist here and `/impeccable` resolves to nothing). It
is invoked on the design side. It is also code-facing — `document` generates a
design doc *from* code and `extract` pulls tokens *out of* code — so a design
session with no repo access can use §2, §5 and `critique`, but not `document` or
`extract`.

---

## The prompt as sent

### Wireframe update via `impeccable` — repo side, 2026-08-16

Six merges are live on `main`. The canvas needs to catch up. This is a
**refinement against shipped reality, not a redesign** — impeccable's own rule
applies: *refinement preserves; redesign replaces*, and nothing here licenses
replacing the incumbent visual world.

#### 0. Before you start

**Check the skill is installed on your side.** It is not installed in the app
repo, so if your session is scoped to that repo it will need adding first.

Then, once per session:

```
node .claude/skills/impeccable/scripts/context.mjs --target <the surface you start with>
```

Follow its directives and do not rerun it. If it reports `CONTEXT_STALE`, act on
it there per its own instructions — **do not** run `/impeccable doctor` as a side
effect of this task. Repairing drift is a separate decision.

#### 1. Mode: Operate — and it is not a close call

Every surface in this update is **Operate**: admin console, founder shell, agent
console, merchant wallet. The visitor is completing a task, so *scanability,
consistency, native expectations and the real usage scene outrank expression*.

Two consequences worth stating because they are where an ambitious pass would go
wrong here:

- **The merchant wallet is an Operate surface handling other people's money.**
  Nothing on it is a canvas for delight.
- **The landing page is the only Persuade surface in the product, and it is out
  of scope.** D50 is open — no product photography exists and the hero is a CSS
  mockup — so it cannot be built on real captures yet.

Persist the mode in the surface brief only, not globally.

#### 2. The brief that wins

Impeccable says the brief wins over its own saturated-pattern instincts, and that
redirecting a clear brief toward your taste is failure. **This is the brief**, and
it is CI-enforced rather than a preference — `frozen-ui-rules.test.ts` fails the
build on violations:

1. ≤1 amber action per screen; amber is fill or border only, never money text.
2. CTA = amber fill + **black** label; disabled is never amber.
3. Money is never coloured, never in a toast, never celebrated.
4. State = icon + word, readable in greyscale. Failure is dark `#141414`; error
   is borders and icons only, body text stays `#111`.
5. Warning is rust `#9A4A0C` — never red or yellow.
6. The 6-digit code is the only bare numeral; no price inside the code card.
7. YOU PAY is identical on tile, detail and claimed code.

Plus the standing bans: no gradients, no glassmorphism, no celebratory motion on
a money surface, no emoji on money/error/loading surfaces, colour never the sole
carrier of state.

**Where impeccable's craft floor and these rules disagree, these rules win.**
"Bold" in this product means precise, not decorative — brand lives in the
details, per the Operate guidance.

#### 3. Command sequence

Run them in this order. Each is scoped; none is a licence to restyle.

**a. `/impeccable document`** — the main event. It generates DESIGN.md from
existing project code, which is exactly the shape of this task: the canvas is
behind the code, not ahead of it. Point it at the console surfaces first:

- `src/app/admin/page.tsx` — the new Operations overview (node switcher, the
  "Needs a human" queue cards, the 7-day loop, supply)
- `src/app/admin/agents/[id]/page.tsx`, `src/app/admin/support/new/`,
  `src/app/admin/resources/page.tsx`, `src/app/admin/merchants/new/`
- `src/app/founder/layout.tsx` + `src/components/nav/founder-header.tsx`
- `src/app/merchant/(app)/wallet/` (both screens)
- `src/app/agent/leads/[id]/page.tsx` — the onboarding handoff

**b. `/impeccable extract`** — three deltas belong in the design system, not in
one screen's frame:

1. **`InlineAlert` gains `info`** — neutral line border, secondary "i" icon, ink
   body, `role="note"`. It exists because not every persistent money state is a
   be-careful state; good news in rust is the colour-semantics error D80
   corrected. Record it beside `warning` and `error`.
2. **Ghost nav-out pattern** — leaving a console for a live surface is icon +
   word, quiet, new tab, with a screen-reader "(opens in a new tab)" hint.
3. **Small-text-on-ink contrast floor** — labels at ~11px on the black sidebar
   are white/70 minimum; white/40 composites to ~3.3:1 and fails 4.5:1.

**c. `/impeccable critique`** on the two surfaces with genuinely new information
architecture, where a second opinion is worth having:

- the Operations overview — is "Needs a human" first the right hierarchy for a
  glance surface, and do the four cards read as queues rather than stats?
- the agent detail — four KPI cards plus two lists on one screen; is the density
  earning its place for an admin/HR reader?

**d. `/impeccable audit`** on the admin shell for a11y and responsive behaviour,
specifically the sidebar's new "Live product" group in the mobile ☰ drawer.

Do **not** run `polish`, `bolder`, `delight` or `overdrive` on any of this. The
consoles are deliberately sober and the money surfaces are frozen.

#### 4. What shipped, in one table

| Surface | Change |
|---|---|
| `/admin` | **Now the Operations overview**, node-switchable (All · BBS Mall · CBD Galleria · Westlands Hub) |
| `/admin/approvals` | The approvals queue moved here, content unchanged |
| `/admin/agents/[id]` | New: agent record, incl. merchants assisted; conversion rate is "—" not "0%" at zero leads |
| `/admin/support/new` | New: ticket intake with channel + escalation |
| `/admin/resources` | New: resource centre, three row states (live / reference / missing) |
| `/admin/merchants/new` | New: admin-assisted onboarding (inert until a migration is applied — D106) |
| Founder shell | Gained a header; Operations cards have a co-founder read-only state |
| `/agent/leads/[id]` | Onboarding handoff — ghost button, merchant-authored |
| Merchant wallet | "Opening credit" row, merchant-voice detail, new-merchant state |

#### 5. Do not draw

Each traces to a ruling or a schema fact, not to taste — challenge any by name:

- **Partly-spent opening-credit state** — founder ruled there is none; the
  sentence claims "your first N redemptions covered" and expires at the first
  fee. Needs a new ruling *and* new copy.
- **Escalation workflow or ticket routing** beyond the intake dropdowns —
  `node_manager` is a staffing concept, not a DB role.
- **Merchant-less tickets** — schema forbids it (`merchant_id` NOT NULL).
- **Welcome-pack contents** — mark as gaps; founder-held.
- **Agent-driven onboarding form** — the merchant is always the submitter.
- **Landing captures** — D50 open, see §1.

#### 6. Deliverables

1. Updated DESIGN.md (or its equivalent on your side) covering the surfaces in §3a.
2. The three design-system entries from §3b.
3. Frames in the **build sections (§13–17)** — §1–12 stay frozen history per the
   2026-08-09 ruling. Assign your own numbering; frame numbers are deliberately
   not invented from the repo side.
4. Critique findings from §3c as a list we can act on, not applied changes.
5. The standing answer still owed: is the shipped founder header the Phase 0
   Operations shell in embryo, or does Phase 0 replace it?

#### 7. One rule that outranks all of the above

From D103, and it is why this handoff exists in this form: **describe what
renders, not what is guaranteed.** `frames.json` in the repo is now test-pinned
to the code, so your inventory and ours have to move together — a frame that
describes a property where a reader needs a screen is how the last false premise
formed.

---

## Notes on what this prompt deliberately does not do

**It assigns no frame numbers.** The canvas owns its numbering; inventing "11m"
from here risks colliding with frames this session cannot see.

**Every "do not draw" traces to a ruling or a schema fact**, not to taste, so the
design side can challenge any of them by name rather than argue with a preference.

**It subordinates the skill to the frozen rules.** `impeccable`'s stated posture
is "dream big and bold" — right for a landing page, wrong for a wallet ledger. Its
own rule that the brief wins is what makes the subordination clean rather than a
fight, so §2 states the frozen rules *as the brief* and says plainly which side
wins a conflict.

**It bans four of the skill's own commands** — `polish`, `bolder`, `delight`,
`overdrive` — because the consoles are deliberately sober and the money surfaces
are frozen. A command list without exclusions reads as permission.

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
| Admin-assisted onboarding attribution | `maanta-app/supabase/migrations/20260816020000_admin_assisted_onboarding_attribution.sql`; drift row **D106** |
| Agent lite-console ruling | `docs/maanta-decisions-log.md`, 2026-08-16 |
| Frozen UI rules, as enforced | `maanta-app/src/lib/__tests__/frozen-ui-rules.test.ts` |
| Surface inventory | `maanta-app/design/current-reality/frames.json`, ratcheted in `src/lib/__tests__/parity-sync.test.ts` |
