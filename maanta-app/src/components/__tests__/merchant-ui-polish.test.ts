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
});
