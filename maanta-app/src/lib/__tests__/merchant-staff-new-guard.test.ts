import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("merchant Add Staff ownership guard", () => {
  it("blocks a non-owner before the client form mounts", () => {
    const layout = read("app/merchant/(app)/staff/new/layout.tsx");
    expect(layout).toContain("await getMerchantContext()");
    expect(layout).toContain("if (!res.ctx.isOwner)");
    expect(layout).toContain("Only the shop owner can manage staff.");
    expect(layout).not.toContain("return children;\n  }\n\n  if (!res.ctx.isOwner)");
  });
});
