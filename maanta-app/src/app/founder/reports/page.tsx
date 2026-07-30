import { redirect } from "next/navigation";

/**
 * Inventory alias: founder KPI charts live under `/admin/reports`
 * (`requireFounderPage` ≡ admin). Keep `/founder/reports` as a stable URL.
 */
export default function FounderReportsAliasPage() {
  redirect("/admin/reports");
}
