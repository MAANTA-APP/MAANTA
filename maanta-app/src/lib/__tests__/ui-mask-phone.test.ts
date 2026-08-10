import { describe, expect, it } from "vitest";
import { maskPhone as maskPhoneUi } from "@/lib/ui";
import { maskPhone as maskPhoneServer } from "@/lib/phone-mask";

/**
 * There used to be two maskPhone implementations — this one and
 * `lib/phone-mask.ts` — and the copy had drifted where it mattered: it returned
 * the number COMPLETELY UNMASKED for inputs under 7 characters, and that
 * version rendered on admin, agent and merchant surfaces.
 *
 * `lib/ui.ts` is now a presentation wrapper over the single masker. These tests
 * pin both halves of that: the leak is gone, and the two entry points agree on
 * WHICH digits are revealed, differing only in the mask character.
 */

describe("ui maskPhone delegates to the single masker", () => {
  it("never returns a short number unmasked", () => {
    // The exact defect: `if (p.length < 7) return phone` returned the input.
    for (const short of ["12345", "+254", "123456"]) {
      const out = maskPhoneUi(short);
      expect(out, `leaked ${short}`).not.toBe(short);
    }
  });

  it("reveals the same digits as the server masker, differing only in styling", () => {
    const ui = maskPhoneUi("+254712345678");
    const server = maskPhoneServer("+254712345678");

    expect(ui).toBe("+254 7•• ••• 678");
    expect(server).toBe("+254 7xx xxx 678");
    // Same revealed digits either way — the masking decision is single-sourced.
    expect((ui?.match(/\d/g) ?? []).join("")).toBe(
      (server?.match(/\d/g) ?? []).join("")
    );
  });

  it("returns null rather than a blank, so `?? fallback` still fires", () => {
    // The old wrapper returned "" for nullish input, which is not null, so a
    // caller writing `maskPhone(x) ?? "No contact on file"` silently rendered
    // an empty cell instead of the fallback.
    expect(maskPhoneUi(null)).toBeNull();
    expect(maskPhoneUi(undefined)).toBeNull();
    expect(maskPhoneUi("")).toBeNull();
  });
});
