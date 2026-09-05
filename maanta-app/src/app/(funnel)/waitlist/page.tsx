import type { Metadata } from "next";
import { isWaitlistTestToken } from "@/lib/growth/waitlist-test-token";
import { collectionAllowed } from "@/lib/marketing/collection-gate";
import { CollectionClosed } from "@/components/funnel/collection-closed";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { parseWaitlistSegmentParam } from "@/lib/waitlist";
import { AsideChecklist, AsideCopy, CodeTiles, FunnelShell } from "@/components/funnel/funnel-shell";
import { PILOT_STATUS_SENTENCE } from "@/lib/marketing/pilot-status";
import { SignupForm } from "./signup-form";

type Params = Record<string, string | string[] | undefined>;

/** Next hands a repeated query key over as an array; every param here is single-valued. */
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The Nairobi pilot-interest form (founder direction 2026-09-05).
 *
 * One step. Email, audience, preferred shopping location, consent — the
 * minimum for one message when a confirmed pilot location and opening date
 * are ready. `?role=` preselects the audience; every audience files to the
 * same list with its segment recorded. (`/merchants/join` remains the
 * unit-level shop registration for once a pilot is confirmed.)
 *
 * ## The collection gate
 *
 * `COLLECTION_GATE` (D274) is closed. Closed means no form and nothing asked
 * for: `CollectionClosed` says registration is temporarily unavailable while
 * the data-handling process is verified, and offers demo access. A verified
 * TEST entry (`?test=<token>`) still passes, so the journey stays testable.
 * The token is checked here and again in `POST /api/waitlist`; the test
 * variant is `noindex`.
 *
 * The route is dynamic (it reads `searchParams`), so `generateMetadata` is the
 * right tool and `check-server-forms` lists it under the dynamic routes.
 */
export async function generateMetadata({ searchParams }: { searchParams?: Params }): Promise<Metadata> {
  const test = Boolean(first(searchParams?.test));
  return pageMetadata({
    path: "/waitlist",
    title: "Join the Nairobi pilot list — MAANTA",
    description:
      "Join for one message when a confirmed MAANTA pilot location and opening date are ready. No location or launch date has been confirmed. Demo access is available now.",
    ...(test ? { robots: { index: false, follow: false } } : {}),
  });
}

export default function WaitlistPage({ searchParams }: { searchParams?: Params }) {
  const segment = parseWaitlistSegmentParam(first(searchParams?.role) ?? first(searchParams?.segment)) ?? "shopper";
  const testToken = first(searchParams?.test) ?? "";
  const isTest = isWaitlistTestToken(testToken);
  const initialEmail = first(searchParams?.email) ?? "";

  // The collection gate (D274). Closed: no form, nothing asked for. A verified
  // test entry passes so the journey stays testable while closed.
  if (!collectionAllowed(isTest)) {
    return (
      <FunnelShell back={{ href: "/", label: "Back to site" }}>
        <CollectionClosed audience="shopper" />
      </FunnelShell>
    );
  }

  return (
    <FunnelShell back={{ href: "/", label: "Back to site" }} test={isTest} aside={<PilotAside />}>
      <SignupForm initialSegment={segment} initialEmail={initialEmail} testToken={testToken} isTest={isTest} />
    </FunnelShell>
  );
}

function PilotAside() {
  return (
    <>
      <AsideCopy title="One list. One message.">
        <p>{PILOT_STATUS_SENTENCE}</p>
        <AsideChecklist
          items={[
            { text: "One email when a pilot location and opening date are confirmed." },
            { text: "Your preferred location helps decide where the pilot runs." },
            { text: "No marketing blasts, no daily deal spam.", negative: true },
            { text: "No card details. MAANTA never takes your payment.", negative: true },
          ]}
        />
      </AsideCopy>
      <CodeTiles />
    </>
  );
}
