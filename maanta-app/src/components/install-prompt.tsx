"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Logomark } from "@/components/ui/icons";

const DISMISS_KEY = "maanta_install_dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** 12n "Add to Home Screen" install prompt (PWA). */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Register the service worker so the app is installable.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setTimeout(() => setOpen(true), 1500);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  async function install() {
    if (!deferred) return dismiss();
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
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
        <Button full className="mt-5" onClick={install}>
          Install app
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
