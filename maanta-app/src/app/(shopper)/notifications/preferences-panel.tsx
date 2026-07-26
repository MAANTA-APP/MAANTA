"use client";

import { useEffect, useState } from "react";
import { Toggle } from "@/components/ui/inputs";
import { Body } from "@/components/ui/claude";

const PREFS_KEY = "maanta_notification_prefs";

type Prefs = {
  flashNearMe: boolean;
  savedShops: boolean;
  expiryReminders: boolean;
};

const DEFAULTS: Prefs = { flashNearMe: true, savedShops: true, expiryReminders: false };

/** Device-local notification toggles — single home is the Notifications screen. */
export function NotificationPreferencesPanel() {
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
    <div>
      <Body className="mb-3">Choose which Maanta alerts you receive.</Body>
      <div className="divide-y divide-line rounded-card border border-line bg-white px-4 shadow-card">
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
        Delivered as web push when enabled. You can change this anytime.
      </p>
    </div>
  );
}
