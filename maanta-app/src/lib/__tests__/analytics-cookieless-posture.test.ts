import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The cookieless posture is load-bearing in two directions, and D22/D88 were what
 * happened when they drifted apart silently.
 *
 * Legally: anonymous analytics stores nothing on the visitor's device (Kenya Data
 * Protection Act 2019 basis, disclosed in src/content/legal/cookie-notice.md).
 * Technically: because there is no posthog cookie, the server cannot read a
 * signed-out shopper's distinct id — so captureDealViewed attributes them as
 * "none" by design, and there is no server-side cookie-read left to go stale
 * (D88 retired the one that assumed the old default persistence; D22 was the
 * silent-drift risk it carried).
 *
 * This pins the shipped `persistence` value to that decision. If someone sets it
 * back to a cookie / localStorage mode, this fails — forcing a conscious look at
 * BOTH the cookie notice and whether server-side signed-out attribution should be
 * restored, instead of the config and the analytics posture drifting apart with
 * no runtime signal (which is exactly what D22/D88 were).
 */
const PROVIDER = path.resolve(
  __dirname,
  "..",
  "..",
  "components",
  "posthog-provider.tsx"
);

describe("anonymous analytics is cookieless", () => {
  it("ships persistence: 'memory' in the PostHog client init", () => {
    const src = readFileSync(PROVIDER, "utf8");
    expect(
      /persistence:\s*["']memory["']/.test(src),
      "posthog-provider.tsx must keep `persistence: \"memory\"` — the cookieless " +
        "posture the cookie notice discloses and that captureDealViewed's " +
        '"none" attribution depends on. Changing it means revisiting both (D22/D88).'
    ).toBe(true);
  });
});
