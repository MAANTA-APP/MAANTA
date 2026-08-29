#!/usr/bin/env node
/**
 * Generate the SQL half of the shared fee-contract fixtures.
 *
 * D211 puts one money rule in two languages — `_fee_totals` in SQL and
 * `aggregateLedgerFees` in TypeScript — which is a second place for it to
 * drift. The answer is that both are proved by the SAME cases, from
 * `supabase/tests/fixtures/fee-contract-cases.json`.
 *
 * This writes the generated SQL, which is checked in so `make db-verify` and
 * the CI `db-tests` job need no Node step. `fee-contract-parity.test.ts` runs
 * this generator and fails if the checked-in file differs, so an edited
 * fixture that was never regenerated is a red build rather than a silently
 * weaker suite.
 *
 *   node scripts/gen-fee-contract-cases.mjs          # write
 *   node scripts/gen-fee-contract-cases.mjs --check  # exit 1 on drift
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SOURCE = path.join(ROOT, "supabase/tests/fixtures/fee-contract-cases.json");
const TARGET = path.join(ROOT, "supabase/tests/fixtures/fee_contract_cases.generated.sql");

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const num = (n) => (n === null || n === undefined ? "NULL" : String(n));
/**
 * A numeric literal. A STRING amount is emitted quoted and cast, which is how
 * `NaN` reaches the database — it is a valid `numeric` value with no JSON
 * spelling, and it is the one that defeats a `> 0` / `<= 0` pair.
 */
const amount = (n) =>
  typeof n === "string" ? `${q(n)}::numeric` : num(n);

/** `merchants.phone` is format-checked, so each merchant needs a distinct one. */
let phoneSeq = 0;
const nextPhone = () => `+2547${String(10000000 + ++phoneSeq).slice(0, 8)}`;

function renderCase(c, windowDefault) {
  const w = c.window ?? windowDefault;
  const merchantKeys = c.merchants ?? ["m1"];
  const redemptions = c.redemptions ?? [];
  const movements = c.movements ?? [];
  // Every case goes through the SCOPED wrapper, scoped to the merchants it
  // created. That is ISOLATION, not the contract: `admin_fee_totals_global`
  // aggregates the whole database, so a global assertion here would depend on
  // what every other suite in supabase/tests/ happened to leave behind, and a
  // single stray genuine success with no fee row anywhere in the database would
  // turn every case in this file unavailable. Scoping each case to its own
  // merchants makes the cases mean exactly what they say. The global wrapper is
  // covered by hand-written tests in fee_totals_contract_test.sql, which can
  // assert relatively and survive whatever else is present.
  const scope = Array.isArray(c.scope) ? c.scope : merchantKeys;

  const lines = [];
  const p = (s = "") => lines.push(s);

  p(`-- ---------------------------------------------------------------------------`);
  p(`-- ${c.id}`);
  p(`--`);
  for (const chunk of wrap(c.description, 74)) p(`-- ${chunk}`);
  p(`-- ---------------------------------------------------------------------------`);
  p(`DO $case$`);
  p(`DECLARE`);
  p(`  v_uid UUID;`);
  for (const m of merchantKeys) {
    p(`  v_m_${m} UUID;`);
    p(`  v_d_${m} UUID;`);
  }
  for (const r of redemptions) p(`  v_r_${r.key} UUID;`);
  p(`  v_tx UUID;`);
  p(`  v_row RECORD;`);
  p(`BEGIN`);
  p(`  INSERT INTO public.users (role) VALUES ('customer') RETURNING id INTO v_uid;`);

  // One merchant + one deal per merchant key. The deal's demo flag is per
  // redemption in the fixtures, so a demo-deal case gets its own merchant.
  for (const m of merchantKeys) {
    const demoMerchant = redemptions.some(
      (r) => (r.merchant ?? "m1") === m && r.demo?.merchant
    );
    const demoDeal = redemptions.some(
      (r) => (r.merchant ?? "m1") === m && r.demo?.deal
    );
    p(``);
    p(`  INSERT INTO public.merchants`);
    p(`    (merchant_name, what3words_address, phone, node, status, is_visible, account_balance, is_demo)`);
    p(`    VALUES (${q(`__fee_case_${c.id}_${m}`)}, ${q(`fee.case.${m}`)}, ${q(nextPhone())},`);
    p(`            'BBS Mall', 'active', TRUE, 1000, ${demoMerchant ? "TRUE" : "FALSE"})`);
    p(`    RETURNING id INTO v_m_${m};`);
    p(`  INSERT INTO public.deals (merchant_id, title, image_url, expires_at, is_demo)`);
    p(`    VALUES (v_m_${m}, ${q(`__fee_case_${c.id}_${m}`)}, 'x', NOW() + INTERVAL '30 days', ${demoDeal ? "TRUE" : "FALSE"})`);
    p(`    RETURNING id INTO v_d_${m};`);
  }

  let otp = 100000;
  for (const r of redemptions) {
    const m = r.merchant ?? "m1";
    p(``);
    p(`  INSERT INTO public.redemptions`);
    p(`    (deal_id, merchant_id, user_id, otp_code, status, expires_at, redeemed_at, success_fee_charged, is_demo)`);
    // `deal` may name a DIFFERENT merchant's deal — the corruption `claim_deal`
    // cannot produce, where a redemption's two parents disagree about whose
    // shop it belongs to.
    p(`    VALUES (v_d_${r.deal ?? m}, v_m_${m}, v_uid, ${q(String(++otp))}, ${q(r.status ?? "success")},`);
    p(`            ${q(r.redeemedAt)}::timestamptz + INTERVAL '1 hour', ${q(r.redeemedAt)}, ${num(r.feeSnapshot ?? 30)},`);
    p(`            ${r.demo?.redemption ? "TRUE" : "FALSE"})`);
    p(`    RETURNING id INTO v_r_${r.key};`);
  }

  // A fee_reversal is only real if `reverse_success_fee` wrote it, and that RPC
  // writes a `fee_reversals` audit row pointing back at the ledger row through
  // `wallet_transaction_id`. So the fixtures create that audit row too --
  // otherwise every reversal case would be testing an orphan, and the suite
  // would flatter a path it is meant to check. A case sets `orphan: true` on a
  // reversal to test the uncorroborated shape deliberately.
  let ref = 0;
  for (const mv of movements) {
    p(``);
    p(`  INSERT INTO public.merchant_transactions`);
    p(`    (merchant_id, amount, transaction_type, payment_provider, provider_reference, description, reference_id, created_at, is_demo)`);
    const mvMerchant = mv.merchant ?? (mv.unlinked ? merchantKeys[0] : redemptionMerchant(redemptions, mv.redemption));
    p(`    VALUES (v_m_${mvMerchant}, ${amount(mv.amount)}, ${q(mv.type)}, 'manual',`);
    p(`            ${q(`__fee_case_${c.id}_${++ref}`)}, 'fixture', ${mv.unlinked ? "NULL" : `v_r_${mv.redemption}`}, ${q(mv.createdAt)},`);
    p(`            ${mv.isDemo ? "TRUE" : "FALSE"})`);
    p(`    RETURNING id INTO v_tx;`);
    // `fee_reversals.amount` is CHECKed > 0 and `reverse_success_fee` refuses a
    // non-positive fee, so a wrong-signed reversal could only ever have reached
    // the ledger by a direct insert -- which means it has no audit row by
    // construction, not by fixture convenience. Emitting one would be a shape
    // the database cannot hold.
    const auditable =
      typeof (mv.auditAmount ?? mv.amount) === "number" &&
      (mv.auditAmount ?? mv.amount) > 0;
    if (mv.type === "fee_reversal" && !mv.orphan && auditable) {
      p(`  INSERT INTO public.fee_reversals`);
      p(`    (redemption_id, merchant_id, wallet_transaction_id, amount, note, approver_user_id)`);
      p(`    VALUES (v_r_${mv.redemption}, v_m_${redemptionMerchant(redemptions, mv.redemption)},`);
      p(`            v_tx, ${amount(mv.auditAmount ?? mv.amount)}, 'fixture reversal',`);
      p(`            ${mv.noApprover ? "NULL" : "v_uid"});`);
    }
  }

  p(``);
  const ids = scope.map((m) => `v_m_${m}`).join(", ");
  p(`  SELECT * INTO v_row FROM public.admin_fee_totals_for_merchants(`);
  p(`    ${q(w.since)}, ${w.until ? `${q(w.until)}` : "NULL"}, ARRAY[${ids}]::uuid[]);`);

  const e = c.expected;
  p(``);
  p(`  ASSERT v_row.available IS NOT DISTINCT FROM ${e.available ? "TRUE" : "FALSE"},`);
  p(`    format(${q(`${c.id}: available = %s, expected ${e.available}`)}, v_row.available);`);
  for (const [field, want] of [
    ["gross_kes", e.grossKes],
    ["reversals_kes", e.reversalsKes],
    ["net_kes", e.netKes],
  ]) {
    p(`  ASSERT v_row.${field} IS NOT DISTINCT FROM ${num(want)},`);
    p(`    format(${q(`${c.id}: ${field} = %s, expected ${want === null ? "NULL" : want}`)}, v_row.${field});`);
  }
  p(`  ASSERT v_row.missing_fee_rows = ${e.missingFeeRows},`);
  p(`    format(${q(`${c.id}: missing_fee_rows = %s, expected ${e.missingFeeRows}`)}, v_row.missing_fee_rows);`);
  p(`  ASSERT v_row.invalid_rows = ${e.invalidRows},`);
  p(`    format(${q(`${c.id}: invalid_rows = %s, expected ${e.invalidRows}`)}, v_row.invalid_rows);`);

  p(``);
  for (const m of merchantKeys) {
    p(`  DELETE FROM public.fee_reversals WHERE merchant_id = v_m_${m};`);
    p(`  DELETE FROM public.merchant_transactions WHERE merchant_id = v_m_${m};`);
    p(`  DELETE FROM public.redemptions WHERE merchant_id = v_m_${m};`);
    p(`  DELETE FROM public.deals WHERE merchant_id = v_m_${m};`);
    p(`  DELETE FROM public.merchants WHERE id = v_m_${m};`);
  }
  p(`  DELETE FROM public.users WHERE id = v_uid;`);
  p(`  RAISE NOTICE ${q(`fee contract case passed: ${c.id}`)};`);
  p(`END $case$;`);
  return lines.join("\n");
}

function redemptionMerchant(redemptions, key) {
  const r = redemptions.find((x) => x.key === key);
  if (!r) throw new Error(`movement references unknown redemption "${key}"`);
  return r.merchant ?? "m1";
}

function wrap(text, width) {
  const out = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

function render() {
  const spec = JSON.parse(readFileSync(SOURCE, "utf8"));
  phoneSeq = 0;
  const header = [
    "-- =========================================================================",
    "-- GENERATED FILE — DO NOT EDIT.",
    "--",
    "-- Source:    supabase/tests/fixtures/fee-contract-cases.json",
    "-- Generator: scripts/gen-fee-contract-cases.mjs",
    "--",
    "-- These are the SAME semantic cases `fee-contract-parity.test.ts` runs",
    "-- against `aggregateLedgerFees`. Editing this file by hand breaks that",
    "-- equivalence silently, which is the one thing the shared fixture exists to",
    "-- prevent — so a drift check in CI regenerates it and fails on any diff.",
    "--",
    "-- Included by supabase/tests/fee_totals_contract_test.sql via \\ir. It is",
    "-- under fixtures/ rather than tests/ because the runner globs",
    "-- supabase/tests/*.sql non-recursively and this file is not a suite of its",
    "-- own.",
    "--",
    "-- Every case calls admin_fee_totals_for_merchants scoped to the merchants it",
    "-- just created. That is ISOLATION, not the contract: the global wrapper sums",
    "-- the whole database, so these assertions would otherwise depend on what",
    "-- other suites left behind, and one stray genuine success with no fee row",
    "-- would make every case here unavailable. The global wrapper has its own",
    "-- hand-written coverage in the parent suite.",
    "-- =========================================================================",
    "",
  ].join("\n");
  const body = spec.cases.map((c) => renderCase(c, spec.window)).join("\n\n");
  return `${header}${body}\n`;
}

const sql = render();
if (process.argv.includes("--check")) {
  const current = readFileSync(TARGET, "utf8");
  if (current !== sql) {
    console.error(
      "fee-contract fixtures are stale — run `node scripts/gen-fee-contract-cases.mjs`"
    );
    process.exit(1);
  }
  console.log("fee-contract fixtures: in sync");
} else {
  writeFileSync(TARGET, sql);
  console.log(`wrote ${path.relative(ROOT, TARGET)}`);
}
