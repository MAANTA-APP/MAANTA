/**
 * Golden path — shopper claims a live deal, merchant redeems the code, wallet
 * moves by the fee. This is the browser-visible proof of Definition of Done §8.
 *
 * ── Rule check ──────────────────────────────────────────────────────────────
 * Asserts:
 *   • Rule 1 — YOU PAY consistency: identical on tile, deal detail, and claimed
 *     code, and already inclusive of extras (this deal has none, so the number
 *     is the price itself; the claimed-code snapshot must still match).
 *   • Rule 2 — fee-before-charge: the redeem keypad never charges on entry; the
 *     exact fee is shown in FeeDisclosure before the single Confirm action,
 *     whose own label carries the fee. No one-tap verify+charge exists.
 *   • Rule 4 (subset) — locked UI on the claimed-code page and success takeover:
 *     ≤1 amber action, money is ink not amber, states carry a word+icon.
 *   • Money invariant — success ReferenceId == verify redemptionId == the
 *     wallet's success-fee ledger row; balance drops by exactly the fee.
 * Out of scope here: settle-first arrears (wallet-arrears.spec.ts), dispute
 * routing, notifications.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { test, expect } from "@playwright/test";
import { SHOPPER, MERCHANT_NUUR, GOLDEN_DEAL, SUCCESS_FEE } from "./fixtures/accounts";
import { signIn } from "./fixtures/clerk-auth";
import {
  ensureDealClaimable,
  getMerchantMoney,
  setMerchantMoney,
  getLedger,
} from "./fixtures/supabase";
import {
  dealTile,
  youPayValue,
  readYouPay,
  claimedCodeCard,
  readClaimedCode,
  feeDisclosure,
  confirmRedemptionButton,
  successTakeover,
  referenceId,
  walletBalance,
  typeCodeOnKeypad,
} from "./fixtures/selectors";
import {
  expectAtMostOneAmberAction,
  expectMoneyIsInk,
  expectStateWord,
} from "./fixtures/locked-ui";

test.describe("MAANTA golden path (browser)", () => {
  test.beforeAll(async () => {
    // Deterministic starting point: golden deal live with capacity, Nuur funded.
    await ensureDealClaimable(GOLDEN_DEAL.id);
    await setMerchantMoney(MERCHANT_NUUR.merchantId, {
      account_balance: 540,
      outstanding_arrears: 0,
    });
  });

  test("golden path: shopper claims and merchant redeems a deal", async ({ browser }) => {
    // ---- Shopper: /demo → feed → claim → claimed code ----
    const shopperCtx = await browser.newContext();
    const shopper = await shopperCtx.newPage();

    // /demo documents the seeded shopper login (Rule: golden path starts at /demo).
    await shopper.goto("/demo");
    await expect(shopper.getByText(SHOPPER.email)).toBeVisible();

    await shopper.goto("/feed");
    const tile = dealTile(shopper, GOLDEN_DEAL.id);
    await expect(tile, "golden deal tile should be on the feed").toBeVisible();
    const payOnTile = await readYouPay(tile);
    expect(payOnTile, "YOU PAY on the tile matches the seeded price").toBe(
      GOLDEN_DEAL.youPay.toLocaleString("en-US")
    );

    // Deal detail — YOU PAY must be identical, and inclusive of extras.
    await tile.click();
    await shopper.waitForURL(`**/deals/${GOLDEN_DEAL.id}`);
    const detail = shopper.getByRole("main");
    const payOnDetail = await readYouPay(detail);
    expect(payOnDetail, "YOU PAY: detail == tile (Rule 1)").toBe(payOnTile);
    await expectMoneyIsInk(youPayValue(detail), "deal detail YOU PAY");

    // Claim: sticky "Claim deal" → bottom-sheet "Confirm". Geolocation is not
    // granted, so the claim proceeds without coordinates (best-effort, per
    // claim-flow.tsx) and lands on a clean pending ticket.
    await shopper.getByRole("button", { name: /^Claim deal$/ }).click();
    await shopper.getByRole("button", { name: /^Confirm$/ }).click();

    // Claimed code page (S5).
    await shopper.waitForURL(/\/tickets\/[0-9a-f-]+/i);
    await expect(claimedCodeCard(shopper)).toBeVisible();

    // Rule 1 — claimed-code YOU PAY matches tile & detail.
    const claimedMain = shopper.getByRole("main");
    const payOnClaimed = await readYouPay(claimedMain);
    expect(payOnClaimed, "YOU PAY: claimed == tile (Rule 1)").toBe(payOnTile);
    // YOU PAY is OUTSIDE the amber-breathing code card (brief: money never on the
    // card, no amber actions on this screen).
    await expect(claimedCodeCard(shopper).getByText(/You pay/i)).toHaveCount(0);
    await expectMoneyIsInk(youPayValue(claimedMain), "claimed-code YOU PAY");

    // Rule 4 — claimed-code page: state carried by a word, ≤1 amber action
    // (in fact zero — the credential screen has none).
    await expectStateWord(shopper.getByText(/CLAIMED/), /CLAIMED/, "claimed-code state chip");
    await expectAtMostOneAmberAction(shopper, "claimed-code page");

    const code = await readClaimedCode(shopper);
    expect(code).toMatch(/^\d{6}$/);

    // ---- Merchant: /demo → sign in as Nuur → redeem ----
    const merchantCtx = await browser.newContext();
    const merchant = await merchantCtx.newPage();

    await merchant.goto("/demo");
    await expect(merchant.getByText(MERCHANT_NUUR.email)).toBeVisible();
    await signIn(merchant, MERCHANT_NUUR.email);

    const balanceBefore = (await getMerchantMoney(MERCHANT_NUUR.merchantId)).account_balance;

    await merchant.goto("/merchant/redeem");
    await expect(merchant.getByText(/enter the customer'?s 6-digit code/i)).toBeVisible();

    // Rule 2 — the keypad screen exposes NO verify/charge control. Entering the
    // code only resolves it (preflight); nothing charges yet.
    await expect(
      merchant.getByRole("button", { name: /verify|charge|redeem now|confirm/i }),
      "keypad must not offer a one-tap verify/charge"
    ).toHaveCount(0);

    const preflight = merchant.waitForResponse(
      (r) => r.url().includes("/api/redemptions/preflight") && r.request().method() === "POST"
    );
    await typeCodeOnKeypad(merchant, code);
    await preflight;

    // Rule 2 — FeeDisclosure shows the EXACT fee BEFORE any confirm.
    await expect(feeDisclosure(merchant)).toContainText(`KES ${SUCCESS_FEE}`);
    const confirm = confirmRedemptionButton(merchant);
    await expect(confirm, "the only charging action carries the exact fee").toContainText(
      `KES ${SUCCESS_FEE}`
    );
    // Rule 4 — disclosure screen: Confirm is the single amber action.
    await expectAtMostOneAmberAction(merchant, "fee-disclosure screen");

    // ---- Confirm → success takeover ----
    const verify = merchant.waitForResponse(
      (r) => r.url().includes("/api/redemptions/verify") && r.request().method() === "POST"
    );
    await confirm.click();
    const verifyBody = await (await verify).json();
    const redemptionId: string = verifyBody.redemptionId;
    expect(redemptionId, "verify returns the redemption id").toMatch(/[0-9a-f-]{8,}/i);
    expect(verifyBody.feeAmount).toBe(SUCCESS_FEE);
    expect(verifyBody.newBalance).toBe(balanceBefore - SUCCESS_FEE);

    // RedemptionResult (M4): "Verified", ink-on-dark, copyable ReferenceId.
    await expect(successTakeover(merchant).getByRole("heading", { name: /^Verified$/ })).toBeVisible();
    await expect(merchant.getByText(`KES ${SUCCESS_FEE} success fee charged`)).toBeVisible();
    await expect(merchant.getByText(`Wallet balance KES ${(balanceBefore - SUCCESS_FEE).toLocaleString("en-US")}`)).toBeVisible();
    // The success ReferenceId encodes the same redemption the verify call returned.
    await expect(referenceId(merchant)).toContainText(redemptionId, { ignoreCase: true });
    // Rule 4 — success takeover: money (fee/balance) is white-on-green, never
    // amber, and there are no amber actions on the takeover.
    await expectAtMostOneAmberAction(merchant, "success takeover");

    // ---- Wallet ledger: matching ReferenceId + balance moved by the fee ----
    // (Navigate before the 3s success auto-reset; a fresh page load is immune.)
    await merchant.goto("/merchant/wallet");
    await expectMoneyIsInk(walletBalance(merchant), "wallet balance");
    await expect(walletBalance(merchant)).toHaveText(
      `KES ${(balanceBefore - SUCCESS_FEE).toLocaleString("en-US")}`
    );

    // Top success-fee row references the same redemption (ledger shows the first
    // 8 chars, upper-cased — a prefix of the takeover's full id).
    const feeRow = merchant
      .locator("div", { hasText: "Success fee" })
      .filter({ hasText: `-KES ${SUCCESS_FEE}` })
      .first();
    await expect(feeRow).toBeVisible();
    await expect(feeRow).toContainText(redemptionId.slice(0, 8).toUpperCase());
    // Balance-after on that row equals the new balance (ledger reconciles to
    // balance — the top row's running balance is the wallet balance).
    await expect(feeRow).toContainText(
      `Bal KES ${(balanceBefore - SUCCESS_FEE).toLocaleString("en-US")}`
    );

    // Cross-check against the DB the app wrote: exactly one fee row for this id.
    const ledger = await getLedger(MERCHANT_NUUR.merchantId);
    const dbFee = ledger.filter(
      (r) => r.transaction_type === "success_fee" && r.reference_id === redemptionId
    );
    expect(dbFee.length, "one success-fee ledger row for this redemption").toBe(1);
    expect(dbFee[0].amount).toBe(-SUCCESS_FEE);

    await shopperCtx.close();
    await merchantCtx.close();
  });
});
