# MAANTA — Privacy Policy (DRAFT)

**Status:** Draft for legal review. **Not legal advice — I am not a lawyer.**
**Date drafted:** 2026-07-31
**Route:** `/privacy` (currently a placeholder in production)
**Grounded in:** Data Protection Act, 2019 (Kenya) and the Data Protection (General) Regulations, 2021

---

> ## ⚠️ DRAFT — NO LEGAL STANDING
>
> This document is an **unreviewed draft**, published as part of a **pre-launch demonstration** of MAANTA. It has **not** been reviewed by a lawyer. It does **not** create any rights or obligations, it is **not** a contract, and it **must not be relied on by anyone**.
>
> MAANTA APP is not yet trading. Any registration, licence or authorisation identifiers shown are **placeholders** (`*-DEMO-*`) and do not refer to any real registration with the Central Bank of Kenya, the Office of the Data Protection Commissioner, or any other authority. See `docs/ops/demo-mode-spec.md`.
>
> Questions: admin@maanta.app


## Before this ships

**Blocking:** registered entity name and address · ODPC registration status · a monitored privacy inbox · counsel review.

**Verified timelines used below** (from the General Regulations 2021, cited so counsel can check the drafting quickly):

| Right | Period | Source |
|---|---|---|
| Access to personal data | **7 days** | Reg. 9(4) |
| Rectification | **14 days**; a refusal must be notified within **7 days** with written reasons | Reg. 10(4), 10(5) |
| Erasure | **14 days** | Reg. 12(3) |

**Breach notification:** the General Regulations do not set the period; section 43 of the Act is the operative provision and is generally read as **72 hours** to the Data Commissioner. Drafted as 72 hours below — **counsel to confirm** before publishing.

**ODPC registration:** exemption applies only where annual turnover is **below KES 5 million AND** the entity employs **fewer than 10 people**. Certain sectors must register regardless of size. MAANTA processes personal data as the core of a commercial platform and touches payment flows — assume registration is required and confirm.

**Processor list is drawn from the production build**, not assumed: Clerk, Supabase, PostHog (EU instance), Sentry, Stripe, IntaSend, Vercel, Resend, what3words, plus web push. If a vendor is added or dropped, this document changes.

> **Cross-border note worth counsel's attention:** the production deployment runs in Vercel's `iad1` region (US East) while the PostHog project is on `eu.posthog.com`. Personal data is therefore processed outside Kenya in at least two jurisdictions. Section 12 below addresses this and needs to be accurate.

---

# Privacy Policy

**MAANTA APP** ("MAANTA", "we", "us")
Last updated: 31 July 2026 (DRAFT)

---

## 1. Who we are

MAANTA operates a platform that shows deals published by shops inside shopping malls, lets shoppers claim a deal and receive a one-time code, and lets shop staff verify that code at the counter.

MAANTA APP is the data controller for the personal data described in this policy.

**Registered address:** BBS Mall, Eastleigh, Nairobi, Kenya
**Contact for privacy matters:** admin@maanta.app
**ODPC registration:** `DEMO-ODPC-NOT-REGISTERED` — placeholder, see demo notice

> *Counsel note: if MAANTA is not yet registered, remove this line rather than leaving it blank or marked "pending".*

## 2. What this policy covers

This policy covers personal data we handle for:

- **Shoppers** who browse, claim and redeem deals
- **Merchants** — shop owners and the staff they add to an account
- **Mall operators** and their representatives
- **People who join our waitlist or contact us**
- **Visitors to maanta.app**

It does not cover what a shop does with information you give it directly at its counter. When you buy something in a shop, that transaction is between you and the shop.

## 3. What we collect

### If you are a shopper

- **Your phone number.** Required when you claim your first deal. Your phone number is your account — we do not ask for a password or an email address.
- **Deals you claim and redeem**, including the code issued, which shop it was for, and when it was claimed, verified, rejected or expired.
- **Favourites and preferences** you set.
- **Approximate location**, if you allow it, so we can show deals near you and distances in metres. You can refuse this and still use MAANTA.
- **Notification preferences**, and a push subscription token if you turn on notifications.

You can browse deals without an account. We do not require a phone number to look.

### If you are a merchant or shop staff

- **Shop details** — name, category, and location within the mall, including a what3words address used to place your shop precisely on the map.
- **Contact details** — name and phone number for the account owner and each staff member added.
- **Account activity** — deals published, codes verified or rejected, wallet top-ups and fee deductions.
- **Payment details** processed by our payment providers (see section 6). We do not store full card numbers.

### If you are a mall operator

Name, role, organisation and contact details you give us, plus records of our correspondence.

### Everyone

- **Technical data** — IP address, device and browser type, and pages viewed, used to run the service, keep it secure, and understand how it is used.
- **Error reports** when something breaks.
- **Anything you send us** by form, email or WhatsApp.

## 4. Why we use it, and our lawful basis

| What we do | Why | Lawful basis |
|---|---|---|
| Issue and verify redemption codes | To run the core service | Performance of a contract |
| Tie a code to one person and prevent reuse | To stop fraud against shops | Legitimate interest |
| Charge merchants the success fee and run wallets | To bill for the service | Performance of a contract |
| Send service messages — code issued, deal expiring, low balance | To operate your account | Performance of a contract |
| Send marketing and launch updates | Only where you agreed | Consent |
| Show deals near you | To make the feed useful | Consent (location) |
| Understand product usage | To improve the service | Legitimate interest |
| Keep records of redemptions | To resolve disputes and meet tax and accounting duties | Legal obligation / legitimate interest |

You can withdraw consent at any time. Withdrawing consent for marketing does not affect service messages about a deal you have claimed.

## 5. Ranking and automated processing

Deals are ordered using verified redemptions, distance, and how soon a deal expires. This affects what you see in the feed. It does not produce legal or similarly significant effects about you, and we do not use it to profile you for any decision about you personally.

## 6. Who we share it with

We do not sell personal data. We do not share it with advertisers or data brokers.

**With shops**, when you redeem: a shop sees that a valid code was presented and which deal it relates to. Shops do not receive your phone number or your browsing history through MAANTA.

**With mall operators**: aggregated, shop-level and mall-level reporting only. Mall operators do not receive information identifying individual shoppers.

**With service providers who process data on our instructions:**

| Provider | Purpose | Where |
|---|---|---|
| Vercel | Hosting and delivery of the website and app | United States |
| Supabase | Database and file storage | {{SUPABASE_REGION}} |
| Clerk | Account authentication | {{CLERK_REGION}} |
| IntaSend | M-Pesa payments and wallet top-ups | Kenya |
| Stripe | Card payments | United States / global |
| PostHog | Product analytics | European Union |
| Sentry | Error monitoring | {{SENTRY_REGION}} |
| Resend | Transactional and notification email | {{RESEND_REGION}} |
| what3words | Converting a shop's location into a precise address | United Kingdom |

> *Counsel note: confirm each region before publishing, and confirm a data processing agreement is in place with each. `{{...}}` regions are unverified.*

**With authorities**, where we are required by law to do so.

## 7. Cookies and similar technologies

We use:

- **Strictly necessary** cookies to keep you signed in and to keep the service secure. These cannot be turned off.
- **Analytics** to understand how the product is used.

{{COOKIE_CONSENT_STATEMENT}}

> **Counsel and engineering note — this is a decision, not drafting.** PostHog, Clerk and Sentry are live in production. Analytics that are not strictly necessary generally require consent. Either (a) gate PostHog behind a consent banner, or (b) run it in a cookieless, essential-only configuration. Write this section to match whichever is built. Do not publish a policy describing consent that the site does not actually collect.

Full detail is in our [Cookie Notice](/cookies).

## 8. How long we keep it

| Data | Retention |
|---|---|
| Shopper account and phone number | While your account is active, then {{SHOPPER_RETENTION}} after you close it |
| Redemption records | {{REDEMPTION_RETENTION}} — needed for dispute resolution, merchant billing, tax and accounting |
| Merchant account and wallet records | For the life of the account, then as required by tax and accounting law |
| Analytics | {{ANALYTICS_RETENTION}} |
| Contact and waitlist messages | {{CONTACT_RETENTION}} |

## 9. Your rights

Under the Data Protection Act, 2019 you have the right to be informed how your data is used, to access it, to have it corrected, to have it erased, to object to processing, and to data portability.

**How long we take:**

- **Access requests — within 7 days.**
- **Corrections — within 14 days.** If we refuse, we will tell you within 7 days and give our reasons in writing.
- **Erasure — within 14 days.**

To exercise any of these, email admin@maanta.app from the phone number or address on your account, or write to us at the address above. We may ask you to confirm your identity. We do not charge for this.

**Some data we cannot delete on request.** Records of verified redemptions are needed to bill merchants correctly, settle disputes and meet tax obligations. Where that applies we will tell you which records we are keeping and why.

## 10. Complaints

If you are unhappy with how we have handled your data, contact us first at admin@maanta.app. You also have the right to complain to the **Office of the Data Protection Commissioner**, whose contact details are at [odpc.go.ke](https://www.odpc.go.ke).

## 11. Security

We use encryption in transit, access controls, and separate accounts for each member of shop staff so that activity can be attributed to a person. Redemption codes are single-use and time-limited.

If a personal data breach occurs that presents a risk to you, we will notify the Data Commissioner within 72 hours of becoming aware of it, and we will tell affected people where the law requires it.

> *Counsel note: confirm the 72-hour period against s.43 of the Act and current ODPC guidance before publishing.*

**We will never ask you for a password, a card PIN or an M-Pesa PIN.** Anyone who does is not us.

## 12. Data processed outside Kenya

Some of our providers process data outside Kenya, including in the United States and the European Union, as set out in section 6. Where we transfer personal data outside Kenya we do so on the basis of {{TRANSFER_BASIS}} and take steps to ensure it remains protected to the standard required by the Act.

> *Counsel note: section 48 of the Act governs cross-border transfers. The basis must be stated accurately — appropriate safeguards, consent, or necessity for contract performance. This section is currently a placeholder and must not ship as one.*

## 13. Children

MAANTA is not intended for children under 18. We do not knowingly collect data from children. If you believe a child has given us personal data, contact admin@maanta.app and we will delete it.

> *Counsel note: s.33 of the Act sets specific requirements for processing children's data. Confirm whether age is verified at sign-up — currently the only sign-up datum is a phone number, so it is not.*

## 14. Changes to this policy

If we change this policy we will update the date at the top. If a change materially affects your rights, we will tell you directly.

## 15. Contact

MAANTA APP
BBS Mall, Eastleigh, Nairobi, Kenya
admin@maanta.app

---

## Questions for counsel

1. **Is registration with the ODPC required, and has it happened?** The exemption needs turnover below KES 5m *and* fewer than 10 employees, and does not apply to some sectors regardless of size. Section 1 should not name a registration number that does not exist.
2. **Confirm the breach notification period** in section 11 against s.43 and current ODPC guidance.
3. **Cross-border transfer basis** in section 12. Production hosting is in the United States and analytics in the EU — this is not a theoretical transfer.
4. **Consent architecture for analytics** — section 7 cannot be finalised until it is decided whether PostHog is gated or made cookieless.
5. **Children's data** — sign-up collects only a phone number, so there is no age check. Is that acceptable under s.33, or is a declaration needed?
6. **Retention periods** — sections 8's blanks should be set by what the business and tax rules actually require, not by a round number.
7. **Controller relationship with merchants.** A shop that adds staff and sees redemption activity may be an independent controller for its own records. Confirm whether the merchant relationship needs a data-sharing clause in the Merchant Terms.
8. **Do processor agreements exist** with each provider in section 6?
