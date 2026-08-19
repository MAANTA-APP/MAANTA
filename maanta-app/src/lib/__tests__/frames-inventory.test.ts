import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
 *     anyone having to remember to look. Entries are rooted at `maanta-app/`
 *     since D140 normalised them, so the check is exact rather than a search.
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
 * Every `frontend` entry is rooted at `maanta-app/` — one convention, so the
 * check is a plain existence test. It was not always so: the file mixed three
 * rooting styles, and this test's first version resolved each entry through all
 * of them plus a unique-tail search. That resolver earned its keep once — it
 * caught a citation of the retired `(public)/` route group and a bare basename
 * matching four files — and then the entries were normalised (drift **D140**)
 * and the resolver deleted, because a lenient matcher kept beyond its purpose
 * teaches the next author that any spelling is fine.
 */
function resolves(rel: string): boolean {
  return existsSync(path.join(APP, rel));
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
      "frames.json points at files that do not exist. Entries are rooted at " +
        "maanta-app/ (one convention — D140); a stale path makes the inventory " +
        "read as coverage while pointing a reader nowhere, which is how the " +
        "retired (public)/ route group survived in the /contact entry:\n" +
        missing.join("\n")
    ).toEqual([]);
  });
});
