import { requireAdminPage } from "@/lib/admin";
import { AdminSidebar } from "@/components/nav/admin-sidebar";
import { AppProviders } from "@/components/auth/app-providers";

export const dynamic = "force-dynamic";

/** §11 Admin shell — black left sidebar on desktop, ☰ drawer on mobile (11k). */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return (
    <AppProviders>
      <div className="flex min-h-dvh bg-white">
        <AdminSidebar />
        <div className="min-w-0 flex-1 px-5 pb-16 pt-14 lg:px-10 lg:pt-8">{children}</div>
      </div>
    </AppProviders>
  );
}
