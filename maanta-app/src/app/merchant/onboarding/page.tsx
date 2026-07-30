import { redirect } from "next/navigation";

/**
 * Inventory alias: some docs/prototypes still say `/merchant/onboarding`.
 * Canonical wizard is `/merchant/onboard` — keep the alias so E2E links work.
 */
export default function MerchantOnboardingAliasPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
  }
  const suffix = qs.toString();
  redirect(suffix ? `/merchant/onboard?${suffix}` : "/merchant/onboard");
}
