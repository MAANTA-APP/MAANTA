import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDealClaimable, isDealInRedemptionWindow } from "@/lib/deal-expiry";
import { DEAL_SELECT, DEAL_SELECT_WITHOUT_LAT_LNG } from "@/lib/data";

const root = join(__dirname, "../../..");

function readApp(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

/**
 * Ratchet tests for the 2026-07-30 backend↔frontend↔wireframe parity pass.
 * These pin truths that previously drifted silently.
 */
describe("parity sync ratchets (2026-07-30)", () => {
  it("live deal selects request and filter is_paused", () => {
    expect(DEAL_SELECT).toContain("is_paused");
    expect(DEAL_SELECT_WITHOUT_LAT_LNG).toContain("is_paused");
    const data = readApp("src/lib/data.ts");
    expect(data).toMatch(/\.eq\(\s*"is_paused"\s*,\s*false\s*\)/);
  });

  it("SQL browse view migration excludes paused deals", () => {
    const mig = readApp(
      "supabase/migrations/20260730190000_paused_deals_discovery_filter.sql"
    );
    expect(mig).toMatch(/is_paused\s+IS\s+NOT\s+TRUE/i);
    expect(mig).toMatch(/deals_public_browse/);
  });

  it("deal detail disables claim when paused and surfaces deal_paused API code", () => {
    const detail = readApp("src/app/(shopper)/deals/[id]/page.tsx");
    expect(detail).toMatch(/Deal paused by merchant/);
    const api = readApp("src/app/api/redemptions/route.ts");
    expect(api).toMatch(/code:\s*"deal_paused"/);
  });

  it("ticket view leads with validity when the deal is paused", () => {
    const ticket = readApp("src/app/(shopper)/tickets/[id]/page.tsx");
    expect(ticket).toMatch(/Your ticket is still valid until/);
    expect(ticket).toMatch(/merchant paused new claims/);
    expect(ticket).toMatch(/show this code at the till/i);
  });

  it("new claims are live-only; grace is till redemption window", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    expect(isDealClaimable("2026-07-26T11:50:00Z", now)).toBe(false);
    expect(isDealInRedemptionWindow("2026-07-26T11:50:00Z", now)).toBe(true);
  });

  it("merchant alerts never promise that verify is blocked by balance", () => {
    const src = readApp("src/app/merchant/(app)/alerts/page.tsx");
    expect(src).not.toMatch(/Top up to verify redemptions/);
    expect(src).not.toMatch(/can be verified/);
    expect(src).toMatch(/arrears/);
  });

  it("inventory route aliases exist", () => {
    expect(readApp("src/app/otp/page.tsx")).toMatch(/verify-phone/);
    expect(readApp("src/app/founder/reports/page.tsx")).toMatch(/admin\/reports/);
    expect(readApp("src/app/merchant/onboarding/page.tsx")).toMatch(
      /merchant\/onboard/
    );
  });

  it("design current-reality inventory is present", () => {
    const frames = JSON.parse(
      readApp("design/current-reality/frames.json")
    ) as { surfaces: { route: string; status: string }[] };
    expect(frames.surfaces.length).toBeGreaterThan(20);
    expect(frames.surfaces.some((s) => s.route === "/feed")).toBe(true);
    expect(frames.surfaces.some((s) => s.route === "/contact" && s.status === "design-ahead")).toBe(
      true
    );
  });
});

/**
 * Ratchet for drift D103.
 *
 * The inventory described `/merchant/onboard` as "Merchant-authored; agent
 * attribution only" and listed only `page.tsx`. Every word of that is true and
 * it reads as a *guarantee* — attribution happens, nothing more — with no hint
 * that the wizard renders an agent question the merchant answers. A design
 * programme read it as a description of absence and resolved a brief conflict on
 * the premise that no agent name or ID field exists. It has existed since #68.
 *
 * The inventory is the artifact `CLAUDE.md` points design sessions at, so the
 * fix is to make it say what renders, and to pin the two sides together: if the
 * wizard stops asking, or the inventory stops documenting it, this fails rather
 * than letting the two drift apart again and re-form the same premise.
 *
 * Deliberately a biconditional, not a pair of one-way assertions. Asserting only
 * that the inventory mentions agents would leave a stale entry passing forever
 * after the field is removed, which is the exact failure mode being fixed —
 * documentation outliving the surface it describes.
 */
describe("onboarding agent attribution is documented where design reads (D103)", () => {
  const wizard = readApp("src/app/merchant/onboard/onboard-wizard.tsx");
  const frames = JSON.parse(readApp("design/current-reality/frames.json")) as {
    surfaces: {
      route: string;
      frontend?: string[];
      notes?: string | null;
    }[];
  };
  const onboard = frames.surfaces.find((s) => s.route === "/merchant/onboard");

  const wizardAsksAboutAgents = /Were you helped by a Maanta agent\?/.test(wizard);
  const inventoryDocumentsTheStep = /agent/i.test(onboard?.notes ?? "");

  it("keeps the wizard and the inventory in step with each other", () => {
    expect(onboard, "/merchant/onboard missing from the inventory").toBeTruthy();
    expect(
      inventoryDocumentsTheStep,
      wizardAsksAboutAgents
        ? "the wizard asks the agent question but the inventory does not record it — that gap is D103"
        : "the wizard no longer asks the agent question, so the inventory entry is now stale"
    ).toBe(wizardAsksAboutAgents);
  });

  it("names the file the question actually lives in", () => {
    // page.tsx alone sends a reader to a 60-line server component that fetches
    // the agent list and renders nothing; the field is in the wizard.
    expect(onboard?.frontend ?? []).toContain("src/app/merchant/onboard/onboard-wizard.tsx");
  });

  it("records that the merchant, never the agent, is the submitter", () => {
    // The guarantee is the part the programme got right. It stays pinned so a
    // future edit cannot quietly turn attribution into impersonation.
    expect(onboard?.notes ?? "").toMatch(/submitter|submitting|merchant-authored/i);
    expect(wizard).toMatch(/You&apos;re\s*\n?\s*still submitting this yourself/);
  });

  it("resolves every src path the two amended entries cite", () => {
    // Scoped to the entries this change touched: other surfaces still carry
    // loose paths from the 2026-07-30 pass ("wallet/page.tsx"), and fixing all
    // 30 is a separate job from closing D103.
    const wallet = frames.surfaces.find((s) => s.route === "/merchant/wallet");
    const cited = [...(onboard?.frontend ?? []), ...(wallet?.frontend ?? [])].filter((p) =>
      p.startsWith("src/")
    );
    expect(cited.length).toBeGreaterThan(3);
    for (const p of cited) {
      expect(() => readApp(p), `inventory cites missing ${p}`).not.toThrow();
    }
  });
});
