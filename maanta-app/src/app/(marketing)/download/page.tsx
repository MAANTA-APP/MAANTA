import type { Metadata } from "next";
import {
  DownloadHeroCopy,
  DownloadInstallPanel,
} from "./download-install-panel";

export const metadata: Metadata = pageMetadata({
  path: "/download",
  // "… — MAANTA" is the convention every other route follows, and this was the
  // one page breaking it — also the only place the wordmark was cased "Maanta"
  // in a title, which reads as a different product in a search result listing
  // both.
  title: "Install the app — MAANTA",
  description:
    "Add MAANTA to your phone home screen in a few taps. No app store, no download — it runs in your browser and works for shoppers, merchants and agents.",
});
import { pageMetadata } from "@/lib/marketing/page-metadata";

/** PWA install landing — primary path for “get the app” links. */
export default function DownloadPage() {
  return (
    <div className="bg-stone">
      <section className="mx-auto flex min-h-[70dvh] max-w-3xl flex-col items-center px-5 pb-16 pt-14 text-center sm:pt-20">
        <DownloadHeroCopy />
        <DownloadInstallPanel />
      </section>
    </div>
  );
}
