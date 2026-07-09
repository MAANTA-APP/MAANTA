# MAANTA waitlist data schema

Last updated: 2026-07-09 · Applies to the public waitlist site and email platform
(external to this repo). One audience database, three role-based segments.

## Rules

- One database, required `segment_type` field: `shopper` | `merchant` | `mall_operator`.
- Segment type is set **automatically** by which landing path/form the person used —
  never by asking them to self-classify in a generic form.
- Never mix the three segments into one generic funnel or one generic email list.
- Every signup must have a consent timestamp before it enters any email sequence.

## Field schema

| Field | Type | Required | Notes |
|---|---|---|---|
| email | string | Yes | Primary key for the email platform |
| phone | string | Yes | E.164; needed for M-Pesa-market audience and SMS later |
| segment_type | enum | Yes | `shopper` / `merchant` / `mall_operator`, set at signup |
| source_campaign | string | Yes | UTM campaign or channel tag; drives CPL reporting |
| mall_or_node_interest | string | Yes | Default `BBS Mall` at launch; free text for expansion signal |
| consent_timestamp | datetime | Yes | Marketing consent moment (DPA 2019 relevance) |
| business_name | string | Merchant only | |
| merchant_category | string | Merchant only | e.g. food, fashion, electronics, services |
| mall_name | string | Mall operator only | |
| mall_role | string | Mall operator only | e.g. property manager, marketing lead, tenant relations |

## Wiring checklist

1. Three landing paths/forms: shopper, merchant, mall operator.
2. Each form tags `segment_type` and `source_campaign` automatically.
3. Forms feed the email platform; segment triggers the matching welcome
   sequence (see `maanta-email-segmentation-plan.md`).
4. Weekly list-quality review: signup count by segment, junk/duplicate rate,
   segment split vs. campaign targeting.

## Handoff note

When the waitlist site is built (or rebuilt), give the builder this file plus
the three-message hierarchy from `maanta-marketing-agency-brief.md`. Field names
above are canonical — keep them identical across forms, email platform, and any
export so segments survive tool migrations.
