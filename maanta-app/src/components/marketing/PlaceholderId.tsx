import { DEMO_MODE } from "@/lib/marketing/demo";

/**
 * Renders a placeholder regulatory identifier so it can never be mistaken for a
 * real one: monospace face, dotted underline, and a `Placeholder` badge. Never
 * render these values as plain text (`demo-mode-spec.md` §2).
 *
 * The visual treatment is doing real work. The risk is not someone reading the
 * page carefully — it is a screenshot, cropped past the disclaimer, shown to a
 * merchant or a regulator. A monospace string with a badge attached survives that
 * crop; a bare number does not.
 *
 * **Throws in development when `DEMO_MODE` is false and the value still contains
 * `-DEMO-`.** A placeholder identifier cannot reach production silently: either
 * the real identifier has been filled in, or the block is deleted, and the launch
 * checklist in `demo-mode-spec.md` §4 says exactly that.
 */
export function PlaceholderId({ value, label }: { value: string; label?: string }) {
  if (!DEMO_MODE && /-DEMO-/.test(value)) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        `<PlaceholderId> rendered "${value}" with DEMO_MODE off. A placeholder ` +
          "identifier must not reach production — replace it with the real " +
          "identifier or remove the block. See docs/ops/demo-mode-spec.md §4."
      );
    }
    // Production safety net: render nothing rather than a fake identifier.
    return null;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {label ? <span className="text-muted">{label}</span> : null}
      <span className="font-mono text-[13px] underline decoration-dotted underline-offset-4 text-secondary">
        {value}
      </span>
      <span className="inline-flex items-center rounded border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        Placeholder
      </span>
    </span>
  );
}
