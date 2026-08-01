import type { Metadata } from "next";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { MerchantJoinForm } from "./join-form";

/**
 * `/merchants/join` — the lead form, relocated from `/merchants`.
 *
 * A server shell whose only job is to own the metadata; the form itself is a
 * client component in `join-form.tsx`. See that file for why the split exists.
 */
export const metadata: Metadata = pageMetadata({
  path: "/merchants/join",
  title: "List your shop — MAANTA",
  description:
    "Start listing your shop on MAANTA. Two fields to begin — we will call you to finish setting up, or come to your shop if you are at BBS Mall, Eastleigh.",
});

export default function MerchantJoinPage() {
  return <MerchantJoinForm />;
}
