"use client";

import { useState } from "react";

type NotifyState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "enabled" }
  | { step: "error"; message: string };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function EnableNotificationsButton() {
  const [state, setState] = useState<NotifyState>({ step: "idle" });

  async function handleEnable() {
    setState({ step: "loading" });
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState({
          step: "error",
          message: "Push notifications aren't supported on this browser.",
        });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ step: "error", message: "Notification permission denied." });
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setState({ step: "error", message: "Push isn't configured yet." });
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!res.ok) {
        const body = await res.json();
        setState({
          step: "error",
          message: body.error ?? "Could not save subscription.",
        });
        return;
      }

      setState({ step: "enabled" });
    } catch {
      setState({ step: "error", message: "Could not enable notifications." });
    }
  }

  if (state.step === "enabled") {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Notifications enabled
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={handleEnable}
        disabled={state.step === "loading"}
        className="rounded border border-black/10 px-4 py-2 text-sm dark:border-white/20 disabled:opacity-50"
      >
        {state.step === "loading" ? "Enabling…" : "Enable Notifications"}
      </button>
      {state.step === "error" && (
        <p className="text-xs text-red-600">{state.message}</p>
      )}
    </div>
  );
}
