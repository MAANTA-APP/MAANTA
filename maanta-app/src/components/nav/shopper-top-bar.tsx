"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBell, IconChevronDown } from "@/components/ui/icons";
import { BottomSheet } from "@/components/ui/overlays";
import { LiveChip, ComingSoonChip } from "@/components/ui/chips";
import { ALL_NODES, NODES, NODE_COOKIE, nodeLabel } from "@/lib/nodes";
import { cn } from "@/lib/ui";

/** 5c Shopper top bar — current location pill + bell; opens 8w node switcher. */
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
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex max-w-[80%] items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-left"
          aria-label={`Current location: ${nodeLabel(node)}. Change mall.`}
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
              Current location
            </span>
            <span className="flex items-center gap-1 text-sm font-bold text-ink">
              <span className="truncate">{nodeLabel(node)}</span>
              <IconChevronDown className="h-3.5 w-3.5 shrink-0" />
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <Link
            href="/browse"
            className="text-xs font-semibold text-muted"
            aria-label="Browse map"
          >
            Map
          </Link>
          <Link href="/notifications" aria-label="Notifications" className="text-ink">
            <IconBell className="h-6 w-6" />
          </Link>
        </div>
      </header>

      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <h2 className="mb-4 text-lg font-bold text-ink">Switch mall</h2>
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => selectNode(ALL_NODES)}
            className={cn(
              "flex w-full items-center justify-between rounded-card border bg-white px-4 py-4 text-left",
              node === ALL_NODES ? "border-ink" : "border-line hover:bg-cream/60"
            )}
          >
            <span className="text-base font-bold text-ink">All nodes</span>
            <span className="text-xs text-faint">every live mall</span>
          </button>
          {NODES.map((n) => (
            <button
              key={n.id}
              type="button"
              disabled={!n.live}
              onClick={() => selectNode(n.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-card border bg-white px-4 py-4 text-left",
                node === n.id
                  ? "border-ink"
                  : n.live
                    ? "border-line hover:bg-cream/60"
                    : "border-line"
              )}
            >
              <span
                className={cn("text-base font-bold", n.live ? "text-ink" : "text-faint")}
              >
                {n.label}
              </span>
              {n.live ? <LiveChip /> : <ComingSoonChip label="Soon" />}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-faint">
          All nodes shows every live mall, sorted like the main feed: Flash → Boosted →
          Deals Near Me
        </p>
      </BottomSheet>
    </>
  );
}
