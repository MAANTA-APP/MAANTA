import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RedeemButton from "./redeem-button";

type DealDetail = {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  discount_type: "percentage" | "fixed" | "freebie" | null;
  discount_value: number | null;
  deal_type: "standard" | "flash";
  expires_at: string | null;
  merchant: {
    merchant_name: string;
    mall_name: string | null;
    floor: string | null;
    node: string;
  } | null;
};

function formatDiscount(deal: DealDetail) {
  if (deal.discount_type === "percentage") return `${deal.discount_value}% off`;
  if (deal.discount_type === "fixed") return `KES ${deal.discount_value} off`;
  if (deal.discount_type === "freebie") return "Free";
  return null;
}

export default async function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: deal, error } = await supabase
    .from("deals")
    .select(
      "id, title, description, image_url, discount_type, discount_value, deal_type, expires_at, merchant:merchants(merchant_name, mall_name, floor, node)"
    )
    .eq("id", params.id)
    .maybeSingle<DealDetail>();

  if (error) {
    console.error("Failed to load deal:", error);
  }

  if (!deal) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-8">
      <Link href="/deals" className="text-sm underline">
        ← Back to deals
      </Link>
      {deal.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={deal.image_url}
          alt={deal.title}
          className="h-48 w-full rounded object-cover"
        />
      )}
      <h1 className="text-2xl font-semibold">{deal.title}</h1>
      {deal.description && (
        <p className="text-sm text-black/60 dark:text-white/60">
          {deal.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {formatDiscount(deal) && (
          <span className="font-semibold">{formatDiscount(deal)}</span>
        )}
        {deal.merchant && (
          <span className="text-black/60 dark:text-white/60">
            {deal.merchant.merchant_name}
            {deal.merchant.mall_name ? ` · ${deal.merchant.mall_name}` : ""}
            {deal.merchant.floor ? ` · Floor ${deal.merchant.floor}` : ""}
          </span>
        )}
      </div>

      <RedeemButton dealId={deal.id} />
    </main>
  );
}
