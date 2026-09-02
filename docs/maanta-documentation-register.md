# MAANTA documentation register

**Status:** CURRENT — established 2026-09-01, last amended 2026-09-02 (UX copy audit added to §8).
**Purpose:** one audited view of every audience-facing and operational document —
who it is for, who owns it, whether it is current, what makes it true, and what
would make it stale. Plus the P0–P3 gap matrix.

**Read this before writing a new document.** The gap may already be recorded, or
the document may already exist under a name you did not expect.

---

## How to use it

**Status** — `KEEP` current and fit for purpose · `UPDATE` useful but stale ·
`MERGE` duplicated elsewhere · `ARCHIVE` historically useful, unsafe as current
instruction · `DRAFT` needs approval before reliance · `MISSING` required and
absent.

**Classification** — `PUBLIC` published or publishable · `INTERNAL` team ·
`CONFIDENTIAL` founder and named recipients only.

**Review trigger** — the *event* that makes the document wrong, not a calendar
date. A date-based review of 200 documents is a review nobody does. Where a
trigger names a config key, a migration or a decision, it can be checked by
looking at the thing rather than by re-reading the prose.

**Two rules this register does not replace:**

1. `docs/maanta-drift-register.md` is the state of what is **broken**. This
   register is the state of what is **written**. A stale document gets a row
   there and a status here.
2. `docs/maanta-launch-readiness-tracker.md` remains the **gate-status** source
   of truth. This is not a second tracker.

---

## 1. Governance and truth

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `CLAUDE.md` | any Claude session, contractor | founder | KEEP | itself; the repo wins over it | 2026-09-01 | Any founder ruling, migration apply, or operating-state change | INTERNAL |
| `AGENTS.md` | coding agents | founder | KEEP | the repo | 2026-08-27 | Build/run mechanics change | INTERNAL |
| `docs/maanta-decisions-log.md` | all | founder | KEEP | Notion is authoritative; this mirrors | 2026-09-01 | Every founder ruling | INTERNAL |
| `docs/maanta-drift-register.md` | all | eng + founder | KEEP | itself, CI-enforced | 2026-09-01 | Any finding; any closure | INTERNAL |
| `docs/maanta-launch-readiness-tracker.md` | founder, ops | founder | **UPDATE** | itself, for gates | 2026-08-08 | **Overdue.** Header narrative predates Field Validation Mode. Drift **D219** | INTERNAL |
| `docs/maanta-documentation-register.md` (this file) | all | founder | KEEP | itself | 2026-09-01 | A document is created, retired or goes stale | INTERNAL |
| `docs/maanta-glossary.md` | all | founder | KEEP | code + decisions log | 2026-09-01 | Vocabulary or a frozen rule changes | INTERNAL |
| `docs/maanta-claude-operating-system.md` | Claude sessions | founder | KEEP | itself | — | Operating model changes | INTERNAL |
| `docs/maanta-decision-queue-2026-08-19.md` | founder | founder | UPDATE | derived from the drift register | 2026-08-19 | Register rows close. Dated; a derived view, not a tracker | INTERNAL |
| `docs/maanta-project-overview.md` | all | founder | UPDATE | this register + stakeholder report | — | Predates Field Validation Mode and the counter-QR packages | INTERNAL |

---

## 2. Shopper

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `/shoppers`, `/help`, `/faq`, `/download` | shoppers | founder | KEEP | `lib/marketing/facts.ts` | 2026-09-01 | `facts.ts`, a frozen rule, or a live product surface changes | PUBLIC |
| `/you/help` (in-app) | signed-in shoppers | founder | KEEP | shares `help-content.tsx` with `/help` | 2026-09-01 | Same | PUBLIC |
| `docs/ops/shopper-pilot-card.md` | pilot shoppers | founder | **DRAFT** (new 2026-09-01) | this register; the app | 2026-09-01 | `fast_visit_enabled` flips; QR behaviour changes; privacy policy is reviewed | INTERNAL → hand-out |
| `/terms`, `/privacy`, `/cookies` | shoppers | founder + counsel | **DRAFT** | `docs/legal/` | 2026-07-31 | Counsel review; any new data category | PUBLIC (draft-bannered) |
| Shopper FAQ, beyond `/faq` | shoppers | founder | **MISSING — P2** | — | — | Needed when shopper volume creates repeat questions | PUBLIC |

**Note:** the in-app and marketing help content does **not** mention QR check-in,
the queue or Points. That is currently correct — Fast Visit is off, and check-in
is optional and self-explanatory at the sticker. It becomes **wrong** the moment
`fast_visit_enabled` is set to `true`. Recorded as **D220**.

---

## 3. Merchant owner

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `/merchants`, `/merchants/join`, `/pricing` | prospects | founder | KEEP | `facts.ts` | 2026-09-01 | Fee, credit or tier rules change | PUBLIC |
| `/merchant-terms` | merchants | founder + counsel | **DRAFT** | `docs/legal/merchant-terms.md` | 2026-07-31 | Counsel review; location capture and staff enrolment are uncovered | PUBLIC (draft-bannered) |
| `docs/ops/merchant-welcome-pack.md` | activated merchants | founder | **DRAFT** | terms win over it | 2026-09-01 (QR added) | Fee, credit, top-up rail, QR or Points change | INTERNAL → hand-out |
| `docs/ops/merchant-lifecycle.md` | ops | founder | KEEP | the RPCs | — | `onboard_merchant` / `activate_merchant` change | INTERNAL |
| `docs/skills/merchant-self-onboarding.md` | eng, ops | eng | KEEP | the migrations | 2026-08-23 | `onboard_merchant` signature changes | INTERNAL |
| `docs/skills/shop-location-capture.md` | eng, ops | eng | KEEP | the migrations | 2026-08-24 | Location capture changes | INTERNAL |
| `/merchant/support` (in-app) | merchants | founder | **UPDATE** | `app_config` + code | 2026-09-01 | Two FAQs only; says nothing about the QR, the queue or the wallet. **P1** | PUBLIC |
| Merchant FAQ (fuller) | merchants | founder | **MISSING — P1** | — | — | Needed at merchants 02–03 | PUBLIC |

---

## 4. Merchant staff

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `docs/ops/merchant-staff-counter-card.md` | counter staff | founder | **DRAFT** | terms win over it | 2026-09-01 (QR + queue added) | Redeem screen, queue, or failure states change | INTERNAL → hand-out |
| Staff / authorised-user terms | counter staff | founder + counsel | **MISSING — P2 (legal)** | — | — | Nothing binds the person who verifies redemptions. Drift **D170** | PUBLIC |

**Deliberate exclusion:** the counter card does not explain fraud checks,
Guardian thresholds, admin escalation internals or evidence doctrine. A counter
employee does not need MAANTA's architecture, and exposing verification internals
at a till would weaken them.

---

## 5. Agent

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `docs/ops/role-tasks-nairobi-150-2026-07.md` | agents | founder | ARCHIVE-lean | — | 2026-07 | Written for a 150-merchant push that is not the current plan. Read as history | INTERNAL |
| `docs/skills/agent-attribution.md` | eng, ops | eng | KEEP | the RPCs | — | Attribution changes. **Note D159**: `onboard_merchant` does not write `onboarded_by` | INTERNAL |
| Agent rotations / field templates | agents | founder | KEEP (Notion) | Notion | — | Rota changes | INTERNAL |
| **Agent guide** (pitch, qualification, prohibited promises, escalation) | agents | founder | **MISSING — P1, BLOCKED** | — | — | **Do not write yet.** CLAUDE.md: the four-agent acquisition phase must not begin until **D159** is resolved. Writing an acquisition guide now would authorize by implication | INTERNAL |

The pitch content an agent needs *today* is `docs/marketing/marketing-claims-register.md`
§1–3 plus the merchant welcome pack. That is sufficient for one merchant and
does not pre-authorize acquisition.

---

## 6. Field operator and Node 0

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `docs/ops/merchant-01-pilot-runsheet.md` | field operator | founder | **DRAFT** (new 2026-09-01) | `app_config`; the decisions log | 2026-09-01 | Any `app_config` change; any loop change; **becomes a record on first use** | INTERNAL |
| `docs/ops/field-operator-day-sheet.md` | node manager, agents | founder | **DRAFT** | the decisions log | 2026-09-01 (QR added) | Evidence rules, escalation, or the support owner change | INTERNAL |
| `docs/ops/first-merchant-loop-test.md` | field operator | founder | **DRAFT** | the seven proofs | 2026-09-01 | Money path changes | INTERNAL |
| `docs/ops/evidence-classification-guide.md` | founder, admin, operator | founder | KEEP (new 2026-09-01) | production; the decisions log | 2026-09-01 | **A third internal record is created** — the exclusion list must be updated that day | INTERNAL |
| `docs/ops/node0-known-limitations.md` | all operational | founder | KEEP (new 2026-09-01) | live `app_config` | 2026-09-01 | **Any `app_config` change**; any drift row opening or closing | INTERNAL |
| `docs/ops/node0-evidence-protocol-2026-08-24.md` | founder, operator | founder | KEEP | itself, ratified | 2026-08-24 | Ratified and **not adjustable during the run** | INTERNAL |
| `docs/ops/d158-self-serve-live-test.md` | field operator | founder | KEEP | the browser | 2026-08-23 | An observation checklist, not a script | INTERNAL |
| `docs/maanta-node0-field-validation-timeline.md` | founder | founder | UPDATE | the evidence protocol | 2026-08-22 | Its 1→5→20 sequence predates the ratified 1→5→10 ladder — reconcile | INTERNAL |
| `docs/maanta-node0-rehearsal-checklist.md` | ops | founder | ARCHIVE-lean | — | — | Rehearsal-era. Superseded by the runsheet for Merchant 01 | INTERNAL |
| `docs/ops/live-pilot-3-person-2026-07-30.md` | founder | founder | KEEP as history | — | 2026-07-30 | Dated narrative the loop test generalises | INTERNAL |
| **Pilot GO/HOLD scorecard** | founder | founder | **MISSING — P1** | — | — | The lines exist in the evidence protocol; a one-page scorecard would help. Not blocking | INTERNAL |
| **Merchant / shopper / staff feedback interviews** | operator | founder | **MISSING — P1** | — | — | Needed at Merchant 01 close-out, not at the visit | INTERNAL |

---

## 7. Admin, ops and support

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `docs/maanta-launch-ops-runbook.md` | ops | founder | UPDATE | itself | — | Predates Field Validation Mode. Support paths and SLA still valid | INTERNAL |
| `docs/skills/redemption-disputes.md` | admin | founder | KEEP | `reverse_success_fee` | — | Dispute flow or SLA changes | INTERNAL |
| `docs/ops/demo-mode.md`, `demo-mode-runbook.md`, `demo-mode-spec.md`, `demo-mode-review-checklist.md` | ops | eng | **MERGE candidate — P2** | `app_config.demo_mode_enabled` | — | Four documents on one switch. Consolidate; keep the runbook | INTERNAL |
| `docs/ops/supabase-migrations.md` | eng, founder | eng | KEEP | the ledger | 2026-09-01 | Apply procedure changes | INTERNAL |
| `docs/skills/money-trust-engineering-guardrails.md` | eng | eng | KEEP | the RPCs | — | Money path changes | INTERNAL |
| `docs/skills/fast-visit-and-counter-qr.md` | eng | eng | KEEP | the migrations | 2026-08-27 | Arrival, points, QR or queue change. **Engineering doc — not usable at a counter** | INTERNAL |
| `docs/skills/role-permissions.md` | eng, admin | eng | KEEP | RLS policies | — | Roles or policies change | INTERNAL |
| **Admin runbook** (role boundaries, sanctions, audit trail, prohibited production actions, failure-vs-zero) | admin | founder | **MISSING — P1** | — | — | Admin is the founder today, so the risk is low. Required before a second admin exists | CONFIDENTIAL |
| **Incident and escalation guide** | admin, operator | founder | **MISSING — P1** | — | — | Escalation ladder exists in the day sheet; a standalone incident procedure does not | INTERNAL |
| **Support FAQ / macros** | support | founder | **MISSING — P2** | — | — | Needed when support volume exists | INTERNAL |

---

## 8. Marketing

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `docs/marketing/marketing-claims-register.md` | founder, agency, agents | founder | KEEP (new 2026-09-01) | production; the decisions log | 2026-09-01 | **External validation moves off zero**; any frozen rule changes | INTERNAL |
| `docs/ops/IMPLEMENTATION-REPORT.md` | eng, founder | eng | KEEP | the marketing build | — | Marketing site changes | INTERNAL |
| `docs/skills/ux-copy-audit-2026-09-02.md` | founder, eng | eng | KEEP (new 2026-09-02) | `lib/deal-list-controls.ts`; the frozen rulings | 2026-09-02 | **D223–D226 ruled on**, or feed rail names/orders change | INTERNAL |
| `docs/maanta-marketing-agency-brief.md` | agency | founder | UPDATE | the claims register | — | Predates the Elite de-anchoring and Field Validation Mode. **Do not hand over until reconciled** | CONFIDENTIAL |
| `docs/maanta-{shopper,merchant,mall-operator}-email-sequence.md` | agency | founder | DRAFT | the claims register | — | Not activated (gate M3). Check every claim against the register first | CONFIDENTIAL |
| `docs/maanta-email-segmentation-plan.md`, `maanta-waitlist-data-schema.md` | agency, eng | founder | KEEP | Resend + the waitlist route | 2026-08-02 | Segmentation or the waitlist backend changes | INTERNAL |
| `docs/ops/copy/*.md` | agency, eng | eng | KEEP | the rendered pages | — | Page copy changes | INTERNAL |
| **Content release / photography consent form** | operator | founder + counsel | **MISSING — P0 (legal)** | — | — | **Needed before the Merchant 01 visit.** Consent cannot be obtained retroactively | PUBLIC (a form) |

---

## 9. Legal and compliance

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `docs/legal/terms-of-service.md` | shoppers | founder + counsel | **DRAFT** | counsel, when engaged | 2026-07-31 | Counsel review | PUBLIC (draft) |
| `docs/legal/privacy-policy.md` | shoppers | founder + counsel | **DRAFT** | counsel | 2026-07-31 | Counsel review; **any new data category** | PUBLIC (draft) |
| `docs/legal/merchant-terms.md` | merchants | founder + counsel | **DRAFT** | counsel | 2026-07-31 | Counsel review. **Read first** — it governs money | PUBLIC (draft) |
| `docs/legal/cookie-notice.md` | shoppers | founder + counsel | **DRAFT** | counsel | 2026-07-31 | Counsel review | PUBLIC (draft) |
| `docs/legal/COUNSEL-REVIEW-NOTE.md` | counsel | founder | KEEP | — | 2026-07-31 | New capability ships | CONFIDENTIAL |
| `docs/legal/legal-gap-checklist-2026-09-01.md` | founder, counsel | founder | **DRAFT** (new 2026-09-01) | the product | 2026-09-01 | A capability ships that handles personal data or value | CONFIDENTIAL |
| **MAANTA Points terms** | shoppers | founder + counsel | **MISSING — required before `fast_visit_enabled = true`** | — | — | There is no live exposure while the gate is off, and no terms can be written retroactively | PUBLIC |
| **Data-processing inventory / RoPA**, **DSR procedure**, **breach procedure** | founder + counsel | founder | **MISSING — P2 (public launch)** | — | — | Gate **O7**. The privacy policy already promises this machinery — drift **D144** | CONFIDENTIAL |

---

## 10. Investor and stakeholder

| Document | Audience | Owner | Status | Source of truth | Last verified | Review trigger | Class |
|---|---|---|---|---|---|---|---|
| `docs/stakeholder/maanta-stakeholder-report.md` | advisors, investors, partners | founder | **DRAFT** (new 2026-09-01) | production; decisions log | 2026-09-01 | **External validation moves off zero**; any founder ruling | CONFIDENTIAL |
| `docs/investor/maanta-investor-overview.md` | investors | founder | **DRAFT** (new 2026-09-01) | the stakeholder report | 2026-09-01 | Same; and when any RESEARCH REQUIRED section is filled | CONFIDENTIAL |
| `docs/notion-refresh/investor-readiness.md` | founder, advisors | founder | KEEP on posture, **UPDATE on figures** | superseded on status by the investor overview | 2026-07-28 | Its "do not claim" list is still correct and still load-bearing | CONFIDENTIAL |
| `docs/notion-refresh/*` (the rest) | Notion | founder | KEEP as a paste package | Notion | 2026-07-28 | A dated package; do not read as current status | INTERNAL |
| `docs/maanta-staged-readiness-now-launch-10k-100k.md` | founder, eng | founder | UPDATE | — | — | Contains the unverified backups claim — drift **D145** | INTERNAL |
| **Public stakeholder one-pager** | external | founder | **MISSING — P2** | — | — | The stakeholder report is CONFIDENTIAL by construction. A public version needs a founder pass | PUBLIC |

---

## 11. Gap matrix

### P0 — before Merchant 01

| Gap | State |
|---|---|
| Merchant 01 end-to-end runsheet | **CLOSED** 2026-09-01 — `docs/ops/merchant-01-pilot-runsheet.md` |
| Staff documentation for the counter QR and queue | **CLOSED** 2026-09-01 — counter card updated |
| Merchant documentation for the counter QR | **CLOSED** 2026-09-01 — welcome pack updated |
| Shopper hand-out | **CLOSED** 2026-09-01 — `docs/ops/shopper-pilot-card.md` |
| Evidence classification, in one place with the queries | **CLOSED** 2026-09-01 — `docs/ops/evidence-classification-guide.md` |
| Known limitations / what must not be promised | **CLOSED** 2026-09-01 — `docs/ops/node0-known-limitations.md` |
| QR placement in the operator's onboarding steps | **CLOSED** 2026-09-01 — day sheet updated |
| **Content release / photography consent form** | **OPEN — founder + counsel.** Cannot be obtained retroactively |
| **Named merchant-support owner** (gate O2) | **OPEN — founder.** Accepted "good for now"; not blocking |
| **Demo-mode decision for the run** | **OPEN — founder.** CLAUDE.md says demo mode must be off for Merchant 01's onboarding and Shopper 01's claim; it is currently on. A production configuration change, so founder-only |

### P1 — during merchants 01→03

- Merchant FAQ, fuller than the two in-app entries; and `/merchant/support`
  updated to cover the QR, the queue and the wallet.
- Admin runbook — required before a second admin exists.
- Incident and escalation guide.
- Pilot GO/HOLD scorecard.
- Merchant / shopper / staff feedback interview scripts.
- Readiness-tracker revision pass (**D219**).
- Agent guide — **blocked on D159**; do not write it yet.

### P2 — before broader BBS Mall launch

- Staff / authorised-user terms (**D170**).
- MAANTA Points terms — **or earlier, if the gate is flipped**.
- Privacy operational package: RoPA, DSR, breach, retention (gate **O7**, **D144**).
- ODPC registration position, evidenced (gate **O9**, **D146**).
- Backup and verified restore runbook (gate **O8**, **D145**).
- Consolidate the four demo-mode documents.
- Public stakeholder one-pager.
- Support FAQ and macros.
- Shopper FAQ beyond `/faq`.

### P3 — scale stage

- Mall-operator welcome pack and reporting expectations (gate **O4**).
- Multi-node operating manual.
- Training material and onboarding for a larger field team.
- Marketing campaign assets — gates M2–M7, deliberately not started.

---

## 12. Recommendation this register cannot itself action

`maanta-app/src/lib/admin-resources.ts` powers the in-app **Admin → Resources**
centre and lists audience-facing resources with three honest states (live,
reference, missing). It is **application code**, and this documentation pass did
not change it — correctly, since the pass is documentation-only.

It is now **out of date in five places**. When engineering work is next
authorized, it should gain:

- `docs/ops/merchant-01-pilot-runsheet.md` — ops
- `docs/ops/evidence-classification-guide.md` — ops
- `docs/ops/node0-known-limitations.md` — ops
- `docs/ops/shopper-pilot-card.md` — shopper (**closing the "Shopper welcome
  pack — does not exist yet" `missing` entry**)
- `docs/maanta-documentation-register.md` — ops

Recorded as drift **D221**.
