"use client";

import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/lib/pwa/usePwaInstall";

type Props = {
  label?: string;
  className?: string;
  full?: boolean;
  size?: "sm" | "md" | "lg";
};

export function PwaInstallButton({
  label = "Add Maanta to my phone",
  className,
  full,
  size = "lg",
}: Props) {
  const { canInstall, install } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <Button
      type="button"
      size={size}
      full={full}
      className={className}
      onClick={() => void install()}
    >
      {label}
    </Button>
  );
}
