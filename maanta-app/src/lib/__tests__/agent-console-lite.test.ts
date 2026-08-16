import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The agent console is the agents' lite admin console (founder, 2026-08-16):
 * onboard and monitor the pipeline, nothing else. These pin the two halves and
 * the trust boundary between them.
 */
const APP = path.resolve(__dirname, "..", "..", "app");
const leadDetail = readFileSync(path.join(APP, "agent", "leads", "[id]", "page.tsx"), "utf8");
const wizardPage = readFileSync(path.join(APP, "merchant", "onboard", "page.tsx"), "utf8");

describe("agent lite console — onboarding handoff", () => {
  it("an unconverted lead offers the onboarding handoff with the shop prefilled", () => {
    expect(leadDetail).toContain(
      "/merchant/onboard?shop=${encodeURIComponent(lead.shop_name)}"
    );
  });

  it("the handoff target actually reads the prefill", () => {
    // The link is only honest if the wizard consumes ?shop= — it does, via the
    // same param the /merchants/join handoff uses (survives the login redirect).
    expect(wizardPage).toContain("searchParams?.shop");
  });

  it("keeps the merchant as the author — the handoff copy says hand the device over", () => {
    // The trust boundary of agent attribution (#68): the agent opens the form,
    // the owner signs in and submits. The copy is the affordance for that rule.
    expect(leadDetail).toMatch(/hand this\s*\n?\s*device to the owner/);
    expect(leadDetail).toMatch(/records your assist/);
  });

  it("stays off the amber budget — Link to merchant is this screen's one action", () => {
    // The handoff is a ghost link (border-ink on white), never bg-brand.
    const handoffBlock = leadDetail.slice(
      leadDetail.indexOf("Onboard this shop") - 600,
      leadDetail.indexOf("Onboard this shop")
    );
    expect(handoffBlock).not.toContain("bg-brand");
  });
});
