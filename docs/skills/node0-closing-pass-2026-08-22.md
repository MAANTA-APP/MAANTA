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

## 4. Notion sync

See the Notion mirror entry dated 2026-08-22 (evening, closing pass) on the
operating-truth page: the operating-state change, the 98/98 ledger read-back,
the security verdict, D152/D153, and the blocked E2E. If that entry is absent,
the Notion write failed and the repo copy here is the truth until it is redone.

## 5. Return to rest

Nothing further is authorized. The next wake is one of: D152 closed by the
founder (then re-run §3 from step 1), a field report from the Nairobi operator,
or an explicit founder instruction.
