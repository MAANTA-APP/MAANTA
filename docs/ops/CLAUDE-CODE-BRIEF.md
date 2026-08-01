# Claude Code — Implementation Brief

Paste the block below into Claude Code or Cursor, in the `MAANTA-APP/MAANTA` repo root, after copying `docs/` into the repo.

---

```
Read these first, in this order. Do not write code until you have.

1. docs/ops/website-handoff.md      — index, Phase 0, constants, blockers
2. docs/ops/demo-mode-spec.md       — entity details, placeholder IDs, disclosure banners
3. docs/ops/website-expansion-plan.md — routes, components, risks, sequence
4. docs/ops/website-ia.md           — sitemap, page IA, verified product facts
5. docs/ops/website-footer-legal-docs-plan.md — footer architecture

Then, per page you build: docs/ops/copy/<page>.md
Legal page content: docs/legal/*.md

CONTEXT
We are turning the MAANTA landing page into a six-page marketing site:
Home, Shoppers, Merchants, Mall Operators, About, Contact — plus a robust
footer and four legal pages. This is a PRE-LAUNCH DEMONSTRATION BUILD.
MAANTA APP is not yet trading. Legal documents are unreviewed drafts.
Regulatory identifiers are placeholders. All of that must be disclosed
on the site exactly as demo-mode-spec.md sets out.

DECISIONS ALREADY MADE — do not re-litigate these.
1. This ships LIVE to www.maanta.app, replacing the current site.
   Because of that, scenario mode is environment-driven:
     NEXT_PUBLIC_SCENARIO_MODE=false  on production
     NEXT_PUBLIC_SCENARIO_MODE=true   on the preview branch used for pitches
   Production must render the fallback copy — no modelled figures and NO
   claim that BBS Mall is a signed partner. See demo-mode-spec.md §2a. This
   is not optional: it is a public claim about a real third party.
2. No CBK licence identifier is rendered anywhere. Build the "Regulatory
   status — pre-launch" block instead. demo-mode-spec.md §2.
3. You ARE authorised to change code outside app/(marketing):
   - create /api/contact and wire Resend
   - move/scope the demo-data banner (root layout)
   - adjust Clerk middleware matchers for public marketing routes
   Keep each of those in its own commit with a clear message.

The copy is written. Do not rewrite it. Where a copy deck gives a heading
or a sentence, use it verbatim. Where it gives guidance in a blockquote,
that is instruction to you, not text for the page.

ORDER OF WORK — do not skip ahead, one PR per phase.

PHASE 0 — verification only, no code.
Answer the 14 questions in website-handoff.md §3 and paste the answers into
the PR description. Question 5 (where the demo banner is mounted) is the
most important thing in this brief.

Also fix the three live bugs in website-handoff.md §2 — the missing
/api/contact endpoint is the urgent one. Verify where the current contact
form POSTs. If nowhere, wire it: form -> /api/contact -> Resend -> inbox,
plus an autoresponder. Resend is already connected to the account.

PHASE 1 — shared shell.
- app/(marketing)/layout.tsx
- components/marketing/SiteHeader.tsx  (audience nav + mobile sheet)
- components/marketing/SiteFooter.tsx  (5 columns + legal base bar)
- lib/marketing/nav.ts, facts.ts, scenario.ts, demo.ts
  (starter code in website-handoff.md §6 and demo-mode-spec.md §5)
- components/marketing/PrelaunchNotice.tsx  (footer line, every page)
- components/marketing/LegalDraftBanner.tsx (legal pages only)
- components/marketing/PlaceholderId.tsx
- components/marketing/ScenarioNotice.tsx + ScenarioStat.tsx
- SCOPE THE EXISTING DEMO-DATA BANNER TO APP ROUTES ONLY.
  It currently renders on marketing pages saying the deals are not real,
  which contradicts the entire argument of those pages. This is risk R1
  and it is the highest-leverage change in the project.

PHASE 2 — routes, redirects, discoverability.
- Create /shoppers, /mall-operators, /merchants/join
- MOVE the lead form to /merchants/join and VERIFY submissions land
  BEFORE repointing /merchants. Do not dark-route merchant acquisition.
- 301 map in next.config.js (website-handoff.md §5), permanent: true
- app/sitemap.ts and app/robots.ts — neither exists today, generate from nav.ts
- noindex on /privacy, /terms, /merchant-terms, /cookies while DEMO_MODE

PHASE 3 — pages, one PR each, in this order:
Home -> Merchants -> Shoppers -> Mall Operators -> About -> Contact
/contact must handle ?topic= BEFORE /mall-operators ships, because that
page's primary CTA points at /contact?topic=mall-operator.

PHASE 4 — legal pages from docs/legal/*.md, on a shared LegalDoc layout
with LegalDraftBanner mounted.

PHASE 5 — responsive, a11y, metadata/OG, Lighthouse.

HARD RULES
- Every number renders from lib/marketing/facts.ts. Never inline a price.
- Every modelled figure renders through <ScenarioStat>. ScenarioStat throws
  in dev if ScenarioNotice is not mounted.
- Every placeholder ID renders through <PlaceholderId>. It throws in dev if
  DEMO_MODE is false and the value still contains "-DEMO-".
- FAIL THE PRODUCTION BUILD if any {{TOKEN}} survives in rendered output.
- No footer link may point at "#" or a "coming soon" page. If it has no
  content, it does not appear.
- Mobile first at 360px. The shopper audience is almost entirely mobile.
- #FDBF2D on CTAs and live-status only. Broad yellow reads flashy, not premium.
- Do not publish the claims listed in website-handoff.md §9. They are held
  pending legal or product decisions.

WHAT NOT TO DO
- Do not rewrite the copy.
- Do not invent statistics. If a number is not in facts.ts or scenario.ts,
  it does not go on the page.
- Do not add a testimonials section, a logo wall, or a founder photo we
  do not have. Empty social proof is worse than none.
- Do not delete old routes. They 301.

Start with Phase 0. Report the 14 answers before writing any code.
```

---

## Copying the docs into the repo

```bash
# from the repo root
mkdir -p docs/ops/copy docs/legal
# copy the 15 markdown files from this handoff into those directories
git checkout -b feat/website-expansion
git add docs && git commit -m "docs: website expansion plan, IA, copy decks and legal drafts"
```

## Suggested PR sequence

| PR | Contents |
|---|---|
| 1 | `docs/` + Phase 0 answers in the description + the three bug fixes |
| 2 | Phase 1 — shell, constants, disclosure components, demo-banner scoping |
| 3 | Phase 2 — routes, redirects, sitemap, robots |
| 4–9 | One page each, in the stated order |
| 10 | Phase 4 — legal pages |
| 11 | Phase 5 — responsive and polish |
