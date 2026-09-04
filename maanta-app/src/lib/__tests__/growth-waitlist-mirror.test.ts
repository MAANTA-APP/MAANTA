import { describe, it, expect } from "vitest";
import { mirrorPatchFromResend } from "@/lib/growth/waitlist-mirror";

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
