import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

// §8.2 (Definition of Done): a /demo index page from which the three seeded
// demo logins (shopper / merchant / admin) are reachable. Public, no auth gate.
// All seeded accounts sign in with email OTP at /login — codes land in the
// founder's real inbox via plus-addressing (see supabase/seed/…).
export const metadata: Metadata = {
  title: "MAANTA — Demo & rehearsal logins",
  description:
    "Seeded demo accounts for the MAANTA Node 0 (BBS Mall) launch rehearsal.",
};

type Account = {
  role: string;
  name: string;
  email: string;
  blurb: string;
  landing: string;
};

// Mirrors supabase/seed/node0_rehearsal_seed.sql. Emails are plus-addressed
// variants of one inbox so email-OTP codes are all deliverable.
const ACCOUNTS: Account[] = [
  {
    role: "Shopper",
    name: "Test Shopper",
    email: "aragagency+shopper@gmail.com",
    blurb:
      "Browse live BBS Mall deals, claim one, and open the ticking code card at the counter.",
    landing: "/feed",
  },
  {
    role: "Merchant · Elite",
    name: "Nuur Fashion House",
    email: "aragagency+nuur@gmail.com",
    blurb:
      "Funded wallet (KES 540). Verify the live seeded code 431977 on the keypad to see the success takeover and a −KES 30 ledger row.",
    landing: "/merchant/redeem",
  },
  {
    role: "Merchant · low balance",
    name: "Bilan Beauty & Cosmetics",
    email: "aragagency+bilan@gmail.com",
    blurb:
      "Wallet is KES 20 — below the KES 30 success fee. Verifying still succeeds; the fee is recorded as arrears and settles from the next top-up.",
    landing: "/merchant/wallet",
  },
  {
    role: "Merchant · pending",
    name: "Macmacaan Sweets & Café",
    email: "aragagency+macmacaan@gmail.com",
    blurb:
      "Submitted, not yet activated — use the admin account to run the activation rehearsal.",
    landing: "/merchant",
  },
  {
    role: "Admin",
    name: "Mohamed (Admin)",
    email: "aragagency@gmail.com",
    blurb:
      "Approvals, fraud review (one unresolved merchant-override dispute is seeded), merchant health and agent tasks.",
    landing: "/admin",
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
          Every account below signs in with an <strong>email OTP</strong> at{" "}
          <code className="font-mono text-[13px]">/login</code> — the codes are
          delivered to a single real inbox via plus-addressing. Run{" "}
          <code className="font-mono text-[13px]">
            supabase/seed/node0_rehearsal_seed.sql
          </code>{" "}
          first so these accounts and their deals exist.
        </p>

        {/* The one amber action on this screen: the public deal feed. */}
        <div className="mt-5">
          <ButtonLink href="/feed" variant="primary" size="lg">
            Browse today&apos;s deals — no login
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
                  Go to {a.landing}
                </ButtonLink>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-8 font-mono text-[11px] leading-relaxed text-muted">
          Dev/rehearsal aid only — not linked from the product. Money, codes and
          totals shown after login come from the server (verify_redemption /
          claim_deal), never from this page.
        </p>
      </div>
    </main>
  );
}
