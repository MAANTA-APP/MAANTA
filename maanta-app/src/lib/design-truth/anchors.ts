import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_ROOT } from "./load";
import type { Frame } from "./schema";

/**
 * Smoke-anchor discipline.
 *
 * A smoke anchor must name copy the shipped UI **actually renders**. The mirror
 * landed with five anchors that named copy no screen had ever contained
 * (`Verify your phone`, `Flash deals`, `Show this code`, `You can't verify
 * codes`, `Release hold`) — every one of them would have failed Layer 2 against
 * a perfectly correct screen, and a reviewer reading the contract would have
 * believed the app said something it does not.
 *
 * So the anchor is checked statically, against the frame's own `sourceFiles`,
 * before anything reaches a browser. A stale anchor fails contract review at
 * Layer 1 rather than surfacing later as a mysterious red Playwright run against
 * an env most people cannot start.
 *
 * The check is intentionally coarse — a substring match over normalised source
 * text — and its limits are worth stating rather than overselling:
 *
 *  - It cannot prove the string is **visible**. That is Layer 2's job, and it is
 *    why Layer 2 still exists.
 *  - A short one-word anchor can match an identifier rather than rendered copy:
 *    `Redeem` matches `RedeemKeypad`, `Wallet` matches `WalletPage`. So the check
 *    is strong against multi-word aspirational copy (which is the failure that
 *    actually happened, five times) and weak against single words. Prefer an
 *    anchor of three words or more where the screen offers one.
 *
 * What it does prove is that the string exists somewhere in the code that renders
 * the screen — enough to catch copy that was hoped for and never written.
 */

/** Decode the entities JSX uses for apostrophes and quotes, and flatten space. */
export function normaliseForAnchorMatch(text: string): string {
  return text
    .replace(/&apos;|&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;| /g, " ")
    // Typographic apostrophes and quotes are the same character to a reader.
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // JSX splits a sentence across lines and indentation freely.
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function anchorTextOf(frame: Frame): string | null {
  return frame.expectedHeading ?? frame.expectedAnchor ?? null;
}

/**
 * Does the frame's anchor appear in any of its `sourceFiles`?
 *
 * Returns the file that carries it, or null. A frame whose anchor lives in a
 * child component must list that component in `sourceFiles` — which is the
 * point: `sourceFiles` should name the code that renders the screen, not just
 * the route entry point.
 */
export function findAnchorSource(frame: Frame): string | null {
  const anchor = anchorTextOf(frame);
  if (!anchor) return null;
  const needle = normaliseForAnchorMatch(anchor);
  for (const rel of frame.sourceFiles) {
    let src: string;
    try {
      src = readFileSync(path.join(APP_ROOT, rel), "utf8");
    } catch {
      continue; // a missing sourceFile is reported by its own assertion
    }
    if (normaliseForAnchorMatch(src).includes(needle)) return rel;
  }
  return null;
}
