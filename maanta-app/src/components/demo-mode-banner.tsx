import { unstable_noStore as noStore } from "next/cache";
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
 *
 * `noStore()` lives here rather than as a `dynamic` export on each layout so
 * the guarantee travels with the component. `/` and `/for-merchants` are
 * otherwise statically rendered, which would bake in whatever demo mode said at
 * build time — turning demo mode on later would then show synthetic data with
 * no disclosure above it. That is the one failure this component cannot have,
 * and a per-layout export is something a future shell can forget to add.
 */
export async function DemoModeBanner() {
  noStore();
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
