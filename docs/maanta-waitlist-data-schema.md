# MAANTA waitlist data schema & backend spec

Last updated: 2026-07-09 · Status: **specification — not yet built.**
One audience database, three role-based segments. Companion to
`maanta-email-segmentation-plan.md`.

> **DECIDED (founder, 2026-07-10): waitlist signups live in the email
> platform** — no `waitlist_signups` table or `/api/waitlist` route in this
> repo. Which email platform is confirmed later; it must meet the platform
> requirements in `maanta-email-segmentation-plan.md` (tag-triggered
> automations, API access, custom fields, suppression handling). The field
> schema below is canonical regardless of platform — keep field names
> identical across forms, the email platform, and any export so segments
> survive tool migrations. The in-repo Option A spec is kept below as an
> archived fallback in case the chosen platform can't capture all fields.
>
> Note: the existing `public.leads` table is the *agent-sourced merchant
> lead* pipeline (48-hour lock for on-ground sales) and must **not** be
> reused for the public waitlist — different audience, lifecycle, and
> access rules.

## Rules

- One database, required `segment_type` field: `shopper` | `merchant` | `mall_operator`.
- Segment type is set **automatically** by which landing path/form the person
  used — never by asking them to self-classify in a generic form.
- Never mix the three segments into one generic funnel or one generic email list.
- Campaign attribution from the first touch: UTM parameters captured at signup.
- Every signup must have a consent timestamp (and the exact consent wording)
  before it enters any email sequence — Kenya DPA 2019; align wording with
  `maanta-app/legal/privacy-policy.md` before the forms go live.

## Field matrix (what each form collects)

| Field | Shopper | Merchant | Mall operator |
|---|---|---|---|
| Email | required | required | required |
| Phone (E.164, `+254` normalized) | required | required | required |
| Segment type | auto: `shopper` | auto: `merchant` | auto: `mall_operator` |
| Full name | optional | optional | optional |
| City | required | required | required |
| Mall / node interest | required (default BBS Mall) | required | required |
| Source campaign / medium / channel (UTM) | auto | auto | auto |
| Consent timestamp + text | auto | auto | auto |
| Business name | — | required | — |
| Business category | — | required | — |
| Floor / unit | — | optional | — |
| Mall role (e.g. owner, manager, leasing) | — | — | required |
| Mall name | — | — | required |

## Archived: Option A table (in-repo — NOT chosen, kept for reference)

```sql
CREATE TABLE public.waitlist_signups (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_type       TEXT NOT NULL
                     CHECK (segment_type IN ('shopper', 'merchant', 'mall_operator')),
  email              TEXT NOT NULL,
  phone              TEXT,
  full_name          TEXT,
  city               TEXT,
  node_interest      TEXT NOT NULL DEFAULT 'BBS Mall',
  source_campaign    TEXT,          -- utm_campaign
  source_medium      TEXT,          -- utm_medium
  source_channel     TEXT,          -- utm_source
  consent_at         TIMESTAMPTZ NOT NULL,
  consent_text       TEXT NOT NULL, -- exact wording shown at signup
  -- merchant-only fields
  business_name      TEXT,
  business_category  TEXT,
  floor_unit         TEXT,
  -- mall-operator-only fields
  mall_name          TEXT,
  mall_role          TEXT,          -- e.g. 'owner', 'manager', 'leasing'
  -- lifecycle
  crm_synced_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, segment_type)
);
```

Notes:

- `UNIQUE (email, segment_type)` allows the same person to join both the
  shopper and merchant lists (a shop owner is also a shopper) while
  preventing duplicate rows within a segment. Handle conflict with an
  upsert that refreshes `source_campaign` only if previously null.
- RLS: no anon read access at all; inserts only via the API route below
  (service role), never directly from the browser with the anon key.
- Follow the repo's migration conventions (timestamped file in
  `maanta-app/supabase/migrations/`, pinned `search_path` if any function
  is added, no anon grants).

## Archived: Option A API (in-repo — NOT chosen, kept for reference)

`POST /api/waitlist` *(archived spec — never built; no such route exists in the repo)*

- Validates: email format, phone format (Kenyan `+254` normalized),
  segment-specific required fields, honeypot field for bots, basic rate
  limit per IP.
- Writes via the service client; returns `201` or `409` (already joined —
  respond in the UI as success: "You're already on the list").
- Emits an analytics event (`waitlist_signup`) with segment and campaign
  source so funnel tracking works from day one.
- Vitest coverage: validation rejects, segment-field enforcement, upsert
  behavior, no anon-key write path.

## Landing-page paths

Keep the value proposition simple, form adjacent to the CTA, minimal
fields. Three paths, each hard-setting the segment:

| Path | CTA | Segment |
|---|---|---|
| `/waitlist` (or homepage hero) | "Join the shopper waitlist" | `shopper` |
| `/merchants` | "Merchants: join the launch list" | `merchant` |
| `/mall-operators` | "For mall operators" | `mall_operator` |

## Wiring checklist

1. Three landing paths/forms: shopper, merchant, mall operator.
2. Each form tags `segment_type` and `source_campaign` automatically.
3. Forms feed the email platform; segment triggers the matching welcome
   sequence (see `maanta-email-segmentation-plan.md`). `crm_synced_at`
   marks sync completion so a retry job can catch failures (Option A).
4. Weekly list-quality review: signup count by segment, junk/duplicate
   rate, segment split vs. campaign targeting.

## Handoff note

When the waitlist site is built (or rebuilt), give the builder this file plus
the three-message hierarchy from `maanta-marketing-agency-brief.md`. Field
names above are canonical.
