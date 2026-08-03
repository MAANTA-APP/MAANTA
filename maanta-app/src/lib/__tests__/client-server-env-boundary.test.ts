import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walk, relToSrc } from "./helpers/source-files";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Guard for drift **D80** — a client component calling a strategy helper that
 * depends on a server-only environment variable.
 *
 * Next.js inlines only `NEXT_PUBLIC_*` into client bundles. Every other
 * `process.env` read is `undefined` in the browser. So a helper that reads
 * `MAANTA_AUTH_STRATEGY` does not merely become unreliable in a client
 * component — it becomes **constant**, and silently takes one branch forever.
 *
 * That is what happened on `/verify-phone`. The page was `"use client"` in its
 * entirety and gated on `phoneOtpEnabled()`, which requires *both* auth vars.
 * The server-only half read `undefined` in the browser, so the gate was false on
 * every hydration and production rendered the Supabase branch — whose
 * `getSession()` call then threw against a Clerk `accessToken` client. The
 * visible symptom was a Sentry error; the real cost was that the Clerk phone-OTP
 * flow never rendered on the surface a shopper must pass to claim a deal.
 *
 * A type checker cannot catch this: the call compiles, runs, and returns a
 * plausible boolean. Only the boundary itself can be asserted, so it is asserted
 * here. The fix is always the same shape — decide on the server, pass the
 * resolved value down as a prop.
 */

const SRC = path.resolve(__dirname, "..", "..");

/**
 * Helpers whose result depends on a variable the browser cannot see.
 *
 * Deliberately a denylist of the server-only ones rather than a blanket ban on
 * the module: `isClerkAuthClient` and `isSupabaseAuthClient` read `NEXT_PUBLIC_*`
 * only and are exactly what a client component *should* use, so banning the
 * import wholesale would push authors toward worse workarounds.
 */
const SERVER_ONLY_HELPERS = [
  "isClerkAuth",
  "authStrategy",
  "isSupabaseAuth",
  "isAuthJsAuth",
  "phoneOtpEnabled",
  "authModeLoginHint",
] as const;

/** `isClerkAuth(` must not match `isClerkAuthClient(` — hence the boundary. */
function callsServerOnlyHelper(code: string): string[] {
  return SERVER_ONLY_HELPERS.filter((name) =>
    new RegExp(`\\b${name}\\s*\\(`).test(code)
  );
}

function isClientModule(code: string): boolean {
  // The directive must lead the file to apply, so only look at the top.
  return /^\s*(?:["']use client["'])/.test(code);
}

describe("client components never call server-only strategy helpers (D80)", () => {
  it("flags a server-only helper and not its *Client counterpart", () => {
    // Fixture-proves the detector, so the repo scan below cannot go vacuous the
    // way the injection scan did (D69). The `Client` suffixes must stay clean:
    // those are the correct client-side calls.
    expect(callsServerOnlyHelper("if (isClerkAuth()) {}")).toEqual(["isClerkAuth"]);
    expect(callsServerOnlyHelper("if (phoneOtpEnabled()) {}")).toEqual([
      "phoneOtpEnabled",
    ]);
    expect(callsServerOnlyHelper("if (isClerkAuthClient()) {}")).toEqual([]);
    expect(callsServerOnlyHelper("if (isSupabaseAuthClient()) {}")).toEqual([]);
  });

  it("finds client modules to check, so the scan is not vacuous", () => {
    const clientModules = walk(SRC).filter((f) =>
      isClientModule(readFileSync(f, "utf8"))
    );
    expect(
      clientModules.length,
      'no "use client" modules found — did the scan break?'
    ).toBeGreaterThan(0);
  });

  it("no client module calls one", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const raw = readFileSync(file, "utf8");
      if (!isClientModule(raw)) continue;
      const hits = callsServerOnlyHelper(stripComments(raw));
      if (hits.length > 0) {
        offenders.push(`${relToSrc(SRC, file)} -> ${hits.join(", ")}`);
      }
    }

    expect(
      offenders,
      "These helpers read MAANTA_AUTH_STRATEGY, which Next.js does not inline\n" +
        "into client bundles — in the browser it is `undefined`, so the helper\n" +
        "returns a constant and the branch is decided at build time, not by config.\n" +
        "Resolve it in a server component and pass the value down as a prop, the way\n" +
        "src/app/verify-phone/page.tsx does. If you only need the public strategy,\n" +
        "use isClerkAuthClient() / isSupabaseAuthClient() instead."
    ).toEqual([]);
  });
});
