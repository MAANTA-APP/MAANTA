"use client";

import { cn } from "@/lib/ui";

/**
 * Multi-select chips — "What do you usually shop for?". Selection is ink,
 * never amber (board 2: "selection is ink, action is amber").
 */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
            }
            className={cn(
              "h-9 rounded-pill border px-3.5 text-sm font-semibold transition-colors",
              on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
