import { DEMO_BANNER_TEXT, isDemoModeEnabled } from "@/lib/demo-mode";

/**
 * Demo-mode disclosure.
 *
 * Whenever a surface is showing synthetic shops, deals or codes, it has to say
 * so on the same screen. A screenshot taken during a rehearsal should carry the
 * disclosure with it, so the image cannot later be mistaken for — or presented
 * as — real marketplace traction.
 *
 * Renders nothing at all when demo mode is off, so there is no launch-mode
 * footprint to remember to remove.
 *
 * Deliberately loud rather than tasteful: rust on amber, not a subtle grey
 * footnote. The failure mode this guards against is someone not noticing.
 */
export async function DemoModeBanner() {
  if (!(await isDemoModeEnabled())) return null;

  return (
    <div
      role="status"
      className="border-b border-rust/30 bg-brand-tint px-4 py-2 text-center text-[13px] font-semibold text-rust"
    >
      {DEMO_BANNER_TEXT}
    </div>
  );
}
