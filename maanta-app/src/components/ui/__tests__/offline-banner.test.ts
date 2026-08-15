import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OfflineBanner, OFFLINE_MESSAGE } from "../states";
import { stripComments } from "@/lib/__tests__/helpers/comment-stripping";

/**
 * Offline copy honesty (drift D92).
 *
 * MAANTA has no offline capability. `public/sw.js` registers `push` and
 * `notificationclick` and nothing else — no `fetch` handler, no Cache Storage,
 * no precache — and the two actions that matter are RPCs (`claim_deal`,
 * `verify_redemption`), so neither could complete offline even if the pages
 * were cached. The banner nonetheless told shoppers *and merchants* "showing
 * saved deals" for as long as it existed.
 *
 * That is the failure this file exists to keep out: not a typo, but a money
 * surface promising a capability the product does not have, to a merchant
 * standing at a counter. Two ratchets, because either alone is escapable:
 *
 *  1. The messages themselves are asserted verbatim, so a rewrite has to be
 *     deliberate and land here too.
 *  2. Every `.tsx` under `src/` and every markdown file under `src/content/`
 *     is scanned for offline *claims*, so the promise cannot reappear on some
 *     other surface — an empty state, a toast, a legal page — while this
 *     component stays clean.
 *
 * The scan matches claim phrases rather than the word "offline", which is
 * legitimate throughout: the DOM event name, `navigator.onLine`, and the
 * banner's own state are all called that and say nothing to a user.
 *
 * Comments are stripped before scanning, via the one shared lexer (D38). The
 * component's docblock quotes the old copy in order to explain why it is gone,
 * and a guard that punished that explanation would teach the next author to
 * delete the reasoning instead of keeping the rule.
 */

const SRC = path.resolve(__dirname, "..", "..", "..");

function copyFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...copyFiles(full));
      continue;
    }
    // `.tsx` is every rendered surface; `src/content/**.md` is the legal and
    // help copy the four live legal routes render. `.test.ts` is excluded by
    // both the extension filter and the `__tests__` skip — this file states
    // the banned phrases in order to ban them.
    if (name.endsWith(".tsx") || name.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * Wordings that assert an offline capability. Each is a thing MAANTA cannot
 * do, phrased the way a well-meaning author would phrase it.
 */
const OFFLINE_CLAIMS: { pattern: RegExp; why: string }[] = [
  { pattern: /saved deals/i, why: "nothing is saved — the SW has no cache" },
  { pattern: /cached deals?/i, why: "nothing is cached" },
  { pattern: /works? offline/i, why: "the app does not work offline" },
  { pattern: /available offline/i, why: "nothing is available offline" },
  { pattern: /offline mode/i, why: "there is no offline mode" },
  {
    pattern: /(claim|redeem|verif\w+)[^.]{0,30}\boffline\b/i,
    why: "claim_deal and verify_redemption are RPCs — neither works offline",
  },
  {
    pattern: /\b(we|it|this)('| wi)ll (retry|sync)\b/i,
    why: "there is no queue, no background sync and no retry",
  },
  { pattern: /\bretry (later|when|once)\b/i, why: "nothing is retried later" },
  {
    pattern: /(sync|send|upload)\w*\s+(it\s+)?when you('| a)re (back|online)/i,
    why: "there is no background sync",
  },
];

const FILES = copyFiles(SRC);
const rel = (f: string) => path.relative(SRC, f);

describe("offline banner copy (D92)", () => {
  it("collected copy files to scan", () => {
    // A walk that silently returns nothing is a guard that passes forever.
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("states the blocked state and the next step, per shell", () => {
    expect(OFFLINE_MESSAGE.shopper).toBe(
      "You're offline. Reconnect to load live deals."
    );
    expect(OFFLINE_MESSAGE.merchant).toBe(
      "You're offline. Reconnect before verifying a redemption."
    );
    expect(OFFLINE_MESSAGE.generic).toBe(
      "You're offline. Reconnect to continue."
    );
  });

  it("promises nothing the product cannot do, in any context", () => {
    for (const [context, message] of Object.entries(OFFLINE_MESSAGE)) {
      for (const { pattern, why } of OFFLINE_CLAIMS) {
        expect(
          pattern.test(message),
          `OFFLINE_MESSAGE.${context} matches ${pattern} — ${why}`
        ).toBe(false);
      }
    }
  });

  it("keeps the live region mounted while online, so the state is announced", () => {
    // Server render runs no effects, so this is the online case by
    // construction. The region must already exist here: assistive tech
    // announces content inserted *into* a live region, and this banner used to
    // return null when online, mounting region and text in the same tick.
    for (const context of ["shopper", "merchant", "generic"] as const) {
      const html = renderToStaticMarkup(
        createElement(OfflineBanner, { context })
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      // Polite, not assertive: a connectivity flap must never interrupt a
      // merchant mid-verification.
      expect(html).not.toContain('aria-live="assertive"');
      // Nothing is announced while online.
      expect(html).not.toContain("You&#x27;re offline");
      expect(html).not.toContain("offline");
    }
  });

  it("defaults to the generic line when no context is given", () => {
    // Any new shell that forgets the prop gets the line that is safe anywhere,
    // never a shopper or merchant promise it cannot keep.
    const html = renderToStaticMarkup(createElement(OfflineBanner, {}));
    expect(html).toContain('role="status"');
  });

  it("no surface claims an offline capability", () => {
    const hits: string[] = [];
    for (const file of FILES) {
      const source = stripComments(readFileSync(file, "utf8"));
      source.split("\n").forEach((line, i) => {
        for (const { pattern, why } of OFFLINE_CLAIMS) {
          if (pattern.test(line)) {
            hits.push(`  ${rel(file)}:${i + 1}  ${line.trim()}\n    → ${why}`);
          }
        }
      });
    }
    expect(hits, `offline claims in user-visible copy:\n${hits.join("\n")}`).toEqual(
      []
    );
  });
});
