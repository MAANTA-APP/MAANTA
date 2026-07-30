# Test accounts — Nairobi 150 seed (@maanta.app)

Last updated: 2026-07-28

Role accounts for the Nairobi 3-node rehearsal world. Sign in with **email OTP** at `/login` when `MAANTA_AUTH_STRATEGY=supabase`. No passwords are set.

Apply seeds in order:

1. `make db-seed-nairobi-150` — 150 merchants + deals
2. `make db-seed-test-accounts` — this file (`test_accounts_maanta_2026_07.sql`)

### Clerk-safe / idempotent behaviour (2026-07-28)

The seed now:

- Skips `public.users` / `auth.users` insert when the **email** (or phone / fixed UUID) already exists — so an existing Clerk `admin@maanta.app` is not duplicated.
- Promotes intended `role` on existing email rows under a `service_role` JWT claim (required by `prevent_self_role_escalation`).
- Only inserts `auth.identities` when the matching `auth.users` row exists.

After Clerk sign-in in production rehearsal, link `clerk_user_id` if a new Clerk user is provisioned instead of the seeded row:

```sql
UPDATE public.users SET clerk_user_id = '<clerk_sub>' WHERE email = '<account email>';
```

**Prod note:** There may already be duplicate `admin@maanta.app` Clerk-linked rows; both can be promoted to `admin`. Prefer one account and clean up the other.

## Ops personas

| Label | Email | DB role | Notes |
|---|---|---|---|
| **Founder** | `founder@maanta.app` | `admin` | Routes to `/founder` via `/app-bootstrap` |
| **Admin** | `admin@maanta.app` | `admin` | Full `/admin/*` console |
| **Agent** | `agent@maanta.app` | `agent` | BBS Mall primary; agent id `a2000000-…002` |

Founder uses the `admin` DB role (see `src/lib/founder.ts`) — there is no separate `founder` role in the schema.

## Merchant personas

| Label | Email | Role | Merchant ID | Shop | Node | Tier |
|---|---|---|---|---|---|---|
| **Merchant A owner** | `merchant.a.owner@maanta.app` | `merchant_admin` | `c2000000-…001` | Eastleigh Spices (Demo A) | BBS Mall | Elite |
| **Merchant A staff** | `merchant.a.staff@maanta.app` | `merchant_staff` | (staff row on A) | same | BBS Mall | — |
| **Merchant B owner** | `merchant.b.owner@maanta.app` | `merchant_admin` | `c2000000-…076` | Juniper Spa (Demo B) | CBD Galleria | Standard |
| **Merchant B staff** | `merchant.b.staff@maanta.app` | `merchant_staff` | (staff row on B) | same | CBD Galleria | — |

Merchant A has **flash + boosted** live deals. Merchant B has a **standard** deal only.

Staff users are linked via `merchant_staff.user_id` with `can_verify = true`.

## Shopper personas

| Label | Email | Role | Seeded state |
|---|---|---|---|
| **Shopper Everyday** | `shopper.everyday@maanta.app` | `customer` | Pending OTP `881122` on Merchant A flash deal |
| **Shopper Occasional** | `shopper.occasional@maanta.app` | `customer` | Clean slate — claim via UI |

## Recommended landing routes

| Persona | Start | Then |
|---|---|---|
| Founder | `/founder` | Node overview, merchant counts, flash/boost summary |
| Admin | `/admin` | Filter merchants by node; deals list |
| Agent | `/agent` | BBS Mall merchant visits, churn-risk outreach |
| Merchant A owner | `/merchant/dashboard` | Flash/boosted deals, create standard deal |
| Merchant A staff | `/merchant/redeem` | Verify OTP `881122` (flash) |
| Merchant B owner | `/merchant/dashboard` | CBD node context, standard deal only |
| Merchant B staff | `/merchant/redeem` | Standard redemption flow |
| Shopper Everyday | `/feed` | Claim + redeem flash and standard |
| Shopper Occasional | `/feed` | Multi-session browse/save/redeem |

## Auth notes

- **Supabase rehearsal:** set `MAANTA_AUTH_STRATEGY=supabase` in `.env.local`. Email OTP only — ignore SMS phone OTP gates in dev.
- **Clerk production:** valid publishable **and** secret keys required for browser UI (`cheerful-sailfish-3`).
- Roles live in `public.users.role` only — not Clerk metadata.

## Legacy Node 0 accounts

The older Gmail plus-addressing personas (`aragagency+*@gmail.com`) from `node0_rehearsal_seed.sql` remain available and can coexist. See `docs/ops/test-accounts.md`.

## Related

- Role task checklists: `docs/ops/role-tasks-nairobi-150-2026-07.md`
- Node registry: `docs/ops/nodes-nairobi-2026-07.md`
