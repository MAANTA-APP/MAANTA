# Public claims and form safety — what shipped on 2026-09-04, and where each claim now lives

**Status:** shipped on branch `claude/new-session-jnbpuh` in three commits, in the
order the engineering package (`10_PUBLIC_CLAIMS_AND_FORM_SAFETY`) recommends:
PR-1a (X1, unblocks BBS Mall outreach), PR-1b (the claims stage), PR-2 (form
safety). **Authorised by:** founder ruling 2026-09-04. **Register rows:** D261–D273.

This document is the durable record of the session. The register is the state;
this is the map. Read it before touching any sentence on the marketing site that
says where MAANTA is, how merchants pay it, who is on the floor, how fast support
replies, or what the feed contains — and before reopening a public form.

---

## 1. The one rule

**Every public claim that will become true on a specific day has exactly one
source, gated on the thing that makes it true.** Nothing in this pass was a
find-and-replace. The same defect appeared on three pages at once because each
page typed its own copy of the claim; the fix is an address, not a wording.

| Claim | Source | Flips on |
|---|---|---|
| Where MAANTA is (no desk, no address) | `lib/marketing/live-claims.ts` → `ENTITY_LINE`, `NO_DESK_NOTICE`; `ENTITY` has **no `address` field** | `DEMO_MODE` — and only after BBS authorises the relationship |
| Whether MAANTA is operating | `live-claims.ts` → `OPERATING_STATUS_SENTENCE` | `DEMO_MODE` |
| How a node is staffed | `live-claims.ts` → `NODE_STAFFING_MODEL` (composed from `facts.ts` `NODE_TEAM`) | `DEMO_MODE` |
| Deployment timeline, month-of-data | `live-claims.ts` → `DEPLOYMENT_TIMELINE_LEAD`, `MONTH_OF_DATA_SENTENCE` | `DEMO_MODE` |
| Support reply line (no SLA) | `live-claims.ts` → `SUPPORT_REPLY_LINE`, `HELP_DESCRIPTION` | `DEMO_MODE`; a turnaround is published only when someone owns it |
| The feed CTA | `live-claims.ts` → `FEED_CTA_LABEL` ("See the demo feed") | `DEMO_MODE` (Gate 2, demo data resolved) |
| Whether a merchant can pay inside MAANTA | `facts.ts` → `PAYMENT_AVAILABILITY` (`inAppPaymentLive: false`, the *Paying MAANTA* note, the FAQ Q11 answer) | the day a rail is live — **not** `DEMO_MODE` |
| Whether a public form collects | `lib/marketing/forms.ts` → `FORM_STATUS` | a founder ruling on **FC1** |

`RESPONSE_TIMES` no longer exists. `ENTITY.address` no longer exists. The
`odpc` placeholder identifier no longer exists. Each absence is deliberate and
each is guarded.

## 2. What the sweep guards

`maanta-app/src/lib/__tests__/public-claims.test.ts` is the package's §7.1
banned-string sweep, run over marketing source and the legal drafts (vitest
runs before build, so source is what can be scanned — the same constraint as
every other marketing guard, D41). Whole-file, whitespace-collapsed matching.

| Row | Fails on | Deliberate survivors |
|---|---|---|
| X1 premises | the address block; desk/office in the mall; "MAANTA operates at" | "We do not have a desk or an office in the mall yet" |
| X3/X4 payment | top-up, top up, topup, wallet, topped up, "Card also works" | the ruling's two sentences ("no M-Pesa top-up and no card payment", "In-app top-up by M-Pesa is planned"); the FAQ *question* |
| X5 vocabulary | listing fee, commission(s), transaction cut, percentage take, free plan, "cut of the/your sale", "take a percentage" | "share of your sale" (approved doc 02 copy); "Data Protection Commissioner" |
| X9 SLA | "reply the same day", "within 1 business day", "acknowledged within", the identifier `RESPONSE_TIMES` | the Data Protection Act's own period for privacy requests |
| X10 | "Browse live deals" | — |
| X2 staffing | "Every node MAANTA opens is staffed", "Each/A node runs with", "They will come to your shop", "roughly a month from agreement to live feed", "A month of data is enough" | — |
| X-JOIN | "We will call you", "come to your shop", "come to you at BBS" | — |
| X-WAITLIST | "relaunch" (also asserted directly on `WAITLIST_CONSENT_TEXT`) | — |
| D2 standing | "Fast Visit", "MAANTA Points" | — |
| §5 | any `ODPC-…` string or the `{{ODPC_REGISTRATION}}` token | — |

`live-claims.ts` is excluded from the file sweep on purpose (it holds the
post-launch wording beside the pre-launch wording); its **resolved exports** are
asserted directly instead, which is what renders.

**The legal drafts are in scope for every row except wallet/top-up.** Their
contractual wallet and top-up language, the Stripe processor row and the
retention commitments are legal's to settle, not copy's — **D270**.

## 3. Form safety — the traces, and how to reopen

Method was static inspection only. **No form was submitted with any data,
including test data**, per instruction 3.

### `/contact`
`EnquiryRouter` → `POST /api/contact` → `sendEmail` (Resend) to `ENTITY.email`,
plus an autoresponder to the sender when they gave an email. **Storage:** the
recipient inbox and Resend's sent-mail log (United States). **Fields:** name,
contact, message, topic. **Consent:** none beyond the stated purpose ("We use
what you send here only to reply to you"). **Retention:** no mechanism — nothing
deletes an email. **Access:** whoever holds the inbox and the Resend account.
**Deletion:** manual, in both. **Destination proven. Legal review: not done.**

### `/waitlist`
`WaitlistForm` → `POST /api/waitlist` → `addWaitlistContact` (Resend Audience
contact) plus a confirmation email. **Storage:** the Resend audience (US).
**Fields:** email, full name, phone, segment, business name, note, UTM source /
medium / campaign, `node_interest`. **Consent: persisted** — `consent_at` and the
full `consent_text` with every contact (the text no longer says "relaunch").
**Retention:** no mechanism. **Access:** anyone with the Resend API key or
dashboard. **Deletion:** remove the contact by email in Resend. **Destination
proven. Legal review: not done.**

### `/merchants/join`
**No request.** The shop name goes into `/login?next=/merchant/onboard?shop=…`
and the phone into `sessionStorage` (`lib/merchant-join-handoff.ts`, read once).
Nothing is written anywhere until the merchant signs in and completes onboarding
through `onboard_merchant` — the product's own authenticated, RLS-governed path,
and Merchant 01's path. It is a door, not a collector. `public.leads` is the
agent workflow and is unrelated. **Left open** — see D273.

### The state today

```ts
// maanta-app/src/lib/marketing/forms.ts
export const FORM_STATUS = { contact: "closed", waitlist: "closed", merchantJoin: "open" };
```

A closed form is closed in two places at once: the page renders the ruling's
§4.3 block (no inputs, the real reason, `admin@maanta.app` as the alternative,
no count) **and** the API route returns `503` with the same alternative, so a
cached page or a direct POST cannot write. `scripts/check-server-forms.mjs`
knows the closed state and asserts it is honest rather than asserting a form.

**To reopen a form:** the founder rules FC1 (which gate governs — recommended
(a): destination proven *and* legal review complete), the review evidence is
recorded against D271, and one word changes in `FORM_STATUS`. Then delete the
non-vacuity assertion in `form-safety.test.ts` that requires at least one closed
route, deliberately.

## 4. What was deliberately not done

- **The KES 300 opening-credit offer** on `/merchants` and `/pricing` — GD1 is
  unruled; only the *mechanism* language came off (`09 CH5` stands).
- **Elite pricing wording, the tagline, canonicals, `robots.txt`, the sitemap,
  the "six hundred visitors" illustration** — founder: keep as they are.
- **The legal drafts' retention table, Stripe row and wallet/top-up
  descriptions** — flagged to legal (D270), not edited.
- **FAQ JSON-LD** — neither added nor removed. It was found to be *already
  live* (D272), contrary to `09 CH10`; X3 corrected Q11 in the schema
  byte-for-byte because the markup is generated from the rendered array.
- **Any submission to any form**, any payment integration, any demo-mode change,
  any redesign, any new route.

## 5. Outreach sequencing

X1 is on the branch and pushed as its own commit (`d9c2046`). The BBS Mall
approach in `11` should go out once that commit is deployed, so that the mall
opening `maanta.app` finds no claim of premises on its floor. Nothing else in
this pass gates outreach.

## 6. Verification

- `npm test` — **192 files, 1985 tests, all green** after PR-2 (191 / 1976
  after PR-1b). The D28 route test holds the form-safety gate open explicitly
  so it keeps proving the delivery path; `form-safety.test.ts` proves the 503.
- `npm run typecheck`, `npm run lint` — clean.
- `npm run build` — green, including `check:tokens` (53 files, 467 chunks),
  `check:canonicals` (16 routes) and the updated `check:forms`, which found
  `/contact` honestly closed (closed heading present, zero `<form>` elements,
  the topic router and `admin@maanta.app` present) and `/merchants/join` with
  its form and no call promise. `/help`, `/pricing` and `/faq` were read back
  from the built HTML: the corrected descriptions and Q11 are what ships.
- Mutation checks: a reintroduced "the desk at BBS Mall" on `/contact` turns
  `public-claims.test.ts` red; the hero-shot guard was updated for the
  renamed "Balance after" label and re-run.

Still 0: independent merchants, genuine claims, verified redemptions, cash
collected. Nothing here moves any of them.
