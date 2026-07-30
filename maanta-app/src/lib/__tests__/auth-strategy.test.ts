import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_STRATEGIES,
  DEFAULT_AUTH_STRATEGY,
  authModeLoginHint,
  authStrategy,
  authStrategyClient,
  isClerkAuth,
  isClerkAuthClient,
  isSupabaseAuth,
  phoneOtpEnabled,
} from "../auth/strategy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth strategy toggle", () => {
  it("defaults to supabase when unset (production rehearsal)", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "");
    expect(DEFAULT_AUTH_STRATEGY).toBe("supabase");
    expect(authStrategy()).toBe("supabase");
    expect(authStrategyClient()).toBe("supabase");
    expect(isClerkAuth()).toBe(false);
    expect(isClerkAuthClient()).toBe(false);
    expect(isSupabaseAuth()).toBe(true);
    expect(phoneOtpEnabled()).toBe(false);
    expect(authModeLoginHint()).toMatch(/email/i);
  });

  it("uses clerk only when both server and public vars are explicitly clerk", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "clerk");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "clerk");
    expect(authStrategy()).toBe("clerk");
    expect(authStrategyClient()).toBe("clerk");
    expect(isClerkAuth()).toBe(true);
    expect(isClerkAuthClient()).toBe(true);
    expect(phoneOtpEnabled()).toBe(true);
    expect(authModeLoginHint()).toMatch(/phone/i);
  });

  it("does not enable clerk when only the server var is clerk", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "clerk");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "");
    expect(isClerkAuth()).toBe(false);
    expect(isClerkAuthClient()).toBe(false);
    expect(authStrategy()).toBe("supabase");
    expect(phoneOtpEnabled()).toBe(false);
  });

  it("does not enable clerk when only the public var is clerk", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "clerk");
    expect(isClerkAuth()).toBe(false);
    expect(isClerkAuthClient()).toBe(true);
    expect(authStrategy()).toBe("supabase");
    expect(phoneOtpEnabled()).toBe(false);
  });

  it("supports supabase dev/test strategy", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "supabase");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "supabase");
    expect(authStrategy()).toBe("supabase");
    expect(isSupabaseAuth()).toBe(true);
    expect(isClerkAuth()).toBe(false);
    expect(phoneOtpEnabled()).toBe(false);
  });

  it("treats authjs like supabase for now", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "authjs");
    expect(isSupabaseAuth()).toBe(true);
    expect(phoneOtpEnabled()).toBe(false);
  });

  it("lists all supported strategies", () => {
    expect(AUTH_STRATEGIES).toEqual(["clerk", "supabase", "authjs"]);
  });

  it("never enables clerk when server and public vars disagree", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "supabase");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "clerk");
    expect(isClerkAuth()).toBe(false);
    expect(authStrategy()).toBe("supabase");
    expect(authStrategyClient()).toBe("clerk");
    expect(phoneOtpEnabled()).toBe(false);
  });

  it("falls back to supabase when server is clerk but public is supabase", () => {
    vi.stubEnv("MAANTA_AUTH_STRATEGY", "clerk");
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "supabase");
    expect(isClerkAuth()).toBe(false);
    expect(authStrategy()).toBe("supabase");
    expect(isClerkAuthClient()).toBe(false);
  });
});
