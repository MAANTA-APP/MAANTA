"use client";

import { useEffect } from "react";
import { cn, formatCode } from "@/lib/ui";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        className="absolute inset-0 animate-fade-in bg-ink/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className={cn(
          "relative z-10 w-full max-w-mobile animate-sheet-up rounded-t-sheet bg-white px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3 shadow-sheet",
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        aria-label="Close"
        className="absolute inset-0 animate-fade-in bg-ink/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className={cn(
          "relative z-10 w-full max-w-md animate-fade-in rounded-2xl bg-white p-6 shadow-modal",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** 6c Code display — big yellow block, monospace "482 913", "Show this to staff". */
export function CodeDisplay({
  code,
  sub = "Show this to staff",
  className,
  size = "lg",
}: {
  code: string;
  sub?: string | null;
  className?: string;
  size?: "lg" | "xl";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-brand px-6 py-7 text-center",
        className
      )}
    >
      <div
        className={cn(
          "font-mono font-bold tracking-[0.12em] text-ink",
          size === "xl" ? "text-5xl" : "text-4xl"
        )}
      >
        {formatCode(code)}
      </div>
      {sub ? (
        <div className="mt-2 text-xs font-semibold text-ink/80">{sub}</div>
      ) : null}
    </div>
  );
}
