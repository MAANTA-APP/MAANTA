"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { IconBell } from "@/components/ui/icons";
import { SHOPPER_PUSH_SENDER_EXISTS } from "@/lib/shopper-push";

const DISMISS_KEY = "maanta_notif_optin_dismissed";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData.split("").map((c) => c.charCodeAt(0)));
}

/**
 * 8p Notification opt-in (sheet) — shown once per device to signed-in shoppers,
 * and **only once something can actually send them a push**.
 *
 * `SHOPPER_PUSH_SENDER_EXISTS` is false today: the sole caller of
 * `sendPushNotification` is `notify-merchant`, and all of its call sites are
 * payment webhooks addressed to merchants. Asking anyway spends a permission
 * that is close to non-renewable — a browser-level block cannot be re-prompted
 * — in exchange for a promise ("new deals near you") that nothing keeps. Drift
 * **D234**; see `@/lib/shopper-push` for why this is a codebase fact rather
 * than an operator toggle.
 *
 * The gate is on BOTH the effect and the render, deliberately. The render guard
 * alone would leave the effect scheduling a sheet that never paints; the effect
 * guard alone would leave a future edit able to open it. Neither is placed
 * before the hooks, because a component may not return early above them.
 */
export function NotificationOptIn() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!SHOPPER_PUSH_SENDER_EXISTS) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (!("Notification" in window) || Notification.permission !== "default") return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  }

  async function allow() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (vapid) {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapid),
          });
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription }),
          });
        }
      }
    } catch {
      // best-effort — never block the feed on push setup
    } finally {
      setBusy(false);
      dismiss();
    }
  }

  if (!SHOPPER_PUSH_SENDER_EXISTS) return null;

  return (
    <BottomSheet open={open} onClose={dismiss}>
      <div className="flex flex-col items-center px-2 pb-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-ink bg-white">
          <IconBell className="h-6 w-6 text-ink" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-ink">Don&apos;t miss flash deals</h2>
        <p className="mt-1 text-sm text-muted">
          Turn on notifications for new deals near you
        </p>
        <Button full className="mt-5" onClick={allow} loading={busy}>
          Allow notifications
        </Button>
        <Button full variant="ghost" className="mt-3 border-0" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </BottomSheet>
  );
}
