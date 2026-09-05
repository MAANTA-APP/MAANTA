# MAANTA waitlist data schema & backend spec

Last updated: 2026-08-02 (route path and the superseded-decision marker below;
the implementation it describes dates from 2026-07-10) · Status: **built —
Resend is the platform** (see "Implemented" below; env config still required
before go-live).
One audience database, three role-based segments. Companion to
`maanta-email-segmentation-plan.md`.

## Implemented (2026-07-10)

- **Platform: Resend.** Contacts live in one Resend audience
  (`RESEND_AUDIENCE_ID`); `segment_type`, `phone`, `node_interest`,
  `business_name`, `note`, `source_channel/medium/campaign`, `consent_at`,
  and `consent_text` are stored as contact properties using the canonical
  field names below. No Supabase table (per the 2026-07-10 decision).
- **Page:** `/waitlist` in `maanta-app/src/app/(marketing)/waitlist/` — one
  form with a hard segment selector (`shopper` | `merchant` | `mall_operator`);
  other pages preset it via `/waitlist?segment=merchant`. UTM params are
  captured from the URL at submit.
- **API:** `POST /api/waitlist` — a **stateless proxy** (validation, +254
  phone normalization, honeypot, then Resend contact create + confirmation
  email). This amends the letter of the "no `/api/waitlist` route" decision
  while keeping its substance: the route stores nothing; it exists because
  the segmentation plan requires server-side keyed API access. Logged in
  `maanta-decisions-log.md` (2026-07-10, Resend entry).
- **Emails:** segment-specific confirmation copy in
  `maanta-app/src/lib/waitlist-emails.ts` (merchant copy states the KES 30
  success fee, per the segmentation-plan guardrail).
- **Env (names only):** `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`,
  `RESEND_FROM_EMAIL`.
- **Deliberate MVP cuts vs. the field matrix:** `city` is not asked
  (launch is BBS Mall only; `node_interest` defaults to "BBS Mall"),
  business/mall name is one optional field, and `business_category` /
  `floor_unit` / `mall_role` are deferred to the email sequences or a
  follow-up form. Add them to the form only if campaign targeting needs
  them before launch.
- **Contact properties must be created in Resend once** (dashboard or
  API) before they persist; the API route falls back to a core-fields-only
  contact create if properties are rejected, so leads are never lost.

### Resend account state + end-to-end test (2026-07-10)

- Sending domain `mail.maanta.app` **verified** (eu-west-1); a dedicated
  **"Waitlist" audience/segment** exists (its ID is the `RESEND_AUDIENCE_ID`
  env value), and all 10 contact properties are created (`segment_type`,
  `phone`, `node_interest`, `business_name`, `note`, `source_channel`,
  `source_medium`, `source_campaign`, `consent_at`, `consent_text`).
- **End-to-end verified 2026-07-10**: local `POST /api/waitlist` exercised
  against a mock (merchant signup 200, duplicate → friendly success,
  invalid email/consent/segment → 400, honeypot silently dropped, +254
  normalization confirmed), and a real merchant signup executed against
  live Resend — contact stored in the Waitlist audience with all
  properties, confirmation email status **delivered**.
- `RESEND_BASE_URL` env override (defaults to the live API) lets local
  testing point at a mock — same pattern as `INTASEND_ENV`.
- **Verify on first production signup**: the route uses Resend's
  `/audiences/{id}/contacts` endpoint with the Waitlist segment ID; Resend
  has since restructured audiences→segments, so confirm the first live
  signup lands in the Waitlist segment (the fallback logging in
  `src/lib/resend.ts` will show any mismatch; no lead is lost either way).

### Consent wording (finalized 2026-07-10 · widened 2026-09-05, D269)

> **Current wording (2026-09-05):** I agree to receive MAANTA launch updates and
> relaunch marketing messages by email, WhatsApp or SMS — including merchant
> offers at BBS Mall and deal updates across Nairobi. I can unsubscribe at any
> time.

Widened by founder ruling so the channels board 2 wants (WhatsApp, SMS) can be
activated later without re-consenting early signups. **Consented ≠ activated:**
email is the only approved launch channel; WhatsApp and SMS are not activated
and each needs its own ruling and readiness (`WAITLIST_ACTIVATED_CHANNELS`).
The 2026-07-10 wording below is kept as the record of what earlier rows carry —
historic consent evidence is never rewritten to the current wording.

> I agree to receive MAANTA launch updates and relaunch marketing emails —
> including merchant offers at BBS Mall and deal updates across Nairobi.
> I can unsubscribe at any time.

Set in `maanta-app/src/lib/waitlist.ts` (`WAITLIST_CONSENT_TEXT`), shown at
the checkbox and stored verbatim on every contact. Scope matches the first
campaign: BBS Mall merchants (relaunch marketing period) + users across
Nairobi. Still align with `legal/privacy-policy.md` at lawyer review.

> **SUPERSEDED IN TWO RESPECTS — read the "Implemented" section above, which is
> the current contract** (marked 2026-08-02; the block below was left standing
> after the same-day amendment and contradicted this document's own header,
> drift **D65**). Both changes are recorded in `docs/maanta-decisions-log.md`
> under 2026-07-10: (1) **the email platform is confirmed — Resend**, not "later";
> (2) **a `/api/waitlist` route does exist**, as a deliberately **stateless**
> proxy, because the segmentation plan needs server-side keyed API access and
> the Resend key cannot be exposed to a browser form. What survives unchanged is
> the substance of the ruling: **no `waitlist_signups` table**, and the route
> stores nothing.
>
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

`POST /api/waitlist` *(archived Supabase-backed spec — superseded by the built
stateless Resend proxy route of the same path; see "Implemented" above)*

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

## Amended 2026-09-05 — the waitlist funnel (design board 2)

Read with the 2026-09-04 mirror amendment (`docs/maanta-decisions-log.md`).

- **Two steps.** `/waitlist` is role selection (three segments, a GET form, no
  JavaScript needed); `/waitlist?role=<segment>` is the contact form. `?segment=`
  and the hyphenated `?role=mall-operator` are still read. A merchant is sent to
  `/merchants/join`.
- **Shopper / mall-operator fields:** `phone` (first, required), `email`
  (required — founder ruling; see register D269), `fullName` (**optional** since
  this date; `full_name` and Resend `first_name` may be empty), `mall`
  (`bbs` | `other` + `mallOther`, stored as `node_interest`), `interests`
  (closed list, `waitlist_signups.interests TEXT[]`, mirror-only), `businessName`
  (mall operator only), `consent` (unchanged wording).
- **A TEST signup sends no confirmation email.**
- **Merchant interest is a separate endpoint and table:** `POST /api/merchants/interest`
  → `growth_merchant_leads` with `source = 'public_form'`. Fields: `shopName`,
  `contactName`, `phone`, `mall`, `floor`, `unit`, `category`, `counterStaff`,
  `eliteTrial`, `contactConsent` (wording in `lib/merchant-interest.ts`, stored
  verbatim). **No email.** Migration `20260905130000_waitlist_funnel_fields.sql`.

