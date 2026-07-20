# Skill — Lovable Phase 1 (shopper core) build spec

Status (2026-07-20): **APPLIED and verified** at prototype commit `418425ae`.
The build initially appeared to fail (one `404 user_not_found`, one 60s
transport timeout) but the timed-out run had in fact completed server-side; a
follow-up retry confirmed it and ran `tsc --noEmit` clean. Source verified
against the guardrails (see checklist below). This doc preserves the exact spec
that produced it and the review outcome.

Verified after the run:
- New shopper routes: `search.tsx`, `shop.$id.tsx`, `my-deals.tsx`, `profile.tsx`.
- Shared components: `DealCard`, `TabBar` (amber top-indicator), `ShopperTopBar`,
  `StateChip`, `chips`, `EmptyState`, `InlineAlert`.
- `computeYouPay` still the single price helper; `verifyCode` + arrears branch
  untouched; `extrasSummary()` added and used on the claimed ticket (the full
  itemised breakdown there was replaced — the canonical correction).
- Feed renders Flash / Boosted / "Near you (ranked by verified redemptions)"
  rails; canonical KES 450 + 122 = **572** deal intact.

- **Project:** "MAANTA Live Demo" `f53ff99b-cf8c-4c71-8fc4-9e3d7b14f382`
  (workspace `owQYEhcS1nVLEQf1pv8u`), TanStack Start + Tailwind + shadcn.
- **Editor:** https://lovable.dev/projects/f53ff99b-cf8c-4c71-8fc4-9e3d7b14f382
- **Decisions:** extend the existing project (don't start over); build **Phase 1
  = shopper core** only (merchant / admin / agent are later passes).
- **Canonical sources mirrored:** the repo shopper route tree
  (`maanta-app/src/app/(shopper)/*`), `frozen-ui-overall-handoff.md` (Pass-2
  tokens), and `money-trust-engineering-guardrails.md` (pricing/fee/redemption/
  visibility behavior). The wireframe PDF `maanta-app/design/Maanta_Wireframe_System.pdf`
  is the visual reference; the code is the structural source of truth.

## Canonical correction folded into Phase 1

The guardrails/repo itemise charges **only** on deal detail; everywhere else
extras collapse to one line "Includes KES {n} in taxes and charges". The current
prototype itemises on the claimed ticket too — Phase 1 fixes that via a new
`extrasSummary(deal)` helper.

## The build prompt (send verbatim to the project agent)

> Expand THIS prototype into the full shopper flow, mirroring the MAANTA repo's
> screen structure, flow order, and component hierarchy. Faithful build, NOT a
> redesign: keep existing screens and layout, polish to the tokens below, add
> the missing shopper screens + shared navigation. Mobile-first inside the
> existing max-w-md shell.
>
> NON-NEGOTIABLE trust behavior (MAANTA guardrails are canonical):
> - Keep `computeYouPay` as the SINGLE price helper. YOU PAY = deal price + all
>   disclosed extras, identical on every surface. Don't duplicate the math.
> - ITEMISED breakdown appears ONLY on deal detail. Everywhere else extras
>   collapse to one line "Includes KES {n} in taxes and charges". FIX: the
>   claimed-ticket screen currently shows a full breakdown — replace it with that
>   one-line summary. Add `extrasSummary(deal)` to `maanta-store.ts` (returns the
>   string, or null when n===0) and use it on the claimed ticket.
> - Keep the merchant Verify screen exactly as-is: the arrears disclosure branch
>   and fee-above-the-button placement stay. Do NOT change `verifyCode`, claim
>   logic, expiry/grace, or the fee.
> - OTP stays the only bare numeral; every other number keeps a KES/min label.
>   Keep `tnum` + `mono-code` (slashed zero) on codes/amounts.
> - Every state distinguishable by icon + word, not color alone.
>
> SHOPPER SCREENS (mirror repo routes; keep existing slugs where present):
> - "/" Feed — keep the current list but organise into rails like the repo:
>   "Flash deals" (bolt), "Boosted", and "Near you" ranked by verified
>   redemptions. Keep DealCard tiles (YOU PAY + struck "Was …").
> - "/deal/$id" Deal detail — keep as-is (hero YOU PAY, the ONE itemised
>   breakdown, Claim bar). Only screen that itemises.
> - "/claimed/$id" Claimed ticket — keep the big slashed-zero OTP card, live
>   per-second countdown, and the "If the timer isn't moving, it's a screenshot"
>   note. Swap the full breakdown for the one-line `extrasSummary`. Add a subtle
>   breathing amber BORDER around the code card (border only, never a fill/second
>   action).
> - ADD "/search" — text query + filter (all/flash/standard/boosted), horizontal
>   DealCard results, clear empty state (icon + "No results for …" + "Browse
>   deals" link).
> - ADD "/shop/$id" Shop profile — merchant name, mall · floor, what3words chip,
>   "{n} verified redemptions" (check icon), that shop's live deals, "Navigate to
>   shop" link. Deal detail's merchant name links here.
> - ADD "/my-deals" — the shopper's claimed tickets from the store: each row
>   shows the deal, YOU PAY, and a state chip (Active + countdown / Redeemed /
>   Expired) with icon + word. Active rows open the claimed ticket.
> - ADD "/profile" — mock profile (name, phone, selected mall = BBS Mall) with a
>   link to My Deals and a "Merchant view" link to /merchant. No real auth.
>
> SHARED NAV + HIERARCHY (reusable components, matching the repo):
> - Bottom TabBar on all shopper screens: Feed · Search · My Deals · Profile.
>   Active tab = thin amber TOP-INDICATOR bar (not a filled pill). Icons + labels.
> - ShopperTopBar showing "BBS Mall, Nairobi" + a bell icon.
> - Extract shared components: DealCard (horizontal + compact vertical for
>   rails), StateChip (icon+word active/redeemed/expired), chips (FlashTag,
>   BoostedTag, CountdownChip, W3wChip), EmptyState, rust InlineAlert. Merchant
>   Verify stays on its own route, NOT in the shopper TabBar.
>
> VISUAL POLISH — Frozen UI (Pass 2) tokens, refine don't redesign:
> - Inter (UI), JetBrains Mono slashed-zero + tabular for codes/amounts.
> - Amber #FDBF2D = fill/border for the ONE primary action per screen and the tab
>   indicator only; disabled buttons never amber (muted/cream disabled state).
> - Surfaces: paper #FAFAF8 background, cards #FFFFFF, hairline #E5E2DA.
> - Text: ink #111111, secondary #3D3D3D, muted #5C5C5C, faint #6B6B6B.
> - Semantic: verified #0A5C34, warning rust #9A4A0C (never red/yellow), error
>   flame #8C1D18.
> - No emoji on money/loading surfaces. High contrast; no tiny/low-contrast text
>   on prices or codes.
>
> DATA: keep the in-memory store. Expand seed data so shops and rails look real
> (a few merchants, each 1–3 deals; some flash, some boosted; keep the canonical
> KES 450 + 122 → YOU PAY 572 deal). My Deals reads claims from the store. Mock
> only, no backend.
>
> Do it all in one pass, then run `tsc --noEmit` to confirm it builds. Do not
> change the merchant verify logic, the price math, or the two existing fixes.

## After the run — review checklist (against the guardrails) — all ✅ at 418425ae

1. [x] `computeYouPay` still the only price helper; YOU PAY identical on feed
   tile, deal detail, claimed ticket, my-deals row.
2. [x] Itemised breakdown ONLY on deal detail; claimed ticket now shows the
   one-line `extrasSummary`.
3. [x] Merchant Verify unchanged (arrears branch + fee-above-button intact —
   `verifyCode` in the store is byte-for-byte the same).
4. [x] OTP the only bare numeral; `tnum`/`mono-code` preserved.
5. [x] Every new state carries icon + word; ≤1 amber action per screen; disabled
   never amber; TabBar uses the amber top-indicator, not a pill.
6. [x] `tsc --noEmit` clean.

Residual polish (optional, non-blocking): the claimed-ticket card uses an
`animate-breathe` class on the amber border — confirm the keyframe is defined in
`styles.css`/tailwind config, otherwise the border is static (still correct, just
not animated).

## Later phases (not built yet)

- Phase 2 — Merchant `(app)`: dashboard, deals list/new/[id]/archived, wallet +
  [id], topup, redemptions, plan/success-fee/upgrade, staff, alerts, settings,
  support. (Verify already exists.)
- Phase 3 — Admin + Agent: approval queue, merchants/[id], redemptions, billing,
  reports, support; agent leads.
- Phase 4 — Public marketing routes.
