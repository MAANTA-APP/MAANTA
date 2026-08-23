# Node 0 closing pass — 2026-08-22 (evening)

**Mode:** Node 0 Field Validation Mode (CLAUDE.md § "Operating state"). This was
the one bounded pass the founder authorized on entering the mode: sync the
codebase, the repo docs and Notion; a last security audit; a production
end-to-end test with founder-controlled accounts. Everything below is what was
**observed**, dated, with the read-back that produced it. Nothing in production
was mutated.

Durable outputs of this pass: this file; drift rows **D152** (blocker) and
**D153** (hardening observation) plus an evidence note on **D151**; the
operating-state section in `CLAUDE.md`; the 2026-08-22 fourth decisions-log entry.

## 1. Repo ↔ codebase ↔ production reconciliation

| Check | Result |
|---|---|
| Working branch | The session started on `claude/maanta-marketing-site-y8fesm`, which was **fully merged** into `main` (0 commits ahead) and 11 behind its own remote. Its uncommitted marketing edits were superseded by the Direction A slices (#245–#248) and no longer apply; they were saved as a patch outside the repo, not discarded. Work moved to `claude/node0-field-sync` cut from `origin/main` at `7c0b0ba` (#257). |
| Migration ledger | `supabase_migrations.schema_migrations` on `axrrslqssmbngbataejg` vs `maanta-app/supabase/migrations/`: **98/98**, every version present on both sides, zero repo-only, zero prod-only; the two historically renamed versions (`20260730120000`, `20260730160000`) match by name. The D106 rule ("reconcile before mutate") is satisfied; no mutation was needed or made. |
| Test suite | `npm test` on `main` + this pass's doc edits: **122 files, 1028 tests, all passing** (6.5 s). `drift-register.test.ts` caught one wrong evidence path in a new row during this pass and it was corrected — the guard works. |
| Deployment | Not re-verified this pass (tree comparison per CLAUDE.md); last verified 2026-08-19 (#235). |

## 2. Security audit (final, read-only)

Source: Supabase security advisors, read 2026-08-22, plus direct catalog queries.

| Advisor finding | Disposition |
|---|---|
| 3 × `security_definer_view` ERROR (`merchants_public_browse`, `deals_public_browse`, `demo_data_census`) | **Accepted, unchanged** — documented trade-off (decisions log 2026-07-23; 2026-08-17 audit §3). |
| `rls_enabled_no_policy` INFO on `api_rate_limit_buckets` | **Correct by design** — service-role only, deny-by-default (2026-08-17 audit). |
| ~50 × `auth_allow_anonymous_sign_ins` WARN across `public.*` | **False positive, verified**: `information_schema.role_table_grants` shows `anon` holds SELECT on exactly two objects, the two browse views, and nothing else in `public`. Policies declared `TO public` on tables anon cannot read are inert for anon. |
| 4 × `anon_security_definer_function_executable` WARN (demo read predicates) | **New row D153** — low, observation, not fixed under the freeze. All four are `STABLE`, boolean, `search_path` pinned. |
| `function_search_path_mutable` WARN on `demo_placeholder_image` | Folded into D153; `IMMUTABLE` SQL returning a literal. |
| 14 × `authenticated_security_definer_function_executable` WARN (`claim_deal`, `verify_redemption`, `onboard_merchant`, money/admin RPCs…) | **Expected** — these are the sanctioned RPC surface; every one enforces its own authz via `current_user_id()` / `current_user_role()` (rpc_authorization_hardening, lock_down_* migrations; regression suites in `supabase/tests/`). |

`authenticated` table grants were also read: base tables `merchants` / `deals`
carry no SELECT/INSERT/UPDATE/DELETE for `authenticated` (D123 + D147 hold);
`fee_reversals`, `guardian_events`, `users` keep DML grants behind admin-only /
own-row RLS and the identity-freeze triggers (D124, D142). No regression found.

**Verdict:** no new blocker or defect in the repo or the database. One
hardening observation registered (D153).

## 3. Production end-to-end test — BLOCKED at sign-in

Accounts: merchant `aragagency@gmail.com`, shopper `moe_elmi97@hotmail.co.uk`,
admin `admin@maanta.app`. All three exist in `public.users` with a
production-instance `clerk_user_id` (read back this pass):

| Email | `users.id` | `clerk_user_id` | role | is_demo |
|---|---|---|---|---|
| admin@maanta.app | `d8c1aa1e…` | `user_3H1aBdhhqgLzMgXUsVYDqGYWlg7` | admin | no |
| aragagency@gmail.com | `86fb787c…` | `user_3I0XLz83qxDm08f2hsXWNbLm1bS` | customer | no |
| aragagency@gmail.com | `b0000000-…0001` | `user_3Gq6PWOJGKqcKTtOfpejcUPh34M` | admin | **yes** (seeded demo row, D108 path (b)) |
| moe_elmi97@hotmail.co.uk | `bf197f6e…` | `user_3GqR8jUeCaiisw372HI5IqkTowj` | customer | no |

Steps taken on `https://www.maanta.app/login` (served with `pk_live_…`,
frontend API `clerk.maanta.app`, clerk-js 5.127.2 — the production instance):

1. Entered `aragagency@gmail.com` → **"Couldn't find your account."** (Clerk 422)
2. Entered `moe_elmi97@hotmail.co.uk` → same.
3. Entered `admin@maanta.app` → same. This is the account that wrote 25
   `admin_ops_log` rows through this instance on 2026-08-16 (D108).
4. Read the instance's public `/v1/environment`:
   - `email_address`: enabled, required, first factors `email_code`, `email_link`
   - `password`: enabled, **required**, not a first factor
   - `phone_number`: **`enabled: false`**
   - social providers: none; sign-up: public, captcha on

Reading: three existing users cannot be matched by the only identifier the form
accepts. The consistent explanation is that they were created phone-first and
the phone attribute has since been disabled on the instance, so they have no
live identifier. `phone_number.enabled=false` also answers D151's "dashboard
restriction" question directly: SMS OTP cannot be requested at all from this
instance today.

**Classification: blocker** (field-validation protocol step 3). It is not a
repo defect — `main` is clean and the ledger reconciles — it is Clerk dashboard
state, which is founder-held. **D152** carries the close condition. Steps 5–6
of the plan (admin activation with the KES 300 opening credit, Deal 01, the
email-verified claim, counter verification, KES 30 ledger read-back) were not
reached and remain to be run once D152 closes.

What was deliberately **not** done: signing the three addresses up afresh via
`/sign-up`. It would "work" and would immediately mint three new `users` rows
through `ensureAppUser`, re-creating the duplicate-email groups that D108 /
D142 spent a week removing.

## 3a. E2E re-run under the email-primary ruling — admin proven, merchant/shopper still unmatched

Run the same night, after the sixth decisions-log entry (email is primary;
phone stays off). Instance at the time of the run: `phone_number.enabled=false`,
`password.required=true`, email first factors `email_code` + `email_link`.

| Step | Result |
|---|---|
| Admin sign-in, `admin@maanta.app` | **PASS.** Account found; the password prompt offers "Use another method" → "Email code to admin@maanta.app"; code delivered and accepted; landed on `/admin` Operations (212 active merchants, 255 live deals, 0 pending approvals). |
| Admin identity read-back | **PASS — no duplicate.** `public.users` still holds exactly the same four rows for the three emails; the session resolved to `d8c1aa1e…` / `user_3H1aBdhhqgLzMgXUsVYDqGYWlg7`, no new row. The required password did **not** block sign-in — email code is selectable as an alternative — but it is still a second auth model on the instance and the ruling says it comes off. |
| Merchant sign-in, `aragagency@gmail.com` | **BLOCKED** — "Couldn't find your account." |
| Shopper sign-in, `moe_elmi97@hotmail.co.uk` | **BLOCKED** — "Couldn't find your account." |

Reading: the admin Clerk user was created email-first (it never had a phone), so
it still has a matchable identifier; the merchant and shopper users were
phone-first, and with the phone attribute disabled they have none. **The
remaining D152 action is founder-only, in the Clerk production dashboard:** on
`user_3I0XLz83qxDm08f2hsXWNbLm1bS` add `aragagency@gmail.com` and on
`user_3GqR8jUeCaiisw372HI5IqkTowj` add `moe_elmi97@hotmail.co.uk` as verified
email addresses (Users → the user → Email addresses → Add → mark verified / set
primary). No new users. Then steps merchant → shopper → deal → claim →
verification → KES 30 ledger resume from here.

## 3b. E2E COMPLETE — 2026-08-23, email-primary, first non-demo `success` on production

Run after the founder's email-primary ruling and the two blockers it exposed
(D156, D157). Every step below is a read-back, not a recollection.

| Step | Result |
|---|---|
| Admin sign-in (`admin@maanta.app`) | PASS — email code; resolved to existing `d8c1aa1e…`, no duplicate |
| Merchant sign-in (`aragagency@gmail.com`) | PASS — email code; resolved to relinked `86fb787c…` / `user_3II1XPqrt…` |
| Merchant onboarding | Self-serve wizard **blocked** — owner phone is mandatory (usability observation, D158); completed via the **admin-assisted** path instead. Shop `6c0f9c84…` "Merchant Wan (E2E test)", node BBS Mall, `onboarding_mode=admin_assisted`, `is_demo=false` |
| Admin activation | PASS — approved with the Elite-trial box **deliberately unticked** (no launch-offer slot consumed; still 99 of 100). Opening credit granted: `account_balance` 0 → **KES 300**, ledger `topup 300.00` |
| Deal 01 | PASS — `39000f70…` "E2E test — KES 100 off any item (not a real offer)", KES 400 (was 500), Services, 24h, max 5 claims, `is_demo=false`, **live in `deals_public_browse`** |
| Shopper sign-in | Hotmail failed (D156); founder created `aragagency+shopper2@gmail.com`, which provisioned a **clean new** row `12e634fd…` / `user_3IImKsmE…` (`customer`, non-demo) — no D108 collision |
| Claim | First attempt **500 / PGRST301** (D157, fixed by the founder mid-run); on retry PASS — redemption `dbdbd178…`, OTP `899048`, `pending`, `amount_kes` 400 snapshotted |
| Counter verify | PASS — merchant keypad showed **CODE VALID**, collect KES 400, fee −KES 30, "wallet after KES 270" *before* charging |
| **KES 30 ledger read-back** | **`status=success`, `fraud_flags` null, Guardian `clear`, `account_balance` 300 → 270, `outstanding_arrears` 0.00, ledger `topup 300.00 \| success_fee -30.00`** |

**This is MAANTA's first non-demo `success` redemption on production, with the
frozen KES 30 success fee debited correctly.** It is a software proof, run by the
founder from Oslo — **not** a Node 0 field result: no BBS Mall merchant, no real
shopper, no physical visit. The Success ladder stays at **0**.

### Cleanup — done 2026-08-23, on founder instruction ("remove the test rows")

Deleted in one transaction, in FK order, each statement scoped to the exact id:
`guardian_events` (1) → `redemptions` (`dbdbd178…`) → `deals` (`39000f70…`) →
`merchant_transactions` (2 — the `topup 300.00` and `success_fee -30.00`) →
`merchants` (`6c0f9c84…`), with `kpi_counters` (3) going by CASCADE. Read back
independently: **0 / 0 / 0** for the three ids, and the surrounding data intact
(214 merchants, 352 users).

Two judgement calls, both stated rather than assumed:

- **`admin_ops_log` rows were KEPT** (2 rows naming the shop). They are the
  audit trail of an admin's actions, not test data; deleting an audit record to
  tidy a test would be the wrong instinct, and the table has no FK that forced it.
- **The owner's role was restored to `customer`.** Deleting the shop left
  `86fb787c…` as a `merchant_admin` owning nothing, which is a state the app has
  no screen for — a consequence of the deletion, so cleaning it up is part of it.
  Written through the identity trigger's service_role arm, guarded on both the
  old role and `NOT EXISTS (a merchant for this user)`.

**Left alone, and worth knowing:** production still holds **3 non-demo
redemptions** — `c663c033…`, `f6cc5711…`, `0d89515e…`, all `pending`, all from
2026-08-14, all by `fhzbg96nr4@privaterelay.appleid.com` against *demo* shops.
They predate this session and are somebody's earlier hand-testing; they are not
`success` rows and do not affect the ladder, but they are why "real redemptions"
reads 3 rather than 0.

The proving record for the loop is this document, not the rows.

## 3c. Staff seat by email — proven live on production, 2026-08-23

D154 shipped, merged to `main` (`586c832`, production deploy READY) and then
exercised end to end. Every line below is a read-back.

| Step | Result |
|---|---|
| Merchant opens Add staff | Form now reads **Phone (optional)** / **Email (optional)**; Continue enables with the phone **blank** — the state that was impossible before |
| Invite saved | Seat `4c198cb4…` created: `phone = NULL`, `email = aragagency+staff1@gmail.com`, `user_id = NULL` (unclaimed), `can_verify = true`, everything else false |
| Confirmation copy | "They can sign in with their own **email**" — the branch reads the channel actually used |
| Staff 01 signs in by email code | New user provisioned `a408ff67…` / `user_3IIuK1or…`, role `customer`, **`users.phone` NULL** |
| First merchant surface loads | Seat links lazily, as designed |
| **Read-back** | **`merchant_staff.user_id = a408ff67…`** (linked) · **`users.role = merchant_staff`** (promoted) · **`users.phone` still NULL** (so it linked on the email alone, not a phone) · permissions applied exactly as invited (`can_verify` true, deals/topup/purchase false) · **exactly 1 `users` row** for the address — no duplicate |
| Verify keypad | Reachable at `/merchant/redeem`, wallet KES 300 shown |

So the last phone-only door in the pilot is open: a shop can put a real employee
on the counter with nothing but an email address.

### 3d. Staff-verified redemption — run and passed, 2026-08-23

Run immediately after, on founder instruction. Three email sign-ins, no phone
anywhere in the chain:

| Step | Result |
|---|---|
| Merchant creates Deal 02 | `8b57fb3a…` "Staff-verify test", KES 200 (was 250), max 3 claims, non-demo, live in `deals_public_browse` |
| Shopper claims | `aragagency+shopper2@gmail.com` → redemption `51544584…`, OTP issued, `amount_kes` 200 snapshotted |
| **Staff 01** opens the counter | `aragagency+staff1@gmail.com` — an **email-linked seat**, `users.phone` NULL — reaches `/merchant/redeem`, wallet KES 300 |
| Staff enters the shopper's code | **CODE VALID** · collect KES 200 · MAANTA success fee −KES 30 · wallet after KES 270, shown *before* charging |
| Staff confirms | **`status = success`**, `fraud_flags` NULL, Guardian **`clear`** |
| **Money read-back** | `account_balance` 300 → **270**, `outstanding_arrears` 0.00, ledger `topup 300.00 \| success_fee -30.00` |

**So the whole counter loop now runs on email-only identities** — merchant,
shopper and a genuine staff member on a seat that never had a phone number. The
`can_verify` permission granted at invite is what let the seat charge the fee,
and it debited the frozen KES 30 exactly as the owner path does.

Still a software proof, not a Node 0 field result: the ladder stays at **0**.

### 3e. Second cleanup — done 2026-08-23, on founder instruction ("Cleanup")

Same shape as the first, one FK-ordered transaction scoped to the shop:
guardian event → redemption → deal → **staff seat** → 2 ledger rows → merchant,
with 3 `kpi_counters` by cascade. Read back **0** for every one, and the
surrounding data untouched (214 merchants, 353 users).

- **Roles restored:** `aragagency@gmail.com` (was `merchant_admin`) and
  `aragagency+staff1@gmail.com` (was `merchant_staff`) are both `customer`
  again, each guarded on *owning no merchant* **and** *holding no seat*, so
  the demotion could not have fired while something still pointed at them.
- **Kept:** the 2 `admin_ops_log` rows, and all three user identities — deleting
  identities is what re-creates the D108 duplicate hazard.

**Consequence, again knowingly:** the staff-verified `success` no longer exists
as a row either. `real_success` for non-demo redemptions is back to **0**, and
both proofs — the owner-verified loop (§3b) and the staff-verified loop (§3d) —
survive only as this document.

**Nothing from this session's testing remains in production data.** What remains
live and real is the code and the schema: the D154 email-invite path is deployed
on `main`, the migration is applied, and the ledger reconciles 99/99.

**Test rows still live** (cleanup owed, same as before): shop `0bc2d71e…`
"Staff Test Shop (E2E)", seat `4c198cb4…`, users `a408ff67…` (staff) and
`12e634fd…` (shopper2).

## 4. Notion sync

See the Notion mirror entry dated 2026-08-22 (evening, closing pass) on the
operating-truth page: the operating-state change, the 98/98 ledger read-back,
the security verdict, D152/D153, and the blocked E2E. If that entry is absent,
the Notion write failed and the repo copy here is the truth until it is redone.

## 5. Return to rest

Nothing further is authorized. The next wake is one of: D152 closed by the
founder (then re-run §3 from step 1), a field report from the Nairobi operator,
or an explicit founder instruction.
