import { requireFounderPage } from "@/lib/founder";
import { canAccessAdminConsole } from "@/lib/roles";
import { AppProviders } from "@/components/auth/app-providers";
import { FounderHeader } from "@/components/nav/founder-header";

export const dynamic = "force-dynamic";

/** Founder shell — guard + shell nav; pages use Claude components inline. */
export default async function FounderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The guard already returns the user, so the header's admin link is decided by
  // the same role read that admitted them — never by assuming founder implies admin.
  const user = await requireFounderPage();
  return (
    <AppProviders>
      <div className="min-h-dvh bg-white">
        <FounderHeader canOpenAdminConsole={canAccessAdminConsole(user.role)} />
        {children}
      </div>
    </AppProviders>
  );
}
