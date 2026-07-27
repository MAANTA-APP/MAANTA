"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/registerServiceWorker";

/** Registers the service worker once at app boot. */
export function PwaRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
