import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  OtpInput,
  sanitizeOtp,
  replaceOtpCharAt,
  removeOtpCharAt,
} from "../otp-input";

// The segmented OTP boxes are pure UI over a single OTP string. The digit maths
// are the important part (typing / backspace / paste all resolve to the same
// string the verify flow already submits), so they're exported and tested here
// without a DOM.

describe("OTP digit helpers", () => {
  it("sanitizeOtp keeps digits only, capped at length", () => {
    expect(sanitizeOtp("12-34-56")).toBe("123456");
    expect(sanitizeOtp("1234567", 6)).toBe("123456");
    expect(sanitizeOtp("ab12cd34")).toBe("1234");
    expect(sanitizeOtp("")).toBe("");
  });

  it("typing across boxes builds the full OTP string", () => {
    const digits = ["1", "2", "3", "4", "5", "6"];
    let v = "";
    for (let i = 0; i < digits.length; i++) {
      v = replaceOtpCharAt(v, i, digits[i]);
    }
    expect(v).toBe("123456");
  });

  it("replaceOtpCharAt overwrites a single box and ignores non-digits", () => {
    expect(replaceOtpCharAt("123456", 0, "9")).toBe("923456");
    expect(replaceOtpCharAt("123456", 5, "0")).toBe("123450");
    expect(replaceOtpCharAt("123", 1, "x")).toBe("13"); // non-digit removes the char
  });

  it("removeOtpCharAt deletes a box and shifts the tail left", () => {
    expect(removeOtpCharAt("123456", 5)).toBe("12345");
    expect(removeOtpCharAt("123456", 0)).toBe("23456");
    expect(removeOtpCharAt("12", 1)).toBe("1");
  });

  it("paste distributes pasted digits (via sanitizeOtp)", () => {
    expect(sanitizeOtp("482 913")).toBe("482913");
    expect(sanitizeOtp("code: 482913 now")).toBe("482913");
  });

  it("renders six input boxes prefilled from the value", () => {
    const html = renderToStaticMarkup(
      createElement(OtpInput, { value: "123", onChange: () => {} })
    );
    expect((html.match(/<input/g) ?? []).length).toBe(6);
    expect(html).toContain('value="1"');
    expect(html).toContain('value="3"');
  });
});
