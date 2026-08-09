import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { SUPPORT_SLA_HOURS } from "../sla";

/**
 * D81 — SLA aging ships as a layer on the SHIPPED operational surfaces
 * (11d held list, 11e/11o support queue, 13e redemption detail), not as a new
 * queue. The binding ruling (2026-08-09, decisions log): WhatsApp stays the
 * only shopper support/dispute intake for the pilot; no shopper report form,
 * no /disputes surface, no new route/tab/nav item; and the clock starts when
 * a case enters its operational queue — never when the redemption occurred.
 *
 * These guards pin the surface halves of that ruling; the clock arithmetic is
 * pinned by sla.test.ts.
 */

const SRC = path.resolve(__dirname, "..", "..");
const read = (...segments: string[]) =>
  readFileSync(path.join(SRC, ...segments), "utf8");

const heldList = read("app", "admin", "redemptions", "page.tsx");
const support = read("app", "admin", "support", "page.tsx");
const detail = read("app", "admin", "redemptions", "[id]", "page.tsx");
const chips = read("components", "ui", "chips.tsx");
const ticket = read("app", "(shopper)", "tickets", "[id]", "page.tsx");
const slaLib = read("lib", "sla.ts");

/** Every directory name under a root, recursively. */
function dirNames(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    out.push(entry.name);
    out.push(...dirNames(path.join(root, entry.name)));
  }
  return out;
}

describe("D81 — the clock starts at queue entry, from immutable timestamps", () => {
  it("11d derives the held clock from the guardian_events soft_block row, not redeemed_at", () => {
    expect(heldList).toContain('.from("guardian_events")');
    expect(heldList).toContain('.eq("check_type", "overall")');
    expect(heldList).toContain('.eq("recommendation", "soft_block")');
    // The SLA badge renders only from that map — redeemed_at stays what it
    // was: display metadata and the list's sort key.
    expect(heldList).toContain("heldSince");
    expect(heldList).toContain("SlaBadge");
  });

  it("11e starts the clock at created_at and resolves via the durable override trail", () => {
    expect(support).toContain("computeSla(t.created_at");
    expect(support).toContain('.from("admin_ops_log")');
    expect(support).toContain('"agent_task.override"');
    expect(support).toContain("resolvedAtFromAuditLine");
  });

  it("13e reuses the same immutable start and shows a read-only block", () => {
    expect(detail).toContain('e.check_type === "overall" && e.recommendation === "soft_block"');
    expect(detail).toContain("Support SLA");
    expect(detail).toContain('"redemption.release_approve"');
    expect(detail).toContain('"redemption.release_reject"');
  });
});

describe("D81 — required surface anatomy", () => {
  it("11e shows the opened timestamp, an age line, and the owner word", () => {
    expect(support).toContain("Opened {friendlyTime(t.created_at)}");
    expect(support).toContain("Open for ${slaHoursLabel(slaAgeHours(t.created_at, now))}");
    expect(support).toContain('t.assigned_to ? "Agent" : "Admin"');
  });

  it("11o leads the mobile support card with the SLA badge, hours never truncated", () => {
    // The mobile-only badge block precedes the card body …
    const mobileBadge = support.indexOf('w-full sm:hidden');
    const cardBody = support.indexOf('min-w-0 flex-1');
    expect(mobileBadge).toBeGreaterThan(-1);
    expect(mobileBadge).toBeLessThan(cardBody);
    // … and the badge's hours copy is whitespace-nowrap, never clamped.
    const badge = chips.slice(chips.indexOf("export function SlaBadge"));
    expect(badge).toContain("whitespace-nowrap");
    expect(badge).not.toContain("truncate");
    expect(badge).not.toContain("line-clamp");
  });

  it("13e's block informs but never gates: the release action does not read the SLA", () => {
    const release = read("app", "admin", "redemptions", "[id]", "release-actions.tsx");
    expect(release).not.toContain("computeSla");
    expect(release).not.toContain("SlaBadge");
    expect(release).not.toContain("slaDeadline");
  });
});

describe("D81 — the 72-hour promise maps to the operational deadline", () => {
  it("keeps the shopper wording: within 72 hours, never 24", () => {
    expect(ticket).toContain("within 72 hours");
    expect(ticket).not.toContain("24 hour");
  });

  it("backs it with the same 72 in the one clock module", () => {
    expect(SUPPORT_SLA_HOURS).toBe(72);
    // 13e renders the promise from the constant, so the two cannot drift.
    expect(detail).toContain("within {SUPPORT_SLA_HOURS}");
  });

  it("keeps 24 an internal warning threshold, not a promise: no surface renders it", () => {
    for (const source of [heldList, support, detail]) {
      expect(source).not.toContain("within 24");
    }
  });
});

describe("D81 — no new intake, no new queue (binding ruling)", () => {
  it("adds no /disputes route anywhere in the app", () => {
    expect(dirNames(path.join(SRC, "app"))).not.toContain("disputes");
  });

  it("adds no shopper report form: WhatsApp stays the only shopper intake", () => {
    // No shopper route named report/dispute, and the ticket page ships no form.
    const shopperDirs = dirNames(path.join(SRC, "app", "(shopper)"));
    expect(shopperDirs.filter((d) => /report|dispute/i.test(d))).toEqual([]);
    expect(ticket).not.toContain("<form");
  });

  it("exposes the WhatsApp intake in no new location", () => {
    for (const source of [heldList, support, detail, chips, slaLib]) {
      expect(source).not.toMatch(/wa\.me|whatsapp/i);
    }
  });
});

describe("D81 — visual contract (frozen UI rules)", () => {
  it("never uses amber on the non-action SLA chip", () => {
    const chipMap = chips.slice(
      chips.indexOf("const SLA_CHIP"),
      chips.indexOf("export function SlaBadge")
    );
    expect(chipMap.length).toBeGreaterThan(0);
    expect(chipMap).not.toContain("brand");
    expect(chipMap).not.toContain("amber");
    expect(chipMap).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("carries state as icon + word (greyscale-readable), failure dark not red", () => {
    const chipMap = chips.slice(
      chips.indexOf("const SLA_CHIP"),
      chips.indexOf("export function SlaBadge")
    );
    for (const word of ["On track", "Due soon", "Overdue", "On time", "Late"]) {
      expect(chipMap).toContain(word);
    }
    expect(chipMap).toContain("border-rust"); // due-soon: rust warning, never yellow
    expect(chipMap).toContain("bg-ink-900"); // overdue / late: failure is dark
    expect(chipMap).not.toContain("flame"); // never the error red
  });
});
