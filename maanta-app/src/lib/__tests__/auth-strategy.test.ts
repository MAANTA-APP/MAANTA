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
  it("defaults to supabase when unset", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "");
    expect(authStrategy()).toBe("supabase");
    expect(isClerkAuth()).toBe(false);
    expect(isSupabaseAuth()).toBe(true);
    expect(phoneOtpEnabled()).toBe(false);
  });

  it("supabase hint mentions account creation", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "supabase");
    expect(authStrategy()).toBe("supabase");
    expect(isSupabaseAuth()).toBe(true);
    expect(isClerkAuth()).toBe(false);
    expect(phoneOtpEnabled()).toBe(false);
    expect(authModeLoginHint()).toMatch(/account/i);
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
