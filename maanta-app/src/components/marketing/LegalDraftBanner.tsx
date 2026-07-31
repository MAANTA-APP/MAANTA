import { DEMO_MODE, ENTITY } from "@/lib/marketing/demo";

/**
 * Legal pages only — `/privacy`, `/terms`, `/merchant-terms`, `/cookies`
 * (`demo-mode-spec.md` §3a). Full-width, above the title, not dismissible.
 *
 * This is the one place on the site where an alert style is correct. Everywhere
 * else, warning treatment is wrong: the marketing pages are making an argument
 * and a banner across them undermines it. Here the document itself is the risk —
 * an unreviewed draft that reads like a contract — so the treatment matches.
 *
 * Uses `rust` (#9A4A0C), the frozen warning token. Never amber: `#FDBF2D` is
 * reserved for CTAs and live-status, and the frozen UI rules keep warnings off
 * yellow entirely.
 *
 * Paired with `noindex` on all four routes while this banner is live — a draft
 * legal document indexed by Google is a liability that outlives the draft. That
 * is applied in each page's `metadata`, driven by the same `DEMO_MODE` flag.
 */
export function LegalDraftBanner() {
  if (!DEMO_MODE) return null;

  return (
    <div
      role="note"
      aria-label="Draft document notice"
      className="rounded-card border border-rust/30 bg-brand-tint px-5 py-4"
    >
      <p className="text-sm font-bold text-rust">⚠️ DRAFT — NO LEGAL STANDING</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink">
        This document is an unreviewed draft, published as part of a pre-launch
        demonstration of MAANTA. It has <strong className="font-semibold">not</strong> been
        reviewed by a lawyer. It does not create any rights or obligations, it is not a
        contract, and it must not be relied on by anyone. Registration and licence numbers
        shown are placeholders and do not refer to any real registration.
      </p>
      <p className="mt-2 text-[13px] text-secondary">
        Questions:{" "}
        <a className="underline underline-offset-2 hover:text-ink" href={`mailto:${ENTITY.email}`}>
          {ENTITY.email}
        </a>
      </p>
    </div>
  );
}
