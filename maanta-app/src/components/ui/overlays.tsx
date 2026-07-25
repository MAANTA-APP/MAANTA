"use client";

import { useEffect, useRef, useState } from "react";
import { cn, formatCode } from "@/lib/ui";

/**
 * Mount → paint → visible → exit lifecycle so an overlay animates BOTH in and
 * out. Previously overlays hard-unmounted (`if (!open) return null`) and
 * vanished instantly on close. `mounted` keeps the node in the tree through the
 * exit transition; `visible` toggles the enter/exit classes. Under
 * `prefers-reduced-motion` the transitions are ~0ms (globals.css), so the same
 * code path is an instant swap — no motion, nothing lost.
 */
function useOverlayLifecycle(open: boolean, durationMs = 220) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Paint once mounted-but-hidden, then flip to visible so the enter
      // transition actually runs (a same-tick change would be coalesced).
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs]);

  return { mounted, visible };
}

/**
 * Keeps keyboard focus inside the dialog while it is open (Tab/Shift-Tab
 * cycle), moves focus into it on open, and wires Esc-to-close + body-scroll
 * lock. One helper for both overlays so behaviour can't drift.
 */
function useDialog(
  mounted: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLDivElement>
) {
  // onClose is almost always an inline arrow (new identity every parent render).
  // Keep it out of the effect deps via a ref, so focus-move + scroll-lock run
  // ONCE per open — not on every unrelated re-render (which would yank focus
  // back to the first control while the user is mid-interaction).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!mounted) return;
    const node = ref.current;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    // Move focus in without yanking it off a control the user just pressed.
    const first = focusables()[0];
    (first ?? node)?.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === firstEl || !node?.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mounted, ref]);
}

/** 6a Bottom sheet — slides up over a scrim, grab-handle on top. */
export function BottomSheet({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const { mounted, visible } = useOverlayLifecycle(open);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(mounted, onClose, ref);

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        className={cn(
          "absolute inset-0 bg-ink/50 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-mobile rounded-t-sheet bg-white px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3 shadow-sheet outline-none",
          "transition-transform duration-200 ease-[var(--ease-standard)] will-change-transform",
          visible ? "translate-y-0" : "translate-y-full",
          className
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-cream-dark" />
        {children}
      </div>
    </div>
  );
}

/** 6b Centered modal */
export function Modal({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const { mounted, visible } = useOverlayLifecycle(open);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(mounted, onClose, ref);

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        aria-label="Close"
        className={cn(
          "absolute inset-0 bg-ink/50 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-modal outline-none",
          "transition-[opacity,transform] duration-200 ease-[var(--ease-standard)] will-change-transform",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * 6c Code display — the credential. White card with a breathing amber border
 * (R3), the code in ink (never on an amber fill — the pulsing border is the
 * boundary between the credential and its context), slashed-zero mono digits.
 */
export function CodeDisplay({
  code,
  sub = "For the shop",
  className,
  size = "lg",
  pulse = false,
}: {
  code: string;
  sub?: string | null;
  className?: string;
  size?: "lg" | "xl";
  pulse?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border-[2.5px] bg-white px-6 py-7 text-center",
        pulse ? "animate-r3 border-brand" : "border-line",
        className
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        {sub}
      </div>
      <div
        className={cn(
          "font-code mt-2 font-medium tracking-[0.14em] text-ink",
          size === "xl" ? "text-4xl" : "text-3xl"
        )}
      >
        {formatCode(code)}
      </div>
    </div>
  );
}
