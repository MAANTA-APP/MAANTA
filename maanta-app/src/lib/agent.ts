import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, type AppUser } from "@/lib/data";

/**
 * Server-component guard for `/agent/*`. Mirrors the inline check the agent
 * console already uses (role ∈ {agent, admin}) and resolves the caller's agent
 * profile id in one place. `agentId` is null for an admin with no agent row.
 */
export async function requireAgentPage(
  next: string
): Promise<{ user: AppUser; agentId: string | null }> {
  const user = await getAppUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (user.role !== "agent" && user.role !== "admin") redirect("/");
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
  if (user.role !== "agent" && user.role !== "admin") {
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
