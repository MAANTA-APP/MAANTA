import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walk, relToSrc } from "./helpers/source-files";
import { stripCommentLines } from "./helpers/comment-stripping";
import { DEMO_MODE } from "@/lib/marketing/demo";
import { OG_STATUS_LINE } from "@/lib/marketing/og";
import { SITE_DESCRIPTION } from "@/lib/marketing/live-claims";
import manifest from "@/app/manifest";

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
const PUBLIC = path.resolve(SRC, "..", "public");

/** Phrasings that assert MAANTA is already trading. */
const TRADING =
  /\b(now live at|live at|already live|is live in|trading now|open for business)\b|live now\s*·/i;

/**
 * The screaming-caps status badge, matched case-sensitively **on purpose**.
 *
 * "Live now" is also the name of a deal filter chip on `/shoppers`, and a deal
 * being live is ordinary product vocabulary that says nothing about whether the
 * company is trading. Case is what separates the two: the badge shouts, the
 * chip does not.
 */
const TRADING_BADGE = /\bLIVE NOW\b/;

/**
 * The same claim made without the word "live" — drift **D90**.
 *
 * D87 removed twenty-one claims that all used "live", and the site went on
 * asserting in the present tense that MAANTA was operating at BBS Mall:
 * "where the product is run in person", "the shops there are the ones
 * publishing deals today", "see what the shops in your mall are offering right
 * now". So a green guard on `TRADING` did not mean the site had stopped
 * claiming to trade — which is the whole reason this second pattern exists.
 *
 * Two shapes are covered. First, present-tense assertions that MAANTA or its
 * merchants are operating **now**. Second, `usually happens` and its
 * neighbours, which claim a norm drawn from operating history: there is none,
 * because the pilot has not run, and a frequency claim is a performance claim
 * wearing ordinary clothes.
 *
 * Kept deliberately narrow of ordinary product vocabulary. A deal being live,
 * a mall "going live" as a future event, a merchant's till working "the way it
 * does today", and the "operating report" product name are all legitimate and
 * must not trip this — a guard that cries wolf gets narrowed by the next person
 * in a hurry, and then it guards nothing.
 */
const OPERATING_CLAIM = new RegExp(
  [
    String.raw`\brun in person\b`,
    String.raw`\bis (?:currently )?(?:operating|running|trading)\b`,
    String.raw`\bpublish(?:ing)? deals (?:today|now|right now)\b`,
    String.raw`\boffering right now\b`,
    String.raw`\busually (?:happens|takes|follows)\b`,
    String.raw`\bfirst deal today\b`,
  ].join("|"),
  "i"
);

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

  /**
   * Asserts the value, not the text of the file that used to hold it.
   *
   * This previously read `layout.tsx` and split it on `DEMO_MODE` to isolate the
   * pre-launch branch of a ternary. That worked while the ternary lived there and
   * would have gone **vacuously green** the moment it moved — the split would
   * have found the import line instead and matched nothing. The ternary has now
   * moved to `live-claims.ts` (D138), so the check reads the resolved constant
   * both surfaces actually render.
   */
  it("does not assert trading in the site description while pre-launch", () => {
    if (!DEMO_MODE) return;
    expect(
      TRADING.test(SITE_DESCRIPTION),
      `The site description says "${SITE_DESCRIPTION}" while the footer says ` +
        "MAANTA is not yet trading. It is the search-result snippet AND the " +
        "web-manifest description, both shown before any page and its footer."
    ).toBe(false);
    // Still the root metadata description, not just a constant nobody uses.
    expect(
      stripCommentLines(readFileSync(path.join(SRC, "app", "layout.tsx"), "utf8")).join("\n")
    ).toContain("description: SITE_DESCRIPTION");
  });

  /**
   * The web manifest — drift **D138**, and the reason `public/` is walked below.
   *
   * `public/manifest.webmanifest` said "Now live at BBS Mall, Eastleigh" for as
   * long as it did because a static JSON file cannot read `DEMO_MODE`, and
   * because this suite's coverage was defined as two `.tsx` directories. The
   * manifest is generated now, so the check reads what is actually served: the
   * Android install prompt renders this description at the moment of install, on
   * a surface `PrelaunchNotice` provably cannot follow.
   */
  it("does not assert trading anywhere in the generated web manifest", () => {
    if (!DEMO_MODE) return;
    const m = manifest();
    const strings = [m.name, m.short_name, m.description].filter(
      (v): v is string => typeof v === "string"
    );
    const offenders = strings.filter((v) =>
      [TRADING, TRADING_BADGE, OPERATING_CLAIM].some((p) => p.test(v))
    );
    expect(
      offenders,
      "The manifest description is what the Android install prompt shows. It " +
        "must come from lib/marketing/live-claims.ts and be gated like every " +
        `other claim site:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  /**
   * Matched against the whole file with whitespace collapsed, not line by line.
   *
   * Line-by-line was a real hole, and it hid a real claim. JSX prose wraps at
   * the print width, so `/mall-operators` carried "where the product is being
   * run in\n              person" — the phrase split across lines 228 and 229.
   * Every pattern here missed it, a `grep` for the phrase missed it, and it was
   * caught only by scanning the built HTML, where the text is reassembled.
   *
   * A guard whose result depends on where Prettier happened to wrap a sentence
   * is not a guard. Collapsing whitespace first costs the precise line number —
   * hence the matched text in the message instead — and buys a check that reads
   * the prose the way a visitor does. Same lesson as D38: audit the artifact,
   * not the text that produces it.
   */
  it("keeps trading and present-tense operating claims out of marketing bodies", () => {
    if (!DEMO_MODE) return;
    const offenders: string[] = [];

    for (const f of walk(path.join(SRC, "app", "(marketing)"), [".tsx"]).concat(
      walk(path.join(SRC, "components", "marketing"), [".tsx"])
    )) {
      // Drop the lines that legitimately name the gate, so the constants that
      // hold the post-launch wording do not report themselves.
      const kept = stripCommentLines(readFileSync(f, "utf8")).filter(
        (line) => !/DEMO_MODE|OG_STATUS_LINE/.test(line)
      );
      const flat = kept.join(" ").replace(/\s+/g, " ");

      for (const pattern of [TRADING, TRADING_BADGE, OPERATING_CLAIM]) {
        const hit = flat.match(pattern);
        if (hit) offenders.push(`${relToSrc(SRC, f)}  →  "${hit[0]}"`);
      }
    }

    expect(
      offenders,
      `No marketing surface may claim MAANTA is trading, or describe it as ` +
        `operating at a named mall, while the footer says it is not yet ` +
        `trading. The gated wording lives in lib/marketing/live-claims.ts — ` +
        `import it rather than writing the sentence here:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  /**
   * `public/` — the directory this suite could not see, drift **D138**.
   *
   * Everything above reads `.tsx` under two `src/` directories. That definition
   * of "every surface" is what let `public/manifest.webmanifest` ship "Now live
   * at BBS Mall, Eastleigh" — a string this file's own `TRADING` regex matches —
   * straight to the Android install prompt. The gap was not the pattern; it was
   * the **scope**.
   *
   * So the directory is enumerated, never listed. A hand-maintained array only
   * checks what somebody remembered to add, and that is precisely how **D52**
   * and **D38** each closed. Anything served verbatim from `public/` in a text
   * format is in scope by existing, including files nobody has written yet.
   *
   * `.js` is included for `sw.js`, which is shipped code that a user's browser
   * registers and which no other guard reads. If a minified vendor bundle ever
   * lands here and trips a pattern, narrow by path with a stated reason —
   * do not drop the extension, which would re-open the hole this closes.
   */
  it("keeps trading claims out of every text file served from public/", () => {
    if (!DEMO_MODE) return;
    const files = walk(PUBLIC, [".webmanifest", ".json", ".txt", ".svg", ".js", ".md"]);
    expect(
      files.length,
      "walked public/ and found nothing — the path is wrong and this asserts nothing"
    ).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of files) {
      const flat = readFileSync(f, "utf8").replace(/\s+/g, " ");
      for (const pattern of [TRADING, TRADING_BADGE, OPERATING_CLAIM]) {
        const hit = flat.match(pattern);
        if (hit) offenders.push(`${path.relative(PUBLIC, f)}  →  "${hit[0]}"`);
      }
    }

    expect(
      offenders,
      "A static file in public/ is served verbatim and cannot read DEMO_MODE, so " +
        "a claim written here can never be un-said by flipping the flag. Move the " +
        "surface into the app so it can read lib/marketing/live-claims.ts — the " +
        `web manifest was moved to src/app/manifest.ts for exactly this reason:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
