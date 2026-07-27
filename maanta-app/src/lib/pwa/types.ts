/** Browser `beforeinstallprompt` event (not in all TS DOM libs). */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallDevice = "android" | "ios" | "desktop" | "unknown";
