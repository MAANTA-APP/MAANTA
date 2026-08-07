import { DEMO_MODE, REGULATORY_STATUS } from "@/lib/marketing/demo";

/**
 * The regulatory status block DECIDED 2026-07-31 (`demo-mode-spec.md` §2):
 * rendered in place of any licence identifier, because MAANTA may not need CBK
 * authorisation at all and even a fake licence number advertises a requirement
 * the company may never have. A mall operator reading this sees a company that
 * has thought about regulation; a fake licence number, once noticed, says the
 * opposite.
 *
 * The wording is `REGULATORY_STATUS` verbatim — a carefully hedged statement
 * about a regulated activity that must not be paraphrased here. Placement per
 * the spec: the footer legal block, and a section in `/merchant-terms` above
 * clause 7 (via the `{{REGULATORY_STATUS}}` token).
 *
 * Pre-launch disclosure, so `DEMO_MODE` governs it like `LegalDraftBanner` and
 * `PrelaunchNotice` — flipping the flag removes every disclosure in one commit
 * (spec §5).
 */
export function RegulatoryStatus({ className = "" }: { className?: string }) {
  if (!DEMO_MODE) return null;
  return (
    <div className={`max-w-3xl ${className}`}>
      <p className="text-[12px] font-semibold text-ink">
        Regulatory status — pre-launch
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        {REGULATORY_STATUS}
      </p>
    </div>
  );
}
