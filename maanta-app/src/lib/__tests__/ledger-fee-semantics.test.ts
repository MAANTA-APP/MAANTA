import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  FEE_LEDGER_TYPES,
  LEDGER_TYPE_CONTRACT,
  readLedgerFeeTotals,
  UNKNOWN_FEE_TOTALS,
} from "@/lib/evidence-scope";

const WINDOW = {
  since: "2026-08-01T00:00:00Z",
  until: "2026-09-01T00:00:00Z",
};

describe("the durable ledger sign contract (D218)", () => {
  it("covers every transaction type admitted by the database constraint", () => {
    const constraint = "merchant_transactions_transaction_type_check";
    const event = new RegExp(
      `(?:DROP\\s+CONSTRAINT\\s+(?:IF\\s+EXISTS\\s+)?${constraint})|` +
        `(?:ADD\\s+CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\(([\\s\\S]*?)\\)\\s*;)`,
      "gi"
    );
    let declared: string[] | null = null;
    const dir = path.join(process.cwd(), "supabase/migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(path.join(dir, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--[^\n]*/g, " ");
      event.lastIndex = 0;
      for (let match = event.exec(sql); match !== null; match = event.exec(sql)) {
        declared = match[1] === undefined
          ? null
          : Array.from(match[1].matchAll(/'([a-z_]+)'/g), (m) => m[1]);
      }
    }
    expect(declared).not.toBeNull();
    expect(Object.keys(LEDGER_TYPE_CONTRACT).sort()).toEqual(declared!.sort());
  });

  it("pins the founder-ratified opposite billed signs and reversal sign", () => {
    expect(LEDGER_TYPE_CONTRACT.success_fee).toEqual({ bucket: "gross", orientation: -1 });
    expect(LEDGER_TYPE_CONTRACT.success_fee_arrears).toEqual({ bucket: "gross", orientation: 1 });
    expect(LEDGER_TYPE_CONTRACT.fee_reversal).toEqual({ bucket: "reversal", orientation: 1 });
    expect(LEDGER_TYPE_CONTRACT.arrears_settlement).toEqual({ bucket: "excluded" });
    expect([...FEE_LEDGER_TYPES].sort()).toEqual(["success_fee", "success_fee_arrears"]);
  });
});

describe("the application reader delegates to the one SQL contract", () => {
  const fake = (data: unknown, error: unknown = null) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    return {
      calls,
      client: {
        rpc(fn: string, args: Record<string, unknown>) {
          calls.push({ fn, args });
          return Promise.resolve({ data, error });
        },
      },
    };
  };

  it("uses the scoped wrapper for every present scope, including empty", async () => {
    const x = fake([{ gross_kes: "0", reversals_kes: "0", net_kes: "0", available: true }]);
    expect(await readLedgerFeeTotals(x.client, { merchantIds: [], window: WINDOW })).toEqual({
      grossKes: 0,
      reversalsKes: 0,
      netKes: 0,
    });
    expect(x.calls).toEqual([{ fn: "admin_fee_totals_for_merchants", args: {
      p_since: WINDOW.since,
      p_until: WINDOW.until,
      p_merchant_ids: [],
    } }]);
  });

  it("uses the global wrapper only when merchant scope is absent", async () => {
    const x = fake([{ gross_kes: 60, reversals_kes: 30, net_kes: 30, available: true }]);
    expect(await readLedgerFeeTotals(x.client, { window: WINDOW })).toEqual({
      grossKes: 60,
      reversalsKes: 30,
      netKes: 30,
    });
    expect(x.calls[0]).toEqual({ fn: "admin_fee_totals_global", args: {
      p_since: WINDOW.since,
      p_until: WINDOW.until,
    } });
  });

  it("maps errors, unavailable rows and malformed partial rows to all-unavailable", async () => {
    for (const x of [
      fake(null, { message: "read failed" }),
      fake([{ gross_kes: 30, reversals_kes: null, net_kes: null, available: false }]),
      fake([{ gross_kes: 30, reversals_kes: "bad", net_kes: 30, available: true }]),
    ]) {
      expect(await readLedgerFeeTotals(x.client, { window: WINDOW })).toEqual(UNKNOWN_FEE_TOTALS);
    }
  });

  it("keeps all five executive surfaces on the shared reader and off legacy/direct sums", () => {
    for (const rel of [
      "src/app/admin/page.tsx",
      "src/app/admin/reports/page.tsx",
      "src/app/admin/pilot/page.tsx",
      "src/app/founder/page.tsx",
      "src/app/founder/yesterday/page.tsx",
    ]) {
      const code = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(code, rel).toContain("readLedgerFeeTotals");
      expect(code, rel).not.toContain("admin_success_fee_revenue");
      expect(code, rel).not.toContain('.from("merchant_transactions")');
    }
  });
});
