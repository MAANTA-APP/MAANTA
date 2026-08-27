import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isNodeScoped,
  nodeSwitcherTargets,
  resolveNodeParam,
} from "@/lib/admin-dashboard";
import { ALL_NODES, NODES } from "@/lib/nodes";

const APP = path.resolve(__dirname, "..", "..", "app");
const dashboard = readFileSync(path.join(APP, "admin", "page.tsx"), "utf8");
const approvals = readFileSync(path.join(APP, "admin", "approvals", "page.tsx"), "utf8");
const sidebar = readFileSync(
  path.resolve(__dirname, "..", "..", "components", "nav", "admin-sidebar.tsx"),
  "utf8"
);

describe("node selection", () => {
  it("defaults to all nodes when unset", () => {
    expect(resolveNodeParam(undefined)).toBe(ALL_NODES);
    expect(resolveNodeParam("")).toBe(ALL_NODES);
  });

  it("accepts a real node id", () => {
    expect(resolveNodeParam("BBS Mall")).toBe("BBS Mall");
  });

  it("falls back to all nodes for anything unrecognised", () => {
    // A typo'd ?node= must not filter to nothing: a dashboard of zeros reads as
    // "the operation is dead", which is the one thing a glance surface must not
    // mis-say.
    expect(resolveNodeParam("bbs mall")).toBe(ALL_NODES);
    expect(resolveNodeParam("Nairobi")).toBe(ALL_NODES);
    expect(resolveNodeParam("'; drop table merchants;--")).toBe(ALL_NODES);
  });

  it("knows when a view is scoped", () => {
    expect(isNodeScoped(ALL_NODES)).toBe(false);
    expect(isNodeScoped("BBS Mall")).toBe(true);
  });
});

describe("node switcher targets", () => {
  it("leads with All nodes", () => {
    expect(nodeSwitcherTargets()[0]).toEqual({ id: ALL_NODES, label: "All nodes" });
  });

  it("offers every live node and no dormant one", () => {
    const ids = nodeSwitcherTargets().map((t) => t.id);
    for (const n of NODES) {
      expect(ids.includes(n.id), `${n.id} (live: ${n.live})`).toBe(n.live);
    }
  });

  it("every target survives its own round trip through the resolver", () => {
    // A tab that resolves to something else would filter to a node the label
    // does not name.
    for (const t of nodeSwitcherTargets()) {
      expect(resolveNodeParam(t.id === ALL_NODES ? undefined : t.id)).toBe(t.id);
    }
  });
});

describe("the dashboard's honesty rules", () => {
  it("scopes non-node tables through the node's merchants", () => {
    // Only merchants and deals carry `node`. Redemptions, the ledger and tasks
    // reach it via merchant_id — mixing scoped and global figures on one screen
    // is worse than not filtering at all.
    expect(dashboard).toContain('in("merchant_id"');
    expect(dashboard).toContain("byMerchant(");
  });

  it("filters an empty node to nothing rather than to everything", () => {
    // A live node with no merchants yet is real. Without the sentinel, an empty
    // id list would drop the filter and show global numbers under a node label.
    expect(dashboard).toContain("NO_MATCH");
    expect(dashboard).toMatch(/merchantIds\.length === 0/);
  });

  it("labels the evidence window and separates genuine-tagged from mixed activity", () => {
    expect(dashboard).toContain("Evidence split (7 days)");
    for (const label of [
      "Genuine-tagged claims",
      "Genuine-tagged verified",
      "Success fees — all activity",
    ]) {
      expect(dashboard).toContain(label);
    }
    expect(dashboard).toContain("not external field validation");
  });

  it("keeps the switcher in the URL, so a filtered view is shareable", () => {
    expect(dashboard).toContain("/admin?node=${encodeURIComponent(t.id)}");
    expect(dashboard).not.toContain("useState");
  });

  it("spends no amber — every queue card is a link, not an action", () => {
    expect(dashboard).not.toContain("bg-brand");
    expect(dashboard).not.toContain("text-brand");
  });
});

describe("the approvals queue moved intact", () => {
  it("lives at /admin/approvals and posts its search there", () => {
    expect(approvals).toContain('action="/admin/approvals"');
    expect(approvals).toContain("Pending approvals");
  });

  it("is reachable from the sidebar alongside the new overview", () => {
    expect(sidebar).toContain('{ href: "/admin", label: "Overview" }');
    expect(sidebar).toContain('{ href: "/admin/approvals", label: "Approvals" }');
  });

  it("is where the dashboard sends an admin who wants the full queue", () => {
    expect(dashboard).toContain('href="/admin/approvals"');
  });
});
