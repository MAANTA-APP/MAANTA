"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logomark } from "@/components/ui/icons";
import { cn } from "@/lib/ui";

/**
 * 8a Splash + 8b Welcome / onboarding (3 panes: Discover, Claim, Redeem).
 */
const PANES = [
  {
    title: "Discover",
    sub: "Every live deal at your mall, on one screen",
  },
  {
    title: "Claim",
    sub: "Tap a deal, get a 6-digit code instantly",
  },
  {
    title: "Redeem",
    sub: "Show your code at the counter and save",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [pane, setPane] = useState(-1); // -1 = splash

  if (pane === -1) {
    return (
      <main
        className="mx-auto flex min-h-dvh w-full max-w-mobile cursor-pointer flex-col items-center justify-center gap-5 bg-ink px-8"
        onClick={() => setPane(0)}
      >
        <Logomark className="h-20 w-20" />
        <p className="text-center text-base font-bold text-brand">
          Discover, Claim and Redeem.
        </p>
        <button className="mt-6 text-xs text-white/50">Tap to continue</button>
      </main>
    );
  }

  const p = PANES[pane];
  const last = pane === PANES.length - 1;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col px-6 pb-8 pt-10">
      <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-ink/20 bg-cream text-xs text-faint">
        illustration — {p.title}
      </div>
      <h1 className="mt-8 text-center text-2xl font-bold text-ink">{p.title}</h1>
      <p className="mt-2 text-center text-sm text-muted">{p.sub}</p>
      <div className="mt-6 flex justify-center gap-1.5">
        {PANES.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === pane ? "w-5 bg-ink" : "w-1.5 bg-cream-dark"
            )}
          />
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Button
          full
          onClick={() => (last ? router.push("/login") : setPane(pane + 1))}
        >
          {last ? "Get started" : "Next"}
        </Button>
        {!last ? (
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-center text-sm font-semibold text-muted"
          >
            Skip
          </button>
        ) : null}
      </div>
    </main>
  );
}
