import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEAL_CATEGORIES,
  availableDealCategories,
  dealCategoryChips,
  dealCategoryLabel,
  filterDealRowsByCategory,
  isDealCategory,
  parseDealCategory,
} from "@/lib/deal-categories";
import {
  isMissingDealCategoryColumnError,
  isMissingLatLngColumnError,
} from "@/lib/supabase/postgrest-errors";
import { insertDealDroppingUnknownCategory } from "@/lib/deal-category-column";
import {
  DEAL_SELECT,
  DEAL_SELECT_WITHOUT_LAT_LNG,
  selectDealsWithMerchants,
} from "@/lib/data";
import { feedEmptyState } from "@/lib/feed-empty-state";
import { stripComments } from "./helpers/comment-stripping";

const APP = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(APP, rel), "utf8");
const code = (rel: string) => stripComments(read(rel));

/**
 * Shopper deal categories — the taxonomy, the two places it is written down, and
 * the ways a filter can lie to a shopper.
 *
 * Founder ruling 2026-08-18: three buckets, attached to the DEAL.
 */

describe("the taxonomy is written down twice and must agree", () => {
  // The keys live in TypeScript (for the pickers, chips and validation) and in a
  // SQL CHECK constraint (so nothing else can ever write a fourth value). Two
  // copies is the price of enforcing it in the database; letting them disagree
  // is not. Add "kids" to the array without widening the CHECK and every
  // merchant who picks it gets "Could not publish the deal" with no reason
  // given — a failure that would reach production because both halves pass
  // their own tests.
  // `--` comment lines stripped first: the migration's own header explains the
  // taxonomy in words, and a guard that scanned them would fail for documenting
  // the thing it is guarding — the D38 lesson, in SQL.
  const migration = read("supabase/migrations/20260818120000_deal_categories.sql")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("the SQL CHECK lists exactly the keys the app offers", () => {
    const inCheck = migration
      .match(/category IN \(([^)]*)\)/)?.[1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .sort();
    expect(inCheck, "no `category IN (...)` CHECK found in the migration").toBeTruthy();
    expect(inCheck).toEqual([...DEAL_CATEGORIES.map((c) => c.key)].sort());
  });

  it("stores keys, not labels", () => {
    // A label is copy and will be reworded. If the column stored "Fashion &
    // fabric", rewording the chip silently orphans every row already filed
    // under the old words.
    for (const c of DEAL_CATEGORIES) {
      expect(migration).not.toContain(c.label);
    }
  });

  it("keys are URL- and DB-safe lowercase", () => {
    for (const c of DEAL_CATEGORIES) {
      expect(c.key, `${c.key} must be lowercase a-z`).toMatch(/^[a-z]+$/);
    }
  });
});

describe("the demo reseed catalogue files itself under the same taxonomy", () => {
  // Production is still in demo mode, so every deal a reviewer sees comes from
  // here. The CHECK constraint would catch a typo — by aborting the nightly
  // cron job with a check_violation and quietly starving the demo feed of
  // flash deals. Catching it in CI is the difference between a red test and a
  // marketplace that stops restocking overnight.
  const reseed = read("supabase/migrations/20260818130000_demo_reseed_categories.sql");
  // `String.match` with /g rather than spreading `matchAll`: this tsconfig sets
  // no `target`, so tsc defaults to ES5 and spreading an iterator needs
  // `--downlevelIteration`. vitest transpiles through esbuild and does not care,
  // which is exactly how that reaches CI green-looking and fails `tsc --noEmit`.
  const raw = reseed.match(/"k":\s*(?:null|"[a-z]+")/g) ?? [];
  const keys = raw.map((m) => /"k":\s*"([a-z]+)"/.exec(m)?.[1] ?? null);

  it("gives every catalogue item a key", () => {
    // Counted against the ITEMS, not against a fixed 16. Asserting a literal
    // count only catches a missing key while the catalogue is exactly the size
    // it is today — grow it to seventeen with one item unkeyed and a `toBe(16)`
    // passes while that item publishes uncategorised every night.
    const items = (reseed.match(/\{"t":/g) ?? []).length;
    expect(items, "no catalogue items found — the regex or the format changed").toBeGreaterThan(
      0
    );
    expect(keys.length, `${items} catalogue items but ${keys.length} keys`).toBe(items);
  });

  it("uses only keys the taxonomy and the CHECK constraint accept", () => {
    const bad = keys.filter((k) => k !== null && !isDealCategory(k));
    expect(bad, `unknown category keys in the demo catalogue: ${bad.join(", ")}`).toEqual(
      []
    );
  });

  it("covers all three buckets, so the chip row actually appears in demo mode", () => {
    const used = new Set(keys.filter((k): k is string => k !== null));
    for (const c of DEAL_CATEGORIES) {
      expect(used.has(c.key), `no demo deal is filed under ${c.key}`).toBe(true);
    }
  });

  it("leaves the items that fit no bucket uncategorised rather than mis-filing them", () => {
    // A suitcase is not fashion, beauty or food. Forcing it into one to make the
    // demo look tidy would be lying with fixture data — and it would hide the
    // uncategorised path, which is the state every real pre-taxonomy deal is in.
    expect(keys.some((k) => k === null)).toBe(true);
  });
});

describe("parseDealCategory never turns a bad URL into an empty market", () => {
  it("falls back to `all` for anything it does not know", () => {
    // Same defect class as ?filter=bogus before parseDealListFilter existed: an
    // unrecognised value that is still truthy filters everything out and the
    // feed reports "No deals live right now" on a mall full of deals.
    for (const raw of ["", "bogus", "FOOD", "all ", undefined, ["food"]]) {
      expect(parseDealCategory(raw as never), String(raw)).toBe("all");
    }
  });

  it("accepts every key the taxonomy defines", () => {
    for (const c of DEAL_CATEGORIES) {
      expect(parseDealCategory(c.key)).toBe(c.key);
    }
  });

  it("isDealCategory rejects non-strings rather than throwing on them", () => {
    for (const raw of [null, undefined, 7, {}, ["food"]]) {
      expect(isDealCategory(raw)).toBe(false);
    }
  });
});

describe("uncategorised deals show under All and under no chip", () => {
  const rows = [
    { id: "a", category: "food" },
    { id: "b", category: null },
    { id: "c", category: "fashion" },
  ];

  it("All returns everything, including the uncategorised", () => {
    expect(filterDealRowsByCategory(rows, "all")).toHaveLength(3);
  });

  it("a category never sweeps up uncategorised rows", () => {
    // Every deal that exists today predates the column. Folding them into a
    // default bucket would put a fabric deal under Food and make the filter lie
    // — which is worse than a deal that is only reachable under All.
    expect(filterDealRowsByCategory(rows, "food").map((r) => r.id)).toEqual(["a"]);
    expect(filterDealRowsByCategory(rows, "fashion").map((r) => r.id)).toEqual(["c"]);
  });

  it("treats a missing field the same as an explicit null", () => {
    // Before the migration is applied, the column is absent from the select and
    // the field is `undefined`, not `null`.
    //
    // Typed rather than inlined: with no `category` property to infer from, the
    // generic falls back to its constraint and an inline literal's `id` becomes
    // an excess property. The annotation is what says "a row that legitimately
    // has no category field", which is the case under test.
    const noField: { id: string; category?: string | null }[] = [{ id: "x" }];
    expect(filterDealRowsByCategory(noField, "food")).toEqual([]);
    expect(filterDealRowsByCategory(noField, "all")).toHaveLength(1);
  });
});

describe("the chip row is only offered when it can change the screen", () => {
  it("renders nothing when no deal has a category", () => {
    // This is the pre-migration state, and it is what makes the feature safe to
    // ship ahead of the apply: no column, no categories, no chips, feed
    // unchanged — rather than a row of chips that all empty the screen.
    expect(dealCategoryChips([{ category: null }, {}])).toEqual([]);
    expect(availableDealCategories([{ category: null }, {}])).toEqual([]);
  });

  it("renders nothing when every live deal is in the same bucket", () => {
    // A filter that cannot narrow anything is noise on a small screen.
    expect(dealCategoryChips([{ category: "food" }, { category: "food" }])).toEqual([]);
  });

  it("renders when one category coexists with uncategorised deals", () => {
    // "Food" genuinely narrows here — it drops the uncategorised deal — so the
    // row earns its space even though only one chip can be offered.
    expect(dealCategoryChips([{ category: "food" }, { category: null }])).toEqual([
      { key: "food", label: "Food" },
    ]);
  });

  it("offers only categories that have a live deal behind them", () => {
    // A chip must never lead to an empty screen: "nothing here" should mean the
    // mall is quiet, not that the shopper picked the one bucket nobody sells in.
    const chips = dealCategoryChips([{ category: "food" }, { category: "beauty" }]);
    expect(chips.map((c) => c.key)).toEqual(["beauty", "food"]);
  });

  it("keeps taxonomy order, not order of appearance", () => {
    // Chips that reshuffle as merchants publish are chips a returning shopper
    // has to re-read every time.
    const chips = dealCategoryChips([
      { category: "food" },
      { category: "fashion" },
      { category: "beauty" },
    ]);
    expect(chips.map((c) => c.key)).toEqual(DEAL_CATEGORIES.map((c) => c.key));
  });
});

describe("labels", () => {
  it("resolves a key to its shopper-facing words", () => {
    expect(dealCategoryLabel("beauty")).toBe("Beauty & perfume");
  });

  it("returns null rather than echoing an unknown key at a shopper", () => {
    expect(dealCategoryLabel("electronics")).toBeNull();
    expect(dealCategoryLabel(null)).toBeNull();
  });
});

/**
 * The column ships before it exists.
 *
 * Claude does not apply migrations to production, so this code is deployed
 * against a database that has never heard of `deals.category`, for a window
 * whose length is a human's decision. Every read and write of the column has to
 * survive that window costing the category and nothing else.
 */
describe("reads degrade when deals.category is not on the remote yet", () => {
  const missingCategory = {
    code: "42703",
    message: 'column deals.category does not exist',
  };
  const missingLatLng = {
    code: "42703",
    message: 'column merchants.lat does not exist',
  };
  const row = {
    id: "d1",
    merchants: { id: "m1", merchant_name: "Shop", lat: null, lng: null },
  };

  it("selects the column when it is there", async () => {
    const run = vi.fn().mockResolvedValue({ data: [row], error: null });
    await selectDealsWithMerchants(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toContain("category");
  });

  it("retries without category rather than 500ing the feed", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: missingCategory })
      .mockResolvedValueOnce({ data: [row], error: null });
    const out = await selectDealsWithMerchants(run);
    expect(out).toHaveLength(1);
    expect(run.mock.calls[1][0]).not.toContain("category");
    // Only the category is given up — lat/lng must still be requested.
    expect(run.mock.calls[1][0]).toContain("lat");
  });

  it("can shed both missing columns in either order", async () => {
    // Postgres names one unknown column per error and the order is not ours to
    // rely on, so the ladder must not assume which gap it hits first.
    for (const [first, second] of [
      [missingCategory, missingLatLng],
      [missingLatLng, missingCategory],
    ]) {
      const run = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: first })
        .mockResolvedValueOnce({ data: null, error: second })
        .mockResolvedValueOnce({ data: [row], error: null });
      const out = await selectDealsWithMerchants(run);
      expect(out).toHaveLength(1);
      expect(run.mock.calls[2][0]).not.toContain("category");
      expect(run.mock.calls[2][0]).not.toContain(" lat,");
    }
  });

  it("does not retry, or swallow, an unrelated failure", async () => {
    // A permissions error or a dead connection must surface. Retrying it would
    // double the load on a database already failing and hide the cause.
    const boom = { code: "42501", message: "permission denied for table deals" };
    const run = vi.fn().mockResolvedValue({ data: null, error: boom });
    await expect(selectDealsWithMerchants(run)).rejects.toBe(boom);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("throws the last error, so the surfaced failure is the real blocker", async () => {
    // An earlier error is by construction a missing column this function chose
    // to work around. Reporting "column deals.category does not exist" while the
    // query is really failing on permissions sends the operator after the wrong
    // problem — and would make D116 look like the cause of every outage until it
    // is applied.
    const second = { code: "42501", message: "permission denied" };
    const run = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: missingCategory })
      .mockResolvedValueOnce({ data: null, error: second });
    await expect(selectDealsWithMerchants(run)).rejects.toBe(second);
  });

  it("keeps both select strings naming category exactly once", () => {
    // The lat/lng-less fallback is the select used on a remote missing GPS. If
    // only the primary carried the column, that path would silently lose
    // categories with no error anywhere.
    for (const select of [DEAL_SELECT, DEAL_SELECT_WITHOUT_LAT_LNG]) {
      expect(select.split(", category,")).toHaveLength(2);
    }
  });
});

describe("writes drop the category, never the deal", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  const missing = { code: "PGRST204", message: "Could not find the 'category' column" };

  it("publishes uncategorised rather than failing at the last step", async () => {
    // The merchant has already passed the wallet gate, uploaded a cover and
    // reached Review. "Could not publish the deal" with no way to succeed, over
    // a column that has nothing to do with publishing, is the worst outcome
    // available here.
    const run = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({ data: { id: "d1" }, error: null });
    const out = await insertDealDroppingUnknownCategory(
      { title: "T", category: "food" },
      run
    );
    expect(out.error).toBeNull();
    expect(run.mock.calls[1][0]).not.toHaveProperty("category");
    expect(run.mock.calls[1][0]).toHaveProperty("title", "T");
    expect(consoleError, "the reason must reach the logs").toHaveBeenCalled();
  });

  it("never launders a real refusal into a second attempt", async () => {
    // The zero-balance gate, the deal limit and flash-on-Standard all come back
    // as insert errors. Retrying any of them would be an attempt to bypass a
    // frozen commercial rule.
    for (const message of [
      "INSUFFICIENT_BALANCE_FOR_NEW_DEAL",
      "Deal limit reached",
      "Flash deals are only available on the Elite plan",
    ]) {
      const error = { code: "P0001", message };
      const run = vi.fn().mockResolvedValue({ data: null, error });
      const out = await insertDealDroppingUnknownCategory(
        { title: "T", category: "food" },
        run
      );
      expect(out.error, message).toBe(error);
      expect(run, message).toHaveBeenCalledTimes(1);
    }
  });

  it("does not retry when the values carried no category to drop", async () => {
    const error = { code: "42703", message: "column deals.category does not exist" };
    const run = vi.fn().mockResolvedValue({ data: null, error });
    await insertDealDroppingUnknownCategory({ title: "T" }, run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

/**
 * The edit route has to say what it actually did.
 *
 * The create path drops the category and publishes anyway, and that trade is
 * right: it saves a deal that would otherwise not exist. The edit path is not
 * the same bargain — this sheet is the documented correction path for
 * pre-taxonomy deals, so the category may be the ONLY thing the merchant came to
 * change. Returning a bare `ok` after discarding it reported a correction as
 * saved when nothing was written, and because the client keeps its local
 * selection across `router.refresh()`, re-opening the sheet showed the chip
 * still chosen and the loss never surfaced.
 *
 * Source-level, because the route is a Next handler wired to Clerk auth and a
 * service client — but pinned at the specific lines that carry the promise,
 * so removing the honesty fails rather than passing on a shape that no longer
 * means anything.
 */
describe("the deal edit route reports what happened to the category", () => {
  const route = code("src/app/api/deals/[id]/route.ts");
  const sheet = code("src/app/merchant/(app)/deals/[id]/deal-actions.tsx");

  it("tells the client when the category did not save", () => {
    expect(route).toContain("categorySaved");
    expect(route).toMatch(/categoryApplied = false/);
  });

  it("does not report success for an edit that was only a category it could not store", () => {
    // Bumping updated_at and answering ok would be the same lie with an extra
    // write, so this case gets its own status and its own sentence.
    expect(route).toMatch(/status:\s*503/);
    expect(route).toContain("the deal is unchanged");
  });

  it("distinguishes an unrecognised category from an empty edit", () => {
    // "Nothing to update" is false when a category WAS sent and rejected.
    expect(route).toContain("That category isn't one we recognise.");
  });

  it("keeps the sheet open and says so rather than closing on success", () => {
    expect(sheet).toContain("body.categorySaved === false");
    expect(sheet).toContain("could not be stored yet");
  });
});

describe("the missing-column probes stay narrow", () => {
  it("does not mistake an unrelated error for a schema gap", () => {
    expect(
      isMissingDealCategoryColumnError({ code: "42501", message: "permission denied" })
    ).toBe(false);
    expect(isMissingDealCategoryColumnError({ message: "timeout" })).toBe(false);
  });

  it("does not confuse the two column probes with each other", () => {
    const cat = { code: "42703", message: "column deals.category does not exist" };
    const geo = { code: "42703", message: "column merchants.lng does not exist" };
    expect(isMissingDealCategoryColumnError(cat)).toBe(true);
    expect(isMissingLatLngColumnError(cat)).toBe(false);
    expect(isMissingDealCategoryColumnError(geo)).toBe(false);
    expect(isMissingLatLngColumnError(geo)).toBe(true);
  });
});

describe("the surfaces are wired to the shared taxonomy", () => {
  it("the merchant wizard requires a category before Continue", () => {
    // Optional here means a deal that a shopper filtering for exactly this can
    // never find, and no one would ever learn why.
    const wizard = code("src/app/merchant/(app)/deals/new/new-deal-wizard.tsx");
    expect(wizard).toContain("DEAL_CATEGORIES");
    expect(wizard).toMatch(/disabled=\{[^}]*!category/);
  });

  it("the create API validates against the taxonomy and refuses a deal without one", () => {
    const route = code("src/app/api/deals/route.ts");
    expect(route).toContain("isDealCategory");
    expect(route).toMatch(/if \(!category\)/);
  });

  it("both shopper surfaces render the same chip component", () => {
    // One component, one taxonomy. Two hand-rolled chip rows is how /feed and
    // /browse end up offering different buckets.
    expect(code("src/app/(shopper)/feed/page.tsx")).toContain("<DealCategoryChips");
    expect(code("src/components/browse/browse-client.tsx")).toContain("<DealCategoryChips");
  });

  it("chips are derived from the unfiltered deal set on both surfaces", () => {
    // Derive them from the filtered list and picking one chip removes the
    // others, stranding the shopper on a filter they cannot leave.
    const feed = code("src/app/(shopper)/feed/page.tsx");
    expect(feed).toMatch(/dealCategoryChips\(\[\.\.\.flash, \.\.\.boosted, \.\.\.nearMe\]\)/);
    expect(code("src/app/(shopper)/browse/page.tsx")).toMatch(/dealCategoryChips\(deals\)/);
  });

  it("the feed derives its empty state from counts rather than from the chip row", () => {
    // The behaviour itself is covered below by exercising `feedEmptyState`
    // directly. This only pins that the page still routes through it: an inlined
    // conditional here is how the copy and the counts drift apart again.
    const feed = code("src/app/(shopper)/feed/page.tsx");
    expect(feed).toContain("feedEmptyState({");
    expect(feed).toMatch(/const liveTotal =/);
    expect(feed).toMatch(/const afterCategoryTotal =/);
  });
});

/**
 * The empty-state copy, tested as behaviour rather than as a string in a file.
 *
 * The first version of this decided between "the mall is quiet" and "your
 * category" by asking whether any chips were on offer, and its guard asserted
 * that conditional was present in the source. Both passed. Both were wrong: the
 * chip row is withheld when every live deal sits in one bucket, so a node with
 * five live fashion deals and `?category=food` told the shopper the mall was
 * empty. A guard that greps for a conditional cannot catch a conditional that is
 * present and incorrect.
 */
describe("feedEmptyState names the filter that actually emptied the feed", () => {
  const CAT = { liveTotal: 5, afterCategoryTotal: 0, category: "food", filter: "all" } as const;

  it("says the mall is quiet only when the mall is actually quiet", () => {
    const out = feedEmptyState({
      liveTotal: 0,
      afterCategoryTotal: 0,
      category: "all",
      filter: "all",
    });
    expect(out.title).toBe("No deals live right now");
  });

  it("does NOT say the mall is quiet when a category emptied a live node", () => {
    // The exact case that shipped broken: live deals at the node, all in one
    // bucket, and a category selected that has none.
    const out = feedEmptyState(CAT);
    expect(out.title).not.toBe("No deals live right now");
    expect(out.title).toContain("food");
    expect(out.sub).toContain("All");
  });

  it("blames the deal type when the deal type is what emptied it", () => {
    // Deals survived the category filter, so the category is not the cause and
    // telling the shopper to tap All would not un-empty the screen.
    const out = feedEmptyState({
      liveTotal: 5,
      afterCategoryTotal: 5,
      category: "food",
      filter: "flash",
    });
    expect(out.title).toContain("flash");
    expect(out.sub).toContain("Deal type");
  });

  it("never promises other categories exist when nothing is live at all", () => {
    // With no live deals, "tap All to see everything" is an empty promise.
    const out = feedEmptyState({
      liveTotal: 0,
      afterCategoryTotal: 0,
      category: "food",
      filter: "flash",
    });
    expect(out.title).toBe("No deals live right now");
    expect(out.sub).not.toContain("All");
  });

  it("falls back to the quiet-mall copy rather than inventing a cause", () => {
    // liveTotal > 0 with no filters set should not be reachable (the feed would
    // have rendered deals), but if it is, the copy must not name a filter that
    // was never applied.
    const out = feedEmptyState({
      liveTotal: 3,
      afterCategoryTotal: 3,
      category: "all",
      filter: "all",
    });
    expect(out.title).toBe("No deals live right now");
  });
});

describe("`Category` never labels a deal-type control again", () => {
  // /map called its Flash/Boosted/Standard dropdown "Category" for as long as
  // the product had no categories. Now that it has three, one word cannot mean
  // two axes in one app — a shopper who reads "Category → Flash" learns the
  // wrong model of the product and then cannot find the real filter.
  const CONTROLS = [
    "src/app/(shopper)/map/map-client.tsx",
    "src/app/(shopper)/feed/feed-controls.tsx",
    "src/app/(shopper)/browse/browse-controls.tsx",
  ];

  it("labels the rail control Deal type on every surface that offers it", () => {
    for (const rel of CONTROLS) {
      const src = code(rel);
      expect(src, `${rel} still labels the rail filter "Category"`).not.toContain(
        'label="Category"'
      );
      expect(src, `${rel} should label it "Deal type"`).toContain('label="Deal type"');
    }
  });
});
