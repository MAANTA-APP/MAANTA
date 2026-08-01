"use client";

import { SCENARIO } from "@/lib/marketing/scenario";
import { ModelledBadge, useScenarioLabelled } from "./ScenarioNotice";

/**
 * The only way a `SCENARIO.*` value may reach the page.
 *
 * Never inline a scenario value into JSX (`copy/mall-operators.md` §1a). Every
 * modelled figure goes through here so that it cannot render without its label,
 * and so that flipping the flag falls every figure back in one step rather than
 * leaving a page half-projected.
 *
 * Two states, no third:
 *   - scenario on  → the value, followed by a `Modelled` badge
 *   - scenario off → `fallback`, or nothing at all when fallback is null
 *
 * **Throws whenever a modelled figure would render without `ScenarioNotice` as
 * an ancestor.** That turns a page with unlabelled projections into a hard
 * failure instead of something a reviewer has to notice.
 *
 * The check is deliberately *not* conditioned on `NODE_ENV`. It was, and that
 * was wrong: a preview deployment is built with `NEXT_PUBLIC_SCENARIO_MODE=true`
 * **and** `NODE_ENV=production`, which is precisely the combination where
 * modelled figures exist and the guard was disabled. An unwrapped stat rendered
 * `121` with no `Modelled` badge to the exact audience the preview build is for.
 *
 * Real production is unaffected: `NEXT_PUBLIC_SCENARIO_MODE` is unset there, so
 * the fallback returns on the line above and this is never reached. There is no
 * configuration in which a visitor sees a crash instead of honest copy.
 */
export function ScenarioStat({
  value,
  fallback = null,
  className,
  badge = true,
}: {
  /** A value from `SCENARIO`. Do not pass a literal. */
  value: string | number;
  /** What renders when scenario mode is off. `null` omits the figure entirely. */
  fallback?: React.ReactNode;
  className?: string;
  /** Set false where the badge would be repeated within one labelled group. */
  badge?: boolean;
}) {
  const labelled = useScenarioLabelled();

  if (!SCENARIO.isScenario) return <>{fallback}</>;

  if (!labelled) {
    throw new Error(
      "<ScenarioStat> rendered without <ScenarioNotice> in the tree. " +
        "Modelled figures must never render unlabelled — wrap the page in " +
        "<ScenarioNotice> or replace this stat with verified copy. " +
        "See docs/ops/copy/mall-operators.md §1a."
    );
  }

  const display = typeof value === "number" ? value.toLocaleString("en-KE") : value;

  return (
    <span className={className}>
      {display}
      {badge ? <ModelledBadge /> : null}
    </span>
  );
}
