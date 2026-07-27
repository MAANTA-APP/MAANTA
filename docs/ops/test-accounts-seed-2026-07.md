# Test accounts seed (July 2026)

Synthetic `@maanta.app` accounts for friends/family rehearsal. All data is fake — use email OTP at `/login` (Supabase Auth dev) or Clerk phone/email OTP at launch.

## Apply

```bash
# Set your Postgres URI (from `supabase start` or Supabase dashboard → Database)
export DB_URL='<postgres-uri>'
DATABASE_URL="$DB_URL" make db-seed-test-accounts
# or: cd maanta-app && ./scripts/apply-test-accounts-seed.sh
```

Seed file: `maanta-app/supabase/seed/test_accounts_maanta_2026_07.sql`  
UUID namespace: `b2/a2/c2` (no collision with rehearsal `b0` or demo `b1` seeds).

## Accounts

| Email | Role | Phone (E.164) | Primary flows to test |
|-------|------|---------------|------------------------|
| `founder@maanta.app` | `admin` (founder) | +254700000001 | Founder console `/founder`, ops overview |
| `admin@maanta.app` | `admin` | +254700000002 | Admin console `/admin`, disputes, merchant approval |
| `agent@maanta.app` | `agent` | +254700000003 | Agent console `/agent`, leads, on-ground support |
| `merchant.a.owner@maanta.app` | `merchant_admin` | +254700000010 | Merchant A dashboard, deal create/edit, redeem, wallet |
| `merchant.b.owner@maanta.app` | `merchant_admin` | +447900000010 | Merchant B (UK phone), same merchant flows |
| `merchant.a.staff@maanta.app` | `merchant_staff` | +254700000011 | Staff redeem + deal list (Merchant A) |
| `merchant.b.staff@maanta.app` | `merchant_staff` | +447900000011 | Staff redeem (Merchant B) |
| `shopper.ke@maanta.app` | `customer` | +254700000020 | Feed, browse, claim, my deals, redeem ticket |
| `shopper.uk@maanta.app` | `customer` | +447900000020 | Same shopper flows (UK number) |
| `shopper.no@maanta.app` | `customer` | +47900000020 | Same shopper flows (Norway number) |

## Post-login routing

After sign-in, `/app-bootstrap` sends each role to the right dashboard:

- `customer` → `/feed`
- `merchant_admin` / `merchant_staff` → `/merchant/dashboard`
- `admin` → `/admin` (except `founder@maanta.app` → `/founder`)
- `agent` → `/agent`

## Auth strategies

| Strategy | How testers sign in |
|----------|---------------------|
| `MAANTA_AUTH_STRATEGY=supabase` (rehearsal) | Email OTP at `/login` — seed inserts matching `auth.users` rows |
| `MAANTA_AUTH_STRATEGY=clerk` (launch) | Clerk email + phone OTP once SMS is configured in the Clerk dashboard |

Founder has no separate DB role — `founder@maanta.app` is stored as `admin` and routed to `/founder` by email in `src/lib/app-bootstrap.ts`.

## Merchants in seed

- **Merchant A** — `c2000000-0000-4000-a000-000000000001` (BBS Mall, elite)
- **Merchant B** — `c2000000-0000-4000-a000-000000000002` (BBS Mall, elite)

Each has two live deals and staff linkage for redeem testing.
