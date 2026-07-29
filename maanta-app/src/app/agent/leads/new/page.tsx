import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/data";
import { hasAgentConsoleAccess } from "@/lib/roles";
import { NewLeadForm } from "./new-lead-form";

export const dynamic = "force-dynamic";

/**
 * 11i Agent lead capture.
 *
 * G2 — page-level role gate mirroring the other agent screens (/agent,
 * /agent/leads). The /api/leads write was already gated server-side; this adds
 * matching defense-in-depth so the capture surface itself isn't reachable by
 * non-agents.
 */
export default async function NewLeadPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/agent/leads/new");
  if (!hasAgentConsoleAccess(user)) redirect("/");

  return <NewLeadForm />;
}
