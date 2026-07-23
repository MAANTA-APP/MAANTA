/**
 * Service-role Supabase client for E2E **arrange & assert** only. This never
 * runs inside the app under test — the specs use it to reset seeded merchants to
 * a known state, drive the production top-up RPC, and read balances/ledger back.
 *
 * Using the service role for arrange/assert (and the browser for the actual
 * user-visible behaviour) is the standard "arrange via API, assert via UI"
 * pattern; it keeps money mutations deterministic without adding any test-only
 * code path to the product.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "E2E arrange/assert needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
        "See e2e/.env.e2e.example."
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export type MerchantMoney = {
  account_balance: number;
  outstanding_arrears: number;
};

export async function getMerchantMoney(merchantId: string): Promise<MerchantMoney> {
  const { data, error } = await serviceClient()
    .from("merchants")
    .select("account_balance, outstanding_arrears")
    .eq("id", merchantId)
    .single();
  if (error || !data) throw new Error(`merchant ${merchantId} not readable: ${error?.message}`);
  return {
    account_balance: Number(data.account_balance),
    outstanding_arrears: Number(data.outstanding_arrears),
  };
}

/** Force a merchant to a known wallet state (arrange-only). */
export async function setMerchantMoney(
  merchantId: string,
  money: MerchantMoney
): Promise<void> {
  const { error } = await serviceClient()
    .from("merchants")
    .update({
      account_balance: money.account_balance,
      outstanding_arrears: money.outstanding_arrears,
    })
    .eq("id", merchantId);
  if (error) throw new Error(`could not reset merchant ${merchantId}: ${error.message}`);
}

/** Remove ledger rows this suite created (provider_reference like 'E2E-%'),
 *  so re-runs start clean and never trip the provider_reference unique index. */
export async function cleanupE2ELedger(merchantId: string): Promise<void> {
  const { error } = await serviceClient()
    .from("merchant_transactions")
    .delete()
    .eq("merchant_id", merchantId)
    .like("provider_reference", "E2E-%");
  if (error) throw new Error(`could not clean E2E ledger for ${merchantId}: ${error.message}`);
}

/**
 * Apply a top-up through the exact production money path
 * (`record_merchant_ledger_entry`, transaction_type='topup') — the same RPC the
 * IntaSend/Stripe webhooks call. This is where settle-first lives, so the test
 * drives the real logic, not a re-implementation.
 */
export async function recordTopup(
  merchantId: string,
  amount: number,
  providerReference: string
): Promise<{ applied: boolean; new_balance: number | null; new_arrears: number | null }> {
  const { data, error } = await serviceClient()
    .rpc("record_merchant_ledger_entry", {
      p_merchant_id: merchantId,
      p_amount: amount,
      p_transaction_type: "topup",
      p_payment_provider: "e2e",
      p_provider_reference: providerReference,
      p_description: "E2E top-up (settle-first assertion)",
      p_currency: "KES",
      p_charged_amount: null,
    })
    .single<{ applied: boolean; new_balance: number | null; new_arrears: number | null }>();
  if (error || !data) throw new Error(`top-up RPC failed: ${error?.message}`);
  return data;
}

export type LedgerRow = {
  amount: number;
  transaction_type: string;
  reference_id: string | null;
  provider_reference: string | null;
  created_at: string;
};

export async function getLedger(merchantId: string, limit = 200): Promise<LedgerRow[]> {
  const { data, error } = await serviceClient()
    .from("merchant_transactions")
    .select("amount, transaction_type, reference_id, provider_reference, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ledger not readable for ${merchantId}: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as LedgerRow[];
}

/** Sum of arrears-affecting ledger rows — must equal outstanding_arrears
 *  (settle-first migration's reconciliation invariant). */
export function arrearsFromLedger(rows: LedgerRow[]): number {
  return rows
    .filter(
      (r) =>
        r.transaction_type === "success_fee_arrears" ||
        r.transaction_type === "arrears_settlement"
    )
    .reduce((s, r) => s + r.amount, 0);
}

/** Ensure the golden deal is live and has claim capacity for a fresh run
 *  (arrange-only): active, expiring in the future, claim counter reset. */
export async function ensureDealClaimable(dealId: string): Promise<void> {
  const { error } = await serviceClient()
    .from("deals")
    .update({
      is_active: true,
      is_paused: false,
      claims_count: 0,
      starts_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      expires_at: new Date(Date.now() + 21 * 3600_000).toISOString(),
    })
    .eq("id", dealId);
  if (error) throw new Error(`could not ready deal ${dealId}: ${error.message}`);
}
