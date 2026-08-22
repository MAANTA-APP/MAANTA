import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Founder ruling 2026-08-22 — the claim gate accepts a verified contact
 * CHANNEL, phone or email, not phone alone.
 *
 * Why this exists as its own suite: the route guard mocks the whole auth module,
 * so it proves the route honours whatever `currentUserHasVerifiedContact()`
 * says — not that the helper resolves the channels correctly. This tests the
 * helper against Clerk's shape, which is the half that decides whether a
 * shopper in Oslo, London or Nairobi can claim at all.
 *
 * The ruling widened a channel; it did not remove a gate. A user with neither
 * channel verified must still be refused.
 */

const currentUserMock = vi.fn();
const phoneOtpEnabledMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: () => currentUserMock(),
  auth: () => Promise.resolve({ userId: "u_1" }),
}));
vi.mock("@/lib/auth/strategy", () => ({
  isClerkAuth: () => true,
  phoneOtpEnabled: () => phoneOtpEnabledMock(),
  authStrategy: () => "clerk",
}));

const verified = { verification: { status: "verified" } };
const unverified = { verification: { status: "unverified" } };

beforeEach(() => {
  vi.resetModules();
  currentUserMock.mockReset();
  // Phone OTP on, so the phone check is real rather than the dev/CI relaxation.
  phoneOtpEnabledMock.mockReset().mockReturnValue(true);
});

const load = async () => import("@/lib/auth");

describe("verified-contact claim gate", () => {
  it("an email-verified shopper with NO phone can claim", async () => {
    currentUserMock.mockResolvedValue({ phoneNumbers: [], emailAddresses: [verified] });
    const { currentUserHasVerifiedContact, currentUserHasVerifiedPhone } = await load();
    expect(await currentUserHasVerifiedPhone(), "still has no phone").toBe(false);
    expect(await currentUserHasVerifiedContact(), "email is a channel").toBe(true);
  });

  it("a phone-verified shopper with no email still claims — the old path is intact", async () => {
    currentUserMock.mockResolvedValue({ phoneNumbers: [verified], emailAddresses: [] });
    const { currentUserHasVerifiedContact } = await load();
    expect(await currentUserHasVerifiedContact()).toBe(true);
  });

  it("neither channel verified is still refused — the gate was widened, not removed", async () => {
    currentUserMock.mockResolvedValue({
      phoneNumbers: [unverified],
      emailAddresses: [unverified],
    });
    const { currentUserHasVerifiedContact } = await load();
    expect(await currentUserHasVerifiedContact()).toBe(false);
  });

  it("a signed-out visitor is refused", async () => {
    currentUserMock.mockResolvedValue(null);
    const { currentUserHasVerifiedContact } = await load();
    expect(await currentUserHasVerifiedContact()).toBe(false);
  });

  it("an unverified email does not count — the address must be proven", async () => {
    currentUserMock.mockResolvedValue({ phoneNumbers: [], emailAddresses: [unverified] });
    const { currentUserHasVerifiedEmail } = await load();
    expect(await currentUserHasVerifiedEmail()).toBe(false);
  });

  it("the email check never inherits the dev/CI phone relaxation", async () => {
    // phoneOtpEnabled() === false relaxes the PHONE check to true for rehearsal.
    // The email check must not pick that up, or CI would stop testing anything.
    phoneOtpEnabledMock.mockReturnValue(false);
    currentUserMock.mockResolvedValue({ phoneNumbers: [], emailAddresses: [unverified] });
    const { currentUserHasVerifiedEmail } = await load();
    expect(await currentUserHasVerifiedEmail()).toBe(false);
  });
});
