import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walk, relToSrc } from "./helpers/source-files";
import { stripCommentLines } from "./helpers/comment-stripping";
import { DEMO_MODE } from "@/lib/marketing/demo";
import { OG_STATUS_LINE } from "@/lib/marketing/og";

/**
 * While the site says it is pre-launch, no surface may say it is trading.
 *
 * Every marketing page carries `PrelaunchNotice` in its footer: "Pre-launch
 * demonstration. MAANTA is not yet trading." Two surfaces contradicted it, and
 * both are surfaces the notice cannot reach, because they render **before** the
 * page does:
 *
 *  - the OG image footer ("Live at BBS Mall, Eastleigh · Nairobi"), which is what
 *    a WhatsApp forward shows — and WhatsApp is how these pages get shared here;
 *  - the root metadata description ("Now live at BBS Mall, Eastleigh"), which is
 *    the search-result snippet.
 *
 * `demo-mode-spec.md` §2a does sanction the "Live at" string, but as the `#hero`
 * status line on `/mall-operators` — on the page, above the footer that qualifies
 * it. Reading the sanction as covering any surface is what let it onto these two.
 * Raised independently by two reviewers on PR #153.
 *
 * This asserts the invariant rather than the strings: whatever those surfaces
 * say, they must not assert trading while `DEMO_MODE` is true.
 */

const SRC = path.resolve(__dirname, "..", "..");

/** Phrasings that assert MAANTA is already trading. */
const TRADING = /\b(now live at|live at|already live|trading now|open for business)\b/i;

describe("pre-launch consistency", () => {
  it("keeps the prelaunch notice and DEMO_MODE in step", () => {
    // If this fails, the rest of the file is asserting nothing.
    const notice = readFileSync(
      path.join(SRC, "components", "marketing", "PrelaunchNotice.tsx"),
      "utf8"
    );
    expect(notice).toContain("not yet trading");
    expect(notice).toContain("DEMO_MODE");
  });

  it("does not assert trading in the OG status line while pre-launch", () => {
    if (!DEMO_MODE) return;
    expect(
      TRADING.test(OG_STATUS_LINE),
      `The OG image says "${OG_STATUS_LINE}" while the site footer says MAANTA is ` +
        `not yet trading. An OG image has no footer — it is the surface the ` +
        `disclosure cannot follow.`
    ).toBe(false);
  });

  it("does not assert trading in the root metadata description while pre-launch", () => {
    if (!DEMO_MODE) return;
    const layout = stripCommentLines(
      readFileSync(path.join(SRC, "app", "layout.tsx"), "utf8")
    ).join("\n");
    // Only the pre-launch branch is checked: the file legitimately carries the
    // post-launch string too, behind the DEMO_MODE ternary.
    const preLaunchBranch = layout.split("DEMO_MODE")[1]?.split(":")[0] ?? "";
    expect(
      TRADING.test(preLaunchBranch),
      "The pre-launch metadata description must not claim MAANTA is live — it is " +
        "the search-result snippet, shown before the page and its footer."
    ).toBe(false);
  });

  it("keeps 'Live at' out of every marketing page body while pre-launch", () => {
    if (!DEMO_MODE) return;
    const offenders: string[] = [];
    for (const f of walk(path.join(SRC, "app", "(marketing)"), [".tsx"]).concat(
      walk(path.join(SRC, "components", "marketing"), [".tsx"])
    )) {
      stripCommentLines(readFileSync(f, "utf8")).forEach((line, i) => {
        // Skip the constant's own definition and the ternary that gates it.
        if (/DEMO_MODE|OG_STATUS_LINE/.test(line)) return;
        if (/\b(now live at|already live)\b/i.test(line)) {
          offenders.push(`${relToSrc(SRC, f)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(
      offenders,
      `No marketing surface may claim MAANTA is already live while the footer ` +
        `says it is not yet trading:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
