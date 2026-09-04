import { publicOrigin } from "@/lib/app-url";

/**
 * JSON-LD for the marketing site.
 *
 * ## What is deliberately absent
 *
 * MAANTA is not incorporated and is not registered with the ODPC — the two
 * identifiers on `/privacy` are visible placeholders (`ODPC-DEMO-0000-NOT-
 * REGISTERED`, `CO-DEMO-0000-NOT-INCORPORATED`, `lib/marketing/demo.ts`), and
 * the footer says the company is not yet trading. So the `Organization` block
 * carries **name, url and logo only**.
 *
 * In particular there is no `address`, no `LocalBusiness`, no `legalName`, no
 * `taxID`/`vatID`, and no `aggregateRating`:
 *
 *  - `LocalBusiness` and `address` assert a public place of business. MAANTA has
 *    none: no desk, office or address in BBS Mall until the mall authorises the
 *    relationship (D261). Publishing the mall's address as MAANTA's would be a
 *    claim about MAANTA, not about the mall.
 *  - `legalName` and any registration identifier would have to be a placeholder,
 *    and a placeholder inside machine-readable markup is worse than one on a
 *    page: nothing renders it for a human to notice. `check-tokens.mjs` catches
 *    `{{TOKEN}}` in output, but `CO-DEMO-…` is not a token — it would ship.
 *  - `aggregateRating` needs reviews. There are none, and there must not be
 *    invented ones (`held-claims.test.ts`).
 *
 * These become available as the underlying facts become true, not before. The
 * ordering is the point: incorporate, then say so.
 *
 * ## Why `WebSite` has no `SearchAction`
 *
 * `SearchAction` advertises a search endpoint that accepts a query string. The
 * marketing site has none — `/search` is a shopper-app route behind the app
 * shell, not a public search over marketing content — so declaring one would
 * point Google at a URL that does not answer the question it was promised.
 */

type Json = Record<string, unknown>;

const ORG_ID = "#organization";

/**
 * `Organization`, carried on the home page.
 *
 * The `@id` is a document-relative fragment so `WebSite.publisher` can point at
 * this node rather than repeating it — one entity, referenced twice, which is
 * what stops the two blocks drifting into two different Organizations.
 */
export function organizationSchema(): Json {
  const origin = publicOrigin();
  return {
    "@type": "Organization",
    "@id": `${origin}/${ORG_ID}`,
    name: "MAANTA",
    url: origin,
    logo: `${origin}/icon.svg`,
  };
}

/** `WebSite`, carried on the home page alongside the `Organization`. */
export function websiteSchema(): Json {
  const origin = publicOrigin();
  return {
    "@type": "WebSite",
    url: origin,
    name: "MAANTA",
    inLanguage: "en-KE",
    publisher: { "@id": `${origin}/${ORG_ID}` },
  };
}

/**
 * One question/answer pair, as the accordions already model it, plus the plain
 * text needed to serialise it.
 *
 * `answer` is `React.ReactNode` on the rendered side because several answers
 * carry a link. Schema.org needs a string, so an item whose answer is not
 * already a string must supply `plain`. That is a duplicate sentence, and it is
 * the least-bad option: deriving text by walking the React tree would silently
 * produce a different answer from the one on screen the first time someone
 * nests an element, and a mismatch between the rendered answer and the answer
 * Google quotes is exactly the failure this markup is supposed to avoid.
 */
export type FaqSchemaItem = {
  q: string;
  a: unknown;
  /** Required when `a` is not a plain string. */
  plain?: string;
};

/**
 * `FAQPage` for `/faq`.
 *
 * Only `/faq` emits this. `/help`, `/shoppers`, `/merchants` and
 * `/mall-operators` also render accordions, and marking all of them up would
 * put several `FAQPage` entities on one site answering the same questions —
 * which is how a site ends up competing with itself for the same rich result.
 * `/faq` is the page that exists to be the answer, so it is the page that
 * claims it.
 *
 * Throws rather than skipping when an answer cannot be serialised. A silently
 * shortened `FAQPage` is indistinguishable from a complete one in the output,
 * so the failure has to be loud enough to fail a build.
 */
export function faqPageSchema(items: ReadonlyArray<FaqSchemaItem>): Json {
  const unserialisable = items
    .filter((i) => typeof i.a !== "string" && !i.plain?.trim())
    .map((i) => i.q);

  if (unserialisable.length > 0) {
    throw new Error(
      `faqPageSchema: these answers are not plain strings and have no \`plain\` ` +
        `fallback, so they cannot be published as FAQPage markup: ` +
        `${unserialisable.join(" · ")}`
    );
  }

  return {
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: typeof i.a === "string" ? i.a : (i.plain as string),
      },
    })),
  };
}

/**
 * Wrap one or more entities into a single `@graph` document.
 *
 * One `<script>` per page rather than one per entity: the entities on a page
 * reference each other by `@id`, and a consumer reading them as separate
 * documents cannot resolve those references.
 */
export function jsonLdDocument(...entities: Json[]): Json {
  return { "@context": "https://schema.org", "@graph": entities };
}
