import { ShopperBottomBar } from "@/components/nav/bottom-bars";
import { OfflineBanner } from "@/components/ui/states";

export default function ShopperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col border-x border-line bg-white">
      <OfflineBanner />
      <div className="flex-1 pb-24">{children}</div>
      <ShopperBottomBar />
    </div>
  );
}
