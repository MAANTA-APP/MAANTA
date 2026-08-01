# Node 0 pilot readiness — 2026-07-30

**Audience:** Founder / operator with access to Vercel, Supabase, GitHub, and https://www.maanta.app.  
**Purpose:** One go / no-go note so you can say, with evidence: *main, DB, and env are aligned enough that a real Node 0 pilot can run without hidden technical surprises.*

**Companions (do not re-derive):**

| Doc | Role |
|---|---|
| [founder-parity-handoff](./founder-parity-handoff-2026-07-30.md) | Money-path truth, Elite vs D-12, env actions |
| [founder-e2e-checklist](./founder-e2e-checklist-2026-07-30.md) | Click-by-click first walkthrough |
| [supabase-migrations](./supabase-migrations.md) | `db push` + version map |
| [e2e-readiness inventory](./e2e-readiness-report-inventory-2026-07-30.md) | What was verified in-repo |
| [repo-branch-audit](../skills/repo-branch-audit-2026-07-30.md) | Why pause-gate was renumbered |
| [notification-prefs canonical](../skills/notification-prefs-canonical-2026-07-30.md) | Prefs route contract |

---

## 1. Main + DB status

| Item | Status |
|---|---|
| **`main` SHA** | `4f418755` — Browse/Map separation (PR #113) |
| **Vercel production** | Project **`maanta-nuia`** tracks `main` at the same SHA (READY) |
| **Build / typecheck / lint** | Pass on this tip |
| **Pause-gate on `main` today** | File may still be named `…160000_restore…` until **#148** merges — that version is **silently skipped** on prod because `160000` already holds the notes ledger alias |
| **After #148** | Pause-gate is **`20260730180000`**. Human must run `supabase db push` so it actually applies |

### Migration map (canonical — use these numbers, not `1600000`)

| Version | Intent |
|---|---|
| `20260730120000` | notes (repo filename; prod may hold same content as `160000`) |
| `20260730130000`–`150000` | Elite first-100 cap / trial sentinel / demo wipe |
| **`20260730160000`** | **RESERVED** — production notes ledger alias; **never** add a new file here |
| **`20260730170000`** | Opening-credit reland (**#143**) |
| **`20260730180000`** | Pause-gate restore (**#148** renumber) |

**Human DB step (production `axrrslqssmbngbataejg`):**

```bash
cd maanta-app
supabase link --project-ref axrrslqssmbngbataejg
supabase migration list          # confirm LOCAL vs REMOTE
supabase db push --dry-run       # preview
supabase db push                 # apply pending, including 170000 / 180000 when landed
```

Verify:

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20260730130000','20260730140000','20260730150000',
                  '20260730170000','20260730180000')
ORDER BY version;

SELECT * FROM public.elite_trial_cap_status();
```

Also confirm lat/lng exists (`20260726120000`) and backfill BBS merchant GPS if Map pins are empty.

---

## 2. Flows that are explicitly E2E-ready (product)

Once Clerk + migrations + (optional) GPS are in place, these journeys are **honest and complete** in code — not stubs:

### Shopper money path

Claim → phone gate → ticket + **15-minute** grace → till fee disclosed → merchant **Confirm** (verify-anyway; **KES 30** fee / arrears) or **Reject** (no fee). Second claim on same deal blocked. Paused deals must reject new claims after `180000` is applied.

### Merchant redemption / top-up

`/merchant/redeem` with fee disclosure; wallet / ledger reflect charge. Top-up: **Pay with card** (Stripe) is Phase 1; M-Pesa STK only when IntaSend is configured — UI says so when it is not.

### Admin / guardian oversight

Approve merchants with honest Elite-trial notice (granted / cap full / unknown). Cap line matches `elite_trial_cap_status()`. Redemptions visible under `/admin/redemptions`; billing under `/admin/billing`. Guardian held / hard-block / appeal paths exist for disputes after the fact.

### Notification prefs + Elite trial

| Surface | Contract |
|---|---|
| `/you/notifications` | Canonical preference toggles |
| `/notifications` | Inbox only + link “Manage alert preferences” |
| `/notifications/preferences` | Redirect → `/you/notifications` |
| Elite trial | First **100** BBS Mall merchants, **30 days**, **KES 30 still applies** |
| D-12 | Bans only ungoverned “Elite free month” — not the governed trial |

Walkthrough steps: [founder-e2e-checklist](./founder-e2e-checklist-2026-07-30.md).

---

## 3. Env / ops checklist for Node 0

Do these on **Production** (or a dedicated rehearsal project — never point Playwright at prod).

| # | Need | System | What you do |
|---|---|---|---|
| 1 | **Clerk publishable + secret** | Vercel → `maanta-nuia` → Production | Set both for Clerk instance `cheerful-sailfish-3`. Redeploy. Publishable alone → “Invalid host” in the browser. |
| 2 | **`W3W_API_KEY`** | Same Vercel Production | Required for onboard what3words validation (fails closed if empty). |
| 3 | **Stripe sandbox (or live when you intend live)** | Same | Merchant `/merchant/topup` Phase 1 path. |
| 4 | **July 30 migrations + pause-gate** | Supabase `axrrslqssmbngbataejg` | After **#148** (and **#143** if landing opening-credit): `supabase db push`. Confirm `20260730180000` remote. |
| 5 | **Merchant lat/lng + GPS backfill** | Supabase + data | Ensure `20260726120000` applied; backfill BBS Mall `lat`/`lng` so Browse/Map pins work. |
| 6 | **Node cookie** | Browser | Feed scoped to **BBS Mall** (`maanta_node`). |
| 7 | **Playwright (optional confidence)** | GitHub Actions secrets or local | `E2E_BASE_URL` = **non-prod only**. Needs `E2E_SHOPPER_*`, `E2E_MERCHANT_*`, optional `E2E_ADMIN_*`. See `docs/ops/e2e-golden-path.md`. |

IntaSend is **not** required for pilot day one if card top-up works.

---

## 4. Branch / PR landing order (before real Node 0 traffic)

**One line:** Merge **#148** → then **#137 / #143 / #94 / #131** (optional **#121 / #142**) → human **`supabase db push`** on prod so `170000` / `180000` apply.

| Order | PR | Why |
|---|---|---|
| 1 | **#148** branch-audit consolidation | Pause-gate → `180000`; prefs canonical; docs |
| 2 | **#137** truth-audit | Aligned to shared `180000` |
| 3 | **#143** pilot sequencing | Opening-credit `170000` + pause `180000` |
| 4 | **#94** avatars / notif | Inbox prefs panel removed; matches `/you/notifications` |
| 5 | **#131** role-hardening | D-12 copy clarified vs governed Elite trial |
| optional | **#121 / #142** | Prod hardening / PostHog drafts |
| **then** | — | Operator `db push` + Clerk/W3W/GPS checks above |

Do **not** fix these by editing `main` directly. Do **not** add a new migration at version `20260730160000`.

Day-of walkthrough after the above: [live-pilot-day-one-prep](./live-pilot-day-one-prep-2026-07-30.md) and [3-person runbook](./live-pilot-3-person-2026-07-30.md).

---

## 5. Remaining human decisions (not hidden tech surprises)

These are **product / marketing** calls. They do not block a careful pilot if you accept current UI:

1. **Feed marketing titles** — “Hot deals” / “Ending soon” / “All deals” vs locked “Flash / Priority / All Active Deals”.
2. **`/contact`** — still design-ahead (fake success, no API). Hide or ship a real inbox later.
3. **Admin deal-report taxonomy** — not a live queue; use existing dispute / fraud paths.

---

## Verdict

| Layer | Safe enough for Node 0 pilot? |
|---|---|
| Product money + trust paths | **Yes** — claim → verify → fee, pause gate (once `180000` applied), verify-anyway, Elite cap, Stripe-primary top-up |
| `main` / Vercel | **Yes** at `4f418755`; land **#148+** before relying on pause-gate + prefs docs in prod |
| DB | **Yes after** human `db push` post-merge (especially `180000`) |
| Env | **Yes after** Clerk pk+sk + `W3W_API_KEY` on Vercel; GPS backfill for Map |
| Playwright | Optional; never against production |

**Bottom line:** Repo and production tip are aligned. The remaining work is **merge order + operator `db push` + keys/GPS** — not rediscovering product rules. Follow §4, then the [founder E2E checklist](./founder-e2e-checklist-2026-07-30.md).
