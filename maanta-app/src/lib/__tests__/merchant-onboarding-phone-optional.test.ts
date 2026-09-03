import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isBusinessStepComplete,
  isOwnerPhoneRequired,
} from "@/lib/merchant-onboarding";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * D158 (founder ruling 2026-08-23, option B) — owner phone is optional once the
 * account has a verified email. The register named this guard when the ruling
 * was recorded: "an onboard-wizard test asserting Continue enables on email
 * alone".
 */
describe("D158 — owner phone optional with a verified email", () => {
  it("Continue enables on shop name alone when the account has a verified email", () => {
    expect(
      isBusinessStepComplete({
        shopName: "Mama Njeri Fabrics",
        ownerPhone: "",
        hasVerifiedEmail: true,
      })
    ).toBe(true);
  });

  it("keeps the phone required when there is no verified email", () => {
    expect(
      isBusinessStepComplete({
        shopName: "Mama Njeri Fabrics",
        ownerPhone: "",
        hasVerifiedEmail: false,
      })
    ).toBe(false);

    expect(
      isBusinessStepComplete({
        shopName: "Mama Njeri Fabrics",
        ownerPhone: "0712345678",
        hasVerifiedEmail: false,
      })
    ).toBe(true);
  });

  it("still requires a shop name either way — the ruling relaxed one field, not the step", () => {
    for (const hasVerifiedEmail of [true, false]) {
      expect(
        isBusinessStepComplete({ shopName: "   ", ownerPhone: "0712345678", hasVerifiedEmail })
      ).toBe(false);
    }
  });

  it("treats a whitespace-only phone as absent", () => {
    expect(
      isBusinessStepComplete({
        shopName: "Shop",
        ownerPhone: "   ",
        hasVerifiedEmail: false,
      })
    ).toBe(false);
  });

  it("isOwnerPhoneRequired is the inverse of holding a verified email", () => {
    expect(isOwnerPhoneRequired(true)).toBe(false);
    expect(isOwnerPhoneRequired(false)).toBe(true);
  });

  it("the wizard reads the shared predicate rather than its own condition", () => {
    // A second copy of this rule is a second place for it to drift — the whole
    // reason the predicate lives in @/lib/merchant-onboarding.
    const src = read("src/app/merchant/onboard/onboard-wizard.tsx");
    expect(src).toContain("isBusinessStepComplete");
    expect(src).not.toMatch(/disabled=\{!shopName\.trim\(\) \|\| !ownerPhone\.trim\(\)\}/);
  });

  it("the wizard never sends a bare country code as a phone number", () => {
    // `${ownerCc}${digits}` on an empty field produced "+254", which the route
    // would have rejected as a malformed Kenyan number.
    const src = read("src/app/merchant/onboard/onboard-wizard.tsx");
    expect(src).toContain("digits ? `${ownerCc}${digits}` : \"\"");
    expect(src).toContain("phone: fullPhone || null");
  });

  it("the account's login address never becomes shopper-visible data", () => {
    // D158 lets the verified login address stand in as the shop contact when no
    // phone is given. That is only acceptable while merchants.email cannot
    // reach a shopper, so assert the app-layer projection too — the SQL suite
    // asserts the same thing about merchants_public_browse. Showing a contact
    // on a storefront needs explicit merchant consent and its own column.
    const data = read("src/lib/data.ts");
    const dealSelect = data.slice(
      data.indexOf("export const DEAL_SELECT ="),
      data.indexOf("type DealSelectResult")
    );
    const merchantJoin = dealSelect.slice(dealSelect.indexOf("merchants!inner("));
    expect(merchantJoin).not.toContain("email");
    expect(merchantJoin).not.toContain("phone");
  });

  it("admin merchant detail shows the email once, not twice, for a no-phone shop", () => {
    // D160. The contact line falls back to the email when phone is NULL; the
    // suffix below it appends the email as a SECOND channel. Unconditional, it
    // printed "Contact: shop@x.com · shop@x.com" for exactly the merchants D158
    // enables. The suffix must depend on the phone actually being present.
    // 2026-09-03: Merchant 360 renders the two channels as two labelled rows,
    // so each prints exactly once and a NULL phone reads "none on file" rather
    // than silently borrowing the email as the primary contact.
    const src = read("src/app/admin/merchants/[id]/page.tsx");
    expect(src).toContain('<Row label="Phone" value={m.phone ?? "none on file"} />');
    expect(src).toContain('<Row label="Email" value={m.email ?? "none on file"} />');
    expect(src).not.toMatch(/\{m\.email \? ` · \$\{m\.email\}` : ""\}/);
    expect(src).not.toMatch(/Contact: \{m\.phone \?\? m\.email/);
  });

  it("the route derives the gate from the session, never from the request body", () => {
    const src = read("src/app/api/merchants/onboard/route.ts");
    // hasVerifiedEmail must be computed from the session-resolved app user...
    expect(src).toMatch(/const hasVerifiedEmail =\s*typeof appUser\.email/);
    expect(src).toContain('"id, role, email"');

    // ...and must never be read off the request body. Scope the check to the
    // destructuring block so an unrelated mention elsewhere cannot pass it.
    const body = src.slice(
      src.indexOf("const {"),
      src.indexOf("} = await request.json();")
    );
    expect(body).not.toContain("hasVerifiedEmail");
  });
});
