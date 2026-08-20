"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconHeart } from "@/components/ui/icons";
import { cn } from "@/lib/ui";

/** Favourite heart (1l / 8ac) — toggles via /api/favourites. */
export function FavouriteButton({
  merchantId,
  initial,
  className,
}: {
  merchantId: string;
  initial: boolean;
  className?: string;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !on;
    setOn(next);
    const res = await fetch("/api/favourites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId, on: next }),
    });
    if (!res.ok) {
      setOn(!next);
      if (res.status === 401) router.push("/login");
    } else {
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-busy={busy}
      aria-label={on ? "Remove from saved shops" : "Save shop"}
      // after:-inset-1.5 keeps the visible heart small on card overlays while
      // extending the tap area to ≥44px (32px at the tightest p-1.5 override).
      className={cn(
        "relative p-2 after:absolute after:-inset-1.5 after:content-['']",
        className
      )}
    >
      <IconHeart
        filled={on}
        className={cn("h-5 w-5", on ? "text-ink" : "text-faint")}
      />
    </button>
  );
}
