/**
 * Seeded Node 0 (BBS Mall) accounts and deals, mirroring
 * `supabase/seed/node0_rehearsal_seed.sql`. Every value is env-overridable so the
 * same specs run against any seeded Clerk **test** environment without edits:
 * point the E2E_*_EMAIL vars at the Clerk test users you provisioned and, if you
 * re-seeded with different ids, override the ids too.
 */

const env = (k: string, fallback: string) => process.env[k]?.trim() || fallback;

/** Fixed email OTP for the Clerk test users. Clerk `+clerk_test` addresses
 *  accept the constant `424242`; override for a differently-configured instance. */
export const OTP_CODE = env("E2E_OTP_CODE", "424242");

export const SHOPPER = {
  role: "shopper",
  email: env("E2E_SHOPPER_EMAIL", "aragagency+shopper@gmail.com"),
} as const;

/** Nuur Fashion House — active Elite, funded wallet, owns the golden deal. */
export const MERCHANT_NUUR = {
  role: "merchant",
  email: env("E2E_MERCHANT_NUUR_EMAIL", "aragagency+nuur@gmail.com"),
  merchantId: env("E2E_MERCHANT_NUUR_ID", "c0000000-0000-4000-a000-000000000001"),
} as const;

/** Bilan Beauty & Cosmetics — active Standard, low wallet, used for arrears. */
export const MERCHANT_BILAN = {
  role: "merchant",
  email: env("E2E_MERCHANT_BILAN_EMAIL", "aragagency+bilan@gmail.com"),
  merchantId: env("E2E_MERCHANT_BILAN_ID", "c0000000-0000-4000-a000-000000000002"),
} as const;

/** Nuur "20% off all abayas & dirac" — the golden-path deal.
 *  price_kes 2400, compare_at 3000, no extras → YOU PAY is exactly KES 2,400. */
export const GOLDEN_DEAL = {
  id: env("E2E_GOLDEN_DEAL_ID", "d0000000-0000-4000-a000-000000000001"),
  merchantId: MERCHANT_NUUR.merchantId,
  youPay: Number(env("E2E_GOLDEN_DEAL_PAY", "2400")),
  wasKes: Number(env("E2E_GOLDEN_DEAL_WAS", "3000")),
  title: "20% off all abayas & dirac",
} as const;

/** Frozen success fee (KES 30 flat), overridable only if app_config changes. */
export const SUCCESS_FEE = Number(env("E2E_SUCCESS_FEE", "30"));

/** All seeded accounts that must be linked to a Clerk test user in globalSetup. */
export const ALL_ACCOUNTS = [SHOPPER, MERCHANT_NUUR, MERCHANT_BILAN] as const;
