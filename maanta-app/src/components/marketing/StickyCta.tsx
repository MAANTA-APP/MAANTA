"use client";

import { useEffect, useState } from "react";
import { TrackedLink } from "./tracked";

/**
 * Sticky mobile call to action for the two long conversion pages.
 *
 * ## Why it exists
 *
 * The launch-readiness audit (2026-08-10, item 9) found no sticky action
 * anywhere on the marketing site. `/merchants` is ~440 lines and `/shoppers`
 * ~350; on a 360px screen the hero CTA is off-screen for most of the scroll
 * depth, and this audience is close to entirely mobile. The closing `CtaBand`
 * is the only other place to act, and it is at the bottom.
 *
 * ## Why it is not simply a second button
 *
 * Frozen UI rule 1 caps a screen at **one** amber action, and a bar pinned to
 * the viewport is on every screen by definition — so the naive version breaks
 * the rule permanently rather than occasionally. The audit's own recommendation
 * was that a sticky CTA must *replace* the visible amber action, not add to it.
 *
 * This enforces that literally rather than by layout convention. Every in-flow
 * amber action carries `data-amber-cta` (`CtaPrimary` in `sections.tsx`, and
 * both `SiteHeader` CTAs); an IntersectionObserver watches all of them, and this
 * bar renders only while **none** is intersecting the viewport. At most one
 * amber action is on screen at any scroll position, which is the rule as
 * written.
 *
 * Two consequences fall out of that for free, rather than needing their own
 * special cases:
 *
 *  - The header CTA is `hidden … sm:inline-flex`, so below 640px it has no
 *    layout box and never intersects — which is exactly the range this bar
 *    renders in (`sm:hidden`). The two are complements, not competitors.
 *  - Opening the mobile sheet reveals its own amber CTA. That is a `SiteHeader`
 *    element carrying the marker, but it mounts *after* this observer is wired,
 *    so intersection alone would miss it. The sheet's toggle publishes
 *    `aria-expanded`, so that is read directly instead of re-scanning the DOM on
 *    every mutation — one attribute observer on one element, rather than a
 *    subtree MutationObserver running on every marketing page over mall wifi.
 *
 * ## It fails closed
 *
 * `amberOnScreen` starts `true`, so the bar is absent on first paint (the hero
 * CTA is on screen then anyway — no flash) and stays absent if
 * `IntersectionObserver` is unavailable or no marked actions are found. A guard
 * that cannot see the other amber actions must not render a second one; the
 * failure mode is the status quo, which is what the site shipped until now.
 *
 * ## What it deliberately does not do
 *
 * It carries no marker itself. `data-amber-cta` means "an in-flow amber action
 * this bar must yield to" — marking the bar would be self-referential, and it is
 * already covered by the invariant above.
 *
 * It also stops before the page ends: the closing `CtaBand`'s primary is marked,
 * so the bar hides as soon as that band enters the viewport. Everything after it
 * is the footer, which is therefore never overlaid — including the legal links
 * and the regulatory-status disclosure, which must stay reachable.
 */
export function StickyCta({ label, href }: { label: string; href: string }) {
  const [amberOnScreen, setAmberOnScreen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = Array.from(document.querySelectorAll("[data-amber-cta]"));
    if (targets.length === 0) return;

    // Tracked as a set rather than a count: an observer can report the same
    // element twice on a fast scroll, and a counter drifts negative from that.
    const onScreen = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      setAmberOnScreen(onScreen.size > 0);
    });

    for (const t of targets) io.observe(t);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const toggle = document.querySelector('[aria-controls="marketing-mobile-nav"]');
    if (!toggle) return;

    const read = () => setMenuOpen(toggle.getAttribute("aria-expanded") === "true");
    read();
    const mo = new MutationObserver(read);
    mo.observe(toggle, { attributes: true, attributeFilter: ["aria-expanded"] });
    return () => mo.disconnect();
  }, []);

  // Unmounted rather than hidden, so there is never a focusable control a
  // keyboard user can tab into while it is invisible.
  if (amberOnScreen || menuOpen) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 animate-sheet-up border-t border-line bg-white/95 backdrop-blur sm:hidden"
      /*
        z-20 sits under the header's z-30. The header is `sticky top-0` and this
        is pinned to the bottom, so they never overlap — but the open sheet
        expands downward from the header, and the loser of that overlap should be
        this bar, not the navigation. (It is unmounted while the sheet is open
        regardless; the z-index is the belt to that braces.)
      */
    >
      <div className="mx-auto max-w-5xl px-5 pb-[max(env(safe-area-inset-bottom),0.875rem)] pt-3.5">
        {/*
          Same amber fill and black label as `CtaPrimary` — this is the same
          action, so it must not read as a different one. `w-full` rather than
          `inline-flex` because a bar-width target is the point on a phone.

          `location="sticky-mobile"` keeps it separable from the hero and
          cta-band clicks in PostHog, which is the only way to find out whether
          this bar earns its place.
        */}
        <TrackedLink
          href={href}
          name={label}
          location="sticky-mobile"
          className="flex w-full items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-ink-soft shadow-card transition active:brightness-90"
        >
          {label}
        </TrackedLink>
      </div>
    </div>
  );
}
