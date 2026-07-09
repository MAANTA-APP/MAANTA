"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@/components/ui/inputs";

const PREFS_KEY = "maanta_notification_prefs";

type Prefs = {
  flashNearMe: boolean;
  savedShops: boolean;
  expiryReminders: boolean;
};

const DEFAULTS: Prefs = { flashNearMe: true, savedShops: true, expiryReminders: false };

/** 8ad Notification preferences (device-local until a prefs column ships). */
export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) setPrefs({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch {
      /* ignore */
    }
  }, []);

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }

  return (
    <main className="px-4 pt-6">
      <h1 className="text-center text-lg font-bold text-ink">Notifications</h1>
      <div className="mt-6 divide-y divide-line rounded-card border border-line bg-white px-4">
        <Toggle
          label="Flash deals near me"
          checked={prefs.flashNearMe}
          onChange={(v) => update({ flashNearMe: v })}
        />
        <Toggle
          label="New deals from saved shops"
          checked={prefs.savedShops}
          onChange={(v) => update({ savedShops: v })}
        />
        <Toggle
          label="Code expiry reminders"
          checked={prefs.expiryReminders}
          onChange={(v) => update({ expiryReminders: v })}
        />
      </div>
      <p className="mt-3 text-xs text-faint">
        Delivered as web push notifications. You can change this anytime.
      </p>
    </main>
  );
}
