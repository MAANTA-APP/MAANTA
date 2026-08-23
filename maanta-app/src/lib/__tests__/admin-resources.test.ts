import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_RESOURCES, AUDIENCE_LABELS } from "@/lib/admin-resources";

/**
 * Guards for the admin resource centre.
 *
 * The registry's whole value is that an admin can trust it, so the checks are
 * about trust, not formatting: every live link resolves to a real page, every
 * reference names a location that exists when it claims to be in this repo, and
 * the welcome-pack gaps stay visible until the packs are written.
 */

const APP_DIR = path.resolve(__dirname, "..", "..", "app");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

/** All routes served by the app: page.tsx paths with route groups stripped. */
function collectRoutes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
      out.push(
        ...collectRoutes(
          path.join(dir, entry.name),
          isGroup ? prefix : `${prefix}/${entry.name}`
        )
      );
    } else if (entry.name === "page.tsx") {
      out.push(prefix === "" ? "/" : prefix);
    }
  }
  return out;
}

const ROUTES = new Set(collectRoutes(APP_DIR));

describe("admin resource registry", () => {
  it("every live href is a route this app actually serves", () => {
    // A resource centre that 404s teaches admins to stop trusting it.
    const dead = ADMIN_RESOURCES.filter(
      (r) => r.access.kind === "live" && !ROUTES.has(r.access.href)
    ).map((r) => `${r.title} → ${(r.access as { href: string }).href}`);
    expect(dead, "live resources pointing at routes that do not exist").toEqual([]);
  });

  it("every repo reference points at a file that exists", () => {
    const missing = ADMIN_RESOURCES.filter((r) => {
      if (r.access.kind !== "reference") return false;
      const loc = r.access.location;
      if (!loc.startsWith("repo: ")) return false;
      return !existsSync(path.resolve(REPO_ROOT, loc.slice("repo: ".length)));
    }).map((r) => r.title);
    expect(missing, "repo references that resolve to nothing").toEqual([]);
  });

  it("covers every audience the console serves, plus ops", () => {
    for (const aud of Object.keys(AUDIENCE_LABELS)) {
      expect(
        ADMIN_RESOURCES.some((r) => r.audience === aud),
        `no resources listed for audience "${aud}"`
      ).toBe(true);
    }
  });

  it("keeps the unwritten welcome-pack gaps visible", () => {
    // The ratchet, narrowed on 2026-08-22 rather than deleted: a row leaves
    // this list by being WRITTEN (and becoming a resolvable reference — the
    // repo-reference test above then covers it), never by being removed from
    // the registry. Shopper and mall-operator packs are still open.
    for (const aud of ["shopper", "mall_operator"] as const) {
      const pack = ADMIN_RESOURCES.find(
        (r) => r.audience === aud && /welcome pack/i.test(r.title)
      );
      expect(pack, `${aud} has no welcome-pack row`).toBeTruthy();
      expect(pack?.access.kind, `${aud} welcome pack must stay marked missing until written`).toBe(
        "missing"
      );
    }
  });

  it("gives the field operator the merchant-visit set, all resolvable", () => {
    // What someone running a first merchant loop test reaches for: the visit
    // protocol, what they leave at the shop, and the day around it. A title
    // rename or a moved file must fail here rather than at a counter.
    const required = [
      "docs/ops/first-merchant-loop-test.md",
      "docs/ops/merchant-welcome-pack.md",
      "docs/ops/field-operator-day-sheet.md",
    ];
    for (const rel of required) {
      const row = ADMIN_RESOURCES.find(
        (r) => r.access.kind === "reference" && r.access.location === `repo: ${rel}`
      );
      expect(row, `${rel} is not listed in the resource centre`).toBeTruthy();
      expect(existsSync(path.resolve(REPO_ROOT, rel)), `${rel} does not exist`).toBe(true);
    }
  });

  it("marks every legal resource as DRAFT — none is lawyer-reviewed", () => {
    const legalHrefs = ["/terms", "/privacy", "/cookies", "/merchant-terms"];
    for (const href of legalHrefs) {
      const r = ADMIN_RESOURCES.find(
        (x) => x.access.kind === "live" && x.access.href === href
      );
      expect(r, `legal route ${href} missing from the registry`).toBeTruthy();
      expect(`${r?.title}`, `${href} must carry the DRAFT marker`).toMatch(/DRAFT/);
    }
  });

  it("references never carry an href and live entries never carry a location", () => {
    // The type union enforces this at compile time; this pins it against a
    // future refactor loosening the union to optional fields.
    for (const r of ADMIN_RESOURCES) {
      if (r.access.kind === "live") expect(r.access.href.startsWith("/")).toBe(true);
      if (r.access.kind === "reference") {
        expect(/^(repo|Notion): /.test(r.access.location), `${r.title} location format`).toBe(true);
      }
    }
  });
});

describe("the console reaches the resource centre", () => {
  it("is in the admin sidebar and served at /admin/resources", () => {
    const sidebar = readFileSync(
      path.resolve(__dirname, "..", "..", "components", "nav", "admin-sidebar.tsx"),
      "utf8"
    );
    expect(sidebar).toContain('{ href: "/admin/resources", label: "Resources" }');
    expect(ROUTES.has("/admin/resources")).toBe(true);
  });
});
