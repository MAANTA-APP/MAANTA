# Dead-code and duplication pass — 2026-08-06

One session, Builder mode. Objective: remove dead code and consolidate
duplication with **zero behavior change** — no schema, no migrations, no money
rules, no RBAC, no demo-mode, no guard weakened. Net: **−297 lines**
(56 insertions, 353 deletions across 26 files).

Method: `knip` (one-off via `npx`, not added to dependencies) produced the
candidate list; every candidate was then verified by hand with repo-wide
`grep -w` across `src/`, `scripts/`, `e2e/`, `docs/`, `supabase/` before any
edit. Verified green after the pass: `npm run typecheck`, `npm run lint`,
`npm test` (555 passed — one new test), `npm run build` including all three
post-build gates (`check:tokens`, `check:canonicals`, `check:forms` — clean).
`make db-verify` was not run: no SQL was touched.

## Deleted (zero references anywhere, including tests, scripts and docs)

| Symbol / file | Evidence |
|---|---|
| `src/components/discover-deal-card.tsx` (whole file) | 2-line re-export shim of `DealCard`; no importers |
| `src/components/install-prompt.tsx` (whole file) | `InstallPrompt` never imported; `usePwaInstall` keeps its live consumer in `(marketing)/download/download-install-panel.tsx` |
| `DealCardVertical`, `TicketCard`, `TransactionRow`, `LocationLine` in `ui/cards.tsx` | No importers. `TicketCard` was already recorded as dead in `docs/skills/ui-walkthrough-roles.md` S7 with verdict "Delete/ignore" (its in-card pulse/`text-rust` expiry would breach frozen rule R6 if ever rendered — deleting removes the latent risk). `DealCardVertical` appears only in that walkthrough's historical S1 narrative; feed tiles render `DealCard` from `ui/claude/` |
| `Chip` in `ui/claude/controls.tsx` (+ barrel entry) | Only reference was the barrel re-export; `FilterChip`/`StatusChip` are the live chips |
| `DiscoverDealCard` alias in `ui/claude/deal-card.tsx` (+ barrel entry) | Back-compat alias; only refs were the barrel and the deleted shim |
| `BackToProfileLink` deprecated alias in `controls.tsx` (+ barrel entry) | "Kept for gradual migration" — migration completed instead: `you/help/page.tsx` now uses `BackToYouLink`; `shopper-ui-polish.test.ts` renamed accordingly (same assertions, not weakened) |
| `IconClock` in `ui/icons.tsx` | No references; `icon-sizing.test.ts` only pins `setsDimension`, untouched |
| `ChipTabs` in `ui/inputs.tsx` | No references |
| `isCollectNow` in `lib/browse.ts` | `@deprecated` alias of `isLiveNow`; no references |
| `currentAuthSubjectId` in `lib/auth.ts` | No references incl. `auth-strategy-boundary.test.ts`. Auth-adjacent, called out deliberately: deleting an uncalled helper changes no gate; `currentClerkUserId`/`currentSupabaseAuthUserId` paths untouched |
| `nodeShortLabel` in `lib/nodes.ts` | No references |
| `unresolvedTokens` in `lib/marketing/legal-docs.ts` | No references; the token gate is `scripts/check-tokens.mjs`, which is independent and still chained into `npm run build` (guarded by `build-gates.test.ts`) |
| `fxProviders()` in `lib/fx/index.ts` | No references; `DEFAULT_CHAIN` and injectable `chain` param remain |
| `resetServiceClientForTests` in `lib/supabase/service.ts` | Test-only helper referenced by no test |
| Duplicate named export in `app/sign-out-button.tsx` | Both importers use the default import; the redundant named export dropped, component unchanged |

## Un-exported (used inside their module only — `export` keyword removed, code unchanged)

- `lib/browse.ts`: `ENDING_SOON_HOURS`, `isCollectToday`
- `lib/deal-expiry.ts`: `formatExpiresIn`, `formatGraceLeft`
- `lib/contact.ts`: `CONTACT_TOPIC_SLUGS`, `topicLabel`, `CONTACT_MESSAGE_MAX`, `CONTACT_FIELD_MAX`
- `lib/pricing.ts`: `MAX_CHARGES`, `MAX_CHARGE_LABEL_LENGTH`, `MAX_FIXED_CHARGE_KES`, `MAX_PERCENT_CHARGE` — money file, values and `parseCharges` behavior identical; `pricing.test.ts` and `success-fee-copy` guards unchanged and green
- `components/marketing/sections.tsx`: `CtaPrimary`, `CtaSecondary`
- `components/marketing/LegalDoc.tsx`: `extractHeadings`

## Consolidated (behavior-identical refactor)

**Extras summary line.** "Includes KES N in taxes and charges" — frozen copy
per the brief §4 — was inlined at 7 JSX sites while `extrasSummary()` in
`lib/pricing.ts` (the self-declared single source) was referenced only by its
test. Added `extrasLine(total)` to `lib/pricing.ts`; `extrasSummary` now
delegates to it, and all remaining render sites use it:
`ui/cards.tsx` (`DealCardHorizontal`), `ui/claude/deal-card.tsx`,
`(shopper)/deals/[id]`, `(shopper)/tickets/[id]`, merchant `new-deal-wizard`
(×2). String output is character-identical (`toLocaleString("en-KE")`,
unchanged); conditional gating (`extras > 0`) stayed at each call site.
New test in `pricing.test.ts` pins `extrasLine` to `extrasSummary` exactly.

## Deliberately left in place (verified unused, but not safe to delete here)

| Symbol | Why left |
|---|---|
| `PlaceholderId` (`components/marketing/PlaceholderId.tsx`) | Governance surface. `lib/marketing/demo.ts` states every `PLACEHOLDER_IDS` value "must render through `<PlaceholderId>`" (demo-mode-spec §2), yet nothing imports it — the values flow through `legal-docs.ts` token substitution as plain markdown text instead. That is a doc/code disagreement, not dead code to silently remove. **Follow-up: a drift-register row is warranted** (not added here — this pass was instructed not to edit the register) |
| `REGULATORY_STATUS` (`lib/marketing/demo.ts`) | Its comment says "rendered instead" of any licence id, but nothing renders it; same disclosure-drift cluster as above. Legal wording, founder-adjacent — left |
| `TOPUP_METHOD` (`lib/marketing/facts.ts`) | A recorded fact (resolves Phase 0 Q13) with a docs-side contract on `copy/merchants.md#wallet`; facts registry is a governance surface |
| `requireFounderApi` (`lib/founder.ts`) | Listed in the live permissions matrix `docs/skills/role-permissions.md`; RBAC symmetry with `requireAdminApi`. No caller today, but deleting narrows a documented API |
| `CodeDisplay` (`ui/overlays.tsx`) | Referenced in `docs/skills/frozen-ui-overall-handoff.md`; 6-digit-code surface (frozen rule 6) |
| `readStrategy`, `isAuthJsAuth` (auth strategy modules) | Referenced only by `auth-strategy-boundary.test.ts` — part of the guarded strategy surface (D59 territory) |
| `LEGAL_ROUTES` (`lib/marketing/nav.ts`) | Consumed by `scripts/check-canonicals.mjs` (a build gate); knip false positive |
| `e2e/golden-path.spec.ts`, `playwright.config.ts`, `public/sw.js`, `design/claim-and-till/support.js` | knip false positives: Playwright entry points, service worker registered by URL string (`navigator.serviceWorker.register("/sw.js")`), design artifact |
| ~25 unused exported *types* (knip list) | Type-only, zero runtime weight; several document API shapes. Churn > value |

## Env vars and commented-out code

- `.env.example` vs `process.env` reads: only `SENTRY_AUTH_TOKEN` is declared
  but never read in source — it is consumed by the Sentry build plugin at
  build time, so it is not dead. No other declared-but-unread vars.
- No commented-out "almost code" blocks found in `src/`.

## Do-later (found, deliberately not done — each fails the bit-for-bit bar)

1. **`formatKes` adoption.** 41 call sites inline
   `KES ${x.toLocaleString("en-KE")}` while `lib/ui.ts#formatKes` exists — but
   `formatKes` applies `Math.round()` and the inline sites do not, so a blind
   swap is not output-identical for non-integer input. Needs a decision on
   rounding (probably: prove all inputs are whole KES, then swap file-by-file
   with render assertions).
2. **`escapeHtml` duplication** (`lib/contact.ts` vs `lib/waitlist-emails.ts`):
   the waitlist copy also escapes `'` → `&#39;`. Merging changes one side's
   email HTML output. Pick the superset escape, note the (harmless) output
   change, then consolidate.
3. **`timeLeftLabel` (`lib/ui.ts`) vs `formatExpiresIn` (`lib/deal-expiry.ts`)**:
   similar countdown logic, deliberately different copy ("2h 14m left" vs
   "Expires in 2h 14m") on different surfaces. Only consolidate behind a shared
   duration-parts helper if it stays copy-preserving.
4. **PlaceholderId / REGULATORY_STATUS disclosure drift** (above) — needs a
   founder/owner decision and a drift-register row, then either wiring the
   component in or retiring the spec sentence.

## Docs made stale by this pass (narrative reports, not retro-edited)

`docs/skills/ui-walkthrough-roles.md` (S7 "dead TicketCard" — now deleted, so
resolved in code) and its S1/S4 references to `DealCardVertical`/`PlanChip` on
feed tiles describe components that no longer exist. Dated session reports;
left as historical record per repo convention.
