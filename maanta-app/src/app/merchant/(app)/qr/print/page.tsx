import { redirect } from "next/navigation";
import { getMerchantContext } from "@/lib/merchant";
import { createServiceClient } from "@/lib/supabase/service";
import { publicOrigin } from "@/lib/app-url";
import { CounterQr } from "@/components/merchant/counter-qr";

export const dynamic = "force-dynamic";

/**
 * The printable counter/entrance sheet (G4).
 *
 * OWNER ONLY, enforced server-side: `getMerchantContext().isOwner` gates the
 * whole page and a staff seat is redirected away, exactly as the dashboard's
 * QR card is gated. The token is read with the service client and never
 * reaches the client as text — only as the QR's encoded value.
 *
 * ## What the sheet says, and why so little
 *
 * A merchant asked to print "a black square" prints it crooked, small, or not
 * at all, so the sheet carries the MAANTA name, one instruction, and one
 * expectation-setting line — nothing else.
 *
 * It deliberately does NOT promise points or rewards. Fast Visit is behind a
 * feature gate that may be off, may be changed, or may be withdrawn, and a
 * sticker is the one MAANTA surface that cannot be updated remotely: a wall
 * promising a reward the app no longer gives is worse than a wall that
 * promised nothing. It also carries no merchant id, no token text and no
 * shop-identifying code — the QR is the only machine-readable thing on it.
 *
 * One sheet serves both placements. The same token goes at the entrance and
 * at the till (founder ruling): the shopper's own state decides what the
 * landing page does, so nothing on the sheet needs to say where it hangs.
 */
export default async function CounterQrPrintPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null; // layout guards
  const { merchant, isOwner } = res.ctx;
  if (!isOwner) redirect("/merchant/redeem");

  const { data: tokenRow } = await createServiceClient()
    .from("merchants")
    .select("qr_token")
    .eq("id", merchant.id)
    .maybeSingle<{ qr_token: string | null }>();

  const token = tokenRow?.qr_token ?? null;

  if (!token) {
    return (
      <main className="px-4 pt-5">
        <h1 className="text-2xl font-bold text-ink">Counter QR</h1>
        <p className="mt-2 text-sm text-secondary">
          This shop has no check-in code yet. Contact MAANTA support and we
          will sort it out — shoppers can still claim and redeem deals with the
          6-digit code in the meantime.
        </p>
      </main>
    );
  }

  const url = `${publicOrigin()}/qr/${token}`;

  return (
    <main className="px-4 pb-10 pt-5">
      {/* Screen-only chrome. `print:hidden` keeps every one of these off the
          paper, so what prints is exactly the sheet below. */}
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-ink">Counter QR</h1>
        <p className="mt-1.5 text-sm text-secondary">
          Print this and put it where shoppers can reach it — the shop entrance
          and the till. One code works in both places.
        </p>
        <p className="mt-3 text-xs text-muted">
          Shoppers scan it to check in when they arrive. You still verify their
          6-digit code at the counter exactly as you do now.
        </p>
      </div>

      {/* The sheet itself. Centred, high-contrast, and sized so it stays
          scannable from arm's length when printed at A5 or A4. */}
      <section className="mx-auto mt-6 max-w-sm rounded-card border-2 border-ink bg-white p-6 text-center print:mt-0 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <p className="text-xl font-black tracking-tight text-ink print:text-3xl">
          MAANTA
        </p>
        <p className="mt-1 text-sm font-semibold text-ink print:text-lg">
          Scan when you arrive
        </p>

        <div className="mt-5 flex justify-center print:mt-8">
          <CounterQr url={url} size={200} className="h-auto w-full max-w-[200px] print:max-w-[320px]" />
        </div>

        <p className="mt-5 text-sm leading-relaxed text-secondary print:mt-8 print:text-base print:text-black">
          Open MAANTA and scan this code to check in.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-secondary print:text-base print:text-black">
          Staff will verify your deal separately.
        </p>
      </section>

      <div className="mx-auto mt-6 max-w-sm print:hidden">
        <p className="text-xs text-muted">
          Tip: print at A5 or larger. Test it with your own phone before you
          stick it up.
        </p>
      </div>
    </main>
  );
}
