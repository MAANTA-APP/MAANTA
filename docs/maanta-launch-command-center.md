# MAANTA — Launch Command Center

Single operating checklist to run until launch. MAANTA is a **built product**;
this file exists to get it safely into BBS Mall, not to re-plan surfaces that
already exist. Mirror this to Notion; this repo copy is the durable artifact.

**How to run it:** every MAANTA session, (1) update this table first, (2) pick
only the 1–2 items in the current focus, (3) log evidence (CI run, screenshot,
email sent, migration). Review weekly in Chat; re-pick focus based on what moved.

Status: Not started · In progress · Done · Blocked
Blocker type: Ops · Legal · Tech · Partner · Decision

---

## 🎯 THIS WEEK (7-day focus — everything else is PARKED)

Three items you **fully control** + one parallel unblock on a partner clock.
Do not open parked items until these three are Done.

| # | Item | Status | Next action | Deadline |
|---|---|---|---|---|
| 1 | Prod deploy verified on Vercel | Not started | Set env vars, one full deploy, walk core flow on the `*.vercel.app` URL in mobile Chrome + Safari | Day 1–3 |
| 2 | Device QA: shopper + merchant on the live deploy | Not started | Once #1 is live, run browse→claim→code→redeem on a mid-range Android + an iPhone; log every bug in `docs/maanta-device-QA-<date>.md` | Day 3–7 |
| 3 | Fix RLS lints + storage bucket | Not started | Add policies to `organizations` + `payment_webhook_failures`, tighten `deal-images` bucket; re-run Supabase advisor until clean | Day 2–5 |
| ‖ | **Parallel (partner clock, not counted this week):** email IntaSend + confirm fallback processor | Blocked | Send the access request today; if no reply in 5 days, wire the fallback (Paystack/Flutterwave) test keys | ongoing |

Rationale: payment-rail *completion* is not a 7-day item — it depends on
IntaSend granting API access (external). Device QA depends on #1. So the week's
"done-able" work is deploy → QA → security, with IntaSend escalated in parallel.

---

## 1. Production deploy verified (frontend)

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| Frontend prod deploy on Vercel verified | Not started | Backend ready: Supabase `vcrfqsevompqjazbwzyh` ACTIVE_HEALTHY, 36/36 migrations applied; app builds clean (76 routes, exit 0) locally | You | Tech | Yes | Set all env vars (Supabase, Stripe + `STRIPE_ENV`, VAPID, W3W, `NEXT_PUBLIC_APP_URL`), deploy, confirm main flows on the live URL | 1–3 days |

Checks: env vars present · app loads in mobile Safari/Chrome · sign-in (phone/email)
works · browse→claim→redeem loads · `STRIPE_ENV` guard behaves · no unhandled errors.

## 2. Payment rail ready for Kenya

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| M-Pesa STK live end-to-end | Blocked | Code + webhook exist (`src/lib/intasend.ts`, `/api/webhooks/intasend`); credentials not granted (tracker E6, only 🔴 in product column) | You | Partner | Yes | Escalate IntaSend access; wire test keys; run sandbox STK then a live KES 10 top-up | 1–2 weeks |
| Fallback processor decision | Not started | Analysis exists: `maanta-app/legal/payment-processor-comparison.md` | You | Decision | Yes (viability) | Decide Paystack/Flutterwave/etc. as fallback if IntaSend slips; client is isolated so swap is contained | with payment choice |
| Card-only interim decision | Not started | Stripe works in sandbox (E5 done) | You | Decision | Yes | Decide if card-only is acceptable temporarily and under what constraints | with payment choice |

Goal: at least one rail a Kenyan merchant can realistically use before merchants touch the app.

## 3. On-device QA: core flows

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| Shopper pass: browse→claim→code→redeem | Not started | Seed ready: `supabase/seed/node0_rehearsal_seed.sql`; checklist: `docs/maanta-node0-rehearsal-checklist.md` (tracker E2 🟡) | You (+ helper) | Ops | Yes | One session on mid-range Android + iPhone against the live deploy; log every screen/bug/friction | 1 week |
| Merchant pass: staff redeem flow | Not started | `verify_redemption` RPC verified against live DB 2026-07-10 (rolled-back test); redeem UI built (E3 🟡) | You | Ops | Yes | Run the redeem screen with a real cashier under Eastleigh conditions (bright light, queue, noise) | 1 week |
| Admin pass: disputes + wallet ledger sanity | Not started | Admin surfaces built; seeded pending merchant + open dispute (E4 🟡) | You | Ops | Medium | Walk admin flows on laptop; confirm references, statuses, timelines read well | 1–2 weeks |

Evidence target: `docs/maanta-device-QA-YYYY-MM-DD.md` with screenshots + notes.

## 4. Waitlist & landing funnel — PARKED

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| Shopper/merchant/operator waitlist live | Not started | Spec only: `maanta-waitlist-data-schema.md`; decided 2026-07-10 to live in external email platform (TBC). No table/form/API exist (tracker E7) | You | Marketing/Tech | Yes (campaign) | Pick platform; build one minimal landing + form capturing phone/email + `segment_type` role | 2 weeks |
| Launch copy (email/SMS templates) | Not started | ⚠️ Your note cited `maanta-resend-email-templates.md` — **that file is NOT in the repo.** Sequence drafts that DO exist: `maanta-shopper/merchant/mall-operator-email-sequence.md` | You | Ops | Medium | Either commit the Resend templates or use the existing sequence docs; update with real build status + launch window | 2 weeks |

## 5. Privacy & legal minimum — PARKED

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| Privacy Policy + Terms linked from app & landing | Not started | Drafts exist, unreviewed: `maanta-app/legal/privacy-policy.md`, `terms-of-service.md` (must NOT be linked live yet — tracker O5 🔴) | You + lawyer | Legal | Yes | Draft MVP policy reflecting Supabase eu-west-1 + real flows; book lawyer review before November | 1 month |
| Incorporation / entity decision | Blocked | Blocked on Nov Nairobi trip (O5/O6) | You | Legal/Ops | Medium | Decide jurisdiction + form; prep paperwork for November | before Nov trip |
| Kenya DPA cross-border basis | Not started | Supabase in eu-west-1 vs DPA 2019 (O6) | You + lawyer | Legal | Yes | Establish lawful-transfer basis or decide region migration | before external users |

## 6. DB security lints & RLS — IN THIS WEEK (item 3)

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| RLS gaps fixed | Not started | Supabase advisor: `organizations` + `payment_webhook_failures` have RLS enabled, no policy | You | Tech | High | Add appropriate policies (or adjust design); re-run advisor until clean | 1 week |
| `deal-images` bucket hardened | Not started | Advisor WARN: public bucket has a broad SELECT policy allowing file listing | You | Tech | Medium | Restrict list/read to proper roles; retest image flows | 1–2 weeks |

## 7. Branding/UI sign-off (bounded) — PARKED

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| v1 branding/UI sign-off | In progress | Tokens in code (`tailwind.config.ts`); all screens merged (PR #11) | You | Design/Ops | Medium | Pick a hard freeze date; after it, bugfix/polish only, no new structural rules | 2–4 weeks |

## 8. Payments economics & trial logic confirmed — PARTLY DONE

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| Trial/boost/fee logic end-to-end | In progress | Implemented in RPCs + 17 passing tests (`verify_redemption`, arrears, ledger); boosts/staff in migration `20260709175532` | You | Tech/Ops | High | Run one full staging path (top-up→claim→redeem→fee/arrears/boost) and log actual numbers vs spec | 1–2 weeks |

## 9. Decisions & docs alignment — PARKED

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| Notion → repo doc sync on operating model | In progress | `CLAUDE.md`, `docs/maanta-decisions-log.md`, `maanta-technical-handoff.md`, `maanta-launch-readiness-tracker.md` all current | You | Ops | Medium | Name one page the canonical operating model; mark superseded docs archived | 2 weeks |

## 10. Kill-switch & rollback — PARKED (but foundation exists)

| Item | Status | Evidence | Owner | Blocker type | Launch critical | Next action | Deadline |
|---|---|---|---|---|---|---|---|
| Kill-switch for redeem flow & boosts | Not started | Foundations present: `app_config` table + deal pause (migration `20260709175532`) + zero-balance gate. No global flag/admin toggle yet | You | Tech/Ops | High | Add a flag-based pause for redemptions/boosts with an admin toggle + clear copy | 1–2 weeks |

---

## Parked list (do not touch until the 3 focus items are Done)

§4 Waitlist · §5 Legal · §7 Branding sign-off · §9 Docs sync · §10 Kill-switch.
These stay visible for weekly review but get zero session time this week.
