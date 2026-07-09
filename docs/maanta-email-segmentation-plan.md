# MAANTA — Email Segmentation Plan & CRM Integration Map

Audience: AI lead (segmentation and scoring rules) and agency (execution in
the email platform). Companion to `maanta-waitlist-data-schema.md`.

## Why segment at all

Shoppers, merchants, and mall operators have different goals, different
objections, and different launch actions. One generic list produces
irrelevant email for at least two of the three audiences. Segment by role
at capture time, then refine by behavior — never by post-hoc list cleanup.

## Top-level segments

| Segment | Set by | Launch goal |
|---|---|---|
| `shopper` | Shopper waitlist form | Install/access on launch day; first claim within week 1 |
| `merchant` | Merchant waitlist form | Booked onboarding before launch; wallet topped up by launch day |
| `mall_operator` | Operator form / direct outreach | Pilot or partnership conversation |

## Sub-segments (behavioral, applied after signup)

| Sub-segment | Definition | Use |
|---|---|---|
| Engaged | Opened ≥1 of last 3 emails | Normal cadence |
| Unengaged | Opened 0 of last 3 | Re-permission email, then suppress |
| Clicker | Clicked any CTA | Priority for launch-day pushes |
| Shopper interest category | Optional preference capture in email #3 | Deal-category launch content |
| Merchant category | `business_category` from form | Category-specific proof points |
| BBS-focused vs future-node | `node_interest` field | Only BBS-focused contacts get launch-day logistics |
| Operator single-site vs multi-site | Manual tag after first call | Pilot vs. rollout track |

## Lead scoring

Simple additive score, recomputed on each event; used to rank merchant
onboarding outreach and identify launch-day shopper champions.

**Merchant score** (onboarding intent):

| Signal | Points |
|---|---|
| Form completed with business category + floor/unit | +20 |
| Opened pricing email (#3) | +10 |
| Clicked "book onboarding" | +30 |
| Replied to any email | +30 |
| BBS Mall as node interest | +10 |

Score ≥ 50 → hot: founder/agent follows up personally within 48h.

**Shopper score** (launch conversion likelihood):

| Signal | Points |
|---|---|
| Clicked any deal-preview content | +10 |
| Opened ≥3 emails | +10 |
| Referred another signup (if referral link used) | +20 |

## CRM / email integration map

```
Landing form (segment hard-coded)
        │  POST /api/waitlist
        ▼
Supabase waitlist_signups  ──► analytics event `waitlist_signup`
        │  sync job (marks crm_synced_at; retries failures)
        ▼
Email platform contact
   tags: segment_type, source_campaign, node_interest,
         business_category (merchant), mall_role (operator)
        │  automation trigger: tag = segment on contact create
        ▼
Lifecycle sequence (shopper / merchant / mall-operator)
        │  engagement events (opens, clicks, replies)
        ▼
Sub-segment tags + lead score  ──► weekly KPI report (agency)
                               ──► hot-merchant list (founder/agent follow-up)
```

Platform requirements (any mainstream ESP works — choose one that has):

1. Tag-triggered automations (one sequence per segment).
2. API access for the sync job (server-side, keyed, not client-side forms).
3. Custom fields for the tags listed above.
4. Suppression handling and one-click unsubscribe (DPA/consent hygiene).

## Analytics definitions (funnel)

| Metric | Definition |
|---|---|
| Visitor → signup rate | `waitlist_signup` events ÷ landing-page sessions, per segment and per campaign |
| Segment split | Share of signups by `segment_type` per week |
| Campaign source performance | Signups and cost per lead by `source_campaign` |
| Onboarding intent | Merchants with score ≥ 50 ÷ total merchant signups |
| Launch conversion | Waitlist contacts who claim ≥1 deal in launch week ÷ shopper list size (join on email/phone against `users`) |

## Sequence docs

- `maanta-shopper-email-sequence.md`
- `maanta-merchant-email-sequence.md`
- `maanta-mall-operator-email-sequence.md`
