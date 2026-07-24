import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAUNCH_AUTH_MODE,
  LAUNCH_AUTH_MODES,
  PHONE_REQUIRED_AT_CLAIM,
  emailSignInEnabled,
  launchAuthMode,
  phoneSignInEnabled,
} from "../launch-auth";

// The launch mix (phone-only vs email+phone) is an OPEN founder decision kept
// behind a flag with BOTH modes enabled — this locks that neither is removed,
// the default is the shipped S2 ruling (email+phone), the flag is env-overridable,
// and that phone-required-at-claim is a frozen invariant independent of the mix.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("launch-auth mix flag", () => {
  it("keeps BOTH modes enabled — neither is picked/removed", () => {
    expect(LAUNCH_AUTH_MODES).toContain("email_and_phone");
    expect(LAUNCH_AUTH_MODES).toContain("phone_only");
  });

  it("defaults to the shipped S2 ruling (email + phone)", () => {
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_AUTH_MODE", "");
    expect(DEFAULT_LAUNCH_AUTH_MODE).toBe("email_and_phone");
    expect(launchAuthMode()).toBe("email_and_phone");
    expect(emailSignInEnabled()).toBe(true);
    expect(phoneSignInEnabled()).toBe(true);
  });

  it("honors an explicit phone_only override without disabling phone", () => {
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_AUTH_MODE", "phone_only");
    expect(launchAuthMode()).toBe("phone_only");
    expect(emailSignInEnabled()).toBe(false);
    expect(phoneSignInEnabled()).toBe(true);
  });

  it("fails safe to the default on an unrecognised value", () => {
    vi.stubEnv("NEXT_PUBLIC_LAUNCH_AUTH_MODE", "sms_only_lol");
    expect(launchAuthMode()).toBe("email_and_phone");
  });

  it("phone is ALWAYS required at claim, in every mode (frozen invariant)", () => {
    expect(PHONE_REQUIRED_AT_CLAIM).toBe(true);
  });
});
