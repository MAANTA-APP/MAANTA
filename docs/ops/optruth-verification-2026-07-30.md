# OpTruth verification — Node 0 & pilot readiness (2026-07-30)

**What this is:** an independent check of the claims on the Notion page
*MAANTA optruth — Node 0 & pilot readiness (2026-07-30)* and its repo mirror
`docs/ops/notion-optruth-node0-pilot-2026-07-30.md` (PR #149), against the
things they describe: `origin/main`, the Vercel production deployment, the open
PR set, and **production's own migration ledger**.

Every prior 07-30 migration doc reasons from the repo file listing. This one
queried `supabase_migrations.schema_migrations` on `axrrslqssmbngbataejg`
(read-only `SELECT`, no writes). Where the two disagree, the ledger wins.

Three of the four Notion summary bullets need correcting. The **operational
instruction** — land #148 first, then `db push`, expect `170000` / `180000` — is
unaffected and still right. What is wrong is the *reasoning* attached to it, and
that reasoning is what the next person will follow when they allocate a version.

---

## 1. Main & prod are aligned — at `7f97afc`, not `4f418755`

| Claim | Verified state |
|---|---|
| "Main & prod aligned at `4f418755` (`maanta-nuia`)" | Aligned, but both are at **`7f97afc`** |

- `origin/main` tip: `7f97afc` — *docs(skills): record 2026-07-30 repo + branch
  audit (#147)*, merged 2026-07-30 20:59 (+02:00), one commit past `4f418755`.
- Vercel `maanta-nuia` production: deployment `dpl_CBoaJey…`, **READY**, target
  `production`, commit `7f97afcb4cc6de166674e92eb6830094164bb20f`, branch `main`.

#147 touched `docs/README.md` and `docs/skills/repo-branch-audit-2026-07-30.md`
only — **no application code, no migrations**. So the alignment claim holds and
no behavior changed; the SHA is simply stale. Update the Notion summary to
`7f97afc` so a reader comparing SHAs does not conclude prod has drifted.

---

## 2. The migration map in #148 / #149 is wrong; #143's is right

This is the finding that matters. The Notion summary says `160000` is
**reserved**; the maps in #148 and #149 describe `120000` as the notes
migration's repo filename and `160000` as a "RESERVED / production notes ledger
alias — never add a new file here."

Production's ledger says otherwise:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version LIKE '202607%' ORDER BY version;
```

| Version | Name in production | Status |
|---|---|---|
| `20260730010000` | `demo_seed_deal_refresh` | applied |
| `20260730120000` | **`node_scoped_opening_credit_cap`** | applied — **burned**, no repo file uses it |
| `20260730130000` | `enforce_elite_trial_first_100_cap` | applied |
| `20260730140000` | `trial_expiry_launch_sentinel_null_guard` | applied |
| `20260730150000` | `demo_wipe_audit_trail_retention` | applied |
| `20260730160000` | **`correct_success_fee_config_notes`** | applied — **taken by a real file**, not a reserved alias |
| `20260730170000` | — | **not applied** (opening-credit reland, #143) |
| `20260730180000` | — | **not applied** (pause gate, #148) |

So both halves of the #148 / #149 description are inverted:

- `120000` is **not** the notes migration's version — production holds it for the
  hand-applied `node_scoped_opening_credit_cap`. It has no repo file, which makes
  it look free from `main` alone. It is the version most likely to be reused by
  accident.
- `160000` is **not** a reserved alias — it is where the notes migration
  genuinely lives in production. That is precisely *why* the pause gate had to
  move off it.

**PR #143's version of `docs/ops/supabase-migrations.md` already states this
correctly**, including the allocation rule "strictly greater than the highest
assigned *or reserved* row" rather than "highest already on `main`". Its map is
the one to keep.

### Consequence for the landing order

The order #148 → #137/#143/#94/#131 lands the **wrong** map on `main` first and
the corrected one two PRs later. That is survivable but not free: whoever merges
#143 must let **#143's** `supabase-migrations.md` win the conflict rather than
resolving toward the incumbent `main` copy. If it resolves the other way, the
repo keeps a document whose stated purpose is preventing version collisions
while naming the wrong version as burned.

---

## 3. The pause gate is confirmed unapplied — and `db push` today would hide that

Not inferred from filenames; read from the ledger. Version `20260730180000` is
absent from production, and `20260730160000` is present under the name
`correct_success_fee_config_notes`.

`main` today still ships
`maanta-app/supabase/migrations/20260730160000_restore_claim_deal_pause_gate.sql`.
Because `db push` matches on **version string alone**, running it against
production from `main` right now would find `20260730160000` already recorded,
skip the file, and report success. The paused-deal claim gate would remain
missing while the operator believed it had just been applied.

**Do not run `supabase db push` from `main` before #148 lands.** A green push
today is not evidence the gate is live. After #148 (and #143), verify by name,
not just count:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20260730170000','20260730180000') ORDER BY version;
-- expect: 20260730170000 node_scoped_opening_credit_cap_reland
--         20260730180000 restore_claim_deal_pause_gate
```

---

## 4. The landing order starts with two draft PRs

| PR | State | Note |
|---|---|---|
| **#148** | **draft** | First item in the landing order — cannot merge until marked ready for review |
| **#149** | **draft** | Carries the Notion mirror + the go/no-go note; also based on `4f418755` |
| #137 | ready | Based on `7f97afc` (current main) |
| #143 | ready | Carries the corrected migration map |
| #94 | ready | |
| #131 | ready | |
| #132 | ready | **Not in the landing order**, but open and overlapping #131's design contract — decide explicitly rather than leaving it to merge order |

#148 and #149 are both based on `4f418755` and predate #147. Since #147 was
docs-only, this is a docs conflict risk (`docs/README.md`,
`docs/skills/repo-branch-audit-2026-07-30.md`), not a code one.

---

## What to change

1. **Notion summary bullet 1** — `4f418755` → `7f97afc`.
2. **Notion summary bullet 3** — "`160000` reserved" is wrong. Say instead:
   `160000` holds `correct_success_fee_config_notes` in production; **`120000` is
   the burned version** (`node_scoped_opening_credit_cap`, no repo file). Next
   free version is above `180000`.
3. **Mark #148 and #149 ready for review**, or the landing order cannot start.
4. **On merging #143**, keep #143's `docs/ops/supabase-migrations.md` map.
5. **Decide #132** in or out of the pilot landing set.

Unchanged and still correct: money/trust paths are E2E-ready; the env checklist
(Clerk pk+sk, `W3W_API_KEY`, BBS GPS backfill); Playwright non-prod only; and the
merge order itself.

---

## Method

- `git log` / `git show` on `origin/main` at `7f97afc`.
- Vercel `list_deployments` for `maanta-nuia` (team `maanta`) — production target.
- GitHub `list_pull_requests` (open) + `pull_request_read` on #149; file read of
  `docs/ops/supabase-migrations.md` at #143's head `20c75af`.
- Supabase read-only `SELECT` against `axrrslqssmbngbataejg`. No writes, no
  `db push`, no migration applied. Production DB changes remain a human step per
  `docs/ops/supabase-migrations.md`.
