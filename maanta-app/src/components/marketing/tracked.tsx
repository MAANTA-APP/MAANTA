"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trackMarketing } from "@/lib/marketing/analytics";
import { MARKETING_EVENTS } from "@/lib/marketing/analytics-events";

/**
 * Client wrappers that attach analytics to otherwise-static marketing markup.
 *
 * These exist so `sections.tsx` can stay a server component: it renders these,
 * they carry the handlers. Splitting it this way keeps the marketing pages
 * server-rendered — they are content, and shipping them as client components to
 * capture a click would be a poor trade on a mid-range Android over mall wifi.
 */

/** A link that reports its click before navigating. */
export function TrackedLink({
  href,
  event = MARKETING_EVENTS.cta,
  name,
  location,
  className,
  children,
  external = false,
}: {
  href: string;
  event?: (typeof MARKETING_EVENTS)[keyof typeof MARKETING_EVENTS];
  /** Stable identifier for this action, e.g. "list-your-shop". */
  name: string;
  /** Where on the page it sits, e.g. "hero", "cta-band". */
  location: string;
  className?: string;
  children: React.ReactNode;
  /**
   * An off-site destination (the founder-configured booking page). Rendered
   * as a plain anchor in a new tab with `rel="noopener noreferrer"`; the
   * click is still tracked.
   */
  external?: boolean;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={() => trackMarketing(event, { name, location, href })}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackMarketing(event, { name, location, href })}
    >
      {children}
    </Link>
  );
}

/**
 * Fires once when a named section first reaches the viewport.
 *
 * `once` matters: without it a user scrolling up and down inflates the count and
 * the number stops meaning "how many people got this far", which is the only
 * question it is being asked.
 */
export function SectionInView({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") return;

    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            trackMarketing(MARKETING_EVENTS.sectionViewed, { section: name });
            io.disconnect();
          }
        }
      },
      // A third of the block visible counts as reached, so a tall section on a
      // 360px screen does not need to be fully on screen to register.
      { threshold: 0.33 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [name, seen]);

  return <div ref={ref}>{children}</div>;
}

/** FAQ item that reports the first time it is opened. */
export function TrackedFaqItem({
  question,
  page,
  children,
}: {
  question: string;
  page: string;
  children: React.ReactNode;
}) {
  const reported = useRef(false);

  return (
    <details
      className="group py-4"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open || reported.current) return;
        reported.current = true;
        trackMarketing(MARKETING_EVENTS.faqOpened, { question, page });
      }}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-bold text-ink">
        {question}
        <span
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-muted transition group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-2.5 max-w-3xl text-sm leading-relaxed text-secondary">{children}</div>
    </details>
  );
}
