"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/ui";
import { COUNTRY_OPTIONS } from "@/lib/country-codes";
import { IconCheck, IconChevronDown, IconSearch, IconPlus, IconBackspace } from "@/components/ui/icons";

/**
 * The shared field shell.
 *
 * The focus ring is **ink, never amber**. #FDBF2D on white is 1.66:1, well under
 * the 3:1 WCAG 1.4.11 asks of a focus indicator, and `globals.css` already says
 * so in as many words while setting the global `:focus-visible` outline to ink.
 * Every field in the app nonetheless shipped `focus:ring-brand`, because the
 * guard that names the rule ("does not use the amber accent as a focus ring",
 * `marketing-a11y.test.ts`) only ever read `globals.css` — the stylesheet that
 * was already compliant. Nine components violated the rule underneath a passing
 * test, the same guard-vacuity shape as D36 and D38.
 *
 * `ring-offset-2` matches the global outline's 2px offset, so a focused field
 * looks the same as every other focused element on the site.
 *
 * Amber stays on primary actions and live status (frozen rule 1). A focused
 * field is not an action, and an amber ring on a top-up field put a second
 * amber element beside the amber CTA it sits under.
 */
export const inputClass =
  "h-12 w-full rounded-xl border border-ink/80 bg-white px-4 text-base text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2";

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

/** 3a Phone field — country code selectable, defaults Kenya +254.
 *  Full list with KE/NO/GB pinned first lives in `@/lib/country-codes`.
 *
 *  Selection identity is the dial code (the component's external API), and
 *  dial codes are shared across countries (+1, +7, +39, +44, +262…) — so every
 *  row sharing the selected code shows the check. That is a known limit of
 *  this API, not a bug; exact country semantics require moving selection to
 *  `iso2` and deriving the dial code, which changes every call site. */
export function PhoneField({
  countryCode,
  onCountryCode,
  value,
  onChange,
  label,
  autoFocus,
}: {
  countryCode: string;
  onCountryCode: (code: string) => void;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  // The visible label is a <span>, not a <label> — so the tel input announced as
  // an unnamed edit field and the label was not a click target. Same defect the
  // Toggle below already carries a note about; here it gets a real association.
  const inputId = useId();
  const q = query.trim().toLowerCase();
  const filtered = COUNTRY_OPTIONS.filter(
    (c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q)
  );
  // The list previously closed only on selection — trapped open for anyone who
  // tapped the code by mistake. Same dismissal contract as FilterDropdown.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={rootRef}>
      {label ? (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-medium text-muted"
        >
          {label}
        </label>
      ) : null}
      <div className="flex h-12 items-stretch overflow-hidden rounded-xl border border-ink/80 bg-white focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 border-r border-line px-3 text-sm font-semibold text-ink"
          aria-expanded={open}
          // Without this the control announces as "+254, expanded" — the dial
          // code with no hint that pressing it picks a country.
          aria-label={`Country calling code: ${countryCode}`}
        >
          {countryCode}
          <IconChevronDown className="h-3.5 w-3.5" />
        </button>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoFocus={autoFocus}
          aria-label={label ? undefined : "Phone number"}
          placeholder="7XX XXX XXX"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 text-base text-ink placeholder:text-faint focus:outline-none"
        />
      </div>
      {open ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-modal">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <IconSearch className="h-4 w-4 text-faint" />
            <input
              placeholder="Search country"
              aria-label="Search country"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.iso2}
                type="button"
                onClick={() => {
                  onCountryCode(c.dialCode);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-cream"
              >
                <span>{c.name}</span>
                <span className="flex items-center gap-1 font-semibold">
                  {c.dialCode}
                  {countryCode === c.dialCode ? <IconCheck className="h-3.5 w-3.5" /> : null}
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted">No matching country</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// (Retired) OtpCells lived here — a second, single-hidden-input OTP entry that
// nothing rendered. The paste-aware, unit-tested `otp-input.tsx` (OtpInput) is
// the one OTP component; the merchant till uses its own NumericKeypad + cells.

/** 3c Search field */
export function SearchField({
  className,
  placeholder = "Search deals, shops\u2026",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div
      className={cn(
        "flex h-12 items-center gap-2.5 rounded-xl bg-cream px-4 focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2",
        className
      )}
    >
      <IconSearch className="h-5 w-5 text-faint" />
      <input
        type="search"
        placeholder={placeholder}
        /*
          A search field carries no visible label by design, so the placeholder
          was its only name — and a placeholder is gone the moment someone types.
          All six call sites pass their own placeholder and none passed a name,
          so every search box in admin and shopper search announced as an
          unnamed edit field. The trailing ellipsis is stripped: it is a visual
          cue, not part of what the field is called. `rest` still wins, so a
          caller can pass a better name than its own placeholder.
        */
        aria-label={typeof placeholder === "string" ? placeholder.replace(/\u2026$/, "") : undefined}
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
      <div className="flex h-12 items-center rounded-xl border border-ink/80 bg-white px-4 focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2">
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
      // The visible label is a sibling, not a <label> — without this the
      // switch announces as an unnamed control.
      aria-label={label}
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
