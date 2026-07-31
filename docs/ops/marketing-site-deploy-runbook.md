# MAANTA — Marketing site deploy runbook

**Date:** 2026-07-31
**Audience:** Mohamed, doing this in the Vercel dashboard
**Scope:** what to set, in what order, and how to check it worked

You set the variables; this document is the checklist. Nothing here needs a
terminal — every step is the Vercel UI or a browser.

---

## 1. The one variable that matters

`NEXT_PUBLIC_SCENARIO_MODE` decides whether the site shows **modelled figures and
BBS Mall partner framing**, or the honest fallback copy.

| Environment | Value | What renders |
|---|---|---|
| **Production** (`www.maanta.app`) | **unset**, or `false` | Fallback copy. No modelled figures. **No claim that BBS Mall is a partner.** |
| **Preview** (the branch you show BBS) | `true` | Full scenario, "Preview build" banner sticky at the top, every figure badged `Modelled`. |

**Unset is safe.** The code treats anything other than the exact string `true` as
off, so a misconfigured deployment tells the truth rather than the projection.

### Setting it

1. Vercel → your project → **Settings → Environment Variables**
2. Add `NEXT_PUBLIC_SCENARIO_MODE`
3. Value `true`, and tick **Preview** only. Leave Production unticked.
4. Save, then **redeploy** — this variable is baked in at build time, so an
   existing deployment will not pick it up.

> **Do not tick Production.** That is the setting that would publish a partner
> claim about a named third party you have not approached.

---

## 2. The rest of the variables

Already set for the app, but confirm before the marketing site goes live —
`/contact` depends on the first two.

| Variable | Needed for | If missing |
|---|---|---|
| `RESEND_API_KEY` | `/contact` delivery | Form returns an error and points at WhatsApp. No silent loss. |
| `RESEND_FROM_EMAIL` | `/contact` delivery | Same. |
| `NEXT_PUBLIC_APP_URL` | `sitemap.xml`, `robots.txt`, social preview images | Falls back to `https://www.maanta.app`. Set it anyway. |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | analytics events | Events silently do nothing. Not an error, but you learn nothing. |

Check `/api/contact?healthz=1` after deploying. It returns three booleans and no
secrets — all three should be `true`.

---

## 3. After the first production deploy

Six checks, about five minutes.

- [ ] **Open `/` on your phone.** No "Demo mode — sample data for rehearsal"
      banner anywhere on the marketing pages. If you see one, stop and report it.
- [ ] **Open `/mall-operators`.** No "Preview build" banner, no `Modelled`
      badges, and nothing describing BBS Mall as a partner.
- [ ] **Send yourself a message through `/contact`.** You should get the enquiry
      at `admin@maanta.app` **and** an autoresponder at the address you used.
      If only one arrives, the autoresponder failed — the enquiry still landed.
- [ ] **Visit `/for-merchants`.** It should land you on `/merchants`. Same for
      `/for-shoppers` and `/how-it-works` → `/shoppers`.
- [ ] **Open `www.maanta.app/sitemap.xml` and `/robots.txt`.** The sitemap should
      list real URLs, not `localhost`. `robots.txt` should disallow the four
      legal routes while they are drafts.
- [ ] **PostHog → Activity.** Click an audience door on the homepage, then look
      for `marketing_audience_door_clicked`. **This has never been verified
      against a real project** — a placeholder token disables capture entirely,
      so the wiring is unit-tested but unproven end to end. If nothing arrives,
      the token is wrong or missing.

---

## 4. When the offers close

`OFFERS.openingCredit` and `OFFERS.eliteTrial` in
`maanta-app/src/lib/marketing/facts.ts` both expire **31 October 2026**.

On that date the opening-credit and Elite-trial copy **disappears from the site
automatically** — from `/merchants` and the homepage merchant band. Nothing
breaks and nothing goes stale.

To extend, change the two `expiresOn` dates. To close early, set a past date.
That is the whole change; every page reads from those constants.

---

## 5. What comes off at launch

From `demo-mode-spec.md` §4, in the order it makes sense to do them.

- [ ] Swap the WhatsApp number to a Kenyan (+254) business line — one value,
      `ENTITY.whatsapp` and `ENTITY.whatsappLink` in `lib/marketing/demo.ts`.
      Every surface reads from it.
- [ ] Split the email roles — `privacy@` in particular must match the Privacy
      Policy exactly.
- [ ] Once counsel has signed off each legal document, set `DEMO_MODE = false`
      in `lib/marketing/demo.ts`. That single flag removes the draft banner, the
      pre-launch footer line, and the `noindex` on the four legal routes.
- [ ] Replace the placeholder company and PIN identifiers with real ones, or
      delete the block. The code throws in development if a `-DEMO-` value is
      still present once `DEMO_MODE` is off, so this cannot be forgotten quietly.
- [ ] Replace demo deal data. That is what retires the app-side demo banner.

---

## 6. If something looks wrong

The two failures worth knowing how to spot:

**Demo banner on a marketing page.** It should be impossible — a test fails if it
returns — but if you see it, the cause is `app_config.demo_mode_enabled` in
Supabase, not an environment variable. It cannot be checked by reading `.env`.

**Modelled figures on production.** Means `NEXT_PUBLIC_SCENARIO_MODE` is set to
`true` on the Production environment. Remove it and redeploy.
