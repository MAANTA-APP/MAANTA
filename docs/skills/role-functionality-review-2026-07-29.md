# Skills: Role functionality review (all personas)

**Date:** 2026-07-29 · **Method:** code + guard/API audit (authenticated browser
not available in this cloud session — Clerk handshake needs real keys). Spec
authority: `role-permissions.md`, `ui-walkthrough-roles.md`, frozen business
rules in `CLAUDE.md`.

**Personas reviewed:** shopper · merchant owner · merchant staff · admin ·
agent · co-founder · founder.

---

## Verdict (one line)

Core money and ops paths are wired and role-gated; **founder / co-founder are
not separate DB roles** (both = `admin`); **merchant staff** APIs are solid but
UI had two permission leaks (fixed this session). No FAIL on frozen money rules.

---

## Role model (source of truth)

| Persona | `public.users.role` | Post-login land | Console |
|---|---|---|---|
| Shopper | `customer` | `/feed` | `(shopper)/*` |
| Merchant owner | `merchant_admin` | `/merchant/dashboard` | `/merchant/(app)/*` |
| Merchant staff | `merchant_staff` | `/merchant/dashboard` | same shell, permission-scoped |
| Field agent | `agent` | `/agent` | `/agent/*` |
| Admin | `admin` | `/admin` | `/admin/*` (+ `/founder`, `/agent`) |
| Founder | `admin` (no enum) | `/admin` today | `/founder` + full admin |
| Co-founder | `admin` (no enum) | `/admin` today | identical to founder |

`destinationForRole()` already maps reserved `founder` / `cofounder` →
`/founder`, but those strings are **not** in the DB CHECK. Provisioning is
`UPDATE users SET role = 'admin'`.

Guards: `requireAdminPage/Api`, `requireFounderPage/Api` (admin-only),
`requireAgentPage` / `requireActiveAgentApi` (agent|admin + active `agents`
row for writes), `getMerchantContext` + `requireMerchant(permission)`.

---

## 1. Shopper (`customer`)

**Can do**
- Browse node-scoped feed / browse / map / search / shops
- Claim deal (verified phone when Clerk SMS enabled; relaxed under Supabase auth rehearsal)
- Hold OTP ticket (`/tickets/[id]`), my-deals, favourites, profile, notifications, help
- Self-serve merchant onboard (`/merchant/onboard`) → promotes to `merchant_admin`

**Cannot**
- Verify OTP, touch wallet/ledger, open admin/agent/founder consoles

**Status vs prior walkthrough**
- Locked rules R1–R7 still hold in code (YOU PAY single source `lib/pricing.ts`,
  S5 card = label+code+countdown only).
- Prior polish S1/S2/S3/S5 closed. Remaining optional: S4 (plan chip on tile),
  S6 (leaf back-nav), S7 (dead `TicketCard`).

**Gaps**
| ID | Finding | Sev |
|---|---|---|
| SH1 | Interactive golden path (claim→ticket) still needs Playwright + real Clerk | med (test gap) |
| SH2 | Merchant owners redirected to merchant console; shopper shell still reachable by URL if they know paths | low |

---

## 2. Merchant owner (`merchant_admin`)

**Can do (all staff flags forced true)**
- Redeem OTP incl. verify-anyway / fee disclosure / arrears
- Create / pause / archive / repost deals; boost (Elite + `can_purchase`)
- Wallet ledger, M-Pesa STK + Stripe top-up
- Plan view / upgrade UI; lifecycle banners; support
- **Invite & manage staff** (owner-only APIs + UI)

**Frozen rules**
- Zero-balance gate on new deals — UI now shows top-up CTA (prior M1 closed)
- KES 30 success fee at verify; verify-anyway preserves shopper experience
- Arrears settle from next top-up

**Gaps**
| ID | Finding | Sev |
|---|---|---|
| MO1 | Top-up failure screen still light+flame (prior M2) — design call | low |
| MO2 | Boost sheet can show two amber marks (prior M4) | low |

---

## 3. Merchant staff (`merchant_staff`)

**Model:** `merchant_staff` row flags `can_verify`, `can_deals`, `can_topup`,
`can_purchase` (DB defaults: verify **true**, others **false**). First phone
match links `user_id` and promotes role from `customer`.

**Can do (when flagged)**
- Same shell as owner for allowed actions
- Verify / create deals / top-up / boost per toggles

**Cannot**
- Manage staff roster (`isOwner` required on `/merchant/staff` + `/api/staff`)
- Staff link hidden in More / Settings

**Fixed this session**
| ID | Was | Fix |
|---|---|---|
| MS1 | Invite form defaulted `canDeals: true` (DB default false) | Default `canDeals: false` |
| MS2 | `/merchant/topup` rendered full STK/card UI without `can_topup` (API 403 only) | Page-level deny copy |
| MS3 | Wallet always showed amber “Top up wallet” for staff without `can_topup` | Hide CTA; owner-ask hint |

**Still open**
| ID | Finding | Sev |
|---|---|---|
| MS4 | Bottom nav always shows Redeem / Deals / Wallet — denied actions only fail inside the page | low–med |
| MS5 | Staff can open Plan & billing (read) with no money write — OK unless product wants hide | low |
| MS6 | No dedicated staff seed in `docs/ops/test-accounts.md` (exists in `test_accounts_maanta_2026_07.sql`) | low (docs) |

---

## 4. Admin (`admin`)

**Can do**
- Approvals queue, merchants (approve / reject / suspend / feature / shadow-ban / location)
- Customers list, deals moderation, redemptions + Guardian release/appeal, fee reversal
- Billing/plan actions, agents list, support override, reports
- Enter `/agent/*` and `/founder`

**Status**
- Prior A1 closed — every admin page calls `requireAdminPage()` (layout + pages)
- A2 customers + A3 redemption detail shipped
- APIs use `requireAdminApi()`

**Gaps**
| ID | Finding | Sev |
|---|---|---|
| AD1 | Deal “Keep” is client-only (A8) — no audit row | low |
| AD2 | Customers list capped ~100, no user detail / role-edit UI | med (feature) |
| AD3 | Support/disputes persona uses same `admin` role (intentional for launch) | note |

---

## 5. Agent (`agent`)

**Can do**
- Dashboard KPIs / weekly target, lead list + 48h lock, lead capture, link lead→merchant
- Attribution on merchant onboard (`assisted_by_agent_id`) — merchant remains submitter

**Cannot**
- Approve merchants, reverse fees, open `/admin` or `/founder`
- Writes need active row in `public.agents` (`requireActiveAgentApi`)

**Status**
- Layout gate + `/agent/leads/new` page gate closed (G2)
- Onboarding attribution closed (G1); entrance notes wired (G3); lead link closed (G4)

**Gaps**
| ID | Finding | Sev |
|---|---|---|
| AG1 | No shared agent chrome/nav (each screen hand-rolls back) — prior G5 | low |
| AG2 | Admin-as-agent can open UI but lead writes still need an `agents` profile | note |

---

## 6. Founder & 7. Co-founder

**Code reality:** both are provisioned as `admin`. There is **no** permission
difference between founder and co-founder today.

| Surface | Behaviour |
|---|---|
| `/founder` | Read-focused KPIs (users, claims, verified, fee revenue, pending approvals, deals-by-node) + shortcuts into admin ops |
| Gate | `requireFounderPage()` → `role === "admin"` |
| Bootstrap | Admins land on `/admin`, not `/founder` (sidebar has Founder link) |
| Destructive money | Still only via `/admin/*` APIs |

**Gaps**
| ID | Finding | Sev |
|---|---|---|
| FD1 | No `founder` / `cofounder` DB enum — deferred until co-founders need narrower access than full admin (fee reverse, Guardian, etc.) | product |
| FD2 | Co-founder cannot be scoped differently from founder or ops admin | product |
| FD3 | Post-login never auto-opens `/founder` for execs (must bookmark or sidebar) | low |

---

## Cross-cutting

| Topic | Note |
|---|---|
| Auth | Clerk launch; `MAANTA_AUTH_STRATEGY=supabase` for email OTP rehearsal |
| Role storage | Postgres only — not Clerk `publicMetadata` |
| Escalation | `prevent_self_role_escalation` — only `service_role` / `admin` |
| Middleware | Session only; **not** role-aware |
| Money path | Exercisable via `claim_deal` / `verify_redemption` under service JWT |

---

## Prioritized next actions

1. **MS4** — hide or disable merchant bottom-nav items the staff member cannot use.
2. **FD1** — decide whether launch needs a dedicated `founder` role before hiring more ops admins who should not reverse fees.
3. **AD2** — admin user detail + controlled role change UI (today: SQL / seed).
4. **SH1** — Playwright + Clerk test-mode golden path across shopper → merchant verify.
5. **AD1** — persist deal “Keep” in `admin_ops_log` (or drop the button).
6. **MS6** — document staff rehearsal emails in `docs/ops/test-accounts.md`.

---

## Code changes shipped with this review

- `merchant/(app)/staff/new/page.tsx` — invite defaults match DB (verify-only)
- `merchant/(app)/topup/page.tsx` — `can_topup` page gate
- `merchant/(app)/wallet/page.tsx` — top-up CTA only when `can_topup`

Also refreshed: `docs/skills/role-permissions.md`.
