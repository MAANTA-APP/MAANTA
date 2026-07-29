import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps the canonical design truth honest against the app.
 *
 * `maanta-app/design/current-reality/frames.json` is the checked-in statement of
 * what MAANTA currently is. Its weakest point is rot: a route gets renamed, the
 * JSON keeps naming the old one, and the "canonical" file quietly becomes
 * another stale mirror. These assertions make that a CI failure instead.
 *
 * Scope is deliberately narrow — it proves the map still matches the
 * territory's street names, not that any screen looks right. Visual/behavioural
 * review stays human (docs/skills/design-sync-checklist.md).
 */

const REPO_APP = path.resolve(__dirname, "../../..");
const FRAMES_PATH = path.join(REPO_APP, "design/current-reality/frames.json");
const APP_DIR = path.join(REPO_APP, "src/app");

type Smoke = {
  role?: string;
  heading?: string;
  redirectTarget?: string;
  denyRoles?: string[];
};

type Frame = {
  id: string;
  title: string;
  route: string | null;
  role: string;
  status: string;
  rules?: string[];
  supersededBy?: string;
  notes?: string;
  smoke?: Smoke;
};

type FramesFile = {
  version: number;
  lastVerified: string;
  provenance: { kind: string; awaitingSourceImport?: string };
  statusLabels: Record<string, string>;
  runtimeRules: Record<string, string>;
  smokeContract: Record<string, string>;
  frames: Frame[];
};

/** Roles the Playwright helpers can actually drive (e2e/helpers/roles.ts). */
const E2E_ROLES = [
  "shopper",
  "owner",
  "staffVerifyOnly",
  "staffDeals",
  "agent",
  "admin",
];

const doc: FramesFile = JSON.parse(readFileSync(FRAMES_PATH, "utf8"));

/**
 * Resolve a product route to a Next.js page file, accounting for App Router
 * route groups — `/feed` lives at `src/app/(shopper)/feed/page.tsx`, and
 * `/merchant/redeem` at `src/app/merchant/(app)/redeem/page.tsx`. Rather than
 * hardcode the group names, try the literal path and then every single-group
 * insertion at each depth.
 */
function routeExists(route: string): boolean {
  const segments = route.split("/").filter(Boolean);
  const groups = ["(public)", "(shopper)", "(app)"];

  const candidates: string[][] = [segments];
  for (const group of groups) {
    for (let i = 0; i <= segments.length; i++) {
      candidates.push([...segments.slice(0, i), group, ...segments.slice(i)]);
    }
  }

  return candidates.some((parts) =>
    existsSync(path.join(APP_DIR, ...parts, "page.tsx"))
  );
}

/** The directory holding a route's `page.tsx`, or null. */
function routeDir(route: string): string | null {
  const segments = route.split("/").filter(Boolean);
  const groups = ["(public)", "(shopper)", "(app)"];

  const candidates: string[][] = [segments];
  for (const group of groups) {
    for (let i = 0; i <= segments.length; i++) {
      candidates.push([...segments.slice(0, i), group, ...segments.slice(i)]);
    }
  }

  for (const parts of candidates) {
    const dir = path.join(APP_DIR, ...parts);
    if (existsSync(path.join(dir, "page.tsx"))) return dir;
  }
  return null;
}

/**
 * Source text a route can render: its own directory (client components live
 * next to the page here), plus the `@/...` modules that directory imports.
 *
 * Scoped to what the route actually pulls in — NOT all of `src/components`,
 * which would make a common heading like "Wallet" match somewhere unrelated and
 * turn the assertion vacuous. One import level is enough: a page either renders
 * its heading itself or delegates to one client component (e.g. `/browse` →
 * `BrowseClient`).
 *
 * This is a text search, not a render. Server components here hit Supabase at
 * module scope, so rendering them in vitest isn't viable — the real render
 * assertion is the Playwright smoke suite. What this catches is the cheap,
 * common failure: someone edits a heading and forgets frames.json.
 */
function readIfExists(base: string): string | null {
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const full = `${base}${ext}`;
    if (existsSync(full) && statSync(full).isFile()) return readFileSync(full, "utf8");
  }
  return null;
}

function sourceFor(route: string): string {
  const dir = routeDir(route);
  if (!dir) return "";

  const localFiles = readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => readFileSync(path.join(dir, f), "utf8"));
  const local = localFiles.join("\n");

  // Follow `@/...` imports one level deep, resolved against src/.
  const imported: string[] = [];
  const importRe = /from\s+"@\/([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(local)) !== null) {
    const src = readIfExists(path.join(REPO_APP, "src", match[1]));
    if (src) imported.push(src);
  }

  return [local, ...imported].join("\n");
}

describe("design truth: frames.json integrity", () => {
  it("declares a known status for every frame", () => {
    const known = Object.keys(doc.statusLabels);
    for (const f of doc.frames) {
      expect(known, `${f.id} has status "${f.status}"`).toContain(f.status);
    }
  });

  it("uses unique frame ids", () => {
    const ids = doc.frames.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only cites runtime rules that are defined", () => {
    const defined = Object.keys(doc.runtimeRules);
    for (const f of doc.frames) {
      for (const rule of f.rules ?? []) {
        expect(defined, `${f.id} cites rule "${rule}"`).toContain(rule);
      }
    }
  });

  it("points every superseded frame at a real replacement", () => {
    const ids = new Set(doc.frames.map((f) => f.id));
    for (const f of doc.frames.filter((x) => x.status === "superseded")) {
      expect(f.supersededBy, `${f.id} must name its replacement`).toBeTruthy();
      expect(ids, `${f.id} supersededBy`).toContain(f.supersededBy!);
    }
  });
});

describe("design truth: current frames match real routes", () => {
  const current = doc.frames.filter((f) => f.status === "current");

  it("covers every role surface (a sanity floor, not a cap)", () => {
    const roles = new Set(current.map((f) => f.role));
    for (const role of ["shopper", "merchant", "admin", "agent", "founder"]) {
      expect(roles).toContain(role);
    }
  });

  it.each(current.map((f) => [f.id, f.route] as const))(
    "%s → %s resolves to a page in src/app",
    (id, route) => {
      expect(route, `${id} is current, so it must name a route`).toBeTruthy();
      expect(routeExists(route!), `${id}: no page.tsx for ${route}`).toBe(true);
    }
  );
});

describe("design truth: design-ahead frames stay unbuilt", () => {
  const ahead = doc.frames.filter((f) => f.status === "design-ahead");

  it("has at least one deferred frame recorded", () => {
    // If this ever hits zero, it is far more likely someone deleted the record
    // of what we deliberately did NOT build than that we shipped all of it.
    expect(ahead.length).toBeGreaterThan(0);
  });

  it.each(ahead.map((f) => [f.id] as const))(
    "%s declares no route — promote it to `current` when it ships",
    (id) => {
      const frame = ahead.find((f) => f.id === id)!;
      expect(frame.route).toBeNull();
    }
  );
});

describe("design truth: smoke contract is well formed", () => {
  const withSmoke = doc.frames.filter((f) => f.smoke);

  it("keeps a behavioural contract on the critical frames", () => {
    // A floor, not a cap. If this collapses, someone deleted coverage.
    expect(withSmoke.length).toBeGreaterThanOrEqual(15);
  });

  it.each(withSmoke.map((f) => [f.id] as const))(
    "%s declares exactly one of heading | redirectTarget, and a drivable role",
    (id) => {
      const { smoke } = doc.frames.find((f) => f.id === id)!;
      const kinds = [smoke!.heading, smoke!.redirectTarget].filter(Boolean);
      expect(kinds, `${id}: heading XOR redirectTarget`).toHaveLength(1);
      expect(E2E_ROLES, `${id}: smoke.role`).toContain(smoke!.role);
      for (const deny of smoke!.denyRoles ?? []) {
        expect(E2E_ROLES, `${id}: denyRoles`).toContain(deny);
        expect(deny, `${id}: cannot deny its own driving role`).not.toBe(smoke!.role);
      }
    }
  );

  it("only puts a smoke contract on `current` frames", () => {
    for (const f of withSmoke) {
      expect(f.status, `${f.id}`).toBe("current");
    }
  });
});

describe("design truth: declared anchors exist in the app", () => {
  const headings = doc.frames.filter((f) => f.smoke?.heading);

  it.each(headings.map((f) => [f.id, f.smoke!.heading!] as const))(
    "%s renders the heading %o somewhere in its source",
    (id, heading) => {
      const frame = doc.frames.find((f) => f.id === id)!;
      const src = sourceFor(frame.route!);
      expect(src, `${id}: no source found for ${frame.route}`).not.toBe("");
      expect(
        src.includes(heading),
        `${id}: frames.json promises the heading "${heading}" at ${frame.route}, but no source under that route (or src/components) contains it. Either the heading was renamed — update frames.json — or the anchor was removed and the smoke test would now fail.`
      ).toBe(true);
    }
  );

  const redirects = doc.frames.filter((f) => f.smoke?.redirectTarget);

  it.each(redirects.map((f) => [f.id, f.smoke!.redirectTarget!] as const))(
    "%s actually redirects to %s",
    (id, target) => {
      const frame = doc.frames.find((f) => f.id === id)!;
      const dir = routeDir(frame.route!);
      expect(dir, `${id}: no page for ${frame.route}`).not.toBeNull();
      const page = readFileSync(path.join(dir!, "page.tsx"), "utf8");
      expect(
        page.includes(`redirect("${target}")`),
        `${id}: ${frame.route} should redirect("${target}")`
      ).toBe(true);
    }
  );

  it("points every redirect target at a route that exists", () => {
    for (const f of redirects) {
      expect(routeExists(f.smoke!.redirectTarget!), `${f.id} target`).toBe(true);
    }
  });
});

describe("design truth: provenance is not faked", () => {
  it("labels a reconstructed mirror as a mirror", () => {
    // The real Maanta Current Reality.dc.html was never available in-repo. Until
    // it is imported, this file must not claim to BE it.
    if (doc.provenance.kind === "repo-native-mirror") {
      expect(doc.provenance.awaitingSourceImport).toBeTruthy();
    } else {
      expect(doc.provenance.kind).toBe("imported");
    }
  });

  it("carries a verification date", () => {
    expect(doc.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
