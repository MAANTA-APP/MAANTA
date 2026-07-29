import { readFileSync, existsSync } from "node:fs";
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

type Frame = {
  id: string;
  title: string;
  route: string | null;
  role: string;
  status: string;
  rules?: string[];
  supersededBy?: string;
  notes?: string;
};

type FramesFile = {
  version: number;
  lastVerified: string;
  provenance: { kind: string; awaitingSourceImport?: string };
  statusLabels: Record<string, string>;
  runtimeRules: Record<string, string>;
  frames: Frame[];
};

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
