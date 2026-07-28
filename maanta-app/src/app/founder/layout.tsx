import { requireFounderPage } from "@/lib/founder";

export const dynamic = "force-dynamic";

/** Founder shell — minimal guard; pages use Claude components inline. */
export default async function FounderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFounderPage();
  return <>{children}</>;
}
