# Nairobi nodes — 3-node rehearsal world

Last updated: 2026-07-28

MAANTA nodes are **text identifiers** on `merchants.node` and `deals.node` (no separate `nodes` table). The app registry lives in `maanta-app/src/lib/nodes.ts`.

## Node registry

| Node | Slug | Role | Approx. coordinates | Merchants (seed) |
|---|---|---|---|---|
| **BBS Mall** | `bbs_mall` | Node 0 — launch node | -1.2746, 36.8501 (Eastleigh) | 60 (30 elite + 30 standard) |
| **CBD Galleria** | `cbd_galleria` | Synthetic rehearsal node | -1.2864, 36.8172 (Nairobi CBD) | 45 (15 elite + 30 standard) |
| **Westlands Hub** | `westlands_hub` | Synthetic rehearsal node | -1.2674, 36.8075 (Westlands) | 45 (15 elite + 30 standard) |

All three nodes are marked `live: true` in the app registry for Browse/Feed node switching during rehearsal.

## Applying the seed

From repo root (local stack or hosted — set `DATABASE_URL` if not using default local URL):

```bash
# 1. Boot local DB (optional)
sudo service docker start
cd maanta-app && supabase start

# 2. Local service_role grant (once per local stack — see AGENTS.md)
psql "$DATABASE_URL" -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;"

# 3. Apply seeds in order
make db-seed-nairobi-150
make db-seed-test-accounts
```

Regenerate the merchant SQL after editing the Python generator:

```bash
python3 maanta-app/scripts/generate-nairobi-merchants-seed.py
```

## Seed composition

| Metric | Count |
|---|---|
| Total merchants | 150 |
| Elite (`tier = 'elite'`) | 60 |
| Standard (`tier = 'standard'`) | 90 |
| Elite with flash + boosted deals | 40 |
| Elite with standard deals only | 20 |
| Waitlist merchants (`status = pending`) | 2 (one per non-BBS node edge case) |
| Churn-risk merchants (expired deal, no live deals) | 2 |

UUID namespaces (do not collide with Node 0 rehearsal seeds):

- Users: `b2000000-0000-4000-a000-…`
- Merchants: `c2000000-0000-4000-a000-…`
- Deals: `d2000000-0000-4000-a000-…`

## Node cookie

Shoppers scope the feed via the `maanta_node` cookie (default `BBS Mall`). Switch nodes in Browse or the node selector to see CBD Galleria / Westlands Hub deals.

## Related docs

- Test accounts: `docs/ops/test-accounts-seed-2026-07.md`
- Role task checklists: `docs/ops/role-tasks-nairobi-150-2026-07.md`
- Legacy Node 0 seeds: `docs/ops/test-accounts.md`, `docs/skills/node0-seed-bbs-mall.md`
