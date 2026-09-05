# The waitlist funnel — design board 2 of 4 (2026-09-05)

**Status:** built, merged into `main` the same day as board 3's security review
and the `unsubscribed` migration. **Authorisation:** Node 0 Field Validation
Mode freezes speculative engineering; the founder exported the board, chose it
over board 1 when asked, and ruled on the four questions below before code was
written. The migration was applied to production on the founder's instruction.

Read this before touching `/waitlist`, `/merchants/join`, `lib/waitlist.ts`,
`lib/merchant-interest.ts` or anything under `src/components/funnel/`.

## What the board asked for, and the four rulings

Board 2 is role selection, two forms, four confirmation states and the internal
TEST treatment. Four things on it could not be built as drawn without a decision
that was not mine to make. The founder ruled on each on 2026-09-05:

| The board says | The constraint | Ruling |
|---|---|---|
| "Phone first, email never" | No SMS/WhatsApp sender exists; Resend keys on email; the mirror's identity is the email; the consent wording is about email | **Phone first, email kept**, labelled as where the confirmation goes. Channel decision open — **D269** |
| `/merchants/join` is "Register interest" with floor and unit | The page handed off into self-serve onboarding, and the copy deck said its labels must not change | **Lead capture into `growth_merchant_leads`**, `source = 'public_form'`. Onboarding one text link away |
| "That link has expired — confirmation links last 24 hours" | No confirm-by-link flow exists | **Failure state only.** Double opt-in open — **D270** |
| New fields need columns | A migration is a founder-authorised act | **Applied**, ledger read first, version repaired to the repo filename |

## The shape

- **`(funnel)` route group.** Both routes moved out of `(marketing)` so they can
  have a chrome-free shell — slim header (back, lockup, `Back to site` / `Back
  to merchants`), skip link, one `main`, `PrelaunchNotice`, three legal links.
  URL-invisible; every inbound link, sitemap entry and OG image is unchanged.
  Every guard that walked `(marketing)` (`marketing-a11y`, `growth-content-health`)
  now walks `(funnel)` as well.
- **Step 1 is a GET form.** Radio cards driven from `WAITLIST_SEGMENT_OPTIONS`
  (the guard that caught the landing form filing every merchant as a shopper
  still applies), selection in ink, one amber button. The choice lands in
  `?role=`; `parseWaitlistSegmentParam` also reads `?segment=` and the
  hyphenated `mall-operator` the mall-operators page has linked since July.
- **Step 2** (`signup-form.tsx`) serves shoppers and mall operators. Merchants
  are redirected to `/merchants/join` with the test token and UTMs carried.
- **Four states** replace the form in place: joined, already on the list (masked
  number, "there is no queue to jump"), failed ("nothing was saved, so nothing
  was lost", Start again), and the test-mode variant. **No state quotes a number
  of people** — a signup count is traction, and there is none to show. Guarded.
- **Merchant interest** (`join-form.tsx` → `POST /api/merchants/interest`) asks
  for the unit because an agent has to find the shop, and for no email. Same
  rules as the waitlist endpoint: token-derived TEST marker, honeypot, IP + phone
  digest rate limit, code-only logging. A second submission for a live unit
  returns `alreadyRegistered` off the partial unique index.

## The TEST treatment, as shipped

Three signals: a striped rust rule under the header, a `TEST` badge on the
lockup, a bordered notice above the first field. The consent row is pre-ticked
and disabled in the disabled tokens ("consent is recorded but no message is
sent"), the button says "Submit test entry" with a `TEST` chip, and — new in
this board — **the API sends no confirmation email for a test signup**. Both
routes are `noindex` when the `test` parameter is present, via `generateMetadata`.

`/merchants/join` became dynamic to do this: the server verifies the token
before rendering the treatment. A client-side read would show "test mode" to
anyone who typed `?test=1` while the API filed a real row — the inverse of the
failure the treatment exists to prevent. `check-server-forms` lists it under the
dynamic routes for that reason; both forms still avoid `useSearchParams` and
`Suspense` (guarded).

## Two departures from the board, on purpose

- **The error lede is ink, not flame.** Frozen rule 4: red is borders and icons;
  body text stays `#111`.
- **The KES 30 callout on the merchant form is stone, not amber tint.** One amber
  per screen, and the button has it.

## Files

`src/app/(funnel)/layout.tsx` · `src/app/(funnel)/waitlist/{page,role-select,signup-form}.tsx`
· `src/app/(funnel)/merchants/join/{page,join-form}.tsx` · `src/components/funnel/*`
· `src/lib/waitlist.ts` · `src/lib/merchant-interest.ts` · `src/app/api/merchants/interest/route.ts`
· `supabase/migrations/20260905130000_waitlist_funnel_fields.sql` · tests:
`waitlist-funnel.test.ts`, `merchant-interest.test.ts`, scenario J of
`waitlist_signups_test.sql`, scenario H of `growth_leads_and_campaigns_test.sql`.

## Verified, and not

`tsc` clean · `next lint` clean · 2084 tests across 203 files · `next build`
green with `check:tokens`, `check:canonicals` (both funnel routes now listed as
per-request), `check:forms`. Migration applied and read back.

**CI's first run caught a real defect** in that migration: `array_length` returns
NULL for an empty array, so the `interests` CHECK passed `ARRAY[]::TEXT[]`.
Scenario J was right and the migration was wrong; `20260905140000` swaps the
constraint for `cardinality`, applied to production the same day (D271).

Not verified: no browser proof — the two-column desktop frame, the `has-[:checked]`
radio cards and the confirmation panels are reasoned, not observed (same posture
as boards 3 and D240). Neither endpoint has been exercised end to end against
production. The two SQL scenarios run only in CI's `db-tests`.

## What board 2 leaves open

**D269** (channel) and **D270** (double opt-in), both founder decisions. Board 4
— the social and OG image kit — was never exported; the bundle ends at board 3.

---

# Addendum — D269 and D270 ruled (2026-09-05)

- **D269, closed (founder product/marketing ruling).** Email is the approved
  launch channel. `WAITLIST_CONSENT_TEXT` now names email, WhatsApp and SMS,
  which future-proofs the consent record — and **consented ≠ activated**:
  `WAITLIST_ACTIVATED_CHANNELS` is `["email"]`, WhatsApp and SMS are not yet
  activated, and neither may be used merely because the wording names it.
  Each needs its own provider, operational and compliance readiness, as its
  own ruling. Guarded in `waitlist.test.ts` (wording, activated ⊆ consented,
  email only, no sender in the codebase). Historic rows keep the wording they
  were shown; consent evidence is never rewritten. Re-examine the channel
  posture immediately before the first genuine send.
- **D270, engineering deferred.** MAANTA initially relies on the recorded form
  consent rather than building confirmation-by-link before launch. Whether
  that satisfies every applicable Kenyan requirement is a compliance matter to
  be rechecked before genuine marketing begins — not a conclusion this record
  draws. Reopen on: first genuine campaign in preparation; legal/compliance or
  provider requirement; deliverability or abuse evidence; a material complaint
  or consent issue.
- **Collection is gated, and the gate is closed (D274, ruled the same day).**
  `COLLECTION_GATE` in `lib/marketing/collection-gate.ts` is `"closed"`: both
  funnel pages render a "not open yet" panel with no form, both endpoints
  refuse with 403 before any write, and a verified TEST entry still passes so
  the journey stays testable. Opening it is a recorded decision — see
  `docs/skills/collection-gate-2026-09-05.md`.

