import { ShopperBottomBar } from "@/components/nav/bottom-bars";
import { OfflineBanner } from "@/components/ui/states";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import { AppProviders } from "@/components/auth/app-providers";

export default function ShopperLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col border-x border-line bg-stone">
        <DemoModeBanner />
        <OfflineBanner />
        <div className="flex-1 pb-24">{children}</div>
        <ShopperBottomBar />
      </div>
    </AppProviders>
  );
}
