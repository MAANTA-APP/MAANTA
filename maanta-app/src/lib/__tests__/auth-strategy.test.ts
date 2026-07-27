import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_STRATEGIES,
  authModeLoginHint,
  authStrategy,
  isClerkAuth,
  isSupabaseAuth,
  phoneOtpEnabled,
} from "../auth/strategy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth strategy toggle", () => {
  it("defaults to clerk when unset", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "");
    expect(authStrategy()).toBe("clerk");
    expect(isClerkAuth()).toBe(true);
    expect(isSupabaseAuth()).toBe(false);
    expect(phoneOtpEnabled()).toBe(true);
  });

  it("supports supabase dev/test strategy", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "supabase");
    expect(authStrategy()).toBe("supabase");
    expect(isSupabaseAuth()).toBe(true);
    expect(isClerkAuth()).toBe(false);
    expect(phoneOtpEnabled()).toBe(false);
    expect(authModeLoginHint()).toMatch(/email/i);
  });

  it("treats authjs like supabase for now", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "authjs");
    expect(isSupabaseAuth()).toBe(true);
    expect(phoneOtpEnabled()).toBe(false);
  });

  it("lists all supported strategies", () => {
    expect(AUTH_STRATEGIES).toEqual(["clerk", "supabase", "authjs"]);
  });

  it("clerk launch hint mentions phone", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "clerk");
    expect(authModeLoginHint()).toMatch(/phone/i);
  });
});
