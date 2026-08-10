import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

/**
 * Internal rehearsal aid. Not part of the public conversion path — founder
 * ruling on **D14**, 2026-08-10: demo mode may remain only as an explicitly
 * labelled internal/sales/QA surface, excluded from the public shopper journey.
 *
 * `noindex, nofollow` is the half that was missing. `/demo` is `Disallow`ed in
 * `robots.ts` via `NON_INDEXABLE_PREFIXES`, but `robots.ts`'s own docblock makes
 * the argument that settles this for the legal routes and applies here
 * unchanged: **`Disallow` stops a crawl, not an index.** A disallowed URL that
 * is linked from anywhere can still be listed as a bare URL with no snippet —
 * precisely because the crawler was forbidden from reading the page that would
 * have said `noindex`. A page titled "Demo & rehearsal logins" listed under
 * MAANTA's domain is exactly the impression this route must not make, so it
 * needs the meta tag as well as the disallow, not instead of it.
 *
 * Not gated behind auth, deliberately and per the task's own constraint: it is
 * a login *index* for seeded accounts, it exposes no data of its own, and every
 * account it names is already gated by the real auth flow. Adding an auth wall
 * here would be a new access-control system for a page that grants no access.
 */
export const metadata: Metadata = {
  title: "MAANTA — Demo & rehearsal logins",
  description:
    "Seeded demo accounts for the MAANTA Node 0 (BBS Mall) launch rehearsal.",
  robots: { index: false, follow: false },
};

type Account = {
  role: string;
  name: string;
  email: string;
  blurb: string;
  landing: string;
  paths?: string[];
};

const ACCOUNTS: Account[] = [
  {
    role: "Shopper",
    name: "Test Shopper",
    email: "aragagency+shopper@gmail.com",
    blurb: "Browse BBS Mall deals, claim one, open the ticking code card.",
    landing: "/feed",
  },
  {
    role: "Merchant A · high-performing",
    name: "Nuur Fashion House",
    email: "aragagency+nuur@gmail.com",
    blurb:
      "Elite, KES 540 wallet, 2 live deals, redemption history. Verify OTP 431977 on the keypad.",
    landing: "/merchant/dashboard",
    paths: ["/merchant/deals", "/merchant/redeem", "/merchant/redemptions"],
  },
  {
    role: "Merchant B · onboarding",
    name: "Bilan Beauty & Cosmetics",
    email: "aragagency+bilan@gmail.com",
    blurb:
      "Recently approved (5 days). Two deals, onboarding banner. Wallet KES 20 — fee arrears path.",
    landing: "/merchant/dashboard",
    paths: ["/merchant/deals", "/merchant/wallet", "/merchant/deals/new"],
  },
  {
    role: "Merchant C · churn-risk",
    name: "Hassan Old Town Fabrics",
    email: "aragagency+churn@gmail.com",
    blurb:
      "Previously live, no current deals. Churn-risk banner and empty-state on deals.",
    landing: "/merchant/deals",
    paths: ["/merchant/dashboard", "/merchant/support"],
  },
  {
    role: "Merchant · waitlist",
    name: "Macmacaan Sweets & Café",
    email: "aragagency+macmacaan@gmail.com",
    blurb: "Pending approval — admin activates from /admin/merchants.",
    landing: "/merchant",
    paths: ["/merchant/dashboard"],
  },
  {
    role: "Admin / founder",
    name: "Mohamed (Admin)",
    email: "aragagency@gmail.com",
    blurb: "Full platform: approvals, disputes, reports, founder KPIs.",
    landing: "/admin",
    paths: ["/admin/merchants", "/admin/redemptions", "/founder"],
  },
  {
    role: "Support / disputes",
    name: "Sara Disputes Ops",
    email: "aragagency+support@gmail.com",
    blurb: "Admin role focused on redemption disputes and support queue.",
    landing: "/admin/redemptions",
    paths: ["/admin/support"],
  },
  {
    role: "Field agent",
    name: "Amina Field Agent",
    email: "aragagency+agent@gmail.com",
    blurb: "Leads, mall visits, churn outreach for Hassan Fabrics.",
    landing: "/agent",
    paths: ["/agent/leads", "/agent/leads/new"],
  },
];

export default function DemoPage() {
  return (
    <main className="min-h-dvh bg-paper px-5 py-10 text-ink">
      <div className="mx-auto w-full max-w-3xl">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Node 0 · BBS Mall, Eastleigh
        </p>
        <h1 className="mt-2 text-2xl font-bold">Demo &amp; rehearsal logins</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary">
          Sign in with <strong>email OTP</strong> at{" "}
          <code className="font-mono text-[13px]">/login</code>. Apply{" "}
          <code className="font-mono text-[13px]">node0_rehearsal_seed.sql</code> then{" "}
          <code className="font-mono text-[13px]">node0_ops_personas_seed.sql</code>.
          Full persona map:{" "}
          <code className="font-mono text-[13px]">docs/ops/test-accounts.md</code>.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/feed" variant="primary" size="lg">
            Browse today&apos;s deals — no login
          </ButtonLink>
          <ButtonLink href="/download" variant="ghost" size="lg">
            Install the app
          </ButtonLink>
        </div>

        <ul className="mt-8 flex flex-col gap-3">
          {ACCOUNTS.map((a) => (
            <li
              key={a.email}
              className="rounded-card border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {a.role}
                  </span>
                  <span className="text-sm font-semibold">{a.name}</span>
                </div>
                <code className="font-mono text-[13px] text-secondary">
                  {a.email}
                </code>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-secondary">
                {a.blurb}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink href="/login" variant="ghost" size="sm">
                  Sign in
                </ButtonLink>
                <ButtonLink href={a.landing} variant="ghost" size="sm">
                  {a.landing}
                </ButtonLink>
                {(a.paths ?? []).map((p) => (
                  <ButtonLink key={p} href={p} variant="ghost" size="sm">
                    {p}
                  </ButtonLink>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-8 font-mono text-[11px] leading-relaxed text-muted">
          Dev/rehearsal aid only — not linked from the product. Lifecycle paths:{" "}
          <code>docs/ops/merchant-lifecycle.md</code>.
        </p>
      </div>
    </main>
  );
}
