import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stripCommentLines } from "./helpers/comment-stripping";
import { DEMO_MODE, PLACEHOLDER_IDS, REGULATORY_STATUS } from "@/lib/marketing/demo";
import {
  PLACEHOLDER_ID_TOKENS,
  RESOLVED_TOKENS,
} from "@/lib/marketing/legal-docs";
import { PlaceholderId } from "@/components/marketing/PlaceholderId";
import { RegulatoryStatus } from "@/components/marketing/RegulatoryStatus";

/**
 * Pre-launch disclosure rendering — the guard drift **D75** required.
 *
 * `demo-mode-spec.md` §2 rules that placeholder regulatory identifiers render
 * through `<PlaceholderId>` (monospace + dotted underline + `Placeholder`
 * badge — the treatment that survives a screenshot cropped past the
 * disclaimer) and **never as plain text**, and the DECIDED 2026-07-31 block
 * says the `RegulatoryStatus` wording renders in place of any licence
 * identifier. For a year of the repo's life none of that was wired: the
 * component had zero importers, the privacy policy hardcoded a **transposed**
 * ODPC string (`DEMO-ODPC-…`) that even defeated the component's `/-DEMO-/`
 * safety net, and the status block rendered nowhere. This file is what makes
 * that class of drift fail CI instead of waiting for an audit.
 */

const SRC = path.resolve(__dirname, "..", "..");
const LEGAL = path.join(SRC, "content", "legal");

const read = (p: string) => readFileSync(p, "utf8");

describe("pre-launch disclosures (D75)", () => {
  it("the privacy policy carries the ODPC identifier as a token, not a literal", () => {
    const md = read(path.join(LEGAL, "privacy-policy.md"));
    expect(md).toContain("{{ODPC_REGISTRATION}}");
  });

  it("no legal document hardcodes a DEMO-form identifier as plain text", () => {
    // The transposed `DEMO-ODPC-NOT-REGISTERED` literal is the specific bug
    // this guards against: it bypassed <PlaceholderId> AND its transposition
    // did not match /-DEMO-/, so the launch-checklist net could never fire.
    for (const f of ["privacy-policy.md", "terms-of-service.md", "merchant-terms.md", "cookie-notice.md"]) {
      const md = read(path.join(LEGAL, f));
      expect(md, `${f} must not hardcode a placeholder identifier`).not.toMatch(
        /DEMO-(ODPC|CO|PIN|CBK)|(ODPC|CO|PIN|CBK)-DEMO/
      );
    }
  });

  it("every canonical placeholder value can trip the /-DEMO-/ safety net", () => {
    for (const [k, v] of Object.entries(PLACEHOLDER_IDS)) {
      expect(v, `PLACEHOLDER_IDS.${k} must match /-DEMO-/ or the launch net cannot fire`).toMatch(/-DEMO-/);
    }
  });

  it("the identifier tokens resolve to the canonical values and are routed through PlaceholderId", () => {
    expect(Array.from(PLACEHOLDER_ID_TOKENS).sort()).toEqual(
      ["COMPANY_REGISTRATION", "ODPC_REGISTRATION", "PIN"].sort()
    );
    expect(RESOLVED_TOKENS.ODPC_REGISTRATION).toBe(PLACEHOLDER_IDS.odpc);
    expect(RESOLVED_TOKENS.COMPANY_REGISTRATION).toBe(PLACEHOLDER_IDS.company);
    expect(RESOLVED_TOKENS.PIN).toBe(PLACEHOLDER_IDS.pin);

    // Wiring, asserted against code rather than comments (shared lexer — D38).
    const legalDoc = stripCommentLines(
      read(path.join(SRC, "components", "marketing", "LegalDoc.tsx"))
    ).join("\n");
    expect(legalDoc).toContain("PLACEHOLDER_ID_TOKENS.has(name)");
    expect(legalDoc).toContain("<PlaceholderId");
  });

  it("PlaceholderId renders the crop-surviving badge treatment", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceholderId, { value: PLACEHOLDER_IDS.odpc })
    );
    expect(html).toContain(PLACEHOLDER_IDS.odpc);
    expect(html).toContain("Placeholder");
    expect(html).toContain("font-mono");
  });

  it("the RegulatoryStatus block renders the verbatim wording under DEMO_MODE", () => {
    // Wording is spec-verbatim and must come from the one constant.
    expect(RESOLVED_TOKENS.REGULATORY_STATUS).toBe(REGULATORY_STATUS);
    expect(DEMO_MODE).toBe(true); // pre-launch: the block must be live
    const html = renderToStaticMarkup(createElement(RegulatoryStatus));
    expect(html).toContain("Regulatory status");
    expect(html).toContain("not yet licensed or registered with any Kenyan regulator");
  });

  it("the block renders in both decided placements: footer legal bar and merchant-terms above clause 7", () => {
    const footer = stripCommentLines(
      read(path.join(SRC, "components", "marketing", "SiteFooter.tsx"))
    ).join("\n");
    expect(footer).toContain("<RegulatoryStatus");

    const terms = read(path.join(LEGAL, "merchant-terms.md"));
    const section = terms.indexOf("## Regulatory status — pre-launch");
    const clause7 = terms.indexOf("## 7. Fees and your balance");
    expect(section).toBeGreaterThan(-1);
    expect(clause7).toBeGreaterThan(-1);
    expect(section, "the section sits above clause 7, per the spec's placement").toBeLessThan(clause7);
    expect(terms).toContain("{{REGULATORY_STATUS}}");
  });
});
