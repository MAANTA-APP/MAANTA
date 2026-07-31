# Cookie & Tracking Notice

**MAANTA APP**
Last updated: 31 July 2026 (DRAFT)

This notice explains what we store on your device and what we track when you use MAANTA. It sits alongside our [Privacy Policy](/privacy).

---

## 1. In short

We use a small number of technologies to keep you signed in, keep the service secure, fix things that break, and understand how MAANTA is used. We do not use advertising cookies, we do not run trackers for third-party advertisers, and we do not sell what we learn.

## 2. What we use, and why

### Strictly necessary — always on

These are required for MAANTA to work. Without them you cannot stay signed in or claim a deal.

| What | Who provides it | Purpose |
|---|---|---|
| Session and authentication cookies | Clerk | Keeps you signed in and ties your codes to your account |
| Security and abuse prevention | Clerk, Vercel | Protects accounts and prevents automated claiming |
| Delivery and routing | Vercel | Serves the site and keeps it working across regions |
| Your preferences stored on your device | MAANTA | Remembers your mall, filters and display settings |

### Error monitoring

| What | Who | Purpose |
|---|---|---|
| Error and performance reports | Sentry | Tells us when something breaks and helps us fix it |

We use this to keep the service working. {{SENTRY_BASIS_STATEMENT}}

### Product analytics

| What | Who | Purpose |
|---|---|---|
| Usage events — pages viewed, features used, where journeys stop | PostHog (processed in the European Union) | Understanding how MAANTA is used so we can improve it |

{{ANALYTICS_CONSENT_STATEMENT}}

### Notifications

If you turn on notifications, your browser stores a push subscription so we can send you messages about deals you have claimed. Turning notifications off removes it.

## 3. What we do not do

- No advertising or retargeting cookies.
- No third-party advertising networks.
- No selling or sharing of your data with data brokers.
- No tracking of what you do on other websites.

## 4. Your choices

**Analytics.** {{ANALYTICS_OPTOUT_INSTRUCTIONS}}

**Notifications.** Turn them off in your MAANTA settings or in your browser.

**Location.** MAANTA asks before using your location. You can refuse, or withdraw permission later in your browser settings, and still use the service.

**Your browser.** You can block or delete cookies in your browser settings. If you block the strictly necessary ones you will not be able to sign in or claim a deal.

**Withdrawing consent** is as easy as giving it, and does not affect anything processed before you withdrew.

## 5. How long these last

| Type | Typical lifetime |
|---|---|
| Session cookies | Until you close your browser or sign out |
| Authentication | {{AUTH_COOKIE_LIFETIME}} |
| Preferences stored on your device | Until you clear them |
| Analytics identifiers | {{ANALYTICS_COOKIE_LIFETIME}} |

## 6. Data processed outside Kenya

Some of these providers process data outside Kenya — PostHog in the European Union, and Vercel in the United States. Section 12 of our [Privacy Policy](/privacy) explains the basis on which that happens.

## 7. Changes

If we add or remove a provider, we will update this notice and the date at the top.

## 8. Questions

admin@maanta.app

---

## Questions for counsel

1. **Confirm the layered basis in the table above** — strictly necessary, legitimate interest for error monitoring, and the consent split for analytics at sign-in. Is that defensible under the DPA and the ODPC consent guidelines?
2. **Consent records.** The ODPC guidelines call for a register of consent declarations. What must MAANTA log, and for how long, to evidence consent for anonymous analytics?
3. **Legitimate interest assessment** for Sentry and for post-sign-in analytics — should a documented balancing test be produced and kept on file?
4. **Cross-border** — PostHog is EU-hosted and Vercel US-hosted. Confirm this notice and Privacy Policy s.12 state the transfer basis consistently.
5. **Withdrawal mechanics** — is an in-product setting sufficient, or is a persistent link required on every page?

---

## Build dependencies

This notice cannot publish until these exist in the product:

- [ ] Consent mechanism for anonymous analytics — banner or cookieless configuration
- [ ] A working analytics opt-out in account settings
- [ ] Consent logging, if consent is the chosen basis
- [ ] Sentry configured to scrub personal data from error payloads
- [ ] Confirmed cookie lifetimes for the table in section 5
- [ ] Confirmed processing regions for every provider

---

**Sources consulted for the regulatory framing:**
[ODPC consent guidelines commentary](https://blog.africadataprotection.org/en/2024/01/31/kenya-a-look-back-at-the-odpc-consent-guidelines/) · [Data Protection Act, 2019 — Kenya Law](https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31) · [Data Protection (General) Regulations, 2021 — Kenya Law](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-01-14)
