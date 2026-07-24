import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { liveness, envPresence } from "../health";

// health.ts must (a) report liveness without touching any dependency, and
// (b) report env presence as booleans only — never a value, so it can't leak a
// secret. These tests mutate process.env and restore it.

const TOUCHED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLERK_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
  "W3W_API_KEY",
  "VERCEL_GIT_COMMIT_SHA",
  "NODE_ENV",
  "NEXT_RUNTIME",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of TOUCHED) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("liveness()", () => {
  it("reports status ok with runtime metadata and a numeric uptime", () => {
    const l = liveness();
    expect(l.status).toBe("ok");
    expect(typeof l.nodeEnv).toBe("string");
    expect(typeof l.runtime).toBe("string");
    expect(typeof l.uptimeSeconds).toBe("number");
    expect(l.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("redacts the build commit to a short SHA, or null when unset", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890";
    expect(liveness().commit).toBe("abcdef1");
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    expect(liveness().commit).toBeNull();
  });
});

describe("envPresence()", () => {
  it("reports true only when a var is set to a non-blank value", () => {
    process.env.RESEND_API_KEY = "re_live_xxx";
    expect(envPresence().email.RESEND_API_KEY).toBe(true);
  });

  it("treats a blank / whitespace-only var as absent", () => {
    process.env.W3W_API_KEY = "   ";
    expect(envPresence().geo.W3W_API_KEY).toBe(false);
    delete process.env.W3W_API_KEY;
    expect(envPresence().geo.W3W_API_KEY).toBe(false);
  });

  it("exposes booleans only — never the secret value anywhere in the output", () => {
    const secret = "super-secret-service-role-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = secret;
    const out = envPresence();
    expect(out.supabase.SUPABASE_SERVICE_ROLE_KEY).toBe(true);
    // The serialized map must not contain the value, only the boolean.
    expect(JSON.stringify(out)).not.toContain(secret);
    // Every leaf is a boolean.
    for (const group of Object.values(out)) {
      for (const v of Object.values(group)) {
        expect(typeof v).toBe("boolean");
      }
    }
  });

  it("covers every critical rail group", () => {
    const out = envPresence();
    expect(Object.keys(out).sort()).toEqual(
      ["auth", "email", "geo", "monitoring", "payments", "push", "supabase"].sort()
    );
  });
});
