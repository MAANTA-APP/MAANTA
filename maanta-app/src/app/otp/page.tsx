import { redirect } from "next/navigation";

/**
 * Inventory / wireframe alias: shopper phone OTP lives on `/verify-phone`.
 * Preserve `next` (and any other query) so claim handoffs keep working.
 */
export default function OtpAliasPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string") q.set(key, value);
    else if (Array.isArray(value) && value[0]) q.set(key, value[0]);
  }
  const suffix = q.toString();
  redirect(suffix ? `/verify-phone?${suffix}` : "/verify-phone");
}
