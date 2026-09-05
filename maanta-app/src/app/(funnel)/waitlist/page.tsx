import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isWaitlistTestToken } from "@/lib/growth/waitlist-test-token";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { FACTS, RESPONSE_TIMES } from "@/lib/marketing/facts";
import { parseWaitlistSegmentParam, type WaitlistSegment } from "@/lib/waitlist";
import { AsideChecklist, AsideCopy, CodeTiles, FunnelShell } from "@/components/funnel/funnel-shell";
import { RoleSelect } from "./role-select";
import { SignupForm } from "./signup-form";

type Params = Record<string, string | string[] | undefined>;

/** Next hands a repeated query key over as an array; every param here is single-valued. */
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The public pre-launch waitlist (board 2, M4–M5, M7, M8).
 *
 * Two steps. Step 1 (`/waitlist`) asks which of the three segments describes
 * the visitor; step 2 (`/waitlist?role=…`) asks how to reach them. A merchant
 * is sent to `/merchants/join`, which asks for the unit rather than an inbox —
 * an agent has to find the shop.
 *
 * ## The internal TEST entry point
 *
 * `/waitlist?test=<token>` files a signup the admin Growth console segregates
 * out of every real count. The token is checked HERE, on the server, against
 * `WAITLIST_TEST_TOKEN`, and again in `POST /api/waitlist` — the API never
 * trusts a flag from the body. The test variant is `noindex`: the URL is handed
 * to a person, never linked, and the crawl policy already treats non-content
 * routes this way.
 *
 * The route is dynamic (it reads `searchParams`), so `generateMetadata` is the
 * right tool and `check-server-forms` lists it under the dynamic routes.
 */
export async function generateMetadata({ searchParams }: { searchParams?: Params }): Promise<Metadata> {
  const test = Boolean(first(searchParams?.test));
  return pageMetadata({
    path: "/waitlist",
    title: "Join the MAANTA waitlist",
    description:
      "MAANTA is launching at BBS Mall, Eastleigh — in-mall deals claimed on your phone and redeemed in person. Join the waitlist as a shopper or a merchant.",
    ...(test ? { robots: { index: false, follow: false } } : {}),
  });
}

/** Query keys that travel from step 1 to step 2 untouched. */
const CARRIED = ["test", "email", "utm_source", "utm_medium", "utm_campaign"] as const;

export default function WaitlistPage({ searchParams }: { searchParams?: Params }) {
  const segment = parseWaitlistSegmentParam(first(searchParams?.role) ?? first(searchParams?.segment));
  const testToken = first(searchParams?.test) ?? "";
  const isTest = isWaitlistTestToken(testToken);

  const carry: Record<string, string> = {};
  for (const key of CARRIED) {
    const v = first(searchParams?.[key]);
    if (v) carry[key] = v;
  }

  if (!segment) {
    return (
      <FunnelShell back={{ href: "/", label: "Back to site" }} test={isTest} aside={<RoleAside />}>
        <RoleSelect carry={carry} isTest={isTest} />
      </FunnelShell>
    );
  }

  if (segment === "merchant") {
    const qs = new URLSearchParams(carry).toString();
    redirect(qs ? `/merchants/join?${qs}` : "/merchants/join");
  }

  const changeHref = `/waitlist${Object.keys(carry).length ? `?${new URLSearchParams(carry)}` : ""}`;

  return (
    <FunnelShell
      back={{ href: changeHref, label: "Back" }}
      test={isTest}
      aside={<SegmentAside segment={segment} />}
    >
      <SignupForm
        segment={segment}
        initialEmail={carry.email ?? ""}
        testToken={testToken}
        isTest={isTest}
        changeHref={changeHref}
      />
    </FunnelShell>
  );
}

function RoleAside() {
  return (
    <>
      <AsideCopy title="One list. Three different messages.">
        Shoppers hear when there are deals to claim. Shops hear in time to be
        publishing on day one. Mall operators hear about bringing a node to their
        floors.
      </AsideCopy>
      <CodeTiles />
    </>
  );
}

function SegmentAside({ segment }: { segment: Exclude<WaitlistSegment, "merchant"> }) {
  if (segment === "mall_operator") {
    return (
      <AsideCopy title="Bring a node to your floors.">
        <p>
          A node is {FACTS.nodeLabel}&apos;s shape, repeated: one named contact on our side,
          agents on the floor, and deals that bring people to your shops.
        </p>
        <AsideChecklist
          items={[
            { text: `One message when ${FACTS.nodeLabel} opens, with what it did.` },
            { text: `A reply within ${RESPONSE_TIMES.operator} if you want a pilot conversation sooner.` },
            { text: "No footfall figures we cannot yet stand behind.", negative: true },
          ]}
        />
      </AsideCopy>
    );
  }
  return (
    <AsideCopy title="What you get, and what you don't.">
      <AsideChecklist
        items={[
          { text: "One message the day deals go live at your mall." },
          { text: "A first look before the feed is public." },
          { text: "No marketing blasts, no daily deal spam.", negative: true },
          { text: "No card details. We never take your payment.", negative: true },
        ]}
      />
    </AsideCopy>
  );
}
