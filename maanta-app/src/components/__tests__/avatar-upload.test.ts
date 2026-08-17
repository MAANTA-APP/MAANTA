import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AvatarUpload } from "@/components/ui/claude";

describe("AvatarUpload", () => {
  it("shows initials and Change photo when no avatar", () => {
    const html = renderToStaticMarkup(
      createElement(AvatarUpload, {
        avatarUrl: null,
        initials: "Amina",
        uploadUrl: "/api/profile/avatar",
      })
    );
    expect(html).toContain("A");
    expect(html).toContain("Add photo");
  });

  it("shows Change photo when an avatar exists", () => {
    const html = renderToStaticMarkup(
      createElement(AvatarUpload, {
        avatarUrl: "https://example.com/a.jpg",
        initials: "M",
        uploadUrl: "/api/merchant/avatar",
      })
    );
    expect(html).toContain("Change photo");
    expect(html).toContain("https://example.com/a.jpg");
  });
});
