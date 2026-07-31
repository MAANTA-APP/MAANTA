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
 * **Throws in development if `ScenarioNotice` is not an ancestor.** That turns a
 * page with unlabelled projections into a build error instead of something a
 * reviewer has to notice. It cannot throw in production, because in production
 * `SCENARIO.isScenario` is false and the component has already returned the
 * fallback before the check is reached — the guard protects the preview build,
 * which is the only build where modelled figures exist to be mislabelled.
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

  if (!labelled && process.env.NODE_ENV === "development") {
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
