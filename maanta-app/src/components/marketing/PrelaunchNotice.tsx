import { DEMO_MODE, ENTITY } from "@/lib/marketing/demo";

/**
 * Footer line, every marketing page (`demo-mode-spec.md` §3b).
 *
 * Quiet, small, permanently present. This single line is what makes the whole
 * site honest without putting a banner across the marketing pages — which is the
 * distinction risk R1 turns on. A blanket warning over the hero destroys the
 * argument the page is making; a footer line discloses the same fact and costs
 * the page nothing.
 */
export function PrelaunchNotice() {
  if (!DEMO_MODE) return null;

  return (
    <p className="text-[12px] leading-relaxed text-muted">
      <strong className="font-semibold">Pre-launch demonstration.</strong> {ENTITY.name} is
      not yet trading. Legal documents on this site are unreviewed drafts, and any
      registration or licence identifiers shown are placeholders.
    </p>
  );
}
