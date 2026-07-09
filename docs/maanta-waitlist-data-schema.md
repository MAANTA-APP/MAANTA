# MAANTA — Waitlist Data Schema & Backend Spec

Status: **specification — not yet built.** The public waitlist does not
exist in the codebase today. Note that the existing `public.leads` table is
the *agent-sourced merchant lead* pipeline (48-hour lock for on-ground
sales) and must not be reused for the public waitlist — different audience,
lifecycle, and access rules.

## Design principles

- **One audience database, segmented at capture.** A single
  `waitlist_signups` table with a `segment_type` column; the segment is set
  by which form the visitor used, never asked as a dropdown.
- **Three top-level segments:** `shopper`, `merchant`, `mall_operator`.
- **Campaign attribution from the first touch:** UTM parameters are
  captured into `source_campaign` at signup.
- **Consent recorded with a timestamp** (Kenya DPA 2019 — align wording
  with `legal/privacy-policy.md` before the forms go live).

## Table

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

## Field matrix (what each form collects)

| Field | Shopper | Merchant | Mall operator |
|---|---|---|---|
| Email | required | required | required |
| Phone | required | required | required |
| Segment type | auto: `shopper` | auto: `merchant` | auto: `mall_operator` |
| City | required | required | required |
| Mall / node interest | required (default BBS Mall) | required | required |
| Source campaign (UTM) | auto | auto | auto |
| Consent timestamp + text | auto | auto | auto |
| Business name | — | required | — |
| Business category | — | required | — |
| Floor / unit | — | optional | — |
| Mall role | — | — | required |
| Mall name | — | — | required |

## API

`POST /api/waitlist`

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

## CRM sync

Signups flow to the email platform tagged with segment + campaign source;
`crm_synced_at` marks completion so a retry job can catch failures. The
full integration map (tags, lists, automation triggers) is in
`maanta-email-segmentation-plan.md`.
