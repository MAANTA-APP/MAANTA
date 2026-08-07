# MAANTA — Demo Mode, Entity Details & Disclosure Spec

**Status:** Authoritative for the pre-launch build
**Date:** 2026-07-31
**Applies to:** all six marketing pages and all four legal documents

---

## 1. Entity details now filled in

Applied across all 13 documents — 61 token substitutions.

| Field | Value |
|---|---|
| Entity name | **MAANTA APP** |
| Jurisdiction | Kenya |
| Registered address | **BBS Mall, Eastleigh, Nairobi, Kenya** |
| Founder | Mohamed Elmi |
| WhatsApp / all contact links | **+44 7746 170752** → `https://wa.me/447746170752` |
| Support / press / privacy / operator email | `admin@maanta.app` |
| Document date | 31 July 2026 (DRAFT) |

**Two notes for launch, not for the demo:**

- **The WhatsApp number is a UK (+44) line.** It is fine for a demo. On a live Nairobi mall page it reads as offshore, which costs trust with exactly the merchants you are recruiting — and a personal number on a public page attracts spam permanently. Swap to a +254 business line before launch.
- **All four email roles point at one inbox.** Fine for demo. At launch, `privacy@` must match the Privacy Policy exactly, and the operator address must be a named person, because the Contact copy promises "a named person, not a queue".

---

## 2. Placeholder regulatory identifiers

You asked for placeholder CBK and related IDs so the demo looks complete. **I have deliberately made them unmistakably fake rather than realistic**, and it is worth two sentences on why.

A realistic-looking licence number — something like `CBK/PSP/2026/0147` — is the version that causes real harm. Disclaimers get cropped out of screenshots, pages get shared without context, and a fabricated regulatory authorisation presented to a merchant, a mall operator or a regulator is a serious matter in a way that fake shop counts are not. An identifier that is self-evidently a placeholder gives you the same visual completeness with none of that exposure, and it reads as *deliberate* rather than *caught out*.

**Use these values:**

| Field | Placeholder value |
|---|---|
| CBK payment services authorisation | `CBK-DEMO-0000-NOT-LICENSED` |
| ODPC data controller registration | `ODPC-DEMO-0000-NOT-REGISTERED` |
| Company registration | `CO-DEMO-0000-NOT-INCORPORATED` |
| VAT / PIN | `PIN-DEMO-0000-NOT-REGISTERED` |

Every one must render inside `<PlaceholderId>`, which applies a monospace face, a dotted underline, and a `Placeholder` badge. Never as plain text.

> **Implementation note (2026-08-07, drift D75):** this rule was unwired for the
> first weeks of the site's life — `<PlaceholderId>` had no importers and the
> privacy policy hardcoded a transposed `DEMO-ODPC-…` literal that did not even
> match the `/-DEMO-/` net below. Wired in per founder ruling: identifier tokens
> route through the component in `LegalDoc.tsx`, and the rule is now guarded by
> `maanta-app/src/lib/__tests__/prelaunch-disclosures.test.ts`.

### ✅ DECIDED 2026-07-31 — build the regulatory status block, not the CBK placeholder

MAANTA may not need CBK authorisation at all — if the merchant wallet is closed-loop prepaid credit spendable only on MAANTA's own fees, it is arguably not e-money. Showing even a placeholder CBK licence advertises a requirement you may never have. **Use the block below instead.** The `PLACEHOLDER_IDS` constants stay in the codebase for the company and PIN fields, but no CBK licence identifier is rendered anywhere.

> **Regulatory status — pre-launch**
> MAANTA APP is not yet licensed or registered with any Kenyan regulator. The merchant balance operates as closed-loop prepaid credit for MAANTA fees only, and our position under the Central Bank of Kenya's payment services regime is under review. Data protection registration with the ODPC is in progress.

A mall operator reading that sees a company that has thought about regulation. A fake licence number, once noticed, says the opposite.

**Placement:** footer legal block, and as a section in `/merchant-terms` above clause 7.

---

## 2a. ✅ DECIDED — deploying live to `www.maanta.app`

This build replaces the production site rather than sitting on a preview URL. That is workable, but it changes one thing that must be fixed in the same release.

### The problem

The `/mall-operators` copy treats **BBS Mall as a signed mall-level partner**. On a private preview sent to BBS, that is a mockup of what their page would look like. Published on `www.maanta.app`, it becomes a **public claim about a named third party's commercial relationship with you** — made before you have spoken to them.

The `ScenarioNotice` covers the *figures*. It does not cover *prose claims* — rows 1 and 7–13 of that page's register. A partner claim about a real, named, findable business is the one that matters most, because BBS are the party most likely to hear about it from someone else first.

### The fix — split scenario mode by deployment

Drive `isScenario` from an environment variable rather than hard-coding it. Production runs the honest fallback copy, which is already written. The preview deployment you send BBS runs the scenario.

```ts
// lib/marketing/scenario.ts
export const SCENARIO = {
  isScenario: process.env.NEXT_PUBLIC_SCENARIO_MODE === 'true',
  // ...values unchanged
} as const
```

| Deployment | `NEXT_PUBLIC_SCENARIO_MODE` | What renders |
|---|---|---|
| `www.maanta.app` (production) | `false` | Fallback copy everywhere. No modelled figures, no partner claim, no `ScenarioNotice`. |
| Preview branch for the BBS walkthrough | `true` | Full scenario, `ScenarioNotice` sticky at top, every figure badged `Modelled`. |

Set the variable in Vercel per-environment. One codebase, two truths, neither of them dishonest.

### Required copy edits for the production build

In `copy/mall-operators.md`, the production path must not state or imply a mall-level agreement with BBS. Use:

- `#hero` status line → the existing fallback: `Live at BBS Mall, Eastleigh · Nairobi`
- `#node` Node 0 callout → describe what a node is, without partner framing or counts
- `#stage` → the `isScenario: false` fallback paragraph, already written in that deck
- `#report` → keep, but phrase the operating report as what a pilot **includes**, not something already being delivered

Everything else on that page — the problem framing, what a node is, what the mall gets, deployment model, requirements, commercial, data governance — is true today and needs no change. **The argument was always the strong part. It survives without the numbers.**

---

## 3. Disclosure architecture — three distinct notices

These are three different things with three different placements. Collapsing them into one site-wide banner is what created risk R1 in the first place.

### 3a. `LegalDraftBanner` — legal pages only

Mounts at the top of `/privacy`, `/terms`, `/merchant-terms`, `/cookies`. Full-width, above the title, not dismissible.

> **⚠️ DRAFT — NO LEGAL STANDING**
>
> This document is an unreviewed draft, published as part of a pre-launch demonstration of MAANTA. It has **not** been reviewed by a lawyer. It does not create any rights or obligations, it is not a contract, and it must not be relied on by anyone. Registration and licence numbers shown are placeholders and do not refer to any real registration.
>
> Questions: admin@maanta.app

**Design:** bordered block, muted warning treatment, `⚠️` retained. This is the one place on the site where an alert style is correct.

**Also required:** `<meta name="robots" content="noindex" />` on all four legal routes while the banner is live. A draft legal document indexed by Google is a liability that outlives the draft.

### 3b. `PrelaunchNotice` — footer line, every page

A single line in the footer base bar, above the copyright:

> **Pre-launch demonstration.** MAANTA APP is not yet trading. Legal documents on this site are unreviewed drafts, and any registration or licence identifiers shown are placeholders.

Quiet, small, permanently present. This is what makes the whole site honest without putting a banner across the marketing pages.

### 3c. `ScenarioNotice` — pages carrying modelled figures

Unchanged from `copy/mall-operators.md` §1a. Sticky, top of page, on `/mall-operators` and anywhere else `ScenarioStat` renders.

### And separately: the existing demo-data banner

*"Demo mode — sample data for rehearsal. These shops, deals and codes are not real."*

**Still app-routes-only.** Risk R1 stands. That banner is about deal data being fake, and it destroys the marketing argument if it appears on `/shoppers` or `/`. The three notices above cover pre-launch disclosure on marketing pages properly — a footer line and page-specific banners, not a blanket warning across the hero.

---

## 4. What comes off at launch

A single checklist. Each item is one flag or one deletion.

- [ ] `SCENARIO.isScenario` → `false` — removes every modelled figure and its marker
- [ ] Replace all four placeholder identifiers with real ones, or delete the block
- [ ] Remove `LegalDraftBanner` once counsel has signed off each document
- [ ] Remove `noindex` from the four legal routes
- [ ] Remove `PrelaunchNotice` from the footer
- [ ] Swap WhatsApp to a +254 business line
- [ ] Split the four email roles
- [ ] Replace demo deal data — this is what retires the app-side demo banner
- [ ] Re-run the `{{TOKEN}}` build check

---

## 5. Build rules

1. **One flag governs the lot.** `lib/marketing/demo.ts` exports `DEMO_MODE`. `LegalDraftBanner`, `PrelaunchNotice` and `PlaceholderId` all read it. Flipping it to `false` must remove every pre-launch disclosure in one commit.
2. **`PlaceholderId` throws in development** if `DEMO_MODE` is false and a value still matches `/-DEMO-/`. A placeholder identifier cannot reach production silently.
3. **Fail the production build** if any `{{TOKEN}}` survives in rendered output.
4. **Legal routes are `noindex` while `DEMO_MODE` is true.**

```ts
// lib/marketing/demo.ts
export const DEMO_MODE = true

export const PLACEHOLDER_IDS = {
  cbk: 'CBK-DEMO-0000-NOT-LICENSED',
  odpc: 'ODPC-DEMO-0000-NOT-REGISTERED',
  company: 'CO-DEMO-0000-NOT-INCORPORATED',
  pin: 'PIN-DEMO-0000-NOT-REGISTERED',
} as const

export const ENTITY = {
  name: 'MAANTA APP',
  address: 'BBS Mall, Eastleigh',
  city: 'Nairobi',
  country: 'Kenya',
  whatsapp: '+44 7746 170752',
  whatsappLink: 'https://wa.me/447746170752',
  email: 'admin@maanta.app',
} as const
```
