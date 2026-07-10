# MAANTA — Resend email template staging map

Last updated: 2026-07-10 · Status: **confirmation emails implemented in code;
sequence broadcasts (#2+) still to stage in Resend UI.**
Companion to `maanta-email-segmentation-plan.md` and the three per-segment
sequence docs (`maanta-shopper-email-sequence.md`,
`maanta-merchant-email-sequence.md`, `maanta-mall-operator-email-sequence.md`).

## Where each email lives

| Email | Type | System of record | Status |
|---|---|---|---|
| Shopper confirmation (email #1) | Transactional, sent per-signup | **Code**: `maanta-app/src/lib/waitlist-emails.ts` | ✅ implemented, tested |
| Merchant confirmation (email #1) | Transactional | **Code**: same file | ✅ implemented, tested |
| Mall-operator confirmation (email #1) | Transactional | **Code**: same file | ✅ implemented, tested |
| Sequence emails #2+ (all segments) | Broadcasts / drip | **Resend UI** (broadcasts to segment filters) | ⬜ not staged |

**Do not duplicate the confirmation emails as Resend templates.** They are
sent by `POST /api/waitlist` through the Resend send API at signup time, with
the contact's name interpolated server-side. Creating UI copies would create
two sources of truth. If copy changes, edit `waitlist-emails.ts` (it has full
HTML + plaintext render and a vitest suite path).

## Confirmation email copy (canonical, as shipped in code)

Variable map for all three: `{firstName}` = first word of the form's
`fullName`, HTML-escaped, fallback `there`. No other variables.

### Shopper — subject: `You're on the MAANTA waitlist`

> Hi {firstName},
>
> You're on the list. MAANTA is launching at **BBS Mall, Eastleigh** — real,
> verified deals from shops inside the mall. You claim a deal on your phone
> and redeem it in person at the counter with a one-time code.
>
> We'll email you as launch gets close, and you'll get access on day one.
> No spam in between — just the launch.
>
> — The MAANTA team

### Merchant — subject: `You're on the MAANTA merchant launch list`

> Hi {firstName},
>
> Thanks for your interest in MAANTA for your business at **BBS Mall,
> Eastleigh**. MAANTA brings shoppers to your door: you publish deals,
> shoppers claim them in the app, and they redeem in person at your counter
> with a one-time code.
>
> You pay only for results — **KES 30 per verified redemption**, from a
> prepaid wallet. No redemption, no fee.
>
> Before launch we'll email you what onboarding involves (approval, wallet
> top-up, getting your first deal live) so you're ready on day one. Want to
> talk sooner? Just reply to this email.
>
> — The MAANTA team

### Mall operator — subject: `MAANTA — thanks for your interest`

> Hi {firstName},
>
> Thanks for registering interest in MAANTA for your property. MAANTA is an
> in-mall deals and redemption platform launching at **BBS Mall, Eastleigh**
> — it drives measurable footfall to tenants and gives operators visibility
> into deal activity and traction inside the mall.
>
> We'll keep you posted as the launch progresses, and we'd welcome a
> conversation about a pilot for your mall — reply to this email and we'll
> set it up.
>
> — The MAANTA team

Every email ends with the standard footer: *"You're receiving this because
you joined the MAANTA waitlist. If this wasn't you, just ignore this email."*

### Known wording drift vs. the sequence docs (accepted, not blocking)

- The sequence docs' email-#1 subject beats differ from shipped copy
  (e.g. shopper doc: "You're on the list — BBS Mall is about to get
  interesting" vs. shipped "You're on the MAANTA waitlist"; mall-operator
  doc assumes a `{{mall_name}}` variable the form doesn't collect). The
  shipped copy is the operative version; update the sequence docs' email #1
  sections (and Notion) to match, or change the code deliberately — don't
  let them drift silently.
- Sequence docs say "contact created with tag `shopper`" — implementation
  uses the `segment_type` contact **property** (`shopper` | `merchant` |
  `mall_operator`), not Resend tags. Broadcast audience filters must key on
  `segment_type`.

## Staging the sequence broadcasts in Resend UI (manual handoff)

For each broadcast: audience = the Waitlist audience (`RESEND_AUDIENCE_ID`
env var), filtered to the relevant `segment_type` property value; from
address = `RESEND_FROM_EMAIL` (verified domain `mail.maanta.app`); use
Resend's built-in unsubscribe. Personalize with Resend's contact variables
(`{{{FIRST_NAME|there}}}`).

Copy for these does **not** exist in final form yet — the sequence docs hold
approved "body beats" only, and several contain founder-dependent facts:

| Broadcast | Blocked on |
|---|---|
| Shopper #2 (+3d), #3 (+7d), #4 (launch−3d) | #3 needs the real merchant-count number; #4 needs launch date + access URL + incentive decision |
| Merchant #2 (+2d) … #5 (+12d) | Explainer-page link (#2); onboarding timeline dates |
| Mall-operator #2 (+4d), #3 (+9d) | Pilot-offer framing (founder-authored, small B2B list) |

Drafting final broadcast copy from the beats is a marketing/Operator-session
deliverable, not an engineering one — do it in a session with the founder,
then stage in Resend UI.

**Parked 2026-07-10 (founder):** the blocking facts (launch date, merchant
count, incentive, explainer link) will be known closer to launch. Revisit
broadcast staging then; nothing further to do engineering-side until the
founder reopens this.
