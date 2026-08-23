import { getAppUser, getSuccessFee } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";
import { OnboardWizard, type OnboardAgent } from "./onboard-wizard";

export const dynamic = "force-dynamic";

/** 9b–9j Merchant onboarding — server shell fetches the canonical success fee
 * and the roster of active field agents, and hands both to the client wizard.
 * The success fee drives the wallet-step copy; the agent roster powers the G1
 * "Were you helped by a Maanta agent?" attribution picker. The merchant remains
 * the authenticated submitter — the agent is captured as attribution only.
 *
 * `?shop=` comes from the `/merchants/join` signup handoff
 * (`/login?next=/merchant/onboard?shop=…`). Prefilling it is the only durable use
 * of that query param — without it the lead form silently discarded the shop name
 * after login.
 *
 * The phone number deliberately does **not** travel in the URL. It briefly did,
 * which put it in browser history, `Referer` and the PostHog `$current_url` on
 * every event; it now moves through `sessionStorage` and is read by the client
 * wizard (`@/lib/merchant-join-handoff`). Do not add `?phone=` back. */
export default async function MerchantOnboardPage({
  searchParams,
}: {
  searchParams?: { shop?: string };
}) {
  const successFee = await getSuccessFee();

  // D158 — owner phone is optional for an account with a verified email.
  // `users.email` is only ever written from a verified address
  // (`verifiedPrimaryEmail`, frozen by D142), so its presence is the proof.
  // This drives the form only; `/api/merchants/onboard` re-derives the same
  // fact from the session and is the gate that actually enforces it.
  const appUser = await getAppUser();
  const hasVerifiedEmail = Boolean(appUser?.email?.trim());

  const initialShopName = (searchParams?.shop ?? "").trim().slice(0, 120);

  // Active agents only, id + display name. Read with the service client (the
  // signed-in caller is a not-yet-merchant customer with no rights to the
  // agents table); we project just what the picker needs, never PII beyond the
  // agent's display name.
  const service = createServiceClient();
  const { data: agentRows } = await service
    .from("agents")
    .select("id, users(full_name)")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const agents: OnboardAgent[] = (agentRows ?? []).map((a) => {
    const u = a.users as unknown as { full_name: string | null } | null;
    return { id: a.id, name: u?.full_name?.trim() || "Maanta agent" };
  });

  return (
    <OnboardWizard
      successFee={successFee}
      agents={agents}
      initialShopName={initialShopName}
      hasVerifiedEmail={hasVerifiedEmail}
    />
  );
}
