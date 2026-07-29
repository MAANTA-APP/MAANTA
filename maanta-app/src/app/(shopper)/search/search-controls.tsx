"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchField, SegmentedControl } from "@/components/ui/inputs";
import { BottomSheet } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui";

const RECENTS_KEY = "maanta_recent_searches";

/** The `type` values `/search` actually queries (see search/page.tsx). */
type SearchType = "all" | "standard" | "flash" | "boosted";

/** Search input + recent chips + 8n filter sheet (All / Standard / Flash / Boosted). */
export function SearchControls({
  initialQuery,
  initialType,
}: {
  initialQuery: string;
  initialType: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [recents, setRecents] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [type, setType] = useState(initialType);

  useEffect(() => {
    try {
      setRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, []);

  function apply(q: string, t: string) {
    if (q) {
      const next = [q, ...recents.filter((r) => r !== q)].slice(0, 5);
      setRecents(next);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    }
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (t !== "all") params.set("type", t);
    router.replace(`/search${params.size ? `?${params}` : ""}`);
  }

  return (
    <>
      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply(value.trim(), type);
        }}
      >
        <SearchField
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label="Filter"
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl border",
            type !== "all" ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"
          )}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
        </button>
      </form>

      {recents.length > 0 && !initialQuery ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {recents.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setValue(r);
                apply(r, type);
              }}
              className="rounded-full bg-cream px-3.5 py-1.5 text-xs font-semibold text-muted hover:bg-cream-dark"
            >
              {r}
            </button>
          ))}
        </div>
      ) : null}

      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)}>
        <h2 className="text-lg font-bold text-ink">Filter</h2>
        <div className="mt-4">
          {/* "Boosted" is here because the feed's "Neighbourhood favourites →
              See all" link lands on /search?type=boosted, which the page has
              always queried. Without this option the filter sheet could not
              represent the state it arrived in, and Apply silently dropped the
              shopper into a different result set. */}
          <SegmentedControl
            options={[
              { value: "all", label: "All" },
              { value: "standard", label: "Standard" },
              { value: "flash", label: "Flash" },
              { value: "boosted", label: "Boosted" },
            ]}
            value={type as SearchType}
            onChange={(t) => setType(t)}
          />
        </div>
        <Button
          full
          className="mt-6"
          onClick={() => {
            setFilterOpen(false);
            apply(value.trim(), type);
          }}
        >
          Apply
        </Button>
      </BottomSheet>
    </>
  );
}
