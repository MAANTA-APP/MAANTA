/**
 * Browser-visible checks for the locked UI hard rules (the subset that is
 * verifiable from the rendered DOM). These read *computed* styles, so they catch
 * a regression regardless of which Tailwind class produced it.
 *
 * Token values come straight from tailwind.config.ts:
 *   brand   #FDBF2D → rgb(253, 191, 45)   — the one amber action fill
 *   ink     #111111 → rgb(17, 17, 17)     — money + body text
 */
import { expect, type Locator, type Page } from "@playwright/test";

export const AMBER = "rgb(253, 191, 45)";
export const INK = "rgb(17, 17, 17)";

async function bgColor(loc: Locator): Promise<string> {
  return loc.evaluate((el) => getComputedStyle(el).backgroundColor);
}
async function textColor(loc: Locator): Promise<string> {
  return loc.evaluate((el) => getComputedStyle(el).color);
}

/**
 * Rule 4a — at most one amber ACTION per screen. Amber is defined by an amber
 * *fill* on an actionable element (button / link / role=button). The
 * claimed-code card breathes an amber *border* (R3) but has no amber fill and is
 * not actionable, so it is correctly excluded.
 */
export async function expectAtMostOneAmberAction(scope: Page | Locator, label: string) {
  const root = "page" in scope ? scope : scope;
  const actions = root.locator("button, a, [role=button]");
  const n = await actions.count();
  let amber = 0;
  for (let i = 0; i < n; i++) {
    const el = actions.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if ((await bgColor(el)) === AMBER) amber++;
  }
  expect(amber, `${label}: expected ≤1 amber action, found ${amber}`).toBeLessThanOrEqual(1);
}

/** Rule 4c — money is never amber. Assert a money value renders ink, not amber. */
export async function expectMoneyIsInk(money: Locator, label: string) {
  await expect(money, `${label}: money should be visible`).toBeVisible();
  const color = await textColor(money);
  expect(color, `${label}: money must be ink (#111), not amber`).not.toBe(AMBER);
  expect(color, `${label}: money must render ink (#111)`).toBe(INK);
}

/**
 * Rule 4d — error/alert BODY text is ink (#111); red is reserved for the
 * border/icon. `InlineAlert` renders its body in a `text-ink` wrapper, so the
 * body text colour must be ink even though the left border is rust/flame.
 */
export async function expectAlertBodyIsInk(alertBody: Locator, label: string) {
  await expect(alertBody, `${label}: alert body should be visible`).toBeVisible();
  expect(await textColor(alertBody), `${label}: alert body text must be ink (#111)`).toBe(INK);
}

/**
 * Rule 4e — a state is distinguishable without colour alone: the claim-state
 * chip carries an icon glyph + an UPPERCASE WORD. Assert the expected word is
 * present (so "claimed" vs "redeemed" vs "expired" differ by text, not hue).
 */
export async function expectStateWord(chip: Locator, word: RegExp, label: string) {
  await expect(chip, `${label}: state chip should be visible`).toBeVisible();
  await expect(chip, `${label}: state must be carried by a word, not colour`).toHaveText(word);
}
