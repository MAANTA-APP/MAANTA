/**
 * Settle-first arrears — a top-up clears arrears FIRST, then credits only the
 * remainder to the balance, and the ledger reconciles to both.
 *
 * ── Rule check ──────────────────────────────────────────────────────────────
 * Asserts:
 *   • Rule 3 — settle-first: with arrears 60 and balance 0, a KES 100 top-up
 *     lands the balance at 40 (not 100); arrears go to 0. The ledger reconciles
 *     to BOTH balance (top row's running "Bal") and arrears (Σ arrears-affecting
 *     rows == outstanding_arrears). Browser-visible: WalletBalance = KES 40, the
 *     arrears alert is gone, and both the +KES 100 top-up row and the −KES 60
 *     settlement row are present.
 *   • Rule 4 (subset) — locked UI on the wallet: money (balance) is ink not
 *     amber; ≤1 amber action (the single "Top up wallet"); alert body text ink.
 *
 * The top-up is applied through the exact production RPC the payment webhooks
 * call (record_merchant_ledger_entry, transaction_type='topup') — a real M-Pesa
 * PIN entry isn't deterministic in CI, and that RPC *is* the settle-first logic.
 * Out of scope here: the redeem flow (golden-path.spec.ts), provider webhook
 * signature verification (covered at the API-test layer).
 * ────────────────────────────────────────────────────────────────────────────
 */
import { test, expect } from "@playwright/test";
import { MERCHANT_BILAN } from "./fixtures/accounts";
import { signIn } from "./fixtures/clerk-auth";
import {
  setMerchantMoney,
  cleanupE2ELedger,
  recordTopup,
  getMerchantMoney,
  getLedger,
  arrearsFromLedger,
} from "./fixtures/supabase";
import { walletBalance, inlineAlerts } from "./fixtures/selectors";
import {
  expectAtMostOneAmberAction,
  expectMoneyIsInk,
  expectAlertBodyIsInk,
} from "./fixtures/locked-ui";

const ARREARS_START = 60;
const TOPUP = 100;
const EXPECTED_BALANCE = TOPUP - ARREARS_START; // 40 — remainder after settling.

test.describe("Wallet · settle-first arrears (browser)", () => {
  test.beforeEach(async () => {
    // Deterministic arrears state: owe 60, balance 0, no leftover E2E rows.
    await cleanupE2ELedger(MERCHANT_BILAN.merchantId);
    await setMerchantMoney(MERCHANT_BILAN.merchantId, {
      account_balance: 0,
      outstanding_arrears: ARREARS_START,
    });
  });

  test("wallet: top-up settles arrears first, then credits remainder", async ({ page }) => {
    // ---- Act: top-up through the production settle-first RPC ----
    const ref = `E2E-TOPUP-${Date.now()}`;
    const rpc = await recordTopup(MERCHANT_BILAN.merchantId, TOPUP, ref);
    expect(rpc.applied, "top-up applied").toBe(true);
    expect(rpc.new_balance, "remainder credited to balance, arrears settled first").toBe(
      EXPECTED_BALANCE
    );
    expect(rpc.new_arrears, "arrears fully settled").toBe(0);

    // ---- Assert (DB): balance/arrears and ledger reconciliation ----
    const money = await getMerchantMoney(MERCHANT_BILAN.merchantId);
    expect(money.account_balance).toBe(EXPECTED_BALANCE);
    expect(money.outstanding_arrears).toBe(0);

    const ledger = await getLedger(MERCHANT_BILAN.merchantId);
    // Ledger reconciles to arrears: Σ over arrears-affecting rows == arrears.
    expect(arrearsFromLedger(ledger)).toBe(money.outstanding_arrears);
    // The settle-first split is two rows: +100 top-up and −60 settlement.
    const topupRow = ledger.find((r) => r.provider_reference === ref);
    const settleRow = ledger.find((r) => r.transaction_type === "arrears_settlement");
    expect(topupRow?.amount).toBe(TOPUP);
    expect(settleRow?.amount).toBe(-ARREARS_START);

    // ---- Assert (browser): the wallet page shows the settled state ----
    await signIn(page, MERCHANT_BILAN.email);
    await page.goto("/merchant/wallet");

    // Balance is the remainder, and it is ink (money is typography, not colour).
    await expect(walletBalance(page)).toHaveText(`KES ${EXPECTED_BALANCE}`);
    await expectMoneyIsInk(walletBalance(page), "wallet balance");

    // Arrears are gone — the "You owe … in arrears" InlineAlert is no longer
    // rendered (a low-balance alert may show instead; that's a different,
    // expected notice, and the settlement ledger row legitimately still reads
    // "Arrears settled first", so we scope this to the alert, not page text).
    await expect(
      page.getByRole("alert").filter({ hasText: /you owe/i }),
      "the arrears alert should be cleared from the wallet"
    ).toHaveCount(0);

    // Both ledger rows are browser-visible with the right signed amounts. (The
    // row's bold label shows the transaction description, so match on "top-up"
    // case-insensitively plus the signed amount.)
    const topupRowUi = page
      .locator("div", { hasText: /top-?up/i })
      .filter({ hasText: `+KES ${TOPUP}` })
      .first();
    await expect(topupRowUi, "top-up row shows the full amount received").toBeVisible();

    const settleRowUi = page
      .locator("div", { hasText: /arrears settled first/i })
      .filter({ hasText: `-KES ${ARREARS_START}` })
      .first();
    await expect(settleRowUi, "settlement row records the arrears payoff").toBeVisible();

    // Ledger reconciles to balance: the most-recent row's running "Bal" equals
    // the wallet balance.
    await expect(page.getByText(`Bal KES ${EXPECTED_BALANCE}`).first()).toBeVisible();

    // ---- Rule 4 (locked UI subset) on the wallet ----
    await expectAtMostOneAmberAction(page, "wallet page");
    const alert = inlineAlerts(page).first();
    if (await alert.isVisible().catch(() => false)) {
      await expectAlertBodyIsInk(alert, "wallet low-balance alert");
    }
  });
});
