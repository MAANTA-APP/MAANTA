/**
 * Component-vocabulary selectors. MAANTA's components carry no `data-testid`s
 * and this session must not change product UI, so these are built from resilient
 * structural + role + stable-copy hooks and named after the components they
 * target (DealTile, ClaimedCode, FeeDisclosure, WalletBalance, InlineAlert, …).
 * The specs speak MAANTA's vocabulary; only this file knows the DOM shape.
 *
 * If a small set of `data-testid`s is ever added to the product (a separate,
 * reviewed change), only this file changes — the specs stay put.
 */
import { type Locator, type Page } from "@playwright/test";

/** A deal tile in the feed, addressed by its stable `/deals/{id}` link. */
export function dealTile(page: Page, dealId: string): Locator {
  return page.locator(`a[href="/deals/${dealId}"]`).first();
}

/** The "You pay" money value element nearest a standalone "You pay" label
 *  (deal detail, claimed code, and the vertical deal tile). Used for colour
 *  (money-is-ink) checks. */
export function youPayValue(scope: Page | Locator): Locator {
  return scope
    .getByText("You pay", { exact: true })
    .locator("..")
    .getByText(/^KES\s[\d,]+$/)
    .first();
}

/** Read the YOU PAY amount as a normalised string ("2,400"), across both the
 *  label-then-value shape (tile/detail/claimed) and the inline
 *  "You pay KES 2,400" shape (horizontal tile). */
export async function readYouPay(scope: Locator): Promise<string> {
  const text = await scope.innerText();
  const m = text.match(/You pay[^\d]*KES\s*([\d,]+)/i);
  if (!m) throw new Error(`no "You pay … KES" amount in scope: ${JSON.stringify(text.slice(0, 200))}`);
  return m[1];
}

/** ClaimedCode hero card — the credential the dispute is argued from. */
export function claimedCodeCard(page: Page): Locator {
  return page.getByRole("group", { name: /redemption code/i });
}

/** FeeDisclosure block ("This redemption costs KES 30"). */
export function feeDisclosure(page: Page): Locator {
  return page.getByText(/this redemption costs KES/i).locator("..");
}

/** The single charging action on the redeem disclosure. Its label carries the
 *  exact fee — there is no separate one-tap verify+charge control. */
export function confirmRedemptionButton(page: Page): Locator {
  return page.getByRole("button", { name: /confirm redemption/i });
}

/** RedemptionResult success takeover ("Verified"). */
export function successTakeover(page: Page): Locator {
  return page.getByRole("main").filter({ has: page.getByRole("heading", { name: /^Verified$/ }) });
}

/** The copyable ReferenceId control (success takeover or a ledger row). */
export function referenceId(scope: Page | Locator): Locator {
  return scope.getByRole("button", { name: /copy reference/i }).first();
}

/** WalletBalance value (M6 — always ink). */
export function walletBalance(page: Page): Locator {
  return page.getByText(/wallet balance/i).locator("..").getByText(/KES\s[\d,]+/).first();
}

/** Any InlineAlert on the page (role=alert). */
export function inlineAlerts(page: Page): Locator {
  return page.getByRole("alert");
}

/** A numeric keypad digit button. */
export function keypadDigit(page: Page, digit: string): Locator {
  return page.getByRole("button", { name: digit, exact: true });
}

/** Type a 6-digit code on the merchant NumericKeypad. */
export async function typeCodeOnKeypad(page: Page, code: string): Promise<void> {
  for (const d of code.split("")) {
    await keypadDigit(page, d).click();
  }
}

/** Read a 6-digit OTP out of the ClaimedCode card ("431 977" → "431977"). */
export async function readClaimedCode(page: Page): Promise<string> {
  const text = (await claimedCodeCard(page).innerText()) ?? "";
  const digits = text.replace(/\D/g, "");
  const match = digits.match(/\d{6}/);
  if (!match) throw new Error(`no 6-digit code found in ClaimedCode card: ${JSON.stringify(text)}`);
  return match[0];
}
