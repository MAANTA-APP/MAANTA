/**
 * Demo feed seeder — 100 live deals at BBS Mall for production/staging demos.
 *
 * Counts: 20 flash · 30 boosted · 50 standard (Deals Near Me).
 * Boosted = deal_type "standard" + boost_active true (not a separate deal_type).
 *
 * Requires in shell (never commit):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: fixed UUID namespace (…be00-…). Re-run refreshes expiry windows.
 * Pass --clean to delete all [SEED] rows first.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const NODE = "BBS Mall";
const SEED_TAG = "[SEED]";
const COUNTS = { flash: 20, boosted: 30, standard: 50 } as const;
const TOTAL_DEALS = COUNTS.flash + COUNTS.boosted + COUNTS.standard;
const TOTAL_MERCHANTS = 10 + COUNTS.boosted + COUNTS.standard; // elite pool + 1 deal each

type DealKind = "flash" | "boosted" | "standard";

function seedUuid(kind: "user" | "merchant" | "deal", index: number): string {
  const head = { user: "b0000000", merchant: "c0000000", deal: "d0000000" }[kind];
  return `${head}-0000-4000-be00-${String(index).padStart(12, "0")}`;
}

function dealKind(dealIndex: number): DealKind {
  if (dealIndex <= COUNTS.flash) return "flash";
  if (dealIndex <= COUNTS.flash + COUNTS.boosted) return "boosted";
  return "standard";
}

function merchantIndexForDeal(dealIndex: number): number {
  if (dealIndex <= COUNTS.flash) return Math.ceil(dealIndex / 2);
  if (dealIndex <= COUNTS.flash + COUNTS.boosted) return 10 + (dealIndex - COUNTS.flash);
  return 40 + (dealIndex - COUNTS.flash - COUNTS.boosted);
}

function dealLabel(kind: DealKind, n: number): string {
  const name = kind === "flash" ? "Flash deal" : kind === "boosted" ? "Boosted deal" : "Standard deal";
  return `${SEED_TAG} ${name} #${n}`;
}

function placeholderImage(label: string, hue: number): string {
  const text = encodeURIComponent(label.slice(0, 28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${hue},55%,42%)"/><text x="200" y="155" font-family="sans-serif" font-size="22" font-weight="bold" fill="white" text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set — export it before running the seeder.`);
  return value;
}

function createServiceClient(): SupabaseClient {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function buildUsers() {
  return Array.from({ length: TOTAL_MERCHANTS }, (_, i) => {
    const index = i + 1;
    return {
      id: seedUuid("user", index),
      phone: `+2547999${String(index).padStart(5, "0")}`,
      email: `seed-feed-${index}@demo.maanta.local`,
      full_name: `${SEED_TAG} Merchant ${index}`,
      role: "merchant_admin" as const,
    };
  });
}

function buildMerchants() {
  const w3wSamples = ["stored.riches.shine", "lively.scent.corner", "sweet.corner.treat", "fresh.style.hub"];
  return Array.from({ length: TOTAL_MERCHANTS }, (_, i) => {
    const index = i + 1;
    const elite = index <= 10;
    return {
      id: seedUuid("merchant", index),
      user_id: seedUuid("user", index),
      merchant_name: `${SEED_TAG} Shop ${index}`,
      tier: elite ? "elite" : "standard",
      status: "active",
      elite_trial_active: elite,
      node: NODE,
      what3words_address: w3wSamples[(index - 1) % w3wSamples.length],
      mall_name: NODE,
      floor: index % 3 === 0 ? "Ground Floor" : index % 3 === 1 ? "1st Floor" : "2nd Floor",
      unit_number: `S-${String(index).padStart(2, "0")}`,
      entrance_notes: "Demo seed merchant for feed rehearsal",
      phone: `+2547999${String(index).padStart(5, "0")}`,
      email: `seed-feed-${index}@demo.maanta.local`,
      account_balance: 5000,
      is_visible: true,
      is_shadow_banned: false,
      onboarded_at: new Date().toISOString(),
    };
  });
}

function buildDeals() {
  const kindCounters: Record<DealKind, number> = { flash: 0, boosted: 0, standard: 0 };
  const now = Date.now();

  return Array.from({ length: TOTAL_DEALS }, (_, i) => {
    const dealIndex = i + 1;
    const kind = dealKind(dealIndex);
    kindCounters[kind] += 1;
    const n = kindCounters[kind];
    const merchantId = seedUuid("merchant", merchantIndexForDeal(dealIndex));
    const isFlash = kind === "flash";
    const startsAt = new Date(now - (isFlash ? 1 : 3) * 60 * 60 * 1000).toISOString();
    const basePrice = 500 + dealIndex * 25;

    return {
      id: seedUuid("deal", dealIndex),
      merchant_id: merchantId,
      node: NODE,
      title: dealLabel(kind, n),
      description: `Demo ${kind} offer at ${NODE}. Show your MAANTA code at the counter before paying.`,
      image_url: placeholderImage(dealLabel(kind, n), (dealIndex * 37) % 360),
      discount_type: isFlash ? "freebie" : dealIndex % 2 === 0 ? "percentage" : "fixed",
      discount_value: isFlash ? null : dealIndex % 2 === 0 ? 15 : 200,
      deal_type: isFlash ? "flash" : "standard",
      flash_duration_hours: 6,
      is_active: true,
      is_paused: false,
      boost_active: kind === "boosted",
      max_claims: 50,
      claims_count: 0,
      starts_at: startsAt,
      price_kes: basePrice,
      compare_at_kes: basePrice + 300,
      charges: [],
    };
  });
}

async function cleanSeedRows(supabase: SupabaseClient) {
  const dealIds = Array.from({ length: TOTAL_DEALS }, (_, i) => seedUuid("deal", i + 1));
  const merchantIds = Array.from({ length: TOTAL_MERCHANTS }, (_, i) => seedUuid("merchant", i + 1));
  const userIds = Array.from({ length: TOTAL_MERCHANTS }, (_, i) => seedUuid("user", i + 1));

  const { error: dealsErr } = await supabase.from("deals").delete().in("id", dealIds);
  if (dealsErr) throw dealsErr;

  const { error: merchantsErr } = await supabase.from("merchants").delete().in("id", merchantIds);
  if (merchantsErr) throw merchantsErr;

  const { error: usersErr } = await supabase.from("users").delete().in("id", userIds);
  if (usersErr) throw usersErr;

  console.log("Removed previous [SEED] demo users, merchants, and deals.");
}

async function upsertRows<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: "users" | "merchants",
  rows: T[]
) {
  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk as never[], { onConflict: "id" });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function upsertDealsInOrder(supabase: SupabaseClient, deals: ReturnType<typeof buildDeals>) {
  for (const deal of deals) {
    const { error } = await supabase.from("deals").upsert(deal as never, { onConflict: "id" });
    if (error) throw new Error(`deals upsert failed for ${deal.id}: ${error.message}`);
  }
}

async function refreshDealWindows(supabase: SupabaseClient) {
  const deals = buildDeals();
  for (const deal of deals) {
    const isFlash = deal.deal_type === "flash";
    const startsAt = new Date(Date.now() - (isFlash ? 1 : 3) * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(
      Date.now() + (isFlash ? 5 : 21) * 60 * 60 * 1000
    ).toISOString();

    const { error } = await supabase
      .from("deals")
      .update({
        starts_at: startsAt,
        expires_at: expiresAt,
        is_active: true,
        is_paused: false,
        boost_active: deal.boost_active,
      })
      .eq("id", deal.id);

    if (error) throw new Error(`deal refresh failed for ${deal.id}: ${error.message}`);
  }
}

async function main() {
  const clean = process.argv.includes("--clean");
  const supabase = createServiceClient();

  if (clean) await cleanSeedRows(supabase);

  const users = buildUsers();
  const merchants = buildMerchants();
  const deals = buildDeals();

  console.log(`Seeding ${NODE}: ${COUNTS.flash} flash, ${COUNTS.boosted} boosted, ${COUNTS.standard} standard…`);

  await upsertRows(supabase, "users", users);
  await upsertRows(supabase, "merchants", merchants);
  await upsertDealsInOrder(supabase, deals);
  await refreshDealWindows(supabase);

  console.log("Done.");
  console.log(`  Merchants: ${TOTAL_MERCHANTS} (${SEED_TAG} Shop 1–${TOTAL_MERCHANTS})`);
  console.log(`  Deals:     ${TOTAL_DEALS} (${SEED_TAG} titles, node="${NODE}")`);
  console.log("Reload /feed with the BBS Mall node selected to browse.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
