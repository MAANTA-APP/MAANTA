import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopperClockProvider } from "@/lib/use-shopper-clock";

/**
 * Renders a shopper subtree the way a shopper route does: inside the
 * server-seeded clock (D213).
 *
 * `useShopperClock` throws without a provider by design — a time-derived
 * shopper element mounted outside one would silently fall back to an unseeded
 * clock and reintroduce the hydration mismatch. That guarantee is why these
 * harnesses wrap rather than the hook falling back.
 */
export function withShopperClock(node: ReactNode, now: Date = new Date()): ReactElement {
  return (
    <ShopperClockProvider serverNow={now.toISOString()}>{node}</ShopperClockProvider>
  );
}

/** `renderToStaticMarkup` for a shopper subtree, seeded at `now`. */
export function renderShopperTree(node: ReactNode, now: Date = new Date()): string {
  return renderToStaticMarkup(withShopperClock(node, now));
}
