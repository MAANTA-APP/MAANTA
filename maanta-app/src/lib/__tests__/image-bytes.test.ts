import { describe, it, expect } from "vitest";
import { detectImageType } from "@/lib/image-bytes";

describe("image-bytes", () => {
  it("detects JPEG from magic bytes", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("jpg");
  });

  it("detects PNG from magic bytes", () => {
    expect(
      detectImageType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
      )
    ).toBe("png");
  });

  it("rejects non-image bytes", () => {
    expect(detectImageType(new Uint8Array([0x3c, 0x68, 0x74, 0x6d]))).toBeNull();
  });
});
