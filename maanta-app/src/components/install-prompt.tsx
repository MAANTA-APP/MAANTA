"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Logomark } from "@/components/ui/icons";
import { usePwaInstall } from "@/lib/pwa/usePwaInstall";
import { isStandaloneDisplayMode } from "@/lib/pwa/device";

const DISMISS_KEY = "maanta_install_dismissed";

/** 12n "Add to Home Screen" install prompt (PWA). */
export function InstallPrompt() {
  const { canInstall, install } = usePwaInstall();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (isStandaloneDisplayMode()) return;
    if (!canInstall) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [canInstall]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  async function onInstall() {
    const accepted = await install();
    if (accepted) dismiss();
  }

  return (
    <BottomSheet open={open} onClose={dismiss}>
      <div className="flex flex-col items-center px-2 pb-2 text-center">
        <Logomark className="h-14 w-14" />
        <h2 className="mt-4 text-lg font-bold text-ink">
          Install Maanta on your phone to work faster.
        </h2>
        <p className="mt-1 text-sm text-muted">
          Add Maanta to your home screen — shoppers, merchants, and ops all sign in
          with email OTP.
        </p>
        <Button full className="mt-5" onClick={() => void onInstall()}>
          Add Maanta to my phone
        </Button>
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
