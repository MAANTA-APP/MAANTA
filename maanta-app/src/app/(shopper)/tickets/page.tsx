import { redirect } from "next/navigation";

/**
 * Inventory alias: prototype list path `/tickets`.
 * Canonical shopper ticket list is `/my-deals` (nav label: Deals).
 */
export default function TicketsListAliasPage() {
  redirect("/my-deals");
}
