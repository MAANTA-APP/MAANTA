import type { InstallDevice } from "@/lib/pwa/types";

/** Best-effort device class for install instructions copy. */
export function detectInstallDevice(): InstallDevice {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/macintosh|windows|linux/i.test(ua) && !/mobile/i.test(ua)) return "desktop";
  return "unknown";
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari legacy
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}
