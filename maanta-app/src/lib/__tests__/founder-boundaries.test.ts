import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("founder route boundaries", () => {
  it("has an in-segment error boundary with retry and reporting", () => {
    const src = read("app/founder/error.tsx");
    expect(src).toContain("Sentry.captureException(error)");
    expect(src).toContain("<ErrorState");
    expect(src).toContain("onRetry={reset}");
    expect(src).toContain("min-h-[70dvh]");
  });

  it("has an accessible loading boundary", () => {
    const src = read("app/founder/loading.tsx");
    expect(src).toContain('role="status"');
    expect(src).toContain("<Skeleton");
  });
});
