import { getMerchantContext } from "@/lib/merchant";

export const dynamic = "force-dynamic";

/** Owner-only guard for the Add Staff flow (D165). */
export default async function AddStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;

  if (!res.ctx.isOwner) {
    return (
      <main className="px-6 py-24 text-center">
        <p className="text-sm font-semibold text-ink">
          Only the shop owner can manage staff.
        </p>
      </main>
    );
  }

  return children;
}
