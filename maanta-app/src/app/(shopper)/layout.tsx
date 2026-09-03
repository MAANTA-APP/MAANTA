import { ShopperBottomBar } from "@/components/nav/bottom-bars";
import { OfflineBanner } from "@/components/ui/states";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import { AppProviders } from "@/components/auth/app-providers";
import { ShopperClockProvider } from "@/lib/use-shopper-clock";
import { ShopperInventoryRefresh } from "@/components/shopper/inventory-refresh";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker";

// The clock seed below must be the instant this response was generated, not a
// build-time one, or every shopper page would ship a stale first paint.
export const dynamic = "force-dynamic";

export default function ShopperLayout({ children }: { children: React.ReactNode }) {
  // D213 — one server-generated instant for the whole shopper tree. Every
  // time-derived element renders from it on the server AND on the first client
  // render, so structure cannot disagree across hydration; the provider's
  // single timer advances it afterwards.
  const serverNow = new Date().toISOString();
  return (
    <AppProviders>
      <ShopperClockProvider serverNow={serverNow}>
        <ServiceWorkerRegistrar />
        <ShopperInventoryRefresh />
        <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col border-x border-line bg-stone">
          <DemoModeBanner />
          <OfflineBanner context="shopper" />
          <div className="flex-1 pb-24">{children}</div>
          <ShopperBottomBar />
        </div>
      </ShopperClockProvider>
    </AppProviders>
  );
}
