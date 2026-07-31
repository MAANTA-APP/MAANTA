import type { Metadata } from "next";
import {
  DownloadHeroCopy,
  DownloadInstallPanel,
} from "./download-install-panel";

export const metadata: Metadata = {
  title: "Install Maanta",
  description:
    "Add Maanta to your phone home screen — shoppers, merchants, agents, and founders.",
};

/** PWA install landing — primary path for “get the app” links. */
export default function DownloadPage() {
  return (
    <main className="bg-stone">
      <section className="mx-auto flex min-h-[70dvh] max-w-3xl flex-col items-center px-5 pb-16 pt-14 text-center sm:pt-20">
        <DownloadHeroCopy />
        <DownloadInstallPanel />
      </section>
    </main>
  );
}
