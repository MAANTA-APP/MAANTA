import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Claim discipline for **D235** — founder instruction, 2026-09-03.
 *
 * The offline service worker shipped and is proven in Chromium against a static
 * harness. That is not the same as the thing the row claims, and the row was
 * closed once on that basis and had to be reopened. This file stops the same
 * overstatement reaching a document, a UI surface, or a stakeholder.
 *
 * ## The rule
 *
 * While D235 is `open` in the drift register, three claims may not appear
 * anywhere in `docs/` or `maanta-app/src/`. They are listed **verbatim in this
 * file and nowhere else** — every other document refers to "the D235 claim
 * discipline" rather than quoting them, so the guard needs no allowlist of
 * files permitted to discuss its own subject, and cannot be defeated by one.
 *
 * ## Why it is tied to the register rather than pinned
 *
 * A flat ban would have to be deleted by whoever legitimately closes D235,
 * which makes it a comment. Instead the ban reads the register: when the row
 * is genuinely closed — which requires the deployed, authenticated,
 * real-claim test in `e2e/offline-ticket.spec.ts` to have run green — the ban
 * lifts by itself. Same ratchet as `shopper-push-gate.test.ts`.
 */

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const REGISTER = path.join(REPO, "docs", "maanta-drift-register.md");
const SELF = path.join("maanta-app", "src", "lib", "__tests__", "d235-claim-discipline.test.ts");

/**
 * The closure rule, founder wording 2026-09-03, canonical.
 *
 * Kept verbatim here for the same reason as `BANNED` below: one file owns the
 * exact text, and the register must match it. The row carried this sentence
 * once and lost it before — the row's headline was still the 2026-09-02
 * finding while the state had moved on, which is how a reader takes a stale
 * claim as live.
 *
 * What it protects is one specific collapse: **"the service worker works" and
 * "a shopper can present a code offline" are different claims**, and treating
 * the first as the second is the mistake that closed this row prematurely. The
 * sentence names the layer that is proven, the layer that is not, and the exact
 * run that separates them.
 *
 * Changing the wording is a founder decision, not a copyedit — which is what
 * an exact match makes true in practice, since any rewrite fails here and has
 * to be made deliberately.
 *
 * The path is written repo-root-relative because `drift-register.test.ts`
 * resolves cited paths and rejects any that do not exist.
 */
const CLOSURE_RULE =
  "worker layer browser-proven; authenticated `/my-deals` offline ticket " +
  "behaviour not yet proven. Closure requires a credentialed deployed run of " +
  "`maanta-app/e2e/offline-ticket.spec.ts` with an active claim.";

/** The banned claims. This array is the single verbatim home for these strings. */
const BANNED = [
  "offline redemption verified",
  "counter-ready offline",
  "D235 fully closed",
] as const;

function d235IsOpen(): boolean {
  const row = readFileSync(REGISTER, "utf8")
    .split("\n")
    .find((l) => l.startsWith("| D235 |"));
  if (!row) throw new Error("D235 has no row in the drift register");
  return /^\|\s*D235\s*\|\s*open\s*\|/.test(row);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "test-results") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(md|ts|tsx|sql|json)$/.test(name)) out.push(full);
  }
  return out;
}

describe("D235 claim discipline", () => {
  it("still has a D235 row to read", () => {
    expect(() => d235IsOpen()).not.toThrow();
  });

  it("makes no claim the closing test has not earned", () => {
    if (!d235IsOpen()) {
      // Legitimately closed: the deployed, authenticated, real-claim proof ran.
      // The ban lifts on its own — nothing to assert.
      return;
    }

    const files = [
      ...walk(path.join(REPO, "docs")),
      ...walk(path.join(REPO, "maanta-app", "src")),
    ];

    const offenders: string[] = [];
    for (const f of files) {
      const rel = path.relative(REPO, f).replace(/\\/g, "/");
      if (rel === SELF.replace(/\\/g, "/")) continue;
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const claim of BANNED) {
        if (text.includes(claim.toLowerCase())) offenders.push(`${rel} → "${claim}"`);
      }
    }

    expect(
      offenders,
      "D235 is open, so these claims are not earned yet. The worker is proven in\n" +
        "Node and in Chromium against a static harness; what is NOT proven is that\n" +
        "the real /my-deals document renders a usable code offline for a signed-in\n" +
        "shopper holding a genuine claim. Run e2e/offline-ticket.spec.ts against a\n" +
        "deployed app with E2E_SHOPPER_STORAGE, close the row on that evidence, and\n" +
        "this ban lifts by itself."
    ).toEqual([]);
  });

  it("keeps the closure rule on the row, in the founder's words", () => {
    const row = readFileSync(REGISTER, "utf8")
      .split("\n")
      .find((l) => l.startsWith("| D235 |"))!;
    if (!/^\|\s*D235\s*\|\s*open\s*\|/.test(row)) return;

    // Whitespace-normalised so a reflow of the register is not a failure, but
    // the words themselves are exact.
    const flat = (t: string) => t.replace(/\s+/g, " ").trim();

    expect(
      flat(row).includes(flat(CLOSURE_RULE)),
      "the D235 row no longer carries the closure rule verbatim.\n\n" +
        "It must read:\n  " +
        CLOSURE_RULE +
        "\n\nThis is the sentence that stops the next reviewer collapsing\n" +
        '"the service worker works" into "a shopper can present a code\n' +
        'offline" — the exact mistake that closed this row prematurely on\n' +
        "2026-09-03. Rewording it is a founder decision, not a copyedit."
    ).toBe(true);
  });

  it("makes closing the row confront the condition, not just flip a word", () => {
    const row = readFileSync(REGISTER, "utf8")
      .split("\n")
      .find((l) => l.startsWith("| D235 |"))!;
    if (/^\|\s*D235\s*\|\s*open\s*\|/.test(row)) return;

    // Honest limit, stated rather than implied: no test can verify that a run
    // against a deployed app actually happened. What this CAN do is refuse a
    // one-word status flip — closing the row must name the specific proof and
    // the credentials it needs, so nobody closes it while thinking the static
    // harness was enough. That was the exact mistake made on 2026-09-03.
    expect(
      /offline-ticket\.spec\.ts/.test(row),
      "D235 is marked closed but its evidence does not name\n" +
        "e2e/offline-ticket.spec.ts. The worker suites do not close this row — only\n" +
        "the deployed, authenticated, real-claim run does."
    ).toBe(true);
    expect(
      /E2E_SHOPPER_STORAGE/.test(row),
      "D235 is marked closed without naming the authenticated session the proof\n" +
        "requires. A run without E2E_SHOPPER_STORAGE cannot have tested a real\n" +
        "shopper's real claim."
    ).toBe(true);
  });

  it("keeps the closing test present and self-skipping, so it can never fake a pass", () => {
    const spec = readFileSync(
      path.join(REPO, "maanta-app", "e2e", "offline-ticket.spec.ts"),
      "utf8"
    );
    expect(/E2E_BASE_URL/.test(spec) && /E2E_SHOPPER_STORAGE/.test(spec)).toBe(true);
    expect(
      /test\.skip\(!ready/.test(spec),
      "the closing spec no longer skips without credentials — it would report a\n" +
        "green it did not earn."
    ).toBe(true);
    expect(
      /no six-digit code on \/my-deals while ONLINE/.test(spec),
      "the spec no longer FAILS when credentials are present but the account holds\n" +
        "no active claim. Skipping there is the specific way this proof gets faked."
    ).toBe(true);
  });
});
