# D14 — BBS launch preflight and demo-mode disable

**Status:** prepared 2026-08-10, **not yet run** · **Owner:** founder / ops lead
· **Target:** Supabase project `axrrslqssmbngbataejg`, `https://www.maanta.app`
· **Drift row:** **D14** · **Ruling:** founder, 2026-08-10

## What this document is, and what it is not

This is the **gate** in front of flipping `app_config.demo_mode_enabled` to
`false` on production, plus the evidence required to close **D14**.

**It is not the mechanical procedure.** That already exists and is not
duplicated here — `docs/ops/demo-mode-runbook.md` §4 owns the disable and wipe
commands, §5 owns feature rollback, and `docs/ops/demo-mode.md` owns the design.
This document adds the four things that runbook does not have: the **preflight
gates**, the **anonymous production evidence**, the **first-launch monitoring
window**, and the **D14 closure template**.

**Read `demo-mode-runbook.md` §4 once before your first run.** Everything below
assumes it.

### The rule that governs this whole document

> **Founder ruling, 2026-08-10: do not flip the production demo flag merely to
> clear the drift item.**

D14 is an *open drift row*, not a task to be closed. The flag stays **on** until
a staffed launch preflight passes. A green drift register bought by an empty
public feed is worse than an open row, because the row is honest and the empty
feed is not.

**Why the flip is not reversible in the way it looks.** `make demo-off` is
instantly reversible at the database level — but the *shopper impression* is
not. Turning demo mode off reveals only the real, non-demo deals at Node 0.
If there are none, `/feed` correctly renders **"No deals live right now"**, and
that is what an organic visitor, a mall operator or a prospective merchant sees
for as long as it lasts. Flipping back on to hide an empty feed re-publishes
synthetic deals under the brand. **Neither direction is a free undo, which is
why the gate is inventory, not a switch.**

---

## 1. Preflight gates

All eight must pass, in order, **on the same day as the flip**, with a named
human on each. Conditions 1–5 are inventory and readiness; 6–8 are the change
itself and its evidence.

**🛑 Any failed gate stops the launch. Do not flip and then fix.**

### Gate 1 — At least 5 real eligible BBS deals

"Eligible" means each deal would actually appear in `/feed`. That is the
conjunction the discovery query enforces (`maanta-app/src/lib/data.ts`,
`selectLiveDealBucket`), so check the same predicate rather than eyeballing a
deal list:

```sql
SELECT count(*) AS eligible_real_deals
FROM public.deals d
JOIN public.merchants m ON m.id = d.merchant_id
WHERE d.is_demo    = false
  AND m.is_demo    = false
  AND d.is_active  = true
  AND d.is_paused  = false
  AND d.expires_at > now()
  AND m.status           = 'active'
  AND m.is_visible       = true
  AND m.is_shadow_banned = false
  AND d.node = '<node-0-identifier>';
```

**Pass: `>= 5`.** Read-only; safe to run any time.

> Note the `expires_at > now()` term. Five deals that all expire this afternoon
> pass this gate at 11:00 and fail it at 18:00. Check the expiry spread, not
> just the count — see Gate 3.

### Gate 2 — At least 2 merchant categories represented

```sql
SELECT m.category, count(*) AS deals, count(DISTINCT m.id) AS merchants
FROM public.deals d
JOIN public.merchants m ON m.id = d.merchant_id
WHERE d.is_demo = false AND m.is_demo = false
  AND d.is_active = true AND d.is_paused = false AND d.expires_at > now()
  AND m.status = 'active' AND m.is_visible = true AND m.is_shadow_banned = false
  AND d.node = '<node-0-identifier>'
GROUP BY m.category ORDER BY deals DESC;
```

**Pass: at least 2 distinct categories.** A feed of five deals from one fabric
shop reads as a single merchant's page, not a mall.

> Confirm the column name against the live schema before your first run — this
> query is written from the discovery predicate, and the category column has not
> been verified against production from this session.

### Gate 3 — Merchant offer terms confirmed

For **every** deal counted in Gate 1, a named person has confirmed with the
merchant, in the last 48 hours:

- [ ] The merchant knows the deal is live to the public today.
- [ ] The stated price and what the shopper receives are correct and honoured.
- [ ] The expiry is deliberate, and the deal is not about to lapse mid-window.
- [ ] The merchant accepts the **KES 30** success fee per verified redemption.
- [ ] The merchant's wallet can cover the expected redemptions, or they accept
      the arrears path.

**A deal nobody has confirmed with the merchant is not real inventory — it is a
row.** The first shopper to be refused at a counter costs more than the launch
gains.

### Gate 4 — Counter verifiers trained and able to complete a redemption

For each merchant in Gate 1:

- [ ] At least one named staff member on shift during the launch window.
- [ ] That person has their own login and has completed a **rehearsal**
      verification end to end.
- [ ] They know a code can fail legitimately (expired, wrong shop, already used)
      and that **rejecting is allowed and free**.
- [ ] They know the verify-anyway rule: preserve the shopper's experience at the
      counter; disputes route to admin/agent afterwards.

**Rehearse against the demo/rehearsal accounts, not production inventory.** Do
not run test claims or redemptions against real deals — it consumes real
inventory and writes real fee rows.

### Gate 5 — A named founder/operator available for the launch window

- [ ] Named person, reachable, for the full monitoring window in §4.
- [ ] They can reach the Supabase dashboard and this runbook.
- [ ] They have authority to execute §5 rollback without escalating.

### Gate 6 — A human disables the flag

Per `docs/ops/demo-mode-runbook.md` §4.1 and §4.2:

```bash
make demo-off
```

Expected: `demo_mode_on` → `f`.

Then **unset `MAANTA_DEMO_MODE` in Vercel Production (or set `false`) and
redeploy**, so analytics stop tagging events as demo. The flag and the env var
are two switches; §4.2 exists because they drift.

**Claude does not run this step.** Production database and config changes are
human-run — `CLAUDE.md`, and D14's owner has always been founder.

> **Do not run `make demo-wipe` as part of the launch flip.** Turning the flag
> off already hides every synthetic row (`is_demo` filtering is in the query,
> not in the data). The wipe is irreversible without PITR and is hygiene, not a
> gate — runbook §4.3 says exactly this. Wipe on a calm day, after launch has
> held.

### Gate 7 — Production read-back confirms the flag is disabled

Do not trust the command's own output. Read it back:

```bash
make demo-status
```

Expected: `demo_mode_on` → `f`, and a census still showing the demo rows as
present-but-hidden.

Record the raw output. A `t` here means the update did not commit — **stop**.

### Gate 8 — Anonymous production `/feed` shows real inventory and no demo rows

**This is the gate that actually matters, and the one the other seven exist to
make passable.** Everything above is a claim about the database; this is what a
shopper sees.

From a browser or shell with **no MAANTA session** — a private window, or
`curl` with no cookies:

```bash
curl -sS -H 'Cache-Control: no-cache' https://www.maanta.app/feed -o /tmp/feed.html -w '%{http_code}\n'
```

Confirm, in that response:

- [ ] HTTP **200**.
- [ ] The **demo banner is gone** — no `role="status"` element carrying
      "sample data for rehearsal".
- [ ] **Every deal shown is one of the Gate 1 deals.** Match them by merchant
      name and price. Not "looks real" — matched.
- [ ] **No synthetic merchant or deal appears.** Cross-check against the demo
      census from Gate 7.
- [ ] The rendered count is **>= 5**.
- [ ] `/malls/bbs-mall` and `/` carry no synthetic rows either.

> **Cache note.** `getLiveDeals` wraps its query in `unstable_cache` with a 30s
> revalidate, keyed on the demo mode value — demo and real feeds are separate
> cache entries, so the flip does not serve a stale demo entry. Still allow ~60
> seconds after the flip and after the Vercel redeploy before treating a `/feed`
> read as authoritative.

> **`/feed` stays `Disallow`ed in `robots.txt` after this.** That was decided
> under **D89** while demo rows could appear. Whether public deal discovery
> should become indexable now that inventory is real is a **separate product-SEO
> decision** — `NON_INDEXABLE_PREFIXES` already flags `/deals` as disallowed
> "deliberately, not by omission" pending exactly that call. **Do not change it
> as a side effect of this launch.**

---

## 2. Exact human production-change procedure

Condensed order of operations. Each step names its owner and its stop condition.

| # | Step | Command / action | Stop if |
|---|---|---|---|
| 1 | Run Gates 1–2 | SQL above, read-only | count < 5, or < 2 categories |
| 2 | Run Gates 3–5 | Human confirmation, checklists above | any box unticked |
| 3 | Announce the window | Tell the named operator and the counter staff it is starting | nobody is reachable |
| 4 | Capture the before state | `make demo-status`, save raw output | — |
| 5 | Flip the flag | `make demo-off` (runbook §4.1) | output is not `f` |
| 6 | Unset the analytics flag | Vercel Production, then **redeploy** (runbook §4.2) | redeploy fails |
| 7 | Wait ~60s | Cache and deploy settle | — |
| 8 | Read back | `make demo-status` (Gate 7) | `demo_mode_on` is `t` |
| 9 | Anonymous check | `curl` / private window (Gate 8) | any Gate 8 box fails → **§5 rollback** |
| 10 | Start monitoring | §4 below | — |
| 11 | Record evidence | §6 template, into the D14 row | — |

**Do not run `make demo-wipe` in this sequence.** See the note under Gate 6.

---

## 3. What "success" looks like an hour in

Not "no errors". Specifically:

- `/feed` serves the real deals to an anonymous visitor, consistently across
  repeated loads.
- No demo banner anywhere.
- If a claim happens: a 6-digit code is issued, and the counter verifies it.
- If a claim is refused, the refusal is one of the **legitimate** ones (expired,
  paused, wrong shop, already used) and not an error.

---

## 4. First-launch monitoring window

The named operator from Gate 5 watches for a **minimum of 4 hours**, or until
the first verified redemption completes — **whichever is longer**.

### Checks at 0, 15, 60 minutes, then hourly

| What | How | Escalate if |
|---|---|---|
| Feed still serving | Anonymous `/feed` load | 5xx, or empty when Gate 1 said ≥5 |
| No synthetic rows | Eyeball merchant names | any demo merchant appears → **§5** |
| Inventory not lapsing | Re-run the Gate 1 query | count drops below 5 |
| Claims succeeding | `redemptions` / admin surface | claims erroring rather than being refused |
| Fee debits correct | Merchant wallet / `merchant_transactions` | a debit on a *failed* verification |
| Errors | Sentry | any new issue on a shopper or merchant route |
| Counter reality | Ask the staff | staff cannot complete a verification |

### Two things to watch that are easy to miss

- **Fee-on-failure.** The frozen rule is KES 30 on a *verified* redemption only.
  A debit against a rejected or expired code is a money defect and is escalate-
  immediately, not wait-and-see.
- **The expiry cliff.** If the launch deals were created the same morning with
  short expiries, the feed can be full at noon and empty by evening without
  anything failing. Gate 1's re-run catches this; nothing else will.

---

## 5. Conservative rollback

**Default posture: re-hide, do not delete.** Nothing in rollback touches deal
data.

| Situation | Action | Reversible? |
|---|---|---|
| Gate 8 fails — synthetic rows still visible | Investigate first. The flag may not have committed (re-check Gate 7) or the cache/deploy may not have settled (wait 60s, re-check). Do **not** re-enable demo mode to "fix" a display problem | n/a |
| Feed is empty or badly wrong to the public | `make demo-on` restores the previous state instantly. **This re-publishes synthetic deals** — it is a deliberate trade of one bad impression for another, so take it only if an empty feed is the worse one, and tell the operator | Yes |
| Real deals are wrong (price, terms, merchant unaware) | **Pause the individual deal**, not the whole mode. Pausing removes it from discovery immediately and blocks new claims, while tickets already claimed stay verifiable — `docs/skills/paused-deal-semantics.md`, drift **D25** | Yes — resume restores it |
| A merchant cannot verify at the counter | Verify-anyway: preserve the shopper's experience, route the dispute to admin/agent afterwards. Do not roll back the launch for one counter | n/a |
| Fee debited on a failed verification | **Escalate immediately.** Money defect. Do not self-serve a correction | n/a |
| Something was wiped by mistake | **No undo.** Supabase PITR. This is why Gate 6 forbids wiping during launch | No |

**Rolling back does not close or reopen D14 by itself.** If you flip off and
back on, D14 simply stays open and this document gets run again.

---

## 6. D14 closure evidence template

Paste into the **D14** row in `docs/maanta-drift-register.md`, filled in.
The register requires a closed row to name a guard or state `no guard: <reason>`;
this one is `no guard`, because whether a production config value is set is not
a property this repository can assert on — same shape as **D10**.

```md
**CLOSED — <YYYY-MM-DD>, verified on production.**

Preflight (`docs/ops/d14-launch-preflight-demo-disable.md`) run by <name>,
<date/time UTC>.

- Gate 1 — eligible real BBS deals: <N> (>= 5). Query output: <paste>
- Gate 2 — merchant categories: <list> (>= 2)
- Gate 3 — offer terms confirmed by <name> on <date> for all <N> deals
- Gate 4 — verifiers trained: <merchant → staff name>, rehearsal completed <date>
- Gate 5 — operator on window: <name>, <start>–<end> UTC
- Gate 6 — `make demo-off` run by <name> at <time UTC>; `MAANTA_DEMO_MODE`
  unset in Vercel Production, redeploy `<dpl_...>`
- Gate 7 — read-back `make demo-status`: `demo_mode_on = f`. Output: <paste>
- Gate 8 — anonymous `https://www.maanta.app/feed`, no session, <time UTC>:
  HTTP 200, <N> deals rendered, all matched to the Gate 1 list by merchant and
  price, zero synthetic merchants, demo banner absent. Also checked `/` and
  `/malls/bbs-mall`: clean.

Monitoring window <start>–<end> UTC: <outcome — first verified redemption at
<time>, or what happened instead>.

no guard: whether `app_config.demo_mode_enabled` is false is a property of the
live database, not of this repository. The control is the read-back above,
which is why the raw output is recorded here rather than asserted in a test.
The repo-side boundary — that no public CTA reaches a demo surface and that
`/demo` is non-indexable — is guarded by
`maanta-app/src/lib/__tests__/demo-boundary.test.ts` and stays green either way.
```

---

## 7. Explicitly out of scope

- **Changing CTA routing.** All public shopper CTAs already resolve to `/feed`,
  the canonical route — verified and guarded
  (`docs/marketing/d14-live-discovery-resolution-2026-08-10.md`).
- **Making `/feed` indexable.** Separate decision, see the note under Gate 8.
- **Wiping demo data.** Runbook §4.4–§4.6, on a calm day, not at launch.
- **D88** — signed-out analytics attribution. Still open. Attribution of launch
  traffic will be incomplete on the server side; that is known and accepted for
  this window.
- **Creating or editing real deals.** Merchant-side work, and the input to
  Gate 1 rather than part of this procedure.

## 8. Unverified in this document

Written from the repository and the existing runbook, **not** from a production
session. Before the first run, confirm against live:

- The Node 0 identifier used in the Gate 1/2 queries (`d.node = '...'`).
- The `merchants.category` column name in the Gate 2 query.
- That `make demo-status`, `make demo-off` and `DATABASE_URL` still resolve as
  `Makefile` lines 97–112 describe.

None of these change the shape of the gate; they are the placeholders a first
run fills in.
