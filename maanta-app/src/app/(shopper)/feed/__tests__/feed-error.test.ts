import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import FeedError from "../error";

// The feed error boundary shows a retryable, user-worded message — never a
// status code or provider name, and never the "no deals" empty copy.

describe("FeedError boundary", () => {
  it("renders the retryable load-error copy with a retry action", () => {
    const reset = vi.fn();
    const html = renderToStaticMarkup(
      createElement(FeedError, { error: new Error("boom"), reset })
    );
    expect(html).toContain("We couldn&#x27;t load deals — try again in a moment.");
    expect(html).toContain("Retry");
  });

  it("never leaks technical detail or the empty-state copy", () => {
    const html = renderToStaticMarkup(
      createElement(FeedError, { error: new Error("500 supabase"), reset: () => {} })
    );
    expect(html).not.toContain("500");
    expect(html.toLowerCase()).not.toContain("supabase");
    expect(html).not.toContain("No deals live right now");
  });
});
