import { describe, it, expect } from "vitest";
import { mirrorPatchFromResend } from "@/lib/growth/waitlist-mirror";
import { resendPropertyValue } from "@/lib/resend";

describe("waitlist mirror — folding a Resend read into a row", () => {
  it("records the contact id and stamps the sync", () => {
    const patch = mirrorPatchFromResend({
      contactId: "abc",
      createdAt: "2026-08-01T00:00:00Z",
      properties: { segment_type: "shopper" },
    });
    expect(patch.resend_contact_id).toBe("abc");
    expect(patch.properties_unreadable).toBe(false);
    expect(patch.joined_at).toBe("2026-08-01T00:00:00Z");
    expect(typeof patch.resend_synced_at).toBe("string");
  });

  // An empty properties object is the footprint of addWaitlistContact's
  // strip-and-retry, which fires on ANY 4xx including a 429. Reading it as
  // "they provided nothing" would raise a consent defect against a person who
  // did consent.
  it("treats an empty properties object as unreadable, not as empty", () => {
    expect(mirrorPatchFromResend({ contactId: "a", createdAt: null, properties: {} })
      .properties_unreadable).toBe(true);
    expect(mirrorPatchFromResend({ contactId: "a", createdAt: null, properties: null })
      .properties_unreadable).toBe(true);
  });

  // The join date is last-write-wins from a SUCCESSFUL read, never floored. A
  // failed read must leave what we already hold rather than overwrite it.
  it("does not touch the join date when the read did not carry one", () => {
    const patch = mirrorPatchFromResend({
      contactId: "a",
      createdAt: null,
      properties: { segment_type: "shopper" },
    });
    expect("joined_at" in patch).toBe(false);
  });
});

describe("resend property shape — read what the API actually returns", () => {
  // Verified against the live audience on 2026-09-04: Resend WRITES flat but
  // READS BACK typed. A reader assuming a bare string sees null for every field,
  // and imports a real person with no segment, no phone and no consent while
  // reporting their metadata as fine.
  const typed = {
    segment_type: { value: "merchant", type: "string" },
    phone: { value: "+254712345678", type: "string" },
    consent_at: { value: "2026-07-10T16:29:10.200Z", type: "string" },
  };

  it("reads the typed {value,type} shape the account returns", () => {
    expect(resendPropertyValue(typed, "segment_type")).toBe("merchant");
    expect(resendPropertyValue(typed, "phone")).toBe("+254712345678");
  });

  it("still reads a bare string, so either shape works", () => {
    expect(resendPropertyValue({ segment_type: "shopper" }, "segment_type")).toBe("shopper");
  });

  it("returns null for an absent key, an empty value, or a null object", () => {
    expect(resendPropertyValue(typed, "source_channel")).toBeNull();
    expect(resendPropertyValue({ a: { value: "  ", type: "string" } }, "a")).toBeNull();
    expect(resendPropertyValue(null, "segment_type")).toBeNull();
  });

  // The failure this whole helper exists to prevent: a non-empty object whose
  // values cannot be read must read as unreadable, never as "provided nothing".
  it("marks a shape it cannot read as unreadable rather than empty", () => {
    const patch = mirrorPatchFromResend({
      contactId: "a",
      createdAt: null,
      properties: { segment_type: { unexpected: "merchant" } },
    });
    expect(patch.properties_unreadable).toBe(true);
  });

  it("accepts a real contact as readable", () => {
    const patch = mirrorPatchFromResend({ contactId: "a", createdAt: null, properties: typed });
    expect(patch.properties_unreadable).toBe(false);
  });
});
