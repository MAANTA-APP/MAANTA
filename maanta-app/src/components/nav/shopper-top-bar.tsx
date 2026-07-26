"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBell } from "@/components/ui/icons";
import { BottomSheet } from "@/components/ui/overlays";
import { LiveChip, ComingSoonChip } from "@/components/ui/chips";
import { LocationPill } from "@/components/ui/claude";
import { ALL_NODES, NODES, NODE_COOKIE, nodeLabel } from "@/lib/nodes";
import { cn } from "@/lib/ui";

/** Shopper top bar — Claude LocationPill + bell; opens node switcher sheet. */
export function ShopperTopBar({ node }: { node: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function selectNode(id: string) {
    document.cookie = `${NODE_COOKIE}=${encodeURIComponent(id)};path=/;max-age=31536000`;
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/80 bg-stone/90 px-4 py-3 backdrop-blur-md">
        <LocationPill
          label={nodeLabel(node)}
          onClick={() => setOpen(true)}
          className="min-w-0 flex-1"
        />
        {/* Map + bell: larger than before, still smaller than LocationPill */}
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/browse"
            className="rounded-full px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-white/70"
            aria-label="Browse map"
          >
            Map
          </Link>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-white/70"
          >
            <IconBell className="h-6 w-6" />
          </Link>
        </div>
      </header>

      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <h2 className="mb-1 text-lg font-semibold tracking-[-0.02em] text-ink">
          Switch mall
        </h2>
        <p className="mb-4 text-sm text-muted">
          Deals update for the mall you pick.
        </p>
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => selectNode(ALL_NODES)}
            className={cn(
              "flex w-full items-center justify-between rounded-card border bg-white px-4 py-4 text-left shadow-card",
              node === ALL_NODES ? "border-ink" : "border-line hover:bg-stone-soft"
            )}
          >
            <span className="text-base font-semibold text-ink">All nodes</span>
            <span className="text-xs text-faint">every live mall</span>
          </button>
          {NODES.map((n) => (
            <button
              key={n.id}
              type="button"
              disabled={!n.live}
              onClick={() => selectNode(n.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-card border bg-white px-4 py-4 text-left shadow-card",
                node === n.id
                  ? "border-ink"
                  : n.live
                    ? "border-line hover:bg-stone-soft"
                    : "border-line opacity-70"
              )}
            >
              <span
                className={cn(
                  "text-base font-semibold",
                  n.live ? "text-ink" : "text-faint"
                )}
              >
                {n.label}
              </span>
              {n.live ? <LiveChip /> : <ComingSoonChip label="Soon" />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
