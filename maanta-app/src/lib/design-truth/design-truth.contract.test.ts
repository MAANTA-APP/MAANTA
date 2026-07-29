import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadContract,
  loadFrames,
  loadSmokeFrames,
  resolveRouteDir,
  routeExists,
  sourceFilePath,
} from "./load";
import {
  AUTH_STATES,
  CAPTURE_READINESS,
  EVIDENCE_SOURCES,
  PROTOTYPE_STATUSES,
  ROLES,
  STATUSES,
} from "./schema";

/**
 * Layer 1 — static contract. Pure, no browser, runs on every PR.
 *
 * `design/current-reality/frames.json` is a MANUALLY verified, design-authored
 * mirror. It will rot. These assertions are what turn rot into a CI failure
 * instead of a stale document nobody notices: the route check in particular is
 * what catches a renamed route still named in the mirror.
 *
 * Layers 2 (behavioural smoke) and 3 (scripts) are in
 * `e2e/design-truth-smoke.spec.ts` and package.json.
 */

const contract = loadContract();
const frames = loadFrames();

describe("contract parses", () => {
  it("validates against the Zod mirror of frames.schema.json", () => {
    // loadContract() throws with the offending frame id, so reaching here is
    // the assertion. Guard the shape we then rely on.
    expect(frames.length).toBeGreaterThan(0);
    expect(contract.mirror.artifact).toBe("maanta-current-reality");
  });

  it("keeps the fixed truth order: Notion, then repo, then design system", () => {
    expect(contract.mirror.truthOrder).toEqual([
      "notion:product-and-current-state",
      "repo:implementation",
      "design-system:visual",
    ]);
  });

  it("labels itself design-authored, never repo-derived", () => {
    expect(contract.mirror.provenance).toContain("NOT EXTRACTED FROM THE REPO");
  });

  it("uses unique frame ids", () => {
    const ids = frames.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("references resolve", () => {
  it.each(frames.map((f) => [f.id, f.runtimeRule] as const))(
    "%s runtimeRule %s resolves to a key in runtimeRules",
    (_id, rule) => {
      expect(Object.keys(contract.runtimeRules)).toContain(rule);
    }
  );

  it("every driftId resolves to a drift row", () => {
    const driftIds = contract.drift.map((d) => d.id);
    for (const f of frames.filter((x) => x.driftId)) {
      expect(driftIds, `${f.id}.driftId`).toContain(f.driftId!);
    }
  });

  it("every supersedes resolves to a superseded row", () => {
    const supersededIds = contract.superseded.map((s) => s.id);
    for (const f of frames.filter((x) => x.supersedes)) {
      expect(supersededIds, `${f.id}.supersedes`).toContain(f.supersedes!);
    }
  });

  it("no runtime rule is declared but unused, except by documented exception", () => {
    // A rule nobody references is usually a frame that forgot to cite it. Two
    // are deliberately uncited and must stay that way:
    const ALLOWED_UNREFERENCED: Record<string, string> = {
      "R-VERIFY-ANYWAY":
        "DISPUTED (drift D-07). Deliberately not cited by any frame — citing it would pick a side of an unresolved product decision.",
      "R-FEE-ON-VERIFIED":
        "Money-path invariant asserted by supabase/tests/*.sql, not owned by a single frame; 10a cites R-RESOLVE-THEN-CHARGE for the UI order.",
    };
    const used = new Set(frames.map((f) => f.runtimeRule));
    const unused = Object.keys(contract.runtimeRules).filter(
      (r) => !used.has(r) && !(r in ALLOWED_UNREFERENCED)
    );
    expect(unused, `unreferenced runtimeRules: ${unused.join(", ")}`).toEqual([]);

    // And the exceptions must still exist, so this list cannot rot silently.
    for (const rule of Object.keys(ALLOWED_UNREFERENCED)) {
      expect(Object.keys(contract.runtimeRules), `stale exception ${rule}`).toContain(rule);
    }
  });
});

describe("routes resolve to real pages", () => {
  // THE check that catches a stale route name in the mirror.
  it.each(frames.map((f) => [f.id, f.route] as const))(
    "%s route %s resolves to a page in src/app",
    (id, route) => {
      expect(
        routeExists(route),
        `${id}: no page.tsx resolves for "${route}". Either the route was renamed (fix the mirror) or the screen was deleted (fix the status).`
      ).toBe(true);
    }
  );

  it("resolves dynamic segments to a real dynamic directory", () => {
    // [id] in the contract must land on an actual [param] dir, not be skipped.
    const dynamic = frames.filter((f) => f.route.includes("["));
    expect(dynamic.length).toBeGreaterThan(0);
    for (const f of dynamic) {
      const dir = resolveRouteDir(f.route);
      expect(dir, `${f.id} ${f.route}`).toBeTruthy();
      expect(dir!, `${f.id} resolved outside a dynamic dir`).toMatch(/\[[^\]]+\]/);
    }
  });
});

describe("sourceFiles exist on disk", () => {
  const pairs = frames.flatMap((f) => f.sourceFiles.map((p) => [f.id, p] as const));

  it.each(pairs)("%s sourceFile %s exists", (id, relative) => {
    expect(
      existsSync(sourceFilePath(relative)),
      `${id}: sourceFiles names "${relative}", which is not on disk. A moved file makes the mirror lie about where the screen lives.`
    ).toBe(true);
  });
});

describe("smoke eligibility is complete and honest", () => {
  const smoke = loadSmokeFrames();

  it("matches the number of frames marked smoke", () => {
    // Anti-fake-sync: a smoke-marked frame can never sit uncovered because the
    // Playwright suite generates from this same list.
    expect(smoke.length).toBe(frames.filter((f) => f.smoke).length);
  });

  it("covers every role that has a smoke-eligible surface", () => {
    const roles = new Set(smoke.map((f) => f.role));
    for (const role of ["shopper", "merchant", "agent", "founder", "admin", "public"]) {
      expect(roles, `no smoke frame for role ${role}`).toContain(role);
    }
  });

  it("never smoke-tests unshipped behaviour", () => {
    for (const f of smoke) {
      expect(f.status, `${f.id}`).not.toBe("design-ahead");
    }
  });

  it.each(smoke.map((f) => [f.id] as const))(
    "%s declares an anchor, a role and an auth state",
    (id) => {
      const f = smoke.find((x) => x.id === id)!;
      expect(f.expectedHeading ?? f.expectedAnchor).toBeTruthy();
      expect(f.requiredRole).toBeTruthy();
      expect(AUTH_STATES).toContain(f.authState);
    }
  );

  it.each(smoke.map((f) => [f.id] as const))(
    "%s anchor text exists in the source it names",
    (id) => {
      // Cheap guard that runs without a browser: the anchor the smoke suite
      // will look for must at least be present in the frame's own sources.
      // Catches a renamed heading long before the Playwright suite runs.
      const f = smoke.find((x) => x.id === id)!;
      const anchor = f.expectedHeading ?? f.expectedAnchor!;
      const sources = f.sourceFiles
        .map((rel) => sourceFilePath(rel))
        .filter((abs) => existsSync(abs))
        .map((abs) => readFileSync(abs, "utf8"));
      const dir = resolveRouteDir(f.route);
      const local = dir
        ? readdirSync(dir)
            .filter((n) => /\.tsx?$/.test(n))
            .map((n) => readFileSync(path.join(dir, n), "utf8"))
        : [];
      // JSX must escape apostrophes (`react/no-unescaped-entities`), so the
      // source says `can&apos;t` where the DOM — and therefore Playwright —
      // sees `can't`. Normalise before comparing, or every anchor containing an
      // apostrophe would fail here while passing in the browser.
      const normalise = (s: string) =>
        s.replace(/&apos;|&#39;|&rsquo;/g, "'").replace(/&amp;/g, "&");
      const haystack = normalise([...sources, ...local].join("\n"));
      expect(
        haystack.includes(normalise(anchor)),
        `${id}: the contract promises the anchor "${anchor}" on ${f.route}, but it appears in none of the frame's sourceFiles or co-located files. Add the anchor to the app, or correct the contract.`
      ).toBe(true);
    }
  );
});

describe("capture readiness is safe", () => {
  it("keeps every founder and admin surface internal-only", () => {
    for (const f of frames.filter((x) => x.role === "founder" || x.role === "admin")) {
      expect(f.captureReadiness, `${f.id} is ${f.role}`).toBe("internal-only");
    }
  });

  it("gives a reason for every label except safe-now", () => {
    for (const f of frames.filter((x) => x.captureReadiness !== "safe-now")) {
      expect(f.captureReadinessReason, `${f.id}`).toBeTruthy();
    }
  });
});

describe("no declared enum value is unexercised", () => {
  // Anti-fake-sync 8: an enum value nobody uses is either dead schema or a
  // frame that should have used it. `allowedUnused` documents the exceptions.
  const allowedUnused: Record<string, string[]> = {
    // No frame is currently blocked by design or by product — both blocked
    // frames are blocked by code (M8) or intentionally out of prototype scope.
    prototypeStatus: ["blocked-design", "blocked-product"],
    // The contract carries no redirect-only frame yet.
    authState: [],
  };

  const check = (
    field: string,
    values: readonly string[],
    used: Set<string>
  ) => {
    const unused = values.filter(
      (v) => !used.has(v) && !(allowedUnused[field] ?? []).includes(v)
    );
    expect(unused, `${field}: unexercised enum values ${unused.join(", ")}`).toEqual([]);
  };

  it("exercises every role, status, prototypeStatus, captureReadiness and evidenceSource", () => {
    check("role", ROLES, new Set(frames.map((f) => f.role)));
    check("status", STATUSES, new Set(frames.map((f) => f.status)));
    check(
      "prototypeStatus",
      PROTOTYPE_STATUSES,
      new Set(frames.map((f) => f.prototypeStatus))
    );
    check(
      "captureReadiness",
      CAPTURE_READINESS,
      new Set(frames.map((f) => f.captureReadiness))
    );
    check(
      "evidenceSource",
      EVIDENCE_SOURCES,
      new Set(frames.map((f) => f.evidenceSource))
    );
  });
});
