"use client";

import { PwaInstallButton } from "@/components/pwa-install-button";
import { Body, HeadingMd } from "@/components/ui/claude";
import { detectInstallDevice } from "@/lib/pwa/device";
import { usePwaInstall } from "@/lib/pwa/usePwaInstall";
import { useSyncExternalStore } from "react";

const INSTRUCTIONS = {
  android: {
    title: "On Android",
    body: 'Open Maanta in Chrome, then tap "Install app" or "Add to Home screen" from the browser menu. You\'ll get a Maanta icon like any other app.',
  },
  ios: {
    title: "On iPhone",
    body: 'Open Maanta in Safari, tap the Share button, then "Add to Home Screen". The Maanta app opens full-screen from your home screen.',
  },
  desktop: {
    title: "On desktop",
    body: 'In Chrome or Edge, click the "Install app" icon in the address bar. Maanta will appear in your Start menu or Applications folder.',
  },
  unknown: {
    title: "On your device",
    body: "Use your browser's menu to add Maanta to your home screen or install the app.",
  },
} as const;

function useInstallDevice() {
  return useSyncExternalStore(
    () => () => {},
    () => detectInstallDevice(),
    () => "unknown" as const
  );
}

type Props = {
  showInstructions?: boolean;
};

export function DownloadClient({ showInstructions = false }: Props) {
  const device = useInstallDevice();
  const { canInstall, installed } = usePwaInstall();
  const copy = INSTRUCTIONS[device];

  if (!showInstructions) {
    if (installed) {
      return (
        <p className="rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-ink">
          Maanta is on your home screen — open it to sign in.
        </p>
      );
    }
    return <PwaInstallButton full />;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-card border border-line bg-stone p-4">
        <HeadingMd as="h3" className="text-base">
          {copy.title}
        </HeadingMd>
        <Body className="mt-2 text-sm text-secondary">{copy.body}</Body>
      </div>
      {!canInstall && !installed ? (
        <Body className="text-sm text-muted">
          If you don&apos;t see an install button above, follow the steps for your device.
          After installing, sign in once — Maanta routes you to the right console for
          shoppers, merchants, staff, admin, agents, and founders.
        </Body>
      ) : null}
      {canInstall ? <PwaInstallButton size="md" /> : null}
    </div>
  );
}
