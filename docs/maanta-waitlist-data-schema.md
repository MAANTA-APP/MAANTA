# MAANTA — Waitlist Data Schema & Backend Spec

Status: **implemented.** Migration
`maanta-app/supabase/migrations/20260709120000_waitlist_signups.sql`,
validation in `maanta-app/src/lib/waitlist.ts`, API at
`maanta-app/src/app/api/waitlist/route.ts`, forms at `/waitlist`,
`/merchants`, and `/mall-operators`.

The existing `public.leads` table is the *agent-sourced merchant lead*
pipeline (48-hour lock for on-ground sales) and is deliberately not reused
— different audience, lifecycle, and access rules.

## Design

- **One audience table, segmented at capture.** `waitlist_signups` with a
  `segment_type` column set by which form the visitor used — never a
  user-facing dropdown.
- **Three segments:** `shopper`, `merchant`, `mall_operator` (DB CHECK).
- **Attribution from first touch:** `utm_campaign` / `utm_medium` /
  `utm_source` query params are read on the form page and stored as
  `source_campaign` / `source_medium` / `source_channel`.
- **Consent evidence:** the server stamps `consent_at` and stores the exact
  consent wording (`consent_text`, a server-side constant also rendered
  next to the checkbox). Clients only send a boolean; the wording can't be
  spoofed. Historical rows keep the wording they were shown.
- **Access model:** RLS enabled with **no policies**, and all grants
  revoked from `anon`/`authenticated`. Inserts happen only via the API
  route using the service-role key; reads only via the admin CSV export.

## Table (as created)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `segment_type` | text | CHECK: `shopper` / `merchant` / `mall_operator` |
| `email` | text | stored lowercase (DB CHECK enforces) |
| `phone` | text | normalized: Kenyan numbers to `+2547…`/`+2541…`, others generic E.164 |
| `full_name` | text nullable | |
| `city` | text | required |
| `node_interest` | text | default `BBS Mall` |
| `source_campaign` / `source_medium` / `source_channel` | text nullable | utm_campaign / utm_medium / utm_source |
| `consent_at` | timestamptz | server-stamped at insert |
| `consent_text` | text | exact wording shown at signup |
| `business_name`, `business_category`, `floor_unit` | text nullable | merchant segment |
| `mall_name`, `mall_role` | text nullable | mall_operator segment |
| `crm_synced_at` | timestamptz nullable | reserved for a future CRM sync job (none exists yet) |
| `created_at` | timestamptz | |

Constraints: `UNIQUE (email, segment_type)` — the same person can join
both the shopper and merchant lists (a shop owner is also a shopper), but
never the same list twice. Index on `(segment_type, created_at)` for
segment reporting.

## Field matrix (what each form collects)

| Field | Shopper | Merchant | Mall operator |
|---|---|---|---|
| Email | required | required | required |
| Phone | required | required | required |
| Name | optional | optional | optional |
| Segment type | auto: `shopper` | auto: `merchant` | auto: `mall_operator` |
| City | required (prefilled Nairobi) | required | required |
| Mall / node interest | auto: BBS Mall | auto: BBS Mall | auto: BBS Mall |
| UTM attribution | auto from URL | auto | auto |
| Consent checkbox + timestamp | required | required | required |
| Business name | — | required | — |
| Business category | — | required | — |
| Floor / unit | — | optional | — |
| Mall name | — | — | required |
| Mall role | — | — | required |

## API — `POST /api/waitlist`

Server-side validation (`src/lib/waitlist.ts`, fully unit-tested):

- Email format check, lowercased; phone normalized (accepts `07…`,
  `254…`, `+254…` Kenyan forms and generic international E.164).
- Segment-specific required fields enforced (merchant: business name +
  category; operator: mall name + role). Segment-irrelevant fields are
  discarded, not stored.
- All free-text fields trimmed and capped at 200 chars.
- `consent: true` required; server stamps `consent_at`.
- **Honeypot**: a hidden `website` field — bot submissions get a success
  response and no row.
- **Rate limit**: best-effort in-memory throttle, 5 requests/minute per IP
  (per serverless instance — a spam blunter, not a security boundary).

Responses: `200 {joined: true}` on insert; duplicates
(unique-constraint hit) also return `200` with `alreadyJoined: true` and
leave the original row — including its first-touch attribution —
untouched; `400` with a user-facing message on validation failure;
`429` when throttled.

Note: the route does **not** yet emit an analytics-platform event —
campaign attribution lives on the row itself. Wiring `waitlist_signup`
events into the analytics stack is tracked separately (tracker E8).

## Landing pages

| Path | Headline CTA | Segment |
|---|---|---|
| `/waitlist` | "Join the waitlist" (shopper positioning) | `shopper` |
| `/merchants` | Merchant launch list (pay-on-redemption pitch) | `merchant` |
| `/mall-operators` | Operator interest (tenant activation pitch) | `mall_operator` |

All three share one form component (`src/app/waitlist/waitlist-form.tsx`)
with the segment hard-set by the page; the homepage footer links to all
three. Campaign links must carry UTMs — that is the only way attribution
reaches the row.

## Export path for marketing (current CRM flow)

Until an automated CRM sync exists, the flow is manual and admin-gated:

1. Admin signs in and opens `/admin` → **Waitlist** section (live counts
   per segment).
2. Download per-segment or full CSV via
   `GET /api/admin/waitlist/export[?segment=…]` (admin role required;
   output is formula-injection-safe for Excel/Sheets).
3. Import into the email platform with the tags described in
   `maanta-email-segmentation-plan.md`.

`crm_synced_at` exists on the table so a future sync job can mark synced
rows and retry failures.
