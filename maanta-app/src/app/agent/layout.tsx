import { requireAgentPage } from "@/lib/agent";
import { AppProviders } from "@/components/auth/app-providers";

export const dynamic = "force-dynamic";

/**
 * Agent shell gate. Each agent screen keeps its own mobile `<main>` frame and
 * back-nav, so this layout adds no chrome — it just enforces the role at the
 * segment root (defense-in-depth), including on the client-rendered lead-capture
 * page which previously relied only on the API to reject writes.
 */
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAgentPage("/agent");
  return <AppProviders>{children}</AppProviders>;
}
