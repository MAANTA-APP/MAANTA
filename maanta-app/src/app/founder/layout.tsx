import { requireFounderPage } from "@/lib/founder";
import { AppProviders } from "@/components/auth/app-providers";

export const dynamic = "force-dynamic";

/** Founder shell — minimal guard; pages use Claude components inline. */
export default async function FounderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFounderPage();
  return <AppProviders>{children}</AppProviders>;
}
