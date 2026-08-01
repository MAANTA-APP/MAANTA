/**
 * SCENARIO DATA — MODELLED, NOT MEASURED.
 *
 * Kept deliberately separate from `facts.ts`. Facts are verified against the live
 * product; nothing in this file is. `copy/mall-operators.md` §1 puts it plainly:
 * keeping them in different files "makes it impossible to ship one while
 * believing it is the other".
 *
 * These values describe what a node would look like at three months. MAANTA has
 * not been live for three months, and BBS Mall has not been approached, let alone
 * signed. Rendering any of it unlabelled to the party you are asking to sign is
 * the failure mode `ScenarioNotice` exists to make structurally impossible.
 *
 * **Environment-driven, not hard-coded** (`demo-mode-spec.md` §2a). This build
 * ships live to `www.maanta.app`, so production must render the honest fallback
 * while the pitch preview renders the scenario:
 *
 *   | Deployment                  | NEXT_PUBLIC_SCENARIO_MODE | Renders                      |
 *   |-----------------------------|---------------------------|------------------------------|
 *   | www.maanta.app (production) | false / unset             | Fallback copy. No figures.   |
 *   | Preview branch for pitches  | true                      | Scenario + ScenarioNotice.   |
 *
 * Defaulting to OFF when the variable is missing is the safe direction: an
 * unconfigured deployment renders the truth, never the projection.
 */
export const SCENARIO = {
  isScenario: process.env.NEXT_PUBLIC_SCENARIO_MODE === "true",
  nodeLiveSince: "May 2026",
  monthsLive: 3,
  activeShops: 121,
  liveDeals: 190,
  verifiedRedemptions: 6_400,
  /** of onboarded shops active in the last 30 days */
  merchantParticipation: "78%",
  /** shoppers redeeming more than once */
  repeatShopperRate: "41%",
  activationWeeks: 3,
} as const;

/**
 * Shopper-facing deal and shop counts must never come from here — `handoff` §6
 * is explicit. Pull them live from the product or omit the number entirely. The
 * demo figures already sitting on `/malls/bbs-mall` ("121 shops · 190 live
 * deals") are risk R11 and are not proof of anything.
 */
export type ScenarioKey = keyof typeof SCENARIO;
