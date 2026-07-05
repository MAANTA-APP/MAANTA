import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Deal = {
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

function formatDiscount(deal: Deal) {
  if (deal.discount_type === "percentage") return `${deal.discount_value}% off`;
  if (deal.discount_type === "fixed") return `KES ${deal.discount_value} off`;
  if (deal.discount_type === "freebie") return "Free";
  return null;
}

export default async function DealsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: deals, error } = await supabase
    .from("deals")
    .select(
      "id, title, description, image_url, discount_type, discount_value, deal_type, expires_at, merchant:merchants(merchant_name, mall_name, floor, node)"
    )
    .order("created_at", { ascending: false })
    .returns<Deal[]>();

  if (error) {
    console.error("Failed to load deals:", error);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Deals</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Couldn&apos;t load deals right now. Please try again shortly.
        </p>
      )}

      {!error && deals?.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          No active deals right now — check back soon.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {deals?.map((deal) => (
          <li
            key={deal.id}
            className="flex flex-col gap-2 rounded border border-black/10 p-4 dark:border-white/20"
          >
            {deal.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={deal.image_url}
                alt={deal.title}
                className="h-40 w-full rounded object-cover"
              />
            )}
            <div className="flex items-center justify-between">
              <span className="font-medium">{deal.title}</span>
              {deal.deal_type === "flash" && (
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  Flash
                </span>
              )}
            </div>
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
          </li>
        ))}
      </ul>
    </main>
  );
}
