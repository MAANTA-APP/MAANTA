/**
 * The invented shops and prices used by marketing illustrations.
 *
 * **One list, deliberately.** Every synthetic deal row on the marketing site
 * comes from here, so "does any of this collide with a real BBS Mall tenant?" is
 * a question with exactly one place to look. A second list is a second place for
 * an invented name to drift into a real business's name unnoticed — and a name
 * that collides turns an illustration into a claim about that business.
 *
 * Nothing here is real. It is rendered only inside components that carry a
 * visible "Illustration" disclosure and an `sr-only` sentence saying so; see
 * drift row **D50**, which exists because these rows are the one exception to
 * "no synthetic content on marketing routes".
 *
 * The walkthrough on `/shoppers` deliberately follows `SAMPLE_DEALS[0]` through
 * all three of its panels rather than showing a different shop per step. That is
 * not only better storytelling — one shopper, one deal, start to finish — it also
 * means the walkthrough introduced **no new invented names** when it was added.
 */
export type SampleDeal = {
  shop: string;
  deal: string;
  was: number;
  now: number;
  away: string;
};

/** Invented. No name here is a real BBS Mall tenant. */
export const SAMPLE_DEALS: readonly SampleDeal[] = [
  {
    shop: "Riverside Fabrics",
    deal: "3 metres of cotton print",
    was: 2_000,
    now: 1_200,
    away: "40 m",
  },
  {
    shop: "Junction Shoes",
    deal: "Leather sandals",
    was: 1_400,
    now: 850,
    away: "1st floor",
  },
  {
    shop: "Amana Electronics",
    deal: "Wireless earbuds",
    was: 3_200,
    now: 2_400,
    away: "80 m",
  },
] as const;

/**
 * The example code shown in the walkthrough's second panel.
 *
 * Six digits, because that is what the product issues, and formatted by the same
 * `formatCode` the real screen uses so the grouping a shopper sees at the counter
 * is the grouping they were shown here. Not a real code: codes are per-claim,
 * single-use and short-lived, so there is nothing to leak — but it is stated
 * because a plausible-looking credential in marketing deserves the sentence.
 */
export const SAMPLE_CODE = "492173";
