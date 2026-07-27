"use client";

import { useRef } from "react";
import { cn } from "@/lib/ui";
import { IconCheck, IconSearch, IconPlus, IconBackspace } from "@/components/ui/icons";

export const inputClass =
  "h-12 w-full rounded-xl border border-ink/80 bg-white px-4 text-base text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand";

export function TextField({
  label,
  className,
  ...rest
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      ) : null}
      <input className={cn(inputClass, className)} {...rest} />
    </label>
  );
}

/** 3a Phone field — full E.164 country dropdown (see InternationalPhoneInput). */
export { PhoneField } from "@/components/phone/international-phone-input";

// (Retired) OtpCells lived here — a second, single-hidden-input OTP entry that
// nothing rendered. The paste-aware, unit-tested `otp-input.tsx` (OtpInput) is
// the one OTP component; the merchant till uses its own NumericKeypad + cells.

/** 3c Search field */
export function SearchField({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div
      className={cn(
        "flex h-12 items-center gap-2.5 rounded-xl bg-cream px-4 focus-within:ring-2 focus-within:ring-brand",
        className
      )}
    >
      <IconSearch className="h-5 w-5 text-faint" />
      <input
        type="search"
        placeholder="Search deals, shops…"
        className="w-full bg-transparent text-base text-ink placeholder:text-faint focus:outline-none"
        {...rest}
      />
    </div>
  );
}

/** 3d Image uploader (required) — dashed frame, cream fill. */
export function ImageUploader({
  previewUrl,
  onFile,
  required = true,
  uploading = false,
}: {
  previewUrl: string | null;
  onFile: (file: File) => void;
  required?: boolean;
  uploading?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="relative block h-44 w-full overflow-hidden rounded-2xl border-2 border-dashed border-ink/30 bg-cream text-center"
    >
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Cover" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full flex-col items-center justify-center gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
            <IconPlus className="h-4 w-4" /> Add cover image
          </span>
          {required ? (
            <span className="text-xs font-medium text-ink">Required to continue</span>
          ) : null}
        </span>
      )}
      {uploading ? (
        <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-semibold">
          Uploading…
        </span>
      ) : null}
    </button>
  );
}

/** 3e Amount field + quick chips (1,000 / 3,000 / 5,000) */
export function AmountField({
  value,
  onChange,
  chips = [1000, 3000, 5000],
}: {
  value: number;
  onChange: (v: number) => void;
  chips?: number[];
}) {
  return (
    <div>
      <div className="flex h-12 items-center rounded-xl border border-ink/80 bg-white px-4 focus-within:ring-2 focus-within:ring-brand">
        <span className="mr-2 text-base font-semibold text-ink">KES</span>
        <input
          inputMode="numeric"
          value={value ? value.toLocaleString("en-KE") : ""}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
            onChange(isNaN(n) ? 0 : n);
          }}
          className="w-full text-base font-semibold text-ink focus:outline-none"
          aria-label="Amount in KES"
        />
      </div>
      <div className="mt-2.5 flex gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold",
              value === c ? "bg-brand text-ink" : "bg-cream text-muted hover:bg-cream-dark"
            )}
          >
            {c.toLocaleString("en-KE")}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A short tactile tick on keypad press — an affordance at a noisy counter, not
 *  a celebration (the success/error buzz is deliberately NOT here). No-ops where
 *  the Vibration API is absent (iOS Safari, desktop). */
function tick() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(8);
  }
}

/** 3f Numeric keypad (merchant redemption home) */
export function NumericKeypad({
  onDigit,
  onDelete,
  disabled = false,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  // "del" is a sentinel rendered as an icon (the counter is icon-driven — the
  // raw "⌫" glyph was the last text glyph on this money surface).
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {keys.map((k, i) =>
        k === "" ? (
          <span key={i} />
        ) : (
          <button
            key={i}
            type="button"
            disabled={disabled}
            aria-label={k === "del" ? "Delete" : k}
            onClick={() => {
              tick();
              if (k === "del") onDelete();
              else onDigit(k);
            }}
            className="flex h-14 items-center justify-center rounded-xl border border-ink/70 bg-white text-xl font-semibold text-ink transition active:bg-cream motion-safe:active:scale-[0.96] disabled:opacity-40"
          >
            {k === "del" ? <IconBackspace className="h-6 w-6" /> : k}
          </button>
        )
      )}
    </div>
  );
}

/** 3g Segmented control (Standard | Flash, Active | Past, tabs…) */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-full border border-ink/80 bg-white p-0.5",
        className
      )}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 flex-1 rounded-full text-sm font-semibold transition-colors",
            // Selection is not an action — keep amber rationed (L5/L7), use ink.
            value === o.value ? "bg-ink text-white" : "text-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Filter chip row (10d Today/Week/All, 10u All/Top-ups/Fees/Boosts, 11d reasons) */
export function ChipTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-semibold",
            value === o.value ? "bg-ink text-white" : "bg-cream text-muted hover:bg-cream-dark"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 3h Checkbox row */
export function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-2">
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-md border-2",
          checked ? "border-ink bg-brand" : "border-ink/60 bg-white"
        )}
      >
        {checked ? <IconCheck className="h-3.5 w-3.5 text-ink" /> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="text-sm font-medium text-ink">{label}</span>
    </label>
  );
}

/** 3i Slider — flash duration 1–24h, default 6h. */
export function FlashSlider({
  hours,
  onChange,
}: {
  hours: number;
  onChange: (h: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted">1–24 hours</div>
      <input
        type="range"
        min={1}
        max={24}
        step={1}
        value={hours}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-ink"
        aria-label="Flash duration in hours"
      />
      <div className="mt-1 text-sm font-bold text-ink">
        {hours}h{hours === 6 ? " (default)" : ""}
      </div>
    </div>
  );
}

/** 3j Toggle */
export function Toggle({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  sub?: string;
}) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        checked ? "bg-brand" : "bg-cream-dark"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full bg-ink transition-all",
          checked ? "left-[calc(100%-1.625rem)]" : "left-0.5 bg-white shadow"
        )}
      />
    </button>
  );
  if (!label) return control;
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-sm font-semibold text-ink">{label}</div>
        {sub ? <div className="text-xs text-muted">{sub}</div> : null}
      </div>
      {control}
    </div>
  );
}
