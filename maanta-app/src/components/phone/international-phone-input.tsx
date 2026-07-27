"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconSearch } from "@/components/ui/icons";
import {
  COUNTRY_DIAL_CODES,
  DEFAULT_DIAL_CODE,
  flagEmoji,
  type CountryDialCode,
} from "@/lib/phone/country-codes";
import { buildE164, isValidE164 } from "@/lib/phone/e164";
import { cn } from "@/lib/ui";

export type InternationalPhoneInputProps = {
  label?: string;
  dialCode: string;
  onDialCodeChange: (code: string) => void;
  localNumber: string;
  onLocalNumberChange: (value: string) => void;
  /** Called whenever dial code or local number changes with the combined E.164 value. */
  onE164Change?: (e164: string) => void;
  error?: string | null;
  autoFocus?: boolean;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
};

/** Full ITU E.164 country dropdown + local tel input. */
export function InternationalPhoneInput({
  label,
  dialCode,
  onDialCodeChange,
  localNumber,
  onLocalNumberChange,
  onE164Change,
  error,
  autoFocus,
  placeholder = "Phone number",
  id,
  disabled = false,
}: InternationalPhoneInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-countries`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const e164 = buildE164(dialCode, localNumber);
  const invalid = localNumber.trim().length > 0 && !isValidE164(e164);

  useEffect(() => {
    onE164Change?.(e164);
  }, [e164, onE164Change]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_DIAL_CODES;
    return COUNTRY_DIAL_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.iso2.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function selectCountry(c: CountryDialCode) {
    onDialCodeChange(c.dialCode);
    setOpen(false);
    setQuery("");
  }

  function onCountryKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && filtered[highlight]) {
      e.preventDefault();
      selectCountry(filtered[highlight]);
    }
  }

  const selected =
    COUNTRY_DIAL_CODES.find((c) => c.dialCode === dialCode) ??
    COUNTRY_DIAL_CODES.find((c) => c.dialCode === DEFAULT_DIAL_CODE)!;

  return (
    <div ref={containerRef}>
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-muted">
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          "flex h-12 items-stretch overflow-hidden rounded-xl border bg-white focus-within:ring-2 focus-within:ring-brand",
          invalid || error ? "border-ink" : "border-ink/80",
          disabled && "opacity-60"
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onCountryKeyDown}
          className="flex max-w-[44%] items-center gap-1 border-r border-line px-2.5 text-sm font-semibold text-ink sm:max-w-none sm:px-3"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-label={`Country code ${selected.name} ${selected.dialCode}`}
        >
          <span className="text-base leading-none" aria-hidden>
            {flagEmoji(selected.iso2)}
          </span>
          <span className="truncate">{selected.dialCode}</span>
          <IconChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          value={localNumber}
          onChange={(e) => onLocalNumberChange(e.target.value)}
          className="w-full min-w-0 px-3 text-base text-ink placeholder:text-faint focus:outline-none"
          aria-invalid={invalid || Boolean(error)}
          aria-describedby={error || invalid ? `${inputId}-error` : undefined}
        />
      </div>

      {open ? (
        <div className="relative z-20 mt-2">
          <div className="max-h-64 overflow-hidden rounded-xl border border-line bg-white shadow-modal">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <IconSearch className="h-4 w-4 text-faint" />
              <input
                ref={searchRef}
                placeholder="Search country or code"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onCountryKeyDown}
                className="w-full text-sm focus:outline-none"
                aria-label="Filter countries"
              />
            </div>
            <ul id={listId} role="listbox" className="max-h-52 overflow-y-auto">
              {filtered.map((c, i) => (
                <li key={`${c.iso2}-${c.dialCode}`} role="option" aria-selected={dialCode === c.dialCode}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => selectCountry(c)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-cream",
                      i === highlight && "bg-cream",
                      dialCode === c.dialCode && "font-semibold"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-base leading-none" aria-hidden>
                        {flagEmoji(c.iso2)}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-semibold">
                      {c.dialCode}
                      {dialCode === c.dialCode ? <IconCheck className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted">No countries match.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {error || invalid ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs font-medium text-ink">
          {error ??
            "Enter a valid international number (e.g. +44 7912 345678, +254 712 345678)."}
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Use InternationalPhoneInput — kept for existing imports. */
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
  return (
    <InternationalPhoneInput
      label={label}
      dialCode={countryCode}
      onDialCodeChange={onCountryCode}
      localNumber={value}
      onLocalNumberChange={onChange}
      autoFocus={autoFocus}
    />
  );
}
