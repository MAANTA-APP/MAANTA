"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { SCENARIO } from "@/lib/marketing/scenario";

/**
 * Scenario marker — `copy/mall-operators.md` §1a.
 *
 * The marker and the figures share one flag, so there is no state in which
 * modelled numbers render unlabelled. That guarantee is structural rather than
 * conventional: this component is a **wrapper**, and `ScenarioStat` reads the
 * context it provides. A stat placed on a page that forgot the notice has no
 * context to read and throws in development.
 *
 * Wrapping rather than sitting as a sibling is the point. A sibling notice can be
 * deleted while the stats stay; a wrapper cannot, because deleting it removes the
 * provider and the page stops building.
 *
 * When `SCENARIO.isScenario` is false — which is production, since
 * `NEXT_PUBLIC_SCENARIO_MODE` is unset there — this renders children with no band
 * and no provider. Any `ScenarioStat` beneath it falls back to its `fallback`
 * prop, so the honest copy takes over without a second code path.
 */
const ScenarioContext = createContext(false);

/** True when a `ScenarioNotice` is an ancestor AND scenario mode is on. */
export const useScenarioLabelled = () => useContext(ScenarioContext);

export function ScenarioNotice({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!SCENARIO.isScenario) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Production path: no band, no provider, no marker. Stats fall back.
  if (!SCENARIO.isScenario) return <>{children}</>;

  return (
    <ScenarioContext.Provider value={true}>
      {/*
        Calm and matter-of-fact — a statement of method, not a warning. Neutral
        surface with a hairline rule; deliberately not amber, not red, and not
        alert-styled. #FDBF2D stays reserved for CTAs and live-status.
        Not dismissible: a marker you can close is a marker that gets closed
        thirty seconds into a walkthrough.
      */}
      <div
        role="note"
        aria-label="Preview build notice"
        className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80"
      >
        <div
          className={`mx-auto max-w-6xl px-5 text-secondary transition-all ${
            scrolled ? "py-2.5" : "py-3"
          }`}
        >
          {/* Compact on mobile, and after scroll on any width. */}
          <p className={`text-[13px] leading-snug ${scrolled ? "block" : "hidden sm:block"}`}>
            <strong className="font-semibold text-ink">Preview build.</strong>{" "}
            {scrolled ? (
              <span>Figures modelled, not measured</span>
            ) : (
              <span>
                Figures on this page are modelled to show what a live node looks like at
                three months. They are not measured results.
              </span>
            )}
          </p>
          <p className={`text-[13px] leading-snug ${scrolled ? "hidden" : "block sm:hidden"}`}>
            <strong className="font-semibold text-ink">Preview build</strong> — figures
            modelled, not measured
          </p>
        </div>
      </div>
      {children}
    </ScenarioContext.Provider>
  );
}

/**
 * The `Modelled` badge shown beside each scenario figure. Small caps, hairline
 * border, neutral foreground, no fill — it labels a number without shouting at
 * the reader.
 */
export function ModelledBadge() {
  return (
    <span className="ml-1.5 inline-flex shrink-0 items-center rounded border border-line px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-muted">
      Modelled
    </span>
  );
}
