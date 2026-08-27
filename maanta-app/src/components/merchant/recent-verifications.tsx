import { IconCheck } from "@/components/ui/icons";
import { relativeAgo } from "@/lib/ui";

/**
 * The last few verifications at this till (G1).
 *
 * Why it exists: after the success screen auto-skips, the keypad resets to
 * blank and nothing on the counter's own screen says what just happened.
 * "Did that one go through?" — the most common question at a busy counter —
 * could only be answered by leaving the till for /merchant/redemptions.
 *
 * Deliberately INFORMATIONAL ONLY. There is no tap target, no re-verify, no
 * undo and no money action here: verification remains the keypad's single
 * path (preflight → fee disclosure → explicit Confirm) and this list is a
 * read of what that path already did. Nothing here can charge, refund or
 * re-run anything.
 *
 * Identity is minimised exactly as the queue does it — first name + last
 * initial, computed server-side by `staffFacingName`. No phone, no email, no
 * full name, and no money figure: the fee is the merchant's business on the
 * wallet screen, not a line staff read out at the counter.
 */
export type RecentVerification = {
  id: string;
  /** staffFacingName output — never a full name. */
  name: string;
  dealTitle: string;
  verifiedAt: string;
};

export function RecentVerifications({
  items,
  readFailed = false,
}: {
  items: RecentVerification[];
  readFailed?: boolean;
}) {
  // A failed read is NOT "nothing was verified today" (D164/D185). Staff who
  // are told an empty list right after serving someone will reasonably
  // re-verify a code that already went through.
  if (readFailed) {
    return (
      <section className="mt-6 px-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Recent
        </h2>
        <p role="status" className="mt-2 text-xs text-muted">
          Couldn&apos;t load recent verifications. Nothing is wrong with the
          codes you just verified.
        </p>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="mt-6 px-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Recent
      </h2>
      <ul className="mt-2 space-y-1.5">
        {items.map((v) => (
          <li key={v.id} className="flex items-start gap-2">
            <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink" aria-hidden="true" />
            <p className="min-w-0 text-xs text-secondary">
              <span className="font-semibold text-ink">{v.name}</span>
              {" · "}
              <span className="break-words">{v.dealTitle}</span>
              {" — verified "}
              {relativeAgo(v.verifiedAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
