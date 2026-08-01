# MAANTA — Footer, Legal & Docs Plan

**Status:** Proposed — *(at time of writing; built and shipped, see the note below)*
**Date:** 2026-07-31
**Companion docs:** `website-ia.md`, `website-expansion-plan.md`

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

## 1. Current state

**Live footer, every marketing page:**

```
© Maanta      Privacy   Terms   Contact
```

Three links, no columns, no contact detail, no entity name, no docs. `/privacy` and `/terms` both render a single sentence saying the real document is "being finalised ahead of launch" — on a live production domain, under a custom domain, with Clerk auth, Stripe/IntaSend payments and PostHog analytics already running.

This is the single largest trust gap on the site.

---

## 2. Footer architecture

Five columns plus a legal base bar. All link data comes from **one module** (`lib/marketing/nav.ts`) shared with the header, so nav and footer can never drift.

### Column 1 — Brand

- Logomark
- One-line positioning: *"Live mall deals, claimed on your phone and verified at the counter."*
- Live-node line: **"Live at BBS Mall, Eastleigh · Nairobi"** with a status dot
- Install link → `/download`

### Column 2 — Product

| Label | Route |
|---|---|
| Shoppers | `/shoppers` |
| Merchants | `/merchants` |
| Mall operators | `/mall-operators` |
| Pricing | `/pricing` |
| Browse deals | `/feed` |
| Install the app | `/download` |

### Column 3 — Company

| Label | Route | Status |
|---|---|---|
| About | `/about` | existing |
| Contact | `/contact` | existing |
| Join the waitlist | `/waitlist` | existing |
| Careers | — | **deferred** |
| Press kit | — | **deferred** |

### Column 4 — Resources

| Label | Route | Status |
|---|---|---|
| Help centre | `/help` | existing, thin |
| FAQ | `/faq` | existing |
| BBS Mall (Node 0) | `/malls/bbs-mall` | existing |
| Merchant guide | — | **deferred** |

> **Shell caveat:** `/help` currently renders inside the **app shell** (Feed/Browse/Map/Deals/You tab bar). Linking to it from a marketing footer drops the visitor into a different chrome. Either give `/help` a marketing-shell variant, or route the footer link to `/faq` until `/help` is rehomed. Decide in Phase 4; do not ship the jarring version.

### Column 5 — Contact

- Support email — *needs a real, monitored address; `admin@maanta.app` is the only one currently evidenced*
- WhatsApp support — reuse the link already live on `/help`
- In-mall desk: BBS Mall, Eastleigh, Nairobi
- Response window, stated (e.g. "We reply within 1 business day")

### Base bar

```
© MAANTA 2026 · <Registered entity name>, Nairobi, Kenya
Privacy · Terms · Merchant Terms · Cookies
```

### Social

**Conditional.** Ship an icon only for an account that exists and is actively posted to. Dead or empty social links do measurable damage to the "operationally serious" positioning. If nothing qualifies, omit the row entirely — an absent row reads as deliberate, an empty profile reads as abandoned.

### Newsletter

**Do not build one.** `/waitlist` already collects name, email, phone and role (shopper / merchant / mall operator) with explicit marketing consent — strictly better than an unsegmented email field. The footer links to it instead. Building a second capture surface splits the list and duplicates the consent problem.

---

## 3. Legal & docs link set — status

| Document | Route | Status | Notes |
|---|---|---|---|
| **Privacy Policy** | `/privacy` | **Existing — placeholder. Rewrite. Launch-blocking.** | Must name the data controller entity, cover Kenya Data Protection Act 2019 basis, list processors actually in use (Clerk, Supabase, PostHog, Sentry, Stripe, IntaSend, Vercel), data-subject rights, retention, and a monitored privacy contact. Needs a `Last updated` date. |
| **Terms of Service** | `/terms` | **Existing — placeholder. Rewrite. Launch-blocking.** | Shopper-facing. Cover: the claim/redeem contract, that MAANTA is not the seller, code validity and the 15-minute grace, no online checkout, acceptable use, account termination, liability limits, Kenyan governing law. |
| **Merchant Terms** | `/merchant-terms` | **Missing but required.** | Distinct commercial agreement: KES 30 success fee, what counts as a verified redemption, that expired/rejected codes are not charged, prepaid wallet and top-up, Elite subscription and trial mechanics, the 7-day post-trial grace, fee reversals and disputes, deal-content standards, suspension. Should be referenced at `/merchants/join` and at wallet top-up. |
| **Cookie & Tracking Notice** | `/cookies` | **Missing but required.** | Non-optional: PostHog, Clerk session cookies and Sentry are all live in production. Must enumerate categories, purposes, and the opt-out path. Pairs with a consent mechanism — see risks. |
| **Refunds & disputes** | — | **Fold in.** | Shopper side into Terms; merchant fee-reversal side into Merchant Terms. A standalone page is not justified at this stage. |
| **Acceptable use** | — | **Fold into Terms.** | |
| **Data Processing Addendum** | — | **Deferred.** | Becomes relevant when a mall operator signs a pilot that involves sharing footfall data. Flag it as a pilot dependency on `/mall-operators`, not a public page. |
| **Security** | `/security` | **Deferred.** | Worth building once there is something substantive to say. A thin security page is worse than none. |
| **Status page** | `/status` | **Deferred.** | |
| **Docs hub** | `/docs` | **Deferred.** | Not justified pre-launch. `/help` + `/faq` + a future merchant guide cover the need. Revisit when merchant self-serve volume grows. |
| **Help centre** | `/help` | **Existing, thin.** Keep. | 2 Q&As today. Expand to shopper + merchant categories in a later pass. Resolve the shell issue first. |
| **FAQ** | `/faq` | **Existing.** Restructure. | 4 Q&As, ungrouped. Split into Shoppers / Merchants / Mall operators tabs and source shared answers from the same constants the pages use. |
| **Contact** | `/contact` | **Existing.** Rebuild. | Currently a bare form. Rebuild as the enquiry router described in the IA. |

### Summary

- **Launch-blocking (4):** Privacy, Terms, Merchant Terms, Cookies.
- **Existing, needs work (3):** Help, FAQ, Contact.
- **Deferred (6):** Security, Status, Docs hub, Careers, Press kit, DPA.

---

## 4. Implementation notes

**Single source of truth.** Header links, footer columns and the sitemap generator all read from `lib/marketing/nav.ts`. Adding `/mall-operators` to that array should update the header, the footer and `sitemap.xml` in one edit.

**Legal page component.** One `LegalDoc` layout: constrained measure (~68ch), generated table of contents from `h2`s, a prominent `Last updated` date, and a "Questions about this policy" contact block. Content authored as MDX or structured data — not hand-built JSX per document — so non-engineers can revise it.

**Do not ship placeholder legal under a real-looking footer.** A five-column premium footer that links to "being finalised ahead of launch" is worse than the current thin footer, because the visual promise is higher. Either Phase 4 lands with real content, or those four links carry a visible, dated "in review" state until it does.

**Cookie consent.** If PostHog is capturing before consent, a cookie *notice* alone is insufficient under Kenya DPA 2019 for non-essential analytics. Decide in Phase 4 between (a) a consent banner gating PostHog, or (b) configuring PostHog to a cookieless/essential-only mode. This is a legal-and-code dependency, not a copy task.

**Footer link hygiene.** Every footer link must resolve to a page with real content on the day the footer ships. No `#`, no "coming soon". Deferred items simply do not appear.

---

## 5. Open dependencies (owner: MAANTA, not the implementing agent)

1. **Registered legal entity name and address** — required for the base bar, Privacy, Terms and Merchant Terms. Nothing legal can ship without it.
2. **Monitored support email** — a real inbox, not a personal address, before it goes in the footer.
3. **Kenya ODPC data-controller registration status** — determines what the Privacy Policy can assert.
4. **Legal review of Merchant Terms** — this document governs money movement (success fees, prepaid wallet, reversals). It should not be AI-drafted and shipped unreviewed.
5. **WhatsApp support number** — confirm the one on `/help` is the intended public support channel.
6. **Social accounts** — confirm which, if any, exist and are maintained.
