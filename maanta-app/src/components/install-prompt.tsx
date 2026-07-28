"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Logomark } from "@/components/ui/icons";
import { usePwaInstall } from "@/lib/pwa/usePwaInstall";

const DISMISS_KEY = "maanta_install_dismissed";

/** 12n "Add to Home Screen" install prompt (PWA) — home landing only. */
export function InstallPrompt() {
  const { canInstall, install, isStandalone } = usePwaInstall();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (isStandalone) return;
    if (!canInstall) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [canInstall, isStandalone]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  async function onInstall() {
    const outcome = await install();
    if (outcome !== null) dismiss();
    else dismiss();
  }

  return (
    <BottomSheet open={open} onClose={dismiss}>
      <div className="flex flex-col items-center px-2 pb-2 text-center">
        <Logomark className="h-14 w-14" />
        <h2 className="mt-4 text-lg font-bold text-ink">
          Add Maanta to your home screen
        </h2>
        <p className="mt-1 text-sm text-muted">
          One tap to live deals — no app store, no download wait.
        </p>
        <Button full className="mt-5" onClick={() => void onInstall()}>
          Install app
        </Button>
        <a
          href="/download"
          className="mt-3 text-sm font-semibold text-ink underline"
        >
          Install tips
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="mt-4 text-sm font-semibold text-muted underline"
        >
          Not now
        </button>
      </div>
    </BottomSheet>
  );
}
