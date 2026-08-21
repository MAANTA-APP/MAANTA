import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Toggle } from "@/components/ui/inputs";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Merchant UI polish", () => {
  it("Toggle switches carry an accessible name", () => {
    const html = renderToStaticMarkup(
      createElement(Toggle, {
        checked: false,
        onChange: () => {},
        label: "Verify redemptions",
      })
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Verify redemptions"');
  });

  it("staff removal confirms before the DELETE fires", () => {
    // One tap used to remove a staff member with no confirmation. The sheet is
    // the guard; losing it regresses a destructive action to a single tap.
    const src = read("src/app/merchant/(app)/staff/[id]/manage-staff.tsx");
    expect(src).toContain("confirmRemove");
    expect(src).toContain("BottomSheet");
    expect(src).toMatch(/Remove \{name\}\?/);
  });

  it("boost sheet keeps the wallet chip off the brand fill", () => {
    // R1/R3: the sheet's single amber element is the Confirm CTA, and a wallet
    // amount never sits on an amber fill.
    const src = read("src/app/merchant/(app)/deals/[id]/deal-actions.tsx");
    const chipLine = src
      .split("\n")
      .find((l) => l.includes("Pay from wallet"));
    expect(chipLine).toBeDefined();
    expect(src).not.toMatch(/bg-brand[^\n]*\n[^\n]*Pay from wallet/);
  });

  it("new-deal wizard shows step progress", () => {
    const src = read("src/app/merchant/(app)/deals/new/new-deal-wizard.tsx");
    expect(src).toContain("Step {stepNumber} of {STEP_ORDER.length}");
  });

  it("onboard wizard shows step progress and announces errors", () => {
    const src = read("src/app/merchant/onboard/onboard-wizard.tsx");
    expect(src).toContain("Step {stepNumber} of {STEPS.length}");
    expect(src).toContain('role="alert"');
  });

  it("onboard wizard's what3words input keeps its label attached", () => {
    // The label must wrap the input (or reference it) — as a bare sibling the
    // wizard's one required free-text field is unnamed to assistive tech.
    const src = read("src/app/merchant/onboard/onboard-wizard.tsx");
    const labelBlock = src.slice(
      src.indexOf("what3words address"),
      src.indexOf("Validate address")
    );
    expect(labelBlock).toContain("</label>");
    expect(labelBlock.indexOf("<input")).toBeLessThan(labelBlock.indexOf("</label>"));
  });

  it("onboard wizard keeps the rendered agent-attribution step (G1)", () => {
    // frames.json: the attribution question is a RENDERED STEP, not only a
    // stored property. Polishing must never design it away.
    const src = read("src/app/merchant/onboard/onboard-wizard.tsx");
    expect(src).toContain("Were you helped by a Maanta agent?");
    expect(src).toContain("attributionAnswered");
  });
});
