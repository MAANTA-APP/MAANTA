"use client";

import { useRef } from "react";
import { cn } from "@/lib/ui";

/**
 * Segmented 6-box OTP input (S2 /verify-phone). Purely presentational: it is a
 * controlled component over the full OTP STRING — typing, backspace, and paste
 * all resolve to the same `value` the existing verify flow already submits. No
 * behaviour or endpoint changes; only the input surface.
 *
 * The digit maths live in exported pure helpers so they can be unit-tested
 * without a DOM.
 */

/** Digits only, capped at `length`. */
export function sanitizeOtp(raw: string, length = 6): string {
  return (raw.match(/\d/g) ?? []).join("").slice(0, length);
}

/** Set/replace the digit at `index` (non-digits are dropped). */
export function replaceOtpCharAt(
  value: string,
  index: number,
  char: string,
  length = 6
): string {
  const digit = (char.match(/\d/)?.[0] ?? "");
  return sanitizeOtp(value.slice(0, index) + digit + value.slice(index + 1), length);
}

/** Remove the digit at `index`, shifting the tail left. */
export function removeOtpCharAt(value: string, index: number, length = 6): string {
  return sanitizeOtp(value.slice(0, index) + value.slice(index + 1), length);
}

/** Merge pasted digits into `value` starting at `index`, preserving the prefix. */
export function mergeOtpPaste(
  value: string,
  index: number,
  pasted: string,
  length = 6
): string {
  const digits = sanitizeOtp(pasted, length);
  return sanitizeOtp(
    value.slice(0, index) + digits + value.slice(index + digits.length),
    length
  );
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = false,
  ariaLabel = "One-time code",
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const focusBox = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  return (
    <div role="group" aria-label={ariaLabel} className="flex justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ""}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const typed = e.target.value.slice(-1);
            // Ignore a non-digit keystroke rather than letting it clear the box.
            // An empty value (box cleared) still flows through to remove the digit.
            if (typed && !/\d/.test(typed)) return;
            const next = replaceOtpCharAt(value, i, typed, length);
            onChange(next);
            if (/\d/.test(typed) && i < length - 1) focusBox(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              if (!value[i] && i > 0) {
                onChange(removeOtpCharAt(value, i - 1, length));
                focusBox(i - 1);
              } else {
                onChange(removeOtpCharAt(value, i, length));
              }
            } else if (e.key === "ArrowLeft" && i > 0) {
              focusBox(i - 1);
            } else if (e.key === "ArrowRight" && i < length - 1) {
              focusBox(i + 1);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = sanitizeOtp(e.clipboardData.getData("text"), length);
            if (!pasted) return;
            // Merge into the existing value at this box — don't discard a prefix
            // the user already typed.
            const next = mergeOtpPaste(value, i, pasted, length);
            onChange(next);
            focusBox(Math.min(length - 1, i + pasted.length - 1));
          }}
          className={cn(
            "h-14 w-11 rounded-xl border bg-white text-center font-code text-xl font-semibold text-ink",
            "focus:border-2 focus:border-ink focus:outline-none",
            value[i] ? "border-ink/80" : "border-line"
          )}
        />
      ))}
    </div>
  );
}
