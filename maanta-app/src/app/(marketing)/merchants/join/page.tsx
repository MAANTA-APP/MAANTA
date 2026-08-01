import type { Metadata } from "next";
import { SUCCESS_FEE_KES } from "@/lib/pricing";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { MerchantJoinForm } from "./join-form";

/**
 * `/merchants/join` — the merchant lead form.
 *
 * A thin server shell around the client form, which is the only reason this file
 * exists separately: `export const metadata` is not permitted in a client
 * component, and this route had no metadata at all until 2026-08-01, so it
 * shipped sharing the homepage's title and search snippet (drift D52). Same
 * split as `/waitlist`.
 *
 * The form itself is in `./join-form.tsx`, with the reasoning about the phone
 * handoff and the onboarding destination.
 */

/**
 * The description names the fee rather than selling the form.
 *
 * This is the page a merchant reaches from a search for "list my shop", and the
 * snippet is the last thing they read before deciding to click. The fee is the
 * single fact that decides whether MAANTA is worth their time, and stating it
 * here means the price is not a surprise waiting on the other side of a form.
 * It reads from `SUCCESS_FEE_KES` for the same reason the body copy does —
 * metadata is rendered output, and a typed fee here is a second place for the
 * frozen number to drift.
 *
 * Wrapped in `pageMetadata` (drift D40) so the route also emits its own
 * canonical and an `og:url` pointing at itself. The description is passed once
 * and reused for `og:description`, which is what a page whose social card and
 * search snippet make the same promise should do.
 */
export const metadata: Metadata = pageMetadata({
  path: "/merchants/join",
  title: "List your shop — MAANTA",
  description: `Put your shop on MAANTA in two fields. No listing fee and no cut of the sale — you pay KES ${SUCCESS_FEE_KES} only when a customer's code is verified at your counter.`,
});

export default function MerchantJoinPage() {
  return <MerchantJoinForm />;
}
