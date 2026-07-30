import { PublicNav, PublicFooter } from "@/components/nav/public-nav";
import { DemoModeBanner } from "@/components/demo-mode-banner";

/** §12 Public / marketing shell (1440px, responsive down to mobile). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <DemoModeBanner />
      <PublicNav />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
