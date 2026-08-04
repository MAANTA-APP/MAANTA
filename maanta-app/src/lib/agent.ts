import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, type AppUser } from "@/lib/data";
import { canViewAgentConsole, canWriteAgentLeads } from "@/lib/roles";

/**
 * Server-component guard for `/agent/*` — read access.
 *
 * Resolves the caller's agent profile id in one place. `agentId` is null for
 * anyone reading the console without leads of their own — an admin, or a
 * co-founder. Callers that render per-agent data must handle that null rather
 * than assume it; `agent/leads/[id]` reads it as "org-wide reader" and both
 * widens the visible set and hides the merchant-link action.
 *
 * The lookup is skipped entirely for roles that cannot write leads. A person
 * promoted from `agent` to `cofounder` keeps their `agents` row, and resolving
 * it would silently narrow them back to their own old leads and re-offer a
 * link action the API rejects — a read-only role acting like a field rep
 * because of a stale row. Role decides, not row existence.
 */
export async function requireAgentPage(
  next: string
): Promise<{ user: AppUser; agentId: string | null }> {
  const user = await getAppUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!canViewAgentConsole(user.role)) redirect("/");
  if (!canWriteAgentLeads(user.role)) return { user, agentId: null };
  const service = createServiceClient();
  const { data: agent } = await service
    .from("agents")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return { user, agentId: agent?.id ?? null };
}

/** Route-handler guard: requires an *active* agent profile for writes. */
export async function requireActiveAgentApi(): Promise<
  { user: AppUser; agentId: string } | { error: NextResponse }
> {
  const user = await getAppUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  if (!canWriteAgentLeads(user.role)) {
    return { error: NextResponse.json({ error: "Not authorized." }, { status: 403 }) };
  }
  const service = createServiceClient();
  const { data: agent } = await service
    .from("agents")
    .select("id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agent || !agent.is_active) {
    return { error: NextResponse.json({ error: "No active agent profile." }, { status: 404 }) };
  }
  return { user, agentId: agent.id };
}
