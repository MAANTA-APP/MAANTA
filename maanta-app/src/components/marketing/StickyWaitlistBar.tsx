"use client";

import { useEffect, useState } from "react";
import { StickyCtaBar } from "@/components/ui/button";
import { TrackedLink } from "./tracked";

/**
 * The mobile sticky CTA on `/shoppers` (board 1, M2).
 *
 * Appears only once the hero — and the amber button inside it — has scrolled
 * out, so the accent is never on screen twice. Watches a sentinel element the
 * page places at the foot of the hero; no scroll listener, no layout reads.
 * Desktop never shows it: the header's CTA is always in view there.
 */
export function StickyWaitlistBar({
  sentinelId,
  href,
  label,
}: {
  sentinelId: string;
  href: string;
  label: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = document.getElementById(sentinelId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setShow(!e.isIntersecting && e.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sentinelId]);

  if (!show) return null;
  return (
    <div className="lg:hidden">
      <StickyCtaBar>
        <TrackedLink
          href={href}
          name={label}
          location="sticky-bar"
          className="flex h-12 items-center justify-center rounded-pill bg-brand text-base font-semibold text-black"
        >
          {label}
        </TrackedLink>
      </StickyCtaBar>
    </div>
  );
}
