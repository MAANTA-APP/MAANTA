import { PublicNav, PublicFooter } from "@/components/nav/public-nav";

/** §12 Public / marketing shell (1440px, responsive down to mobile). */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicNav />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
