import { dealCategoryLabel, type DealCategoryFilter } from "@/lib/deal-categories";
import { DEAL_FILTER_OPTIONS, type DealListFilter } from "@/lib/deal-list-controls";

/**
 * What to say when the shopper feed has nothing on it.
 *
 * Three different facts need three different sentences, and the first version of
 * this got it wrong in both directions. It chose between "quiet mall" and "your
 * category" by asking whether any category chips were on offer — but the chip
 * row is deliberately withheld when every live deal sits in ONE bucket, so a
 * node with five live fashion deals and a `?category=food` URL rendered "No
 * deals live right now" on a mall that was open for business. It also never
 * considered the Deal type filter, which can empty the screen on its own while
 * the copy blames the category.
 *
 * So the cause is derived from counts rather than inferred from what the UI
 * happens to be showing. Whatever the shopper is told here has to be true of the
 * node in front of them, and the suggested next step has to be the one that
 * actually un-empties the screen.
 *
 * Lives in `lib` rather than beside the page so it can be tested directly: the
 * feed is an async server component, and a guard that greps its source for a
 * conditional is the kind of assertion that passes while the behaviour is wrong.
 * That is precisely how the bug above survived its own test.
 */
export function feedEmptyState(opts: {
  /** Live deals at this node before any shopper filter. */
  liveTotal: number;
  /** Live deals after the category filter, before the deal-type filter. */
  afterCategoryTotal: number;
  category: DealCategoryFilter;
  filter: DealListFilter;
}): { title: string; sub: string } {
  const quiet = {
    title: "No deals live right now",
    sub: "Merchants drop new deals through the day.",
  };

  // Nothing live at this mall — the only case where the market really is quiet.
  if (opts.liveTotal === 0) return quiet;

  // Deals exist; the category filter removed all of them.
  if (opts.category !== "all" && opts.afterCategoryTotal === 0) {
    return {
      title: `No ${(dealCategoryLabel(opts.category) ?? "").toLowerCase()} deals right now`,
      sub: "Tap All to see everything live at this mall.",
    };
  }

  // Deals survived the category; the deal-type filter is what emptied the screen.
  if (opts.filter !== "all") {
    const dealType =
      DEAL_FILTER_OPTIONS.find((o) => o.value === opts.filter)?.label.toLowerCase() ??
      opts.filter;
    return {
      title: `No ${dealType} deals right now`,
      sub: "Other deals are live — set Deal type back to All to see them.",
    };
  }

  return quiet;
}
