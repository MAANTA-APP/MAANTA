import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Guard for the hero device mockup — drift row **D50**.
 *
 * `HeroShot` is the one place on the marketing site where synthetic deal rows
 * render. Every other marketing surface is held to "no invented content",
 * and the demo-data banner is deliberately kept *off* marketing routes on the
 * premise that no synthetic rows appear there. This component is the founder-
 * approved exception (2026-08-01), and the thing that keeps it honest is a
 * visible disclosure sitting next to it.
 *
 * That disclosure is one line of JSX. Nothing about the build, the type system
 * or the other guards notices if it is deleted while the invented shops stay —
 * and the result is fabricated merchant offers presented as real, in the hero of
 * the page that argues the product works. That is the regression this file
 * exists to catch, and it is why the row could be opened with a guard named
 * rather than `no guard:`.
 *
 * ## What this does not check, stated rather than left to be found
 *
 * **This reads source, not rendered HTML.** CLAUDE.md asks new marketing guards
 * to assert against `.next/server/app/**`, because a source-only guard is how
 * D41 shipped — a `/contact` form present in JSX and absent from server HTML.
 * That is the right rule and it cannot be followed here: `.github/workflows/ci.yml`
 * runs `npm run test` *before* `npm run build`, so `.next/` does not exist when
 * this file executes in CI. A guard that skipped when the directory is missing
 * would pass vacuously on every CI run, which is worse than a source guard that
 * is honest about its scope.
 *
 * The exposure is narrow and worth naming: `HeroShot` is a server component with
 * no `useSearchParams`, no `Suspense` boundary and no client hook, so it has no
 * mechanism to render in the browser but not on the server — which is precisely
 * the mechanism that produced D41. If it ever gains one, this guard stops being
 * sufficient and the assertion has to move to built output.
 *
 * Comments are stripped before scanning through the shared lexer (D38): a
 * disclosure that exists only inside a `/* … *\/` block is not a disclosure, and
 * this file's own docblock quotes the string it looks for.
 */

const SRC = path.resolve(__dirname, "..", "..");
// The first three illustrated surfaces (HeroShot on Home, the shopper and
// merchant walkthrough rails) were retired by design board 1 on 2026-09-05
// (founder ruling: as drawn). The help panels are the one that remains, and
// the grace-period sweep below is unrelated to illustrations but lives here.

const code = (f: string) => stripComments(readFileSync(f, "utf8"));

/**
 * Guard for the fourth illustrated surface — the `/help` failure states.
 *
 * Different job from the other three. These draw what a shopper sees when
 * something has gone wrong, and the thing that must survive is the reassurance:
 * an expired code with no red on it, and an under-review notice saying nothing is
 * needed from them. Strip either and the page shows two error screens with no
 * answer, which is worse than showing nothing.
 */
describe("help failure-state illustrations (D50, fourth surface)", () => {
  const HELP_PANELS = path.join(SRC, "components", "marketing", "HelpStatePanels.tsx");
  const HELP = path.join(SRC, "app", "(marketing)", "help", "page.tsx");
  const HELP_CONTENT = path.join(SRC, "components", "marketing", "help-content.tsx");

  it("renders a visible illustration disclosure", () => {
    expect(/Illustration\s*·\s*example code/.test(code(HELP_PANELS))).toBe(true);
  });

  it("describes both states, and the invented code, to assistive tech", () => {
    const src = code(HELP_PANELS);
    expect(src).toContain('aria-hidden="true"');
    expect(/sr-only/.test(src) && /invented example/.test(src)).toBe(true);
  });

  it("keeps the reassurance, which is the whole point", () => {
    const src = code(HELP_PANELS);
    expect(src).toContain("Nothing is needed from you right now");
    expect(src).toContain("72 hours");
  });

  it("shows failure without red, and review in rust — frozen rules 4 and 5", () => {
    const src = code(HELP_PANELS);
    // Failure is greyscale-legible: chip icon + word, struck code. Not an error.
    expect(src, "an expired code is not an error state").not.toContain("text-flame");
    expect(src, "warning is rust, never red or yellow").toContain("border-rust");
  });

  it("shows no money on a page about things going wrong", () => {
    const src = code(HELP_PANELS);
    expect(src).not.toContain("formatKes");
    expect(src).not.toContain("KES");
  });

  it("adds no amber, so /help keeps one amber action", () => {
    // The real screens end in amber CTAs; the panels crop them deliberately, so
    // the page's single amber action stays its WhatsApp button.
    expect(code(HELP_PANELS)).not.toContain("bg-brand");
  });

  it("stays out of the shared FAQ component, which the app shell also renders", () => {
    // (shopper)/you/help renders HelpFaqs. A signed-in shopper should open the
    // real screen, not look at a drawing of it.
    expect(code(HELP)).toContain("<HelpStatePanels />");
    expect(
      code(HELP_CONTENT),
      "HelpStatePanels must not leak into the app shell via HelpFaqs"
    ).not.toContain("HelpStatePanels");
  });
});

describe("grace period is single-sourced, like the success fee", () => {
  const FACTS_FILE = path.join(SRC, "lib", "marketing", "facts.ts");

  it("re-exports DEAL_GRACE_MINUTES rather than redeclaring the number", () => {
    // `successFeeKes` re-exports SUCCESS_FEE_KES and pricing-copy.test.ts fails on
    // a second declaration. `graceMinutes` carried a literal 15 while
    // DEAL_GRACE_MINUTES in @/lib/deal-expiry is what the expiry logic actually
    // computes with — so a grace change moved behaviour and left the copy behind.
    const src = code(FACTS_FILE);
    expect(src).toContain("DEAL_GRACE_MINUTES");
    expect(src).toContain("graceMinutes: DEAL_GRACE_MINUTES");
    expect(src, "no literal grace value in FACTS").not.toMatch(/graceMinutes:\s*\d/);
  });
});

describe("no surface restates the grace period as prose (D113)", () => {
  // `DEAL_GRACE_MINUTES` in @/lib/deal-expiry is what the expiry logic computes
  // with. Any other source that spells the number out is a copy that a grace
  // change would silently leave behind — telling a shopper at the claim screen,
  // or a merchant in their support FAQ, something the product no longer does.
  //
  // Comments are stripped through the shared lexer (D38) before scanning. That is
  // not a loophole: `deal-expiry.ts` documents its own constant, `chips.tsx`
  // explains a countdown, and two marketing docblocks narrate this very
  // correction — prose in a comment cannot mislead a user, and a guard that
  // failed on its own explanation would be deleted rather than obeyed.
  const APP = path.resolve(SRC, "app");
  const COMPONENTS = path.resolve(SRC, "components");

  function sourcesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        out.push(...sourcesUnder(full));
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("spells 15 nowhere in rendered copy across app/ and components/", () => {
    const offenders = [...sourcesUnder(APP), ...sourcesUnder(COMPONENTS)].filter((f) =>
      /15[\s-]minutes?/.test(code(f))
    );
    expect(
      offenders.map((f) => path.relative(SRC, f)),
      "interpolate DEAL_GRACE_MINUTES instead of writing the number:\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  it("has the four swept surfaces importing the constant", () => {
    const swept = [
      path.join(APP, "(shopper)", "deals", "[id]", "claim-flow.tsx"),
      path.join(APP, "(shopper)", "tickets", "[id]", "page.tsx"),
      path.join(APP, "merchant", "(app)", "deals", "[id]", "page.tsx"),
      path.join(APP, "merchant", "(app)", "support", "page.tsx"),
    ];
    for (const f of swept) {
      expect(code(f), `${path.relative(SRC, f)} should read the constant`).toContain(
        "DEAL_GRACE_MINUTES"
      );
    }
  });
});
