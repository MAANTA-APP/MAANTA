import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import ApproveButton from "./approve-button";

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const service = createServiceClient();

  const { data: appUser } = await service
    .from("users")
    .select("role")
    .eq("auth_uid", user.id)
    .maybeSingle();

  if (appUser?.role !== "admin") redirect("/");

  const { data: pendingMerchants } = await service
    .from("merchants")
    .select(
      "id, merchant_name, mall_name, floor, phone, what3words_address, created_at"
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: activeMerchants } = await service
    .from("merchants")
    .select("id, merchant_name, mall_name, account_balance, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">
          Pending Shops ({pendingMerchants?.length ?? 0})
        </h2>
        {!pendingMerchants?.length && (
          <p className="text-sm text-black/60 dark:text-white/60">
            Nothing pending.
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {pendingMerchants?.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-4 rounded border border-black/10 p-4 dark:border-white/20"
            >
              <div>
                <p className="font-medium">{m.merchant_name}</p>
                <p className="text-sm text-black/60 dark:text-white/60">
                  {m.mall_name ? `${m.mall_name} · ` : ""}Floor {m.floor ?? "—"}{" "}
                  · {m.phone}
                </p>
                <p className="text-xs text-black/40 dark:text-white/40">
                  {`///${m.what3words_address}`}
                </p>
              </div>
              <ApproveButton merchantId={m.id} />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Active Shops</h2>
        {!activeMerchants?.length && (
          <p className="text-sm text-black/60 dark:text-white/60">
            No active shops yet.
          </p>
        )}
        <ul className="flex flex-col gap-2 text-sm">
          {activeMerchants?.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded border border-black/10 p-3 dark:border-white/20"
            >
              <span>
                {m.merchant_name}
                {m.mall_name ? ` · ${m.mall_name}` : ""}
              </span>
              <span className="text-black/60 dark:text-white/60">
                KES {m.account_balance}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
