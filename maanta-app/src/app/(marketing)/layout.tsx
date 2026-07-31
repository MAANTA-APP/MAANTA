import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

/**
 * Marketing shell — header, content, footer.
 *
 * **This layout must not mount `DemoModeBanner`.** It used to, and that was risk
 * R1: every selling page on the site was topped by "Demo mode — sample data for
 * rehearsal. These shops, deals and codes are not real." A merchant or mall
 * operator reading a page that argues MAANTA is operationally serious, under a
 * banner saying none of it is real, does not convert.
 *
 * The banner itself is correct and stays mounted on `(shopper)/layout.tsx` and
 * `merchant/(app)/layout.tsx`, where synthetic deal rows actually render and the
 * disclosure has something to disclose. Marketing pages render no deal data, so
 * there is nothing there for it to be honest about.
 *
 * Pre-launch disclosure on marketing routes is handled properly instead, by three
 * scoped notices rather than one blanket warning (`demo-mode-spec.md` §3):
 * `PrelaunchNotice` in the footer on every page, `LegalDraftBanner` on the four
 * legal routes, and `ScenarioNotice` wherever modelled figures appear.
 *
 * The route group is named `(marketing)`, renamed from `(public)` in this change
 * to match the plan documents. Route groups are URL-invisible, so no path moved.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
