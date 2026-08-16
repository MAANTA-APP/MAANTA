import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClerkAPIResponseError } from "@clerk/shared/error";
import { clerkSendCodeMessage } from "@/lib/clerk-errors";

/**
 * The send-code failure copy.
 *
 * Every failure on this screen used to read "Couldn't send the code. Check the
 * number and try again." A well-formed number refused for a reason that has
 * nothing to do with its digits — already on another account, SMS not enabled
 * for that country, rate limit — sent the operator back to re-type a number that
 * was never wrong. These tests pin that each known cause says its own thing, and
 * that an unknown one still surfaces the code instead of swallowing it.
 */
// The real class, not a duck-typed stand-in: `isClerkAPIResponseError` is a
// constructor/`kind` check, so an object that merely looks the part is not
// recognised — and a test built from one would pass against a mapper that never
// runs its switch. Found that the hard way; the stub version went green on the
// fallback branch for every case.
function clerkError(code: string) {
  return new ClerkAPIResponseError("clerk", {
    data: [{ code, message: code, long_message: `long: ${code}` }],
    status: 422,
  });
}

describe("clerkSendCodeMessage", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("names the already-registered case, so the number is not retyped forever", () => {
    const msg = clerkSendCodeMessage(clerkError("form_identifier_exists"));
    expect(msg).toContain("already on another Maanta account");
    expect(msg).not.toContain("Check the number");
  });

  it("asks for a format fix only when the format is what failed", () => {
    for (const code of ["form_param_format_invalid", "form_param_value_invalid"]) {
      expect(clerkSendCodeMessage(clerkError(code)), code).toContain("country code");
    }
  });

  it("tells someone rate-limited to wait, not to edit their number", () => {
    const msg = clerkSendCodeMessage(clerkError("too_many_requests"));
    expect(msg).toContain("Wait a minute");
  });

  it("surfaces an unrecognised code instead of hiding it", () => {
    // The country-restriction and SMS-quota cases land here and are
    // indistinguishable from the client, so the code is the only handle on
    // which one it was — it belongs in the message and in the console.
    const msg = clerkSendCodeMessage(clerkError("sms_country_not_enabled"));
    expect(msg).toContain("sms_country_not_enabled");
    expect(msg).toContain("SMS to that country");
    expect(consoleError).toHaveBeenCalled();
  });

  it("does not blame the number when the failure was not Clerk's", () => {
    // A dropped connection is not a bad phone number.
    const msg = clerkSendCodeMessage(new TypeError("Failed to fetch"));
    expect(msg).toContain("connection");
  });

  it("never echoes Clerk's raw longMessage", () => {
    // Provider strings change without notice and are written for a different
    // audience; the mapping is ours to control.
    const msg = clerkSendCodeMessage(clerkError("form_identifier_exists"));
    expect(msg).not.toContain("long:");
  });
});
