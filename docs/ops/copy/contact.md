# MAANTA — `/contact` Copy Deck

**Status:** Ready for implementation — one blocking technical unknown (see §0) — *(at time of writing; built and shipped, see the note below)*
**Date:** 2026-07-31
**Route:** `/contact`, accepts `?topic=`
**Primary CTA:** Send message
**Supporting CTA:** WhatsApp support
**Companion docs:** `about.md`, `mall-operators.md`, `../website-footer-legal-docs-plan.md`

> **Implemented as of PR #153 (2026-08-01).** This deck is the input that was
> written before the build, kept unedited as the record of what was asked for.
> It is **not** the description of what shipped, and several passages were
> deliberately departed from — see the 17 recorded deviations in
> `docs/ops/IMPLEMENTATION-REPORT.md` §5, and the founder rulings in §14.
>
> **Where this deck and the code disagree, the code and the implementation
> report win.** Do not copy a line out of here into a page without checking it
> against `docs/ops/website-handoff.md` §9 (held claims) and
> `maanta-app/src/lib/marketing/facts.ts` (every rendered number) first.


---

## 0. Two things to settle before writing any code

### ✅ Where does the current form submit? — ANSWERED, do not re-investigate

**Resolved 2026-08-02 marker.** The suspicion below was correct and is fixed:
the form now POSTs to `maanta-app/src/app/api/contact/route.ts`, which delivers
the enquiry to `admin@maanta.app` via Resend and autoresponds to the sender.
Drift **D28** (fake success) and **D41** (form missing from server HTML) are both
closed. The audit text is kept below as the record of how it was found.

### ⚠️ Where does the current form submit? *(original finding, superseded)*

The production build manifest contains `/api/leads`, `/api/waitlist`, `/api/staff`, `/api/profile` and `/api/support` — **but no `/api/contact`**. The live `/contact` page renders a working-looking form with *Your email or phone*, *Message* and a *Send* button.

Either it routes through an existing endpoint, or **messages sent from that page are going nowhere.** Check this first. A contact form that silently discards enquiries is worse than having no contact page, and every trust claim on this site is undermined by it. If it is broken, that is a bug fix that should not wait for the marketing rebuild.

**Resend is already connected to this account** and is the obvious delivery path: form → `/api/contact` → Resend → monitored inbox, plus an autoresponder to the sender confirming receipt and restating the response time. The autoresponder is not a nicety here — it is the thing that proves the message arrived.

### The form is probably not the primary channel

For this audience, a web form is the *least* likely route. A shop owner in Eastleigh will WhatsApp before they fill in a form, and will walk to a desk before either. Most contact pages bury the human channels under a form and lose the people who would actually have got in touch.

So this page **leads with channels and puts the form second**. That is a deliberate inversion of the usual layout, and it is the right call for Nairobi mall retail.

---

## 1. Facts used

**Verified:** WhatsApp support exists (linked from `/help`) · BBS Mall, Eastleigh, Nairobi is the operating location · `/waitlist` segments shopper / merchant / mall operator · `/mall-operators` links here with `?topic=mall-operator` · current form fields are *Your email or phone* and *Message*.

**Dependencies — every one of these is a value MAANTA must supply.** Response times, hours, addresses and inboxes are the entire substance of this page; it cannot be written around them. Listed in §4.

---

## 2. Page metadata

**Title:** `Contact — MAANTA`
**Meta description:** `Talk to MAANTA. WhatsApp support for shoppers and merchants, a desk at BBS Mall, Eastleigh, and direct contacts for mall operators, press and privacy requests.`

---

## 3. Section-by-section copy

### `#hero`

**H1**
> Talk to us

**Sub**
> Pick what this is about and we will point you at the fastest route. Most things are quicker on WhatsApp than by form.

---

### `#router` — topic selector

> Reads `?topic=` from the URL and pre-selects. `/mall-operators` already links here with `?topic=mall-operator`, so this must work before that page's primary CTA goes live.
>
> Selecting a topic does two things: surfaces the recommended channel for it, and pre-fills the form subject below. Never hide the form entirely — some people want a written record.

**H2**
> What is this about?

**Six options**

**1. I am a shopper**
A code that did not work, a deal, or a shop.
→ *Fastest: WhatsApp.* Have your 6-digit code ready if you have one.

**2. I run a shop on MAANTA**
Deals, your balance, staff accounts, a redemption you want looked at.
→ *Fastest: WhatsApp, or the desk at BBS Mall.*

**3. I want to list my shop**
→ *This is not a contact enquiry.* Go straight to [List your shop](/merchants/join) — shop name and a phone number, and we will call you.

**4. I am a mall operator**
A pilot, a partnership, or a question about how a node works.
→ *Use the form, or email admin@maanta.app.* Goes to a named person, not a queue.

**5. Press**
→ *Email admin@maanta.app.* Tell us your deadline and we will work to it.

**6. Privacy or legal**
A data request, a takedown, or a question about our terms.
→ *Email admin@maanta.app.* See also our [Privacy Policy](/privacy).

---

### `#channels` — direct routes

> Placed high, above the form. These are the routes people will actually use.

**H2**
> Ways to reach us

**WhatsApp**
> +44 7746 170752
> The quickest route for anything to do with a deal, a code, or a shop account. {{WHATSAPP_HOURS}}

**The desk at BBS Mall**
> {{DESK_LOCATION}} — BBS Mall, Eastleigh, Nairobi
> {{DESK_HOURS}}
> If you run a shop in the mall and would rather do this in person, come and find us. We will set you up at your counter.

**Email**
> admin@maanta.app for anything else.

---

### `#form` — the message form

**H2**
> Send a message

**Sub**
> If you would rather have it in writing, or your question does not fit any of the above.

**Fields**

| Field | Label | Notes |
|---|---|---|
| Name | `Your name` | New — improves routing and lets replies open properly. |
| Contact | `Email or phone` | **Keep the existing label.** It is correct for this market: many people prefer a call back. |
| Topic | `What is this about?` | Pre-filled from `#router` / `?topic=`. Editable. |
| Message | `Your message` | |

**Submit:** `Send message`

**Under the form**
> We read every message. You will get a confirmation by email as soon as it arrives.

**Privacy line — required**
> We use what you send here only to reply to you. See our [Privacy Policy](/privacy).

**Security note — worth including**
> Never send passwords, card numbers or M-Pesa PINs to us, here or anywhere else. We will not ask for them.

---

### `#response` — what happens next

> Response times are the substance of this page. **Publish only what you can actually meet** — a missed commitment here does more damage than no commitment at all. Start conservative; tighten later.

**H2**
> What happens next

**Four rows**

| | |
|---|---|
| **WhatsApp** | {{WHATSAPP_RESPONSE}} during opening hours |
| **This form and email** | {{EMAIL_RESPONSE}} |
| **Mall operator enquiries** | {{OPERATOR_RESPONSE}}, from a named person |
| **Privacy and data requests** | Acknowledged {{PRIVACY_ACK}}, answered within the period required by the Kenya Data Protection Act 2019 *(confirm the statutory period with counsel before publishing)* |

**Closing**
> If we are going to be slower than this, we will tell you rather than leave you waiting.

---

### `#location` — where we are

**H2**
> Where to find us

**Body**
> MAANTA operates at **BBS Mall, Eastleigh, Nairobi**. That is where the shops are, where our activation team works, and where the desk is.

> There is no other office worth sending you to.

**Entity block — legally required**
> MAANTA APP
> BBS Mall, Eastleigh
> Nairobi, Kenya

---

## 4. Dependencies

**Every value below must come from MAANTA. This page is unusually dependent on them — the copy is scaffolding, and these are the substance.**

| Value | Demo status | What it needs to be at launch |
|---|---|---|
| WhatsApp `+44 7746 170752` | **Set — founder's personal number.** Note this is a **UK (+44)** number. | A Kenyan (+254) business line. A UK number on a Nairobi mall page reads as offshore and will cost trust with merchants. Also expect spam once it is public. |
| `{{WHATSAPP_HOURS}}` / `{{DESK_HOURS}}` | Open | Real opening hours. If it is not staffed on Sundays, say so. |
| `{{DESK_LOCATION}}` | Open | Floor and position inside BBS Mall, precise enough to find. |
| Support / press / privacy / operator email | **All set to `admin@maanta.app` for demo.** | Split them: a monitored shared inbox for support, `privacy@` matching the Privacy Policy exactly, and a named address for operators — the copy promises "a named person, not a queue". |
| `{{*_RESPONSE}}` | Open | Conservative, real commitments. Suggested starting point: WhatsApp same day, email 1 business day, operator enquiries 2 business days, privacy acknowledged within 2 business days. Adjust to what you can hold. |
| Entity `MAANTA APP`, `BBS Mall, Eastleigh` | **Set for demo.** | Confirm the exact registered name and registered office as filed. "MAANTA APP" is being used as the demo entity name. |

---

## 5. Claims register

| # | Claim | Status | Resolution |
|---|---|---|---|
| 1 | The form delivers to a monitored inbox | **Unknown — no `/api/contact` in the build** | **Resolve first.** See §0. |
| 2 | "We read every message" | **Promise** | Only publish if someone owns the inbox. |
| 3 | "You will get a confirmation by email" | **Requires an autoresponder** | Build it — Resend is already connected. |
| 4 | All stated response times | **Not yet defined** | See §4. Do not ship placeholder durations. |
| 5 | "Goes to a named person, not a queue" | **Requires a named address** | Otherwise cut the phrase. |
| 6 | The desk at BBS Mall | **Unconfirmed** | Confirm it is staffed at the stated hours before listing it. |
| 7 | Kenya DPA statutory response period | **Not verified** | Confirm the exact period with counsel; the copy deliberately avoids naming a number. |
| 8 | WhatsApp is the fastest route | **Assumed, and probably right** | True only if the number is watched. If not, reorder the page. |

---

## 6. Design and build notes

- **Channels above the form.** The single most important layout decision on this page, and the opposite of the default. Someone who wants to WhatsApp should never have to scroll past a form to find the number.
- **`?topic=` must work before `/mall-operators` ships.** That page's primary CTA points here. An unrouted landing is a broken promise on the page where it costs most.
- **Make the WhatsApp number tappable** — a `wa.me` link with a pre-filled message per topic, e.g. *"Hi MAANTA, I run a shop at BBS Mall and I have a question about my balance."* Removes the blank-message hesitation, and tells you the topic before the conversation starts.
- **Mobile first, again.** This page will be opened one-handed, in a mall, possibly while a customer waits. Tap targets large, number and hours visible without scrolling.
- **Spam protection** on the form — but no CAPTCHA that punishes a slow connection. A honeypot field and a rate limit are enough.
- **The security note is not boilerplate.** In a market with heavy M-Pesa fraud, saying plainly that you will never ask for a PIN is a real trust signal, and it protects your users from people impersonating you.
- **No accent colour except the send button** and the WhatsApp link.
- **Instrument:** topic selection, WhatsApp click-through, form submit, and the drop-off between selecting a topic and submitting. If most people pick a topic and leave, they found their answer in `#router` — which is a success, not a failure, and worth knowing before anyone "optimises" the form.
