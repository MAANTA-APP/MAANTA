import { createServiceClient } from "@/lib/supabase/service";

/**
 * Node 0 opening credit — the ONE place that decides whether the launch-credit
 * promise may be shown to the public.
 *
 * The credit itself is granted inline by `activate_merchant`
 * (migration `20260716084804_node0_opening_credit_on_activation.sql`), gated on
 * four `app_config` keys. The public copy on `/for-merchants` used to hardcode
 * two of those numbers, which meant the page kept promising KES 300 to the first
 * 100 shops no matter what ops had actually configured — and kept promising it
 * after the window closed or the cap filled.
 *
 * So this module mirrors the SQL gate exactly, and the page renders the promo
 * only when the gate would actually grant it. The rule is pure
 * (`launchCreditOffer`) so it can be tested without a database; the read
 * (`getLaunchCreditOffer`) is the thin server half.
 *
 * The merchant-node condition (`merchants.node = node0_launch_node`) is the one
 * gate this module can't evaluate — a visitor has no merchant row yet — so the
 * copy names the launch node instead of implying every shop qualifies.
 */

/** The four `app_config` keys the SQL gate reads, as raw strings. */
export const LAUNCH_CREDIT_CONFIG_KEYS = [
  "node0_opening_credit_kes",
  "node0_opening_credit_merchant_cap",
  "node0_launch_node",
  "node0_launch_period_ends_at",
] as const;

export type LaunchCreditConfig = {
  /** `node0_opening_credit_kes`. 0 or absent disables the promo. */
  amountKes: number | null;
  /** `node0_opening_credit_merchant_cap`. `null` means uncapped. */
  merchantCap: number | null;
  /** `node0_launch_node`. The SQL coalesces a missing value to "BBS Mall". */
  launchNode: string | null;
  /** `node0_launch_period_ends_at`. `null` means the window never closes. */
  windowEndsAt: string | null;
};

/**
 * Why the promo is not being advertised. Every one of these is a reason to show
 * nothing rather than a reason to show a smaller promise — an offer we cannot
 * confirm is one we must not make.
 */
export type LaunchCreditUnavailableReason =
  | "disabled" // amount is 0 or unset
  | "window-closed" // past node0_launch_period_ends_at
  | "cap-filled" // the first-N slots are gone
  | "unavailable"; // config could not be read

export type LaunchCreditOffer =
  | {
      live: true;
      amountKes: number;
      /** `null` when uncapped — the copy must not claim a "first N" in that case. */
      merchantCap: number | null;
      launchNode: string;
      windowEndsAt: string | null;
    }
  | { live: false; reason: LaunchCreditUnavailableReason };

/** The SQL's `COALESCE(v_launch_node, 'BBS Mall')`, kept in one place. */
const DEFAULT_LAUNCH_NODE = "BBS Mall";

/**
 * The gate, as a pure function. Mirrors the `IF` block in `activate_merchant`:
 * a positive amount, inside the launch window, under the merchant cap.
 *
 * @param creditedCount how many merchants have already been credited
 * @param now evaluation time, injected so the window boundary is testable
 */
export function launchCreditOffer(
  config: LaunchCreditConfig,
  creditedCount: number,
  now: Date
): LaunchCreditOffer {
  const { amountKes, merchantCap, launchNode, windowEndsAt } = config;

  if (amountKes === null || !Number.isFinite(amountKes) || amountKes <= 0) {
    return { live: false, reason: "disabled" };
  }

  if (windowEndsAt !== null) {
    const ends = Date.parse(windowEndsAt);
    // An unparseable window is not a licence to advertise indefinitely.
    if (Number.isNaN(ends)) return { live: false, reason: "unavailable" };
    if (now.getTime() >= ends) return { live: false, reason: "window-closed" };
  }

  if (merchantCap !== null && creditedCount >= merchantCap) {
    return { live: false, reason: "cap-filled" };
  }

  return {
    live: true,
    amountKes,
    merchantCap,
    launchNode: launchNode ?? DEFAULT_LAUNCH_NODE,
    windowEndsAt,
  };
}

/**
 * How many verified redemptions the opening credit covers.
 * Floor, because a partial redemption is not a redemption.
 */
export function creditedRedemptions(amountKes: number, successFeeKes: number): number {
  if (!Number.isFinite(amountKes) || !Number.isFinite(successFeeKes)) return 0;
  if (successFeeKes <= 0 || amountKes <= 0) return 0;
  return Math.floor(amountKes / successFeeKes);
}

/** Parse an `app_config` value as a number, treating junk as absent. */
function numeric(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read the live gate. Fails **closed**: any read error yields
 * `{ live: false, reason: "unavailable" }`, so a config outage silently drops a
 * marketing line instead of making a promise the product may not keep — and
 * never takes the public page down with it.
 */
export async function getLaunchCreditOffer(
  now: Date = new Date()
): Promise<LaunchCreditOffer> {
  try {
    const service = createServiceClient();

    const { data, error } = await service
      .from("app_config")
      .select("key, value")
      .in("key", LAUNCH_CREDIT_CONFIG_KEYS as unknown as string[]);
    if (error) return { live: false, reason: "unavailable" };

    const raw = new Map<string, string>(
      (data ?? []).map((row: { key: string; value: string }) => [row.key, row.value])
    );

    const config: LaunchCreditConfig = {
      amountKes: numeric(raw.get("node0_opening_credit_kes")),
      merchantCap: numeric(raw.get("node0_opening_credit_merchant_cap")),
      launchNode: raw.get("node0_launch_node") ?? null,
      windowEndsAt: raw.get("node0_launch_period_ends_at") ?? null,
    };

    // Only worth counting when a cap exists and the promo is otherwise on.
    let creditedCount = 0;
    if (config.merchantCap !== null) {
      const { count, error: countError } = await service
        .from("merchant_transactions")
        .select("id", { count: "exact", head: true })
        .eq("transaction_type", "topup")
        .eq("payment_provider", "manual")
        .like("provider_reference", "node0_opening_credit:%");
      // A cap we cannot measure is a cap we must assume is full.
      if (countError) return { live: false, reason: "unavailable" };
      creditedCount = count ?? 0;
    }

    return launchCreditOffer(config, creditedCount, now);
  } catch {
    return { live: false, reason: "unavailable" };
  }
}
