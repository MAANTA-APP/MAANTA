import { createServiceClient } from "@/lib/supabase/service";
import { readDemoModeEnabled } from "@/lib/demo-mode";
import { withPublicMerchant } from "@/lib/data";
import { genuineJoinSelect, genuineTagged } from "@/lib/evidence-scope";
import { classifyMerchant } from "@/lib/pilot-cohort";
import {
  buildActionQueue,
  type ActionItem,
  type ActionQueueInput,
} from "@/lib/admin-action-queue";

/**
 * The reads behind the Action Queue, in one place, so `/admin` and
 * `/admin/queue` cannot disagree about what needs attention.
 *
 * Every list read is bounded (`ROW_CAP`), and a read that RETURNS the cap is
 * treated as unreadable rather than complete: PostgREST returns the first
 * page with no error, so "I got the cap back" is the only signal that rows
 * were dropped, and a queue that quietly omits items is an all-clear for the
 * items it dropped. The cap sits below PostgREST's server maximum so hitting
 * it is unambiguous. `pilot-bounded-reads.test.ts` states the same rule for
 * the pilot surfaces; this module follows it.
 *
 * Per-merchant supply is counted with the SAME predicate the feed uses
 * (`withPublicMerchant`, demo-aware), so the "no shopper-visible deal" item
 * cannot fire against a merchant whose deals are on screen.
 */
export const ROW_CAP = 400;

type Service = ReturnType<typeof createServiceClient>;

/** A list read: rows, or null on error OR on a page that hit the cap. */
function rowsOrNull<T>(res: { data: T[] | null; error: unknown }): T[] | null {
  if (res.error) return null;
  const rows = res.data ?? [];
  if (rows.length >= ROW_CAP) return null;
  return rows;
}

const name = (m: unknown): string | null =>
  (m as { merchant_name?: string | null } | null)?.merchant_name ?? null;

export type ActionQueueData = {
  items: ActionItem[];
  demoMode: { ok: boolean; enabled: boolean };
};

export async function loadActionQueue(service: Service = createServiceClient()): Promise<ActionQueueData> {
  const now = new Date();
  const nowIso = now.toISOString();
  const demoMode = await readDemoModeEnabled();

  const [
    pendingRes,
    heldRes,
    declinedRes,
    fraudRes,
    tasksRes,
    merchantsRes,
    cappedDealsRes,
    seatsRes,
    blacklistedRes,
    arrivalsRes,
    topupsRes,
  ] = await Promise.all([
    service
      .from("merchants")
      .select("id, merchant_name, created_at")
      .eq("status", "pending")
      .eq("is_demo", false)
      .order("created_at", { ascending: true })
      .limit(ROW_CAP),
    genuineTagged(
      service
        .from("redemptions")
        .select(genuineJoinSelect("id, redeemed_at", ["merchant_name"]))
        .eq("status", "flagged")
        .order("redeemed_at", { ascending: true })
        .limit(ROW_CAP)
    ),
    // Guardian hard-blocks carry `guardian_hard_block`; an upheld appeal adds
    // `guardian_appeal_rejected`. The filter for "not yet upheld" is applied
    // in memory because PostgREST's array operators cannot express "contains
    // A and not B" in one predicate.
    genuineTagged(
      service
        .from("redemptions")
        .select(genuineJoinSelect("id, redeemed_at, fraud_flags", ["merchant_name"]))
        .eq("status", "failed")
        .contains("fraud_flags", ["guardian_hard_block"])
        .order("redeemed_at", { ascending: false })
        .limit(ROW_CAP)
    ),
    service
      .from("fraud_events")
      .select("id, event_type, severity, created_at, merchant_id, merchants(merchant_name,is_demo)")
      .eq("resolved", false)
      .order("created_at", { ascending: true })
      .limit(ROW_CAP),
    service
      .from("agent_tasks")
      .select("id, task_type, priority, created_at, due_at, merchant_id, merchants(merchant_name,is_demo)")
      .eq("is_complete", false)
      .order("created_at", { ascending: true })
      .limit(ROW_CAP),
    service
      .from("merchants")
      .select(
        "id, merchant_name, status, is_visible, is_shadow_banned, is_demo, account_balance, outstanding_arrears, updated_at"
      )
      .eq("is_demo", false)
      .neq("status", "churned")
      .order("created_at", { ascending: true })
      .limit(ROW_CAP),
    // Live, capped deals; the D236 boundary is applied by the rule so the SQL
    // and the TypeScript cannot disagree about `>=`.
    service
      .from("deals")
      .select(
        "id, title, merchant_id, max_claims, claims_reserved, updated_at, merchants!inner(merchant_name,is_demo)"
      )
      .eq("is_active", true)
      .eq("is_paused", false)
      .eq("is_demo", false)
      .eq("merchants.is_demo", false)
      .gt("expires_at", nowIso)
      .not("max_claims", "is", null)
      .order("updated_at", { ascending: true })
      .limit(ROW_CAP),
    service
      .from("merchant_staff")
      .select("id, staff_name, merchant_id, invited_at, merchants!inner(merchant_name, status, is_demo)")
      .is("user_id", null)
      .eq("merchants.is_demo", false)
      .order("invited_at", { ascending: true })
      .limit(ROW_CAP),
    genuineTagged(
      service
        .from("redemptions")
        .select(
          genuineJoinSelect("id, user_id, claimed_at, users!inner(full_name,is_blacklisted)", [
            "merchant_name",
          ])
        )
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .eq("users.is_blacklisted", true)
        .order("claimed_at", { ascending: true })
        .limit(ROW_CAP)
    ),
    genuineTagged(
      service
        .from("redemptions")
        .select(
          genuineJoinSelect(
            "id, status, expires_at, arrived_at, merchant_presentations(status,expires_at)",
            ["merchant_name"]
          )
        )
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .not("arrived_at", "is", null)
        .order("arrived_at", { ascending: true })
        .limit(ROW_CAP)
    ),
    service
      .from("pending_topups")
      .select("api_ref, merchant_id, amount, currency, created_at, merchants!inner(merchant_name,is_demo)")
      .eq("status", "initiated")
      .eq("merchants.is_demo", false)
      .order("created_at", { ascending: true })
      .limit(ROW_CAP),
  ]);

  // Per-merchant shopper-visible supply, one count per non-demo merchant.
  // Bounded by the merchant read above (itself capped), and each count is a
  // head query, so nothing here can be truncated silently.
  const merchantRows = rowsOrNull(merchantsRes);
  let merchants: ActionQueueInput["merchants"] = null;
  if (merchantRows !== null) {
    const supply = await Promise.all(
      merchantRows.map(async (m) => {
        if (m.status !== "active" || !demoMode.ok) return null;
        const { count, error } = await withPublicMerchant(
          service
            .from("deals")
            .select("id, merchants!inner(status,is_visible,is_shadow_banned,is_demo)", {
              count: "exact",
              head: true,
            })
            .eq("merchant_id", m.id)
            .eq("is_active", true)
            .eq("is_paused", false)
            .gt("expires_at", nowIso),
          { includeDemo: demoMode.enabled }
        );
        return error ? null : count ?? 0;
      })
    );
    merchants = merchantRows.map((m, i) => ({
      id: m.id,
      merchant_name: m.merchant_name,
      status: m.status,
      is_visible: m.is_visible !== false,
      is_shadow_banned: m.is_shadow_banned === true,
      is_demo: m.is_demo === true,
      account_balance: Number(m.account_balance ?? 0),
      outstanding_arrears: Number(m.outstanding_arrears ?? 0),
      updated_at: m.updated_at ?? null,
      evidence: classifyMerchant(m.id),
      visibleDeals: supply[i],
    }));
  }

  const declinedRows = rowsOrNull(declinedRes);
  const input: ActionQueueInput = {
    now,
    pendingMerchants: rowsOrNull(pendingRes),
    heldRedemptions:
      rowsOrNull(heldRes)?.map((r) => ({
        id: r.id,
        redeemed_at: r.redeemed_at,
        merchant_name: name(r.merchants),
      })) ?? null,
    appealableRedemptions:
      declinedRows
        ?.filter((r) => !((r.fraud_flags ?? []) as string[]).includes("guardian_appeal_rejected"))
        .map((r) => ({ id: r.id, redeemed_at: r.redeemed_at, merchant_name: name(r.merchants) })) ?? null,
    fraudEvents:
      rowsOrNull(fraudRes)
        ?.filter(
          (e) =>
            (e.merchants as unknown as { is_demo?: boolean } | null)?.is_demo !== true
        )
        .map((e) => ({
          id: e.id,
          event_type: e.event_type,
          severity: e.severity,
          created_at: e.created_at,
          merchant_id: e.merchant_id,
          merchant_name: name(e.merchants),
        })) ?? null,
    openTasks:
      rowsOrNull(tasksRes)
        ?.filter(
          (t) =>
            (t.merchants as unknown as { is_demo?: boolean } | null)?.is_demo !== true
        )
        .map((t) => ({
          id: t.id,
          task_type: t.task_type,
          priority: t.priority,
          created_at: t.created_at,
          due_at: t.due_at,
          merchant_id: t.merchant_id,
          merchant_name: name(t.merchants),
        })) ?? null,
    merchants,
    cappedLiveDeals:
      rowsOrNull(cappedDealsRes)?.map((d) => ({
        id: d.id,
        title: d.title,
        merchant_id: d.merchant_id,
        merchant_name: name(d.merchants),
        max_claims: d.max_claims,
        claims_reserved: Number(d.claims_reserved ?? 0),
        updated_at: d.updated_at,
      })) ?? null,
    unlinkedStaffSeats:
      rowsOrNull(seatsRes)?.map((s) => {
        const m = s.merchants as unknown as { merchant_name: string; status: string } | null;
        return {
          id: s.id,
          staff_name: s.staff_name,
          merchant_id: s.merchant_id,
          merchant_name: m?.merchant_name ?? null,
          merchant_status: m?.status ?? "unknown",
          invited_at: s.invited_at,
        };
      }) ?? null,
    blacklistedLiveClaims:
      rowsOrNull(blacklistedRes)?.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        full_name: (r.users as unknown as { full_name: string | null } | null)?.full_name ?? null,
        claimed_at: r.claimed_at,
        merchant_name: name(r.merchants),
      })) ?? null,
    staleArrivals:
      rowsOrNull(arrivalsRes)?.map((r) => ({
        id: r.id,
        status: r.status,
        expires_at: r.expires_at,
        arrived_at: r.arrived_at,
        merchant_presentations: (r.merchant_presentations ?? []) as { status: string; expires_at: string }[],
        merchant_name: name(r.merchants),
      })) ?? null,
    stuckTopups:
      rowsOrNull(topupsRes)?.map((t) => ({
        api_ref: t.api_ref,
        merchant_id: t.merchant_id,
        merchant_name: name(t.merchants),
        amount: Number(t.amount ?? 0),
        currency: t.currency,
        created_at: t.created_at,
      })) ?? null,
    demoModeEnabled: demoMode.ok ? demoMode.enabled : null,
  };

  return { items: buildActionQueue(input), demoMode };
}
