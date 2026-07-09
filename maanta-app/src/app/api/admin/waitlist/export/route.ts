import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Admin-only CSV export of the waitlist for the marketing/CRM workflow.
// Optional ?segment=shopper|merchant|mall_operator filter. This is the
// documented export path until an automated CRM sync job exists.

const EXPORT_COLUMNS = [
  "segment_type",
  "email",
  "phone",
  "full_name",
  "city",
  "node_interest",
  "source_campaign",
  "source_medium",
  "source_channel",
  "business_name",
  "business_category",
  "floor_unit",
  "mall_name",
  "mall_role",
  "consent_at",
  "created_at",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Quote anything that could break CSV structure, and neutralize formula
  // injection (=, +, -, @ leading chars) since this file is opened in Excel
  // or Sheets by the marketing team.
  const needsFormulaGuard = /^[=+\-@]/.test(text);
  const guarded = needsFormulaGuard ? `'${text}` : text;
  if (/[",\n\r]/.test(guarded) || needsFormulaGuard) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: appUser } = await service
    .from("users")
    .select("role")
    .eq("auth_uid", authUser.id)
    .maybeSingle();

  if (appUser?.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const segment = new URL(request.url).searchParams.get("segment");

  let query = service
    .from("waitlist_signups")
    .select(EXPORT_COLUMNS.join(", "))
    .order("created_at", { ascending: true });

  if (segment) {
    query = query.eq("segment_type", segment);
  }

  const { data, error } = await query;

  if (error) {
    console.error("waitlist export failed:", error);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }

  // supabase-js can't derive row types from a runtime-joined column string,
  // so it falls back to an error-shaped type; the data is plain rows.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [
    EXPORT_COLUMNS.join(","),
    ...rows.map((row) =>
      EXPORT_COLUMNS.map((col) => csvEscape(row[col])).join(",")
    ),
  ].join("\n");

  const filename = `maanta-waitlist${segment ? `-${segment}` : ""}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
