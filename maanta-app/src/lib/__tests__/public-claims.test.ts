import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walk, relToSrc } from "./helpers/source-files";
import { stripComments } from "./helpers/comment-stripping";
import { DEMO_MODE, ENTITY } from "@/lib/marketing/demo";
import { PAYMENT_AVAILABILITY } from "@/lib/marketing/facts";
import {
  DEPLOYMENT_TIMELINE_LEAD,
  FEED_CTA_LABEL,
  HELP_DESCRIPTION,
  MONTH_OF_DATA_SENTENCE,
  NODE_STAFFING_MODEL,
  SUPPORT_REPLY_LINE,
} from "@/lib/marketing/live-claims";

/**
 * Public claims — founder ruling 2026-09-04 (`10_PUBLIC_CLAIMS_AND_FORM_SAFETY`).
 *
 * Every pattern here is a sentence the site once published about something that
 * does not exist: a desk in a mall MAANTA has not yet introduced itself to, a
 * top-up mechanism with no payment behind it, a staffed node with nobody on the
 * floor, a support team with a reply time, a "live" feed of demo rows. Each was
 * written as a literal at its point of use, which is why the same defect showed
 * up on three pages, and each is now either deleted or resolved through one
 * gated constant so it flips in one place when it becomes true.
 *
 * The ruling's acceptance criterion is a banned-string sweep that returns zero
 * matches in user-facing copy and metadata (§7.1). This is that sweep, run over
 * source rather than built output because CI runs `test` before `build` (same
 * constraint as every other marketing guard — D41). Copy is static, so a string
 * absent from source is absent from output; the two deliberate exceptions the
 * ruling names are encoded as `allow` patterns rather than left to memory.
 *
 * Whole-file, whitespace-collapsed matching, for the reason
 * `prelaunch-consistency.test.ts` gives: JSX wraps prose at the print width, and
 * a line-by-line guard is a guard whose verdict depends on Prettier.
 */

const SRC = path.resolve(__dirname, "..", "..");

/**
 * `lib/marketing/live-claims.ts` is excluded from the sweep on purpose: it is
 * the gated address where the post-launch wording of every claim lives beside
 * the pre-launch wording, so its source necessarily contains strings the site
 * must not currently show. Its *resolved* exports are asserted directly below
 * instead — which is the check that matters, since that is what renders.
 */
const MARKETING_TSX = walk(path.join(SRC, "app", "(marketing)"), [".tsx"])
  .concat(walk(path.join(SRC, "components", "marketing"), [".tsx"]))
  .concat(
    walk(path.join(SRC, "lib", "marketing"), [".ts", ".tsx"]).filter(
      (f) => !f.endsWith("live-claims.ts")
    )
  );
const LEGAL_MD = walk(path.join(SRC, "content", "legal"), [".md"]);

/** One sweep row: the pattern, where it applies, and what the ruling says. */
type Banned = {
  pattern: RegExp;
  claim: string;
  ruling: string;
  /** Matches to ignore — the ruling's explicit survivors. */
  allow?: RegExp[];
  /** Whether the legal drafts are in scope. Defaults to true. */
  legal?: boolean;
};

const BANNED: Banned[] = [
  // X1 — premises. "BBS Mall, Eastleigh" as prose ("preparing to open at BBS
  // Mall, Eastleigh") is permitted and must survive; the address block is not.
  {
    pattern: /BBS Mall,? Eastleigh,? Nairobi,? Kenya/i,
    claim: "the mall as a postal address block",
    ruling: "X1 — no address at BBS until the mall authorises the relationship (D261)",
  },
  {
    pattern: /\b(?:desk|office) (?:at|in|inside) (?:BBS|the mall)\b|\bin-mall desk\b|\bMAANTA desk\b|\bthe desk\b/i,
    claim: "a MAANTA desk or office in the mall",
    ruling: "X1 — MAANTA has no premises in BBS Mall (D261)",
    allow: [/do not have a desk or an office in the mall/i],
  },
  {
    pattern: /\bMAANTA operates at\b|\boperates from\b|\bbased at BBS\b/i,
    claim: "MAANTA operating from the mall",
    ruling: "X1 — intent only: \"preparing to open at\" (D261)",
  },
  // X3/X4 — payment mechanism. No payment exists inside MAANTA. The legal
  // drafts still describe wallets and top-ups in contractual terms and are
  // flagged for legal review rather than edited here (D270), so they are out
  // of this row's scope; the two survivors are the ruling's own sentences.
  {
    pattern: /\btop[- ]?ups?\b|\btopup\b|\bwallet\b|\btopped up\b/i,
    claim: "a top-up or wallet mechanism",
    ruling: "X4 — the capability does not exist; describe none (D263)",
    legal: false,
    allow: [
      /no M-Pesa top-up and no card payment/i,
      /In-app top-up by M-Pesa is planned/i,
      // The FAQ *question* is kept verbatim (X3); only the answer changed.
      /How do I top up my balance\?/i,
    ],
  },
  {
    pattern: /Card also works/i,
    claim: "card payment as a working option",
    ruling: "X3 — deleted, not softened (D263)",
  },
  // X5 — the frozen merchant-copy vocabulary (PROJECT RULES rank 2). "share of
  // your sale" is the approved phrasing and must survive; `\bcommissions?\b`
  // leaves "Data Protection Commissioner" alone.
  {
    pattern: /\blisting fees?\b|\bpercentage take\b|\bcommissions?\b|\btransaction cut\b|\bfree plan\b|\bcut of (?:the|your) sale\b|\bpercentage (?:cut|of the sale)\b|\btake a percentage\b/i,
    claim: "a banned fee term (listing fee, commission, cut, percentage take, free plan)",
    ruling: "X5 — say \"no fee to join\" and \"we never take a share of your sale\" (D266)",
  },
  // X9 — no support team exists, so no response time may be published.
  {
    pattern: /\breply (?:on WhatsApp )?(?:the same day|within \d+ business days?)\b|\bwithin 1 business day\b|\backnowledged within\b|\bRESPONSE_TIMES\b/i,
    claim: "a support response time",
    ruling: "X9 — SUPPORT_REPLY_LINE only, until someone owns a turnaround (D264)",
  },
  // X10 — the feed holds demo deals and no real ones.
  {
    pattern: /Browse live deals/i,
    claim: "the feed CTA as \"live\"",
    ruling: "X10 — FEED_CTA_LABEL, gated on DEMO_MODE (D265)",
    legal: false,
  },
  // X2 — present-tense staffing, timeline and data-pattern claims.
  {
    pattern: /\bEvery node MAANTA opens is staffed\b|\bEach node runs with\b|\bA node runs with\b|\bwork the mall\b|\bThey will come to your shop\b|\broughly a month from agreement to live feed\b|\bA month of data is enough\b/i,
    claim: "a staffed node, a deployment track record or a tested data claim",
    ruling: "X2 — NODE_STAFFING_MODEL / DEPLOYMENT_TIMELINE_LEAD / MONTH_OF_DATA_SENTENCE (D262)",
    legal: false,
  },
  // Standing check (D2): the dark features are never named publicly.
  {
    pattern: /\bFast Visit\b|\bMAANTA Points\b/,
    claim: "Fast Visit or MAANTA Points",
    ruling: "D2 — feature-flagged OFF and not to be advertised",
  },
  // §5 — no registration-number-shaped string, on the page or in the token.
  {
    pattern: /ODPC-[A-Z0-9-]{4,}|\{\{ODPC_REGISTRATION\}\}/,
    claim: "an ODPC registration-number-shaped string",
    ruling: "§5 — plain words: there is no registration (D269)",
  },
];

const flatten = (text: string) => text.replace(/\s+/g, " ");

function offendersFor(row: Banned): string[] {
  const out: string[] = [];
  const files = row.legal === false ? MARKETING_TSX : MARKETING_TSX.concat(LEGAL_MD);
  for (const f of files) {
    const raw = readFileSync(f, "utf8");
    const text = flatten(f.endsWith(".md") ? raw : stripComments(raw));
    for (const m of Array.from(text.matchAll(new RegExp(row.pattern.source, row.pattern.flags + "g")))) {
      const around = text.slice(Math.max(0, m.index! - 60), m.index! + m[0].length + 60);
      if (row.allow?.some((a) => a.test(around))) continue;
      out.push(`${relToSrc(SRC, f)}  →  "${m[0]}"`);
    }
  }
  return out;
}

describe("public claims (founder ruling 2026-09-04)", () => {
  it("has content to scan", () => {
    expect(MARKETING_TSX.length).toBeGreaterThan(20);
    expect(LEGAL_MD.length).toBe(4);
  });

  for (const row of BANNED) {
    it(`does not publish ${row.claim}`, () => {
      expect(
        offendersFor(row),
        `${row.ruling}. Found:\n${offendersFor(row).join("\n")}`
      ).toEqual([]);
    });
  }

  /**
   * The gated constants, resolved. While DEMO_MODE holds, each must say the
   * pre-launch thing the ruling asks for and none may carry a banned string —
   * this is what makes excluding `live-claims.ts` from the sweep safe.
   */
  it("resolves the shared claims to their pre-launch wording under DEMO_MODE", () => {
    expect(DEMO_MODE).toBe(true);
    expect(FEED_CTA_LABEL).toBe("See the demo feed");
    expect(NODE_STAFFING_MODEL).toMatch(/not yet operating/);
    expect(NODE_STAFFING_MODEL).toMatch(/No node is staffed today/);
    expect(NODE_STAFFING_MODEL).toMatch(/up to 4 agents/);
    expect(DEPLOYMENT_TIMELINE_LEAD).toMatch(/a plan, not a track record/);
    expect(MONTH_OF_DATA_SENTENCE).toMatch(/has not been tested/);
    expect(SUPPORT_REPLY_LINE).toMatch(/not yet operating/);
    expect(SUPPORT_REPLY_LINE).not.toMatch(/same day|business day/i);
    expect(HELP_DESCRIPTION).not.toMatch(/same day|business day/i);
    for (const row of BANNED) {
      for (const value of [
        FEED_CTA_LABEL,
        NODE_STAFFING_MODEL,
        DEPLOYMENT_TIMELINE_LEAD,
        MONTH_OF_DATA_SENTENCE,
        SUPPORT_REPLY_LINE,
        HELP_DESCRIPTION,
      ]) {
        expect(value, `${row.claim} in a resolved live-claims constant`).not.toMatch(
          row.pattern
        );
      }
    }
  });

  it("states that no payment exists inside MAANTA, GD1-neutral, from one source", () => {
    expect(PAYMENT_AVAILABILITY.inAppPaymentLive).toBe(false);
    expect(PAYMENT_AVAILABILITY.faqAnswer).toMatch(/^You cannot yet\./);
    expect(PAYMENT_AVAILABILITY.faqAnswer).toMatch(/no M-Pesa top-up and no card payment/);
    expect(PAYMENT_AVAILABILITY.note).toMatch(/There is no payment inside MAANTA today/);
    // Neutral to the settlement ruling: commits to *when*, never to *how*.
    for (const s of [PAYMENT_AVAILABILITY.note, PAYMENT_AVAILABILITY.faqAnswer]) {
      expect(s).toMatch(/before your first confirmed code/);
      expect(s).not.toMatch(/opening credit|KES 300|invoice|cash|paybill/i);
    }
  });

  it("carries no address in the entity record, so no surface can render one", () => {
    // `ENTITY.address` is what every address block read from. Its absence is the
    // ratchet: a surface that wants an address fails to type-check.
    expect("address" in ENTITY).toBe(false);
  });
});
