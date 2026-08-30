import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("merchant dashboard wallet money label (D180)", () => {
  it("renders account_balance through the shared KES formatter", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/app/merchant/(app)/dashboard/page.tsx"),
      "utf8"
    );

    expect(source).toContain("formatKes(merchant.account_balance)");
    expect(source).not.toContain(
      'Math.round(merchant.account_balance).toLocaleString("en-KE")'
    );
  });
});
