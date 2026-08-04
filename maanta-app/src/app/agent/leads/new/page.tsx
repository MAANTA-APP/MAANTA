import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/data";
import { canWriteAgentLeads } from "@/lib/roles";
import { NewLeadForm } from "./new-lead-form";

export const dynamic = "force-dynamic";

/**
 * 11i Agent lead capture.
 *
 * G2 — page-level role gate mirroring the other agent screens (/agent,
 * /agent/leads). The /api/leads write was already gated server-side; this adds
 * matching defense-in-depth so the capture surface itself isn't reachable by
 * non-agents.
 *
 * Gated on `canWriteAgentLeads`, not on console visibility: a co-founder may read
 * the pipeline and may not add to it, so this page is the one `/agent` surface
 * they cannot reach. Same predicate as the API, so the form and the write it
 * posts to cannot disagree.
 */
export default async function NewLeadPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/agent/leads/new");
  if (!canWriteAgentLeads(user.role)) redirect("/");

  return <NewLeadForm />;
}
