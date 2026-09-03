import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { ROLE_LABELS } from "@/lib/roles";
import { StatusChip } from "@/components/ui/chips";
import { KpiCard } from "@/components/ui/cards";
import { IconArrowLeft } from "@/components/ui/icons";
import { friendlyTime, maskPhone, formatKes } from "@/lib/ui";
import { summariseCustomerRedemptions } from "@/lib/customer-summary";
import { AdminReadError } from "@/components/admin/read-error";
import { CustomerAdminActions } from "./customer-admin-actions";

export const dynamic = "force-dynamic";

/**
 * A2b — Admin customer record.
 *
 * Everything the product knows about one account: who they are, when they
 * joined, and every claim they have made. Read-only — blacklisting and role
 * changes are separate acts with their own audit questions, and no mutation for
 * them exists on this surface.
 *
 * Three privacy decisions, each following an existing rule rather than inventing
 * one:
 *
 *  - **The phone stays masked**, as it is on the customers list and the agent
 *    lead detail. Merchant detail shows a shop's phone in full because that is a
 *    published business contact; a shopper's number is personal data, and an
 *    admin reading a support ticket does not need it rendered to answer the
 *    question in front of them.
 *  - **No OTP codes.** For a pending row the code is a live credential, and for
 *    a past one it is an unnecessary record of one. The reference id already
 *    identifies a redemption for support.
 *  - **Auth linkage is shown as presence, not value.** Whether an account is
 *    Clerk-linked is useful when a sign-in fails; the identifier itself is
 *    internal and belongs in the database, not on a page.
 */
export default async function AdminCustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminPage();

  const service = createServiceClient();
  const userRes = await service
    .from("users")
    .select(
      "id, full_name, email, phone, role, is_blacklisted, created_at, clerk_user_id, push_subscription"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (userRes.error) {
    return (
      <main className="max-w-3xl">
        <h1 className="text-2xl font-bold text-ink">Customer detail</h1>
        <div className="mt-5"><AdminReadError what="customer details" /></div>
      </main>
    );
  }
  const user = userRes.data;
  if (!user) notFound();

  const { data: redemptions, error: redemptionsError } = await service
    .from("redemptions")
    .select(
      "id, status, redeemed_at, success_fee_charged, deals(title), merchants(id, merchant_name)"
    )
    .eq("user_id", params.id)
    .order("redeemed_at", { ascending: false })
    .limit(100);

  if (redemptionsError) {
    return (
      <main className="max-w-3xl">
        <h1 className="text-2xl font-bold text-ink">Customer detail</h1>
        <div className="mt-5"><AdminReadError what="customer claims and redemptions" /></div>
      </main>
    );
  }

  const rows = redemptions ?? [];
  const s = summariseCustomerRedemptions(rows);

  return (
    <main className="max-w-3xl">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-ink"
      >
        <IconArrowLeft className="h-4 w-4" />
        Customers
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">
          {user.full_name?.trim() || maskPhone(user.phone) || "Unnamed account"}
        </h1>
        <StatusChip
          status={user.is_blacklisted ? "flagged" : "active"}
          label={user.is_blacklisted ? "Blacklisted" : "Active"}
        />
      </div>

      <div className="mt-4 space-y-2">
        {/* Indexed through a widened view: `role` is TEXT in the database, so a
            row can legitimately hold a value the union does not know, and the
            raw value is a better answer than a crash. */}
        <Row
          label="Role"
          value={(ROLE_LABELS as Record<string, string>)[user.role] ?? user.role}
        />
        <Row label="Joined" value={friendlyTime(user.created_at)} />
        <Row label="Email" value={user.email || "—"} />
        {/* Masked, per the rule in this file's header. */}
        <Row label="Phone" value={maskPhone(user.phone) ?? "—"} />
        <Row
          label="Sign-in"
          value={user.clerk_user_id ? "Clerk-linked" : "Not Clerk-linked"}
        />
        <Row
          label="Push notifications"
          value={user.push_subscription ? "Subscribed" : "Not subscribed"}
        />
        <Row
          label="Last activity"
          value={s.lastActivityAt ? friendlyTime(s.lastActivityAt) : "No claims yet"}
        />
      </div>

      {/* D171: the block control lives next to the status chip that reports it,
          so an admin never sees the label without the lever that moves it. */}
      {user.role === "customer" ? (
        <CustomerAdminActions
          userId={user.id}
          isBlacklisted={user.is_blacklisted === true}
        />
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Claims (all time)" value={s.claims.toLocaleString()} />
        <KpiCard label="Redeemed" value={s.redeemed.toLocaleString()} />
        <KpiCard label="Open claims" value={s.pending.toLocaleString()} />
        <KpiCard label="Fees generated" value={formatKes(s.feesGenerated)} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Fees generated is what merchants paid on this shopper&apos;s verified redemptions —
        success rows only, since a pending claim has cost nobody anything yet.
        {s.flagged > 0 || s.failed > 0
          ? ` ${s.flagged} flagged · ${s.failed} failed.`
          : ""}
      </p>

      <h2 className="mt-8 text-base font-bold text-ink">Claims and redemptions</h2>
      <p className="mt-1 text-xs text-muted">
        One row per claim. Status is what separates a claim from a completed redemption.
      </p>
      <div className="mt-2 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-card bg-white shadow-card px-4 py-6 text-center text-sm text-muted">
            No claims yet
          </p>
        ) : (
          rows.map((r) => {
            const deal = r.deals as unknown as { title: string } | null;
            const merchant = r.merchants as unknown as {
              id: string;
              merchant_name: string;
            } | null;
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card bg-white shadow-card px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                  {deal?.title ?? "Deal removed"}
                </span>
                {merchant ? (
                  <Link
                    href={`/admin/merchants/${merchant.id}`}
                    className="text-xs text-secondary hover:text-ink"
                  >
                    {merchant.merchant_name}
                  </Link>
                ) : null}
                <span className="text-xs text-muted">{friendlyTime(r.redeemed_at)}</span>
                {r.status === "success" ? (
                  <span className="tnum text-xs text-secondary">
                    {formatKes(Number(r.success_fee_charged ?? 0))}
                  </span>
                ) : null}
                <StatusChip status={r.status} />
              </div>
            );
          })
        )}
      </div>

      <p className="mt-8 text-xs text-muted">
        Read-only. Blacklisting and role changes are separate acts with their own audit
        trail, and are not performed from this page. Redemption codes are never shown —
        for a pending claim the code is a live credential.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-card bg-white shadow-card px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
