import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";

/** 11e Override — completes the task with an audit line appended to it. */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const service = createServiceClient();
  const { data: task } = await service
    .from("agent_tasks")
    .select("id, description")
    .eq("id", params.id)
    .maybeSingle();
  if (!task) {
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  }

  const auditLine = `[override by admin ${auth.user.id} at ${new Date().toISOString()}]`;
  const { error } = await service
    .from("agent_tasks")
    .update({
      is_complete: true,
      description: task.description ? `${task.description}\n${auditLine}` : auditLine,
    })
    .eq("id", task.id);

  if (error) {
    console.error("override failed:", error);
    return NextResponse.json({ error: "Could not override." }, { status: 500 });
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: "agent_task.override",
    targetType: "agent_task",
    targetId: task.id,
  });

  return NextResponse.json({ ok: true });
}
