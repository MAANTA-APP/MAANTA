/**
 * Pre-launch disclosure — one flag governs the lot (`demo-mode-spec.md` §5).
 *
 * `LegalDraftBanner`, `PrelaunchNotice` and `PlaceholderId` all read `DEMO_MODE`,
 * so flipping it to `false` removes every pre-launch disclosure in one commit
 * rather than leaving someone to hunt for the last one.
 *
 * **This is not the app's demo mode.** `@/lib/demo-mode` is a different switch
 * for a different thing: it reads `app_config.demo_mode_enabled` from Postgres and
 * governs the banner that says the *deal data* is synthetic. That banner belongs
 * on app routes only — it renders on shopper and merchant surfaces where seeded
 * rows actually appear. This constant governs the *marketing site's* disclosure
 * that MAANTA is not yet trading and its legal documents are unreviewed drafts.
 * Conflating the two is what produced risk R1.
 *
 * A plain constant rather than an environment variable, per the spec. Scenario
 * mode is env-driven because it differs per deployment; pre-launch status does
 * not — the company is either trading or it is not, and it is not.
 */
export const DEMO_MODE = true;

/**
 * Placeholder regulatory identifiers, deliberately unmistakable rather than
 * realistic.
 *
 * `demo-mode-spec.md` §2 makes the argument: a plausible-looking licence number
 * like `CBK/PSP/2026/0147` is the version that causes real harm, because
 * disclaimers get cropped out of screenshots and a fabricated regulatory
 * authorisation shown to a merchant, a mall operator or a regulator is a serious
 * matter. Self-evidently fake reads as deliberate; plausible reads as caught out.
 *
 * **`cbk` is intentionally absent.** Decision of 2026-07-31: no CBK licence
 * identifier renders anywhere, not even a placeholder, because MAANTA may not
 * need CBK authorisation at all — a closed-loop prepaid balance spendable only on
 * MAANTA's own fees is arguably not e-money. Showing even a fake licence
 * advertises a requirement the company may never have. The
 * `RegulatoryStatus` block is rendered instead.
 *
 * Every value here must render through `<PlaceholderId>`, never as plain text.
 */
export const PLACEHOLDER_IDS = {
  odpc: "ODPC-DEMO-0000-NOT-REGISTERED",
  company: "CO-DEMO-0000-NOT-INCORPORATED",
  pin: "PIN-DEMO-0000-NOT-REGISTERED",
} as const;

/** Entity details, filled in 2026-07-31 (`demo-mode-spec.md` §1). */
export const ENTITY = {
  name: "MAANTA APP",
  address: "BBS Mall, Eastleigh",
  city: "Nairobi",
  country: "Kenya",
  founder: "Mohamed Elmi",
  whatsapp: "+44 7746 170752",
  whatsappLink: "https://wa.me/447746170752",
  email: "admin@maanta.app",
} as const;

/**
 * Full registered line for the footer base bar and legal documents.
 * "MAANTA APP, BBS Mall, Eastleigh, Nairobi, Kenya"
 */
export const ENTITY_LINE = `${ENTITY.name}, ${ENTITY.address}, ${ENTITY.city}, ${ENTITY.country}`;

/**
 * Regulatory status — rendered in place of any licence identifier.
 * Wording is verbatim from `demo-mode-spec.md` §2 and must not be paraphrased:
 * it is a carefully hedged statement about a regulated activity.
 */
export const REGULATORY_STATUS =
  `${ENTITY.name} is not yet licensed or registered with any Kenyan regulator. ` +
  "The merchant balance operates as closed-loop prepaid credit for MAANTA fees only, " +
  "and our position under the Central Bank of Kenya's payment services regime is under review. " +
  "Data protection registration with the ODPC is in progress.";

/**
 * The date the legal drafts carry. Generated from one constant rather than typed
 * per document — the token register flags `{{lastUpdated}}` as "Build — generate,
 * never type", because four documents with three different dates is how a reader
 * learns not to trust any of them.
 */
export const LEGAL_LAST_UPDATED = "31 July 2026";
