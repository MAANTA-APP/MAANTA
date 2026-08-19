import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * `design/current-reality/frames.json` is what `CLAUDE.md` sends "is this
 * shipped, or design-ahead?" to. Drift **D94** recorded that it omitted
 * `/download` and `/app-bootstrap` — the install landing and the manifest
 * `start_url`, i.e. the entry point of the installed product — so the canonical
 * surface inventory did not contain the first screen an installed user sees.
 *
 * Two properties are pinned here, both of which were untrue when D94 was opened:
 *
 *  1. **The PWA entry surfaces are present and live.** Named explicitly, because
 *     they are the two the inventory actually lost and the reason the row exists.
 *  2. **Every `frontend` path resolves on disk.** That is the general form of the
 *     same failure, and it was not hypothetical: the `/contact` entry still cited
 *     `(public)/contact/page.tsx` long after the route group was renamed to
 *     `(marketing)`, so the one design-ahead surface in the file pointed at a
 *     directory that does not exist. A path check catches that class without
 *     anyone having to remember to look.
 *
 * Deliberately **not** asserted here: that every `design-ahead` surface cites an
 * open drift row. That guardrail is **D26**, and whether it should be mandatory
 * is a founder call, not a test author's.
 */

const APP = path.resolve(__dirname, "..", "..", "..");
const FRAMES = path.join(APP, "design", "current-reality", "frames.json");

type Surface = {
  route: string;
  status: string;
  frontend: string[] | null;
  notes?: string | null;
};


/**
 * The file's `frontend` entries follow no single convention: some are rooted at
 * `maanta-app/` (`src/app/(marketing)/download/page.tsx`), some at `src/app/`
 * (`admin/page.tsx`), and some are bare basenames (`claim-flow.tsx`). Rather
 * than rewrite twenty-one unrelated entries in a change about two new ones, the
 * resolver tries those forms in order and, failing all of them, looks for a
 * single file anywhere under `src/` whose path ends with the entry.
 *
 * It is deliberately *not* a wildcard: a unique tail match is a real file the
 * reader can open, while an ambiguous or absent one is exactly the stale
 * citation this test exists to catch. `(public)/contact/page.tsx` failed every
 * branch, which is how the retired route group surfaced. The inconsistent
 * convention itself is tracked as drift **D140**.
 */
const SRC = path.join(APP, "src");

function allSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) allSourceFiles(full, out);
    else out.push(full);
  }
  return out;
}

const SOURCE_FILES = allSourceFiles(SRC);

function resolves(rel: string): boolean {
  const clean = rel.replace(/^\.\//, "");
  if (existsSync(path.join(APP, clean))) return true;
  if (existsSync(path.join(APP, "src", "app", clean))) return true;
  const suffix = `${path.sep}${clean.split("/").join(path.sep)}`;
  return SOURCE_FILES.filter((f) => f.endsWith(suffix)).length === 1;
}

const inventory = JSON.parse(readFileSync(FRAMES, "utf8")) as {
  surfaces: Surface[];
};

describe("frames.json — the canonical surface inventory", () => {
  it("parses and is not empty", () => {
    expect(inventory.surfaces.length).toBeGreaterThan(0);
  });

  it("includes the installed product's entry surfaces (D94)", () => {
    for (const route of ["/download", "/app-bootstrap"]) {
      const surface = inventory.surfaces.find((s) => s.route === route);
      expect(surface, `${route} is missing from the inventory`).toBeDefined();
      expect(surface?.status).toBe("live");
      expect(surface?.frontend?.length ?? 0).toBeGreaterThan(0);
      // The install funnel is unproven rather than working; the entry that
      // describes it has to say so, or a reader takes "live" for "works".
      expect(surface?.notes ?? "").toMatch(/drift D9[235]/);
    }
  });

  it("cites only frontend paths that exist", () => {
    const missing: string[] = [];
    for (const s of inventory.surfaces) {
      for (const rel of s.frontend ?? []) {
        if (!resolves(rel)) missing.push(`${s.route}  →  ${rel}`);
      }
    }
    expect(
      missing,
      "frames.json points at files that do not exist. A stale path makes the " +
        "inventory read as coverage while pointing a reader nowhere — the " +
        "`(public)/` route group survived in the /contact entry long after it " +
        `was renamed to (marketing):\n${missing.join("\n")}`
    ).toEqual([]);
  });
});
