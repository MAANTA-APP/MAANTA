import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  OPENING_CREDIT_CONFIG_KEY,
  OPENING_CREDIT_DESCRIPTION,
  OPENING_CREDIT_LABEL,
  OPENING_CREDIT_REFERENCE_PREFIX,
  formatMerchantLedgerDescription,
  formatMerchantLedgerLabel,
  formatMerchantLedgerType,
  formatOpeningCreditNotice,
  hasUnspentOpeningCredit,
  isOpeningCredit,
  openingCreditAmount,
  openingCreditRedemptionsCovered,
  showsProviderReference,
} from "@/lib/merchant-ledger-copy";
import { formatKes } from "@/lib/ui";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Guard for drift D104: the Node 0 opening credit reached merchants labelled
 * with the `app_config` key that controls the promo, because the wallet printed
 * the stored `description` verbatim and that description is written for
 * operators.
 *
 * The assertions are about the leak, not about the wording — a copy change
 * should be free, and re-exposing the internal key should not be. So the tests
 * pin: the key never survives any formatter, both wallet screens import the
 * formatters rather than keeping their own maps, and the list query still
 * selects the column detection depends on. That last one is the quiet failure
 * mode — drop `provider_reference` from the select and the label silently falls
 * back to the operator string for any row whose description check misses.
 */

/** The row exactly as `activate_merchant` writes it. */
const OPENING_CREDIT_ROW = {
  transaction_type: "topup",
  description: "Node 0 launch opening credit · node0_opening_credit",
  provider_reference: "node0_opening_credit:6f1c1b2e-0000-4000-8000-000000000001",
};

const WALLET_DIR = path.resolve(__dirname, "..", "..", "app", "merchant", "(app)", "wallet");
const walletList = readFileSync(path.join(WALLET_DIR, "page.tsx"), "utf8");
const walletDetail = readFileSync(path.join(WALLET_DIR, "[id]", "page.tsx"), "utf8");

describe("opening-credit detection", () => {
  it("recognises the grant by its provider reference", () => {
    expect(isOpeningCredit(OPENING_CREDIT_ROW)).toBe(true);
    expect(
      isOpeningCredit({
        transaction_type: "topup",
        description: null,
        provider_reference: `${OPENING_CREDIT_REFERENCE_PREFIX}anything`,
      })
    ).toBe(true);
  });

  it("still recognises it from the stored description when the reference is absent", () => {
    // Fail-safe: the operator string carries the same key, and the key is the
    // thing that must not render.
    expect(
      isOpeningCredit({
        transaction_type: "topup",
        description: OPENING_CREDIT_ROW.description,
        provider_reference: null,
      })
    ).toBe(true);
  });

  it("does not claim ordinary top-ups", () => {
    for (const row of [
      { transaction_type: "topup", description: "Card top-up via Stripe", provider_reference: "cs_test_123" },
      { transaction_type: "topup", description: "M-Pesa top-up via IntaSend", provider_reference: "ABC123" },
      { transaction_type: "success_fee", description: "Success fee deducted on verified redemption", provider_reference: null },
    ]) {
      expect(isOpeningCredit(row), `${row.description} must not read as promotional credit`).toBe(
        false
      );
    }
  });
});

describe("merchant-facing ledger copy", () => {
  it("never lets the app_config key reach a merchant surface", () => {
    const rendered = [
      formatMerchantLedgerLabel(OPENING_CREDIT_ROW),
      formatMerchantLedgerDescription(OPENING_CREDIT_ROW) ?? "",
      formatMerchantLedgerType(OPENING_CREDIT_ROW.transaction_type),
    ];
    for (const text of rendered) {
      expect(text, `"${text}" leaks ${OPENING_CREDIT_CONFIG_KEY}`).not.toContain(
        OPENING_CREDIT_CONFIG_KEY
      );
    }
  });

  it("labels the credit in merchant vocabulary and explains it", () => {
    expect(formatMerchantLedgerLabel(OPENING_CREDIT_ROW)).toBe(OPENING_CREDIT_LABEL);
    expect(formatMerchantLedgerDescription(OPENING_CREDIT_ROW)).toBe(OPENING_CREDIT_DESCRIPTION);
  });

  it("hides the internal reference, which is not a payment reference", () => {
    // A manual grant has no external payment behind it. The transaction id
    // stays the reference for support, on the row and in the detail URL.
    expect(showsProviderReference(OPENING_CREDIT_ROW)).toBe(false);
    expect(
      showsProviderReference({
        transaction_type: "topup",
        description: "Card top-up via Stripe",
        provider_reference: "cs_test_123",
      })
    ).toBe(true);
  });

  it("keeps rendering the stored description for every other row", () => {
    // The fix is scoped to promotional credit: descriptions written by the
    // webhooks and the fee RPCs are already merchant-safe and stay authoritative.
    expect(
      formatMerchantLedgerLabel({
        transaction_type: "topup",
        description: "Card top-up via Stripe",
        provider_reference: "cs_test_123",
      })
    ).toBe("Card top-up via Stripe");
  });

  it("falls back to a word for every ledger type, never a raw enum", () => {
    // The union in merchant-ledger.ts. The two screens previously carried
    // partial maps, so `success_fee_arrears` and `dispute` printed as enums.
    const types = [
      "topup",
      "success_fee",
      "success_fee_arrears",
      "boost_fee",
      "subscription",
      "refund",
      "dispute",
      "arrears_settlement",
    ];
    for (const t of types) {
      const label = formatMerchantLedgerLabel({ transaction_type: t, description: null });
      expect(label, `${t} renders as its raw enum`).not.toBe(t);
      expect(label).not.toContain("_");
    }
  });
});

describe("the new-merchant opening-credit state (D105)", () => {
  const feeRow = {
    transaction_type: "success_fee",
    description: "Success fee deducted on verified redemption",
    provider_reference: null,
    amount: -30,
  };
  const creditRow = { ...OPENING_CREDIT_ROW, amount: 300 };

  it("derives the covered count from the credit and the configured fee", () => {
    expect(openingCreditRedemptionsCovered(300, 30)).toBe(10);
    // A fee change moves the count with no code edit — the whole point of D105.
    expect(openingCreditRedemptionsCovered(300, 25)).toBe(12);
    // Floors: a partly covered redemption is not covered.
    expect(openingCreditRedemptionsCovered(250, 30)).toBe(8);
  });

  it("refuses to divide by a missing or zero fee", () => {
    expect(openingCreditRedemptionsCovered(300, 0)).toBe(0);
    expect(openingCreditRedemptionsCovered(300, Number.NaN)).toBe(0);
    expect(openingCreditRedemptionsCovered(0, 30)).toBe(0);
  });

  it("renders the brief's sentence with every numeral derived", () => {
    expect(formatOpeningCreditNotice(300, 30, formatKes)).toBe(
      "KES 300 starting credit — your first 10 verified redemptions covered; " +
        "thereafter a transparent KES 30 success fee."
    );
  });

  it("keeps the sentence true when the numbers change", () => {
    const notice = formatOpeningCreditNotice(500, 25, formatKes) ?? "";
    expect(notice).toContain("KES 500 starting credit");
    expect(notice).toContain("first 20 verified redemptions");
    expect(notice).toContain("KES 25 success fee");
    // Singular when the credit covers exactly one.
    expect(formatOpeningCreditNotice(30, 30, formatKes)).toContain(
      "your first 1 verified redemption covered"
    );
  });

  it("says nothing rather than something false", () => {
    // No honest count to state → no state at all.
    expect(formatOpeningCreditNotice(300, 0, formatKes)).toBeNull();
    expect(formatOpeningCreditNotice(20, 30, formatKes)).toBeNull();
  });

  it("shows only while the credit is unspent", () => {
    expect(hasUnspentOpeningCredit([creditRow])).toBe(true);
    // Once a fee is charged, "your first N redemptions covered" is no longer true.
    expect(hasUnspentOpeningCredit([feeRow, creditRow])).toBe(false);
    expect(
      hasUnspentOpeningCredit([
        { ...feeRow, transaction_type: "success_fee_arrears", amount: 30 },
        creditRow,
      ])
    ).toBe(false);
    // An ordinary top-up is not a credit.
    expect(
      hasUnspentOpeningCredit([
        { transaction_type: "topup", description: "Card top-up via Stripe", provider_reference: "cs_1", amount: 3000 },
      ])
    ).toBe(false);
  });

  it("reads the granted amount from the merchant's own row", () => {
    // Not from app_config: an older merchant's credit must not be restated at
    // today's promo value.
    expect(openingCreditAmount([creditRow])).toBe(300);
    expect(openingCreditAmount([{ ...creditRow, amount: "250.00" }])).toBe(250);
    expect(openingCreditAmount([feeRow])).toBeNull();
  });

  it("hardcodes none of the three numbers in source", () => {
    // Comments come out first, via the one shared stripper (D38): this module's
    // docblock quotes the brief's literal sentence to explain why it is derived,
    // and a guard that reads comments would fail on its own explanation and
    // teach the next author to delete it.
    const source = stripComments(
      readFileSync(path.resolve(__dirname, "..", "merchant-ledger-copy.ts"), "utf8")
    );
    // The brief writes "your first 10 verified redemptions covered" as a literal.
    // Reintroducing any of its numerals in code is the drift D105 was opened for.
    expect(source).not.toMatch(/first 10 verified/);
    expect(source).not.toMatch(/KES 300|KES 30\b/);
  });
});

describe("the wallet screens use the shared formatters", () => {
  it("imports them instead of keeping a local label map", () => {
    // The import boundary is the fix, so it is asserted rather than assumed —
    // a screen that re-declares its own map is a second place to drift.
    expect(walletList).toContain("formatMerchantLedgerLabel");
    expect(walletList).not.toMatch(/const label = \(/);

    expect(walletDetail).toContain("formatMerchantLedgerDescription");
    expect(walletDetail).toContain("showsProviderReference");
    expect(walletDetail).not.toMatch(/const typeLabel: Record/);
  });

  it("selects the column detection depends on", () => {
    // Dropping provider_reference from the select would not fail typechecking
    // and would not look wrong — it would just quietly restore the leak.
    for (const [name, source] of [
      ["wallet list", walletList],
      ["transaction detail", walletDetail],
    ] as const) {
      const select = source.match(/\.select\(\s*\n?\s*"([^"]+)"/)?.[1];
      expect(select, `${name} query not found`).toBeTruthy();
      expect(select, `${name} must select provider_reference`).toContain("provider_reference");
    }
  });

  it("does not render the raw description on the detail screen", () => {
    expect(walletDetail).not.toContain("{txn.description}");
  });

  it("renders the opening-credit state neutrally, and never above a warning", () => {
    expect(walletList).toContain("formatOpeningCreditNotice");
    expect(walletList).toContain("hasUnspentOpeningCredit");
    // Good news is not a be-careful state: rust would say "act" about a balance
    // that needs no action (the colour-semantics error D80 corrected).
    expect(walletList).toMatch(/variant="info"[\s\S]{0,120}\{openingCredit\}/);
    // Last in the state chain, so a real warning always wins and a merchant
    // never sees two states at once.
    expect(walletList.indexOf("Low balance.")).toBeLessThan(
      walletList.indexOf("{openingCredit}")
    );
  });
});
