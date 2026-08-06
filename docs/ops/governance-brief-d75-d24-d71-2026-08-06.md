# Governance brief — proposed D75, D24 status, D71 closure options (2026-08-06)

Prepared for founder decision. **This brief edits nothing**: the drift register,
CLAUDE.md and the readiness tracker are untouched. It contains a ready-to-paste
register row and two decision menus. Everything below was verified against the
repo at `9f19e6b` (branch `claude/maanta-cleanup-dead-code-l68779`), not taken
from prompt context.

## 1. Proposed row D75 — placeholder/legal disclosure rendering

Verified state, 2026-08-06:

- `docs/ops/demo-mode-spec.md` §2 (line 45): every placeholder identifier
  "must render inside `<PlaceholderId>` … Never as plain text";
  `lib/marketing/demo.ts` repeats the rule.
- `PlaceholderId.tsx` has **zero importers** — it renders nowhere (found in the
  2026-08-06 dead-code pass and deliberately left).
- `src/content/legal/privacy-policy.md:16` hardcodes the ODPC identifier as a
  plain markdown code-span, and the string is `DEMO-ODPC-NOT-REGISTERED` — a
  **transposition** of the canonical `PLACEHOLDER_IDS.odpc`
  (`ODPC-DEMO-0000-NOT-REGISTERED`). The transposed form does **not** match
  `/-DEMO-/`, so the component's dev-throw / production-suppress net could never
  fire on it even if wired in — the spec §4 launch-checklist assumption
  ("a placeholder identifier cannot reach production silently") does not hold
  for this string.
- `RESOLVED_TOKENS` maps `ODPC_REGISTRATION`/`COMPANY_REGISTRATION`/`PIN`, but
  **no legal markdown contains those tokens** — the canonical values render
  nowhere; the mapping is vestigial.
- The `RegulatoryStatus` block (DECIDED 2026-07-31, spec §2;
  `REGULATORY_STATUS` in `demo.ts`, wording "verbatim, must not be
  paraphrased") is rendered by nothing.
- Containment that does exist: `LegalDraftBanner` on all four legal routes via
  `(marketing)/layout.tsx`, and the privacy line's inline "placeholder, see
  demo notice". What is missing is the crop-surviving badge treatment the spec
  argues for, and any guard. No existing test (`held-claims`,
  `prelaunch-consistency`, `check-tokens`) covers identifier rendering.

Row text to paste (append after D74; category from the enforced list —
`code-outlier`, since code diverges from a decided spec):

> | D75 | open | code-outlier | 2026-08-06 | Legal / marketing | **Placeholder regulatory identifiers do not render the way the disclosure spec requires — and the one identifier actually published bypasses the safety net.** `docs/ops/demo-mode-spec.md` §2 rules "Every one must render inside `<PlaceholderId>` … Never as plain text", and `maanta-app/src/lib/marketing/demo.ts` repeats the rule over `PLACEHOLDER_IDS`. Verified 2026-08-06: (1) `maanta-app/src/components/marketing/PlaceholderId.tsx` has zero importers — the component renders nowhere; (2) `maanta-app/src/content/legal/privacy-policy.md` line 16 hardcodes the ODPC identifier as a plain markdown code-span, and the string `DEMO-ODPC-NOT-REGISTERED` is a transposition of the canonical `PLACEHOLDER_IDS.odpc` (`ODPC-DEMO-0000-NOT-REGISTERED`) that does **not** match `/-DEMO-/` — so the component's dev-throw and production-suppress net could never fire on it even if wired in, and spec §4's "a placeholder identifier cannot reach production silently" does not hold for this string; (3) `RESOLVED_TOKENS` in `maanta-app/src/lib/marketing/legal-docs.ts` maps `ODPC_REGISTRATION`/`COMPANY_REGISTRATION`/`PIN` to the canonical values but no legal markdown contains those tokens, so the canonical values render nowhere; (4) the `RegulatoryStatus` block DECIDED 2026-07-31 (spec §2; `REGULATORY_STATUS` in `demo.ts`) is rendered by nothing. Exposure is contained — `LegalDraftBanner` renders on all four legal routes and the privacy line carries an inline "placeholder, see demo notice" caveat — but the crop-surviving badge treatment the spec argues for is absent, which is precisely the §2 risk (a screenshot cropped past the disclaimer). Scope: marketing legal pages only; no app, money or RBAC surface renders these values | Founder/counsel decision first, then implement one of: **(a) wire the spec in** — put `{{ODPC_REGISTRATION}}` in the privacy markdown, render identifier tokens through `<PlaceholderId>` in `LegalDoc.tsx`, delete the transposed literal, render the `RegulatoryStatus` block where §2 says; or **(b) retire the mechanism** — amend `demo-mode-spec.md` §2 to bless the banner-plus-inline-caveat treatment now live, and delete `PlaceholderId`/`REGULATORY_STATUS` as dead code (left in place by `docs/ops/dead-code-cleanup-2026-08-06.md` pending this row). Either way, add the missing guard: (a) a test asserting the canonical `PLACEHOLDER_IDS` strings reach the rendered legal surface through the component, or (b) a test asserting no `DEMO`-form identifier appears in `src/content/legal/` outside the sanctioned form — plus, in both, an assertion that the transposed `DEMO-ODPC-NOT-REGISTERED` literal is gone. no guard yet | eng |

## 2. D24 — status check against the mission framing

The mission described "four remaining version mismatches". **The register says
D24 closed 2026-08-05**: production's `schema_migrations` and the repo's 85
migration files agree on all 85 version/name pairs, verified by full read-back
diff. The four mismatches existed and were each resolved:

1. Prod's `20260730120000 node_scoped_opening_credit_cap` (no file in repo) —
   exported verbatim from the ledger's stored statements into the repo.
   **Live residue: D73** — the migration is in the chain but its per-node cap
   was clobbered by `20260730130000` before taking effect.
2. The success-fee notes fix — renamed in the repo to `20260730160000` to match
   what prod recorded at apply time.
3. & 4. The two pause-gate rows — prod's MCP-minted `20260804152939`/`…51`
   repaired in the ledger to the repo filenames `20260730180000`/`20260730190000`.

There is nothing left to fix in the ledger itself. The standing check is
`supabase db push --dry-run` → "Remote database is up to date", re-run after
any apply. The real open decision descending from D24 is **D73 timing** —
reland the per-node opening-credit cap. Register position: not urgent for the
Node 0 pilot, **required before any second node**.

## 3. D71 — closure options (founder ruling)

Current state (all verified in-repo): tripwire live — `/api/healthz` exposes
`ref` (`src/lib/health.ts`, `health.test.ts`) and
`.github/workflows/prod-branch-guard.yml` polls every 30 min, failing on
`ref != main`, missing ref, or unreachable healthz. Prevention confirmed
unavailable: no Vercel setting restricts Promote. Preview-URL protection ON,
system env vars ON. Remaining from the row: (a) confirm Production Branch =
`main`, (c) promote-rights / team-RBAC + token audit. The row's own close
condition: a non-main promote demonstrably fails (unreachable — no such
setting exists), **or** the founder rules the standing guard sufficient.

- **Option A — rule the standing guard sufficient and close.** Do (a) and (c),
  record both in the row, add a decisions-log entry, close citing
  `prod-branch-guard.yml` + `health.test.ts` + the decisions entry (satisfies
  register rule 2). Pros: honest — everything buildable is built and tested;
  the row stops consuming attention; close condition is explicitly yours to
  invoke. Cons: a fifth promote is still one click away; detection is ≤30 min
  of exposure, not zero; team RBAC can drift after the audit (new member,
  new token) with nothing watching it.
- **Option B — Option A plus a soft promote policy.** Same as A, plus a short
  promote runbook (only from `main`; `curl healthz` after; non-main promote =
  incident + register row). Pros: gives any human with promote rights a rule
  to point to; near-zero cost. Cons: paper does not stop clicks; risks
  guard-theatre — the register's culture prefers an honest "no guard" over a
  decorative one. Worth doing only if written as one paragraph in an existing
  runbook, not a new ceremony.
- **Option C — keep open until a milestone** (e.g. the 3-person pilot
  completes). Pros: conservative through the highest-risk window; free.
  Cons: waiting produces no new information — prevention-unavailable is
  already established fact; open founder-owned rows accumulate attention cost
  and rot risk (D49 was exactly a stale status line).

Recommendation: **A**, with B's one-paragraph runbook note folded in if cheap.

## Gotchas / founder-only items

- **D75 option (a) vs (b) is a founder/counsel call** — it is disclosure
  posture, and `REGULATORY_STATUS` wording is spec-verbatim, not to be
  paraphrased by an implementer.
- The transposed ODPC literal silently defeats the `/-DEMO-/` launch-checklist
  net — whichever D75 option is chosen, kill the transposed string.
- **D71 item (c)** (team membership, token scoping) is founder-only — it names
  people.
- The tripwire depends on two things staying true: healthz remains public, and
  GitHub scheduled workflows keep running — GitHub suspends cron workflows
  after ~60 days without repo activity, and cron firing can lag. The workflow
  already fails red on "cannot see", which covers the first; the second is a
  known soft spot of any cron tripwire.
- **Closing D71 requires the guard-naming rule** (register rule 2): cite the
  workflow + health test + the decisions-log entry recording the ruling — not
  just prose.
- Cofounder role assignment stays held (Q14) until D74's DB policy layer lands;
  nothing in this brief changes that.
