"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PhoneField, TextField } from "@/components/ui/inputs";
import { ENTITY } from "@/lib/marketing/demo";
import { MARKETING_EVENTS, trackMarketing } from "@/lib/marketing/analytics";

/**
 * `/merchants/join` — the lead form, relocated from `/merchants`.
 *
 * Field labels are verified live and deliberately unchanged (`copy/merchants.md`
 * §4). The relocation is sequenced ahead of `/merchants` becoming the marketing
 * page, so merchant acquisition is never dark between commits (risk R2).
 *
 * **The phone number now survives the handoff.** This form previously collected a
 * phone and passed only `?shop=` to onboarding, so the merchant typed their number
 * here and then typed it again two steps into the wizard. Both values are carried
 * through now — same class of defect as the contact form, smaller blast radius.
 *
 * The destination is unchanged: `/login?next=/merchant/onboard?…`. This is a funnel
 * into authenticated onboarding, not a lead-capture endpoint. `/api/leads` exists
 * but is agent-only — it requires a signed-in agent or admin and locks a shop for
 * 48 hours, which is the in-mall field-agent workflow, not public self-serve.
 */
export default function MerchantJoinPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [cc, setCc] = useState("+254");
  const [phone, setPhone] = useState("");

  return (
    <div className="mx-auto max-w-xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">List your shop on MAANTA</h1>
      <p className="mt-3 text-base leading-relaxed text-secondary">
        Two fields to start. We will call you to finish setting up, or come to your shop
        if you are at BBS Mall.
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Records the handoff into onboarding. No shop name, no phone number.
          trackMarketing(MARKETING_EVENTS.formSubmit, { form: "merchant-join" });
          const params = new URLSearchParams({ shop: shopName });
          if (phone.trim()) {
            params.set("phone", phone.trim());
            params.set("cc", cc);
          }
          router.push(`/login?next=${encodeURIComponent(`/merchant/onboard?${params}`)}`);
        }}
      >
        <TextField
          label="Shop name"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          required
        />
        <PhoneField
          label="Phone"
          countryCode={cc}
          onCountryCode={setCc}
          value={phone}
          onChange={setPhone}
        />
        <Button type="submit" full>
          Get started
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-faint">
        Prefer to do it in person? Find us at the MAANTA desk in {ENTITY.address},{" "}
        {ENTITY.city}.
      </p>

      <p className="mt-6 text-center text-xs text-muted">
        By continuing you agree to our{" "}
        <Link href="/merchant-terms" className="underline underline-offset-2 hover:text-ink">
          Merchant Terms
        </Link>
        .
      </p>
    </div>
  );
}
