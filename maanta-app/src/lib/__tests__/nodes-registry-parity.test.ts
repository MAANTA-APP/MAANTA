import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { NODES } from "@/lib/nodes";

/**
 * Parity guard for drift **D60**: `src/lib/nodes.ts` and the `public.nodes`
 * seed must describe the same malls.
 *
 * The migration made the table authoritative for *integrity* — `deals.node` and
 * `merchants.node` now carry a foreign key, so an unregistered node cannot be
 * written. It did not make the app read the table everywhere: client components
 * and the synchronous cookie check in `getSelectedNode()` cannot await a query,
 * so they still read the compiled-in array.
 *
 * That split is only safe while the two agree, and "they agree" is exactly the
 * kind of claim that rots — it is the same shape as the drift the register was
 * built for, where a constant and a database quietly diverge and nothing fails.
 * So it is asserted rather than assumed.
 *
 * Concretely this makes registering a mall a two-step that cannot be half-done:
 * insert the row **and** update the constant, or this fails. That is a weaker
 * promise than "add a mall with no deploy", and it is the honest one for what
 * shipped — the remaining half is tracked on D60 rather than implied here.
 *
 * Reads the migration as text on purpose. Parsing the seed the database will
 * actually receive is the only way this compares against the real thing; a
 * fixture would just be a third copy to drift.
 */

const REPO_APP = path.resolve(__dirname, "..", "..", "..");
const MIGRATION = path.join(
  REPO_APP,
  "supabase",
  "migrations",
  "20260802120000_nodes_registry.sql"
);

type SeedRow = {
  id: string;
  slug: string;
  label: string;
  shortLabel: string;
  lat: number | null;
  lng: number | null;
  what3words: string | null;
  isLive: boolean;
};

/**
 * Pull the seeded rows out of the migration's INSERT.
 *
 * Deliberately narrow: it reads the one `INSERT INTO public.nodes (...) VALUES`
 * block that carries the full column list, and it throws rather than returning
 * an empty list if it cannot find it. A parser that silently finds nothing
 * would make every assertion below vacuously true, which is the specific
 * failure mode this repo has hit before (D38, D43, D45).
 */
function parseSeed(): SeedRow[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const marker =
    "INSERT INTO public.nodes (id, slug, label, short_label, lat, lng, what3words_address, is_live, display_order)";
  const start = sql.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `Could not find the seed INSERT in ${MIGRATION}. If the column list changed, update this parser — do not let it match nothing.`
    );
  }
  const valuesStart = sql.indexOf("VALUES", start);
  const end = sql.indexOf("ON CONFLICT", valuesStart);
  if (valuesStart === -1 || end === -1) {
    throw new Error("Seed INSERT found but its VALUES ... ON CONFLICT block was not.");
  }

  const body = sql.slice(valuesStart + "VALUES".length, end);
  const rows: SeedRow[] = [];

  // One tuple per line: ('BBS Mall', 'bbs_mall', …, TRUE, 0)
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("(")) continue;
    const inner = trimmed.slice(1, trimmed.lastIndexOf(")"));

    // Split on commas that are not inside a quoted literal.
    const cells: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "'") inQuote = !inQuote;
      if (ch === "," && !inQuote) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());

    if (cells.length !== 9) {
      throw new Error(`Seed row has ${cells.length} cells, expected 9: ${trimmed}`);
    }

    const text = (cell: string): string | null => {
      if (cell === "NULL") return null;
      return cell.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'");
    };
    const num = (cell: string): number | null =>
      cell === "NULL" ? null : Number(cell);

    rows.push({
      id: text(cells[0])!,
      slug: text(cells[1])!,
      label: text(cells[2])!,
      shortLabel: text(cells[3])!,
      lat: num(cells[4]),
      lng: num(cells[5]),
      what3words: text(cells[6]),
      isLive: cells[7].toUpperCase() === "TRUE",
    });
  }

  return rows;
}

describe("nodes.ts and the nodes table seed describe the same malls (D60)", () => {
  it("has a migration to read, and parses rows out of it", () => {
    expect(existsSync(MIGRATION), `${MIGRATION} is missing`).toBe(true);
    // Guards against the parser matching nothing and passing everything.
    expect(parseSeed().length).toBeGreaterThanOrEqual(5);
  });

  it("registers exactly the same node ids on both sides", () => {
    const seeded = parseSeed().map((r) => r.id).sort();
    const compiled = NODES.map((n) => n.id).sort();
    expect(
      compiled,
      "A mall was added or removed in one place only. Registering a node means\n" +
        "both an INSERT in the migration seed and an entry in src/lib/nodes.ts."
    ).toEqual(seeded);
  });

  it("agrees field by field, so the compiled fallback cannot lie", () => {
    const seeded = new Map(parseSeed().map((r) => [r.id, r]));

    for (const node of NODES) {
      const row = seeded.get(node.id);
      expect(row, `${node.id} is in nodes.ts but not in the seed`).toBeDefined();
      if (!row) continue;

      expect(node.slug, `${node.id}: slug`).toBe(row.slug);
      expect(node.label, `${node.id}: label`).toBe(row.label);
      expect(node.short, `${node.id}: short label`).toBe(row.shortLabel);
      expect(node.lat, `${node.id}: lat`).toBe(row.lat);
      expect(node.lng, `${node.id}: lng`).toBe(row.lng);
      expect(node.what3words_address ?? null, `${node.id}: what3words`).toBe(row.what3words);
      expect(node.live, `${node.id}: live flag`).toBe(row.isLive);
    }
  });

  it("keeps every slug URL-safe and unique, matching the column's CHECK", () => {
    const slugs = NODES.map((n) => n.slug);
    for (const slug of slugs) {
      expect(slug, `${slug} must match the nodes.slug CHECK constraint`).toMatch(
        /^[a-z0-9_]+$/
      );
    }
    expect(new Set(slugs).size, "slugs must be unique — the column is UNIQUE").toBe(
      slugs.length
    );
  });

  it("keeps the default node registered and live", () => {
    // DEFAULT_NODE is what getSelectedNode() falls back to, and it is also the
    // DEFAULT on deals.node / merchants.node — so it must satisfy the foreign
    // key, or every insert that omits a node would fail.
    const seeded = parseSeed();
    const fallback = seeded.find((r) => r.id === "BBS Mall");
    expect(fallback, "the column DEFAULT 'BBS Mall' must exist as a node row").toBeDefined();
    expect(fallback?.isLive, "the default node must be live").toBe(true);
  });
});
