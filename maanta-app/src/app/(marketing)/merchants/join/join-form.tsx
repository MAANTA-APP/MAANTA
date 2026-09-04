"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PhoneField, TextField } from "@/components/ui/inputs";
import { ENTITY } from "@/lib/marketing/demo";
import { CLOSED_FORM_COPY, isFormCollecting } from "@/lib/marketing/forms";
import { MARKETING_EVENTS, trackMarketing } from "@/lib/marketing/analytics";
import { stashMerchantJoin } from "@/lib/merchant-join-handoff";

/**
 * The `/merchants/join` lead form.
 *
 * Field labels are verified live and deliberately unchanged (`copy/merchants.md`
 * §4). The relocation from `/merchants` was sequenced ahead of that page becoming
 * the marketing page, so merchant acquisition is never dark between commits
 * (risk R2).
 *
 * **The phone number survives the handoff without entering the URL.** This form
 * previously collected a phone and passed only `?shop=` to onboarding, so the
 * merchant typed their number here and again two steps into the wizard. Carrying
 * it as a query parameter fixed that and created a worse problem — the number
 * landed in history, in `Referer`, and in the PostHog `$current_url` on every
 * event — so it travels in `sessionStorage` instead
 * (`@/lib/merchant-join-handoff`). The shop name stays in the URL: it is about to
 * be published on a public feed, and keeping it there means a merchant who lands
 * on onboarding in a fresh tab loses only the phone prefill.
 *
 * The destination is unchanged: `/login?next=/merchant/onboard?…`. This is a
 * funnel into authenticated onboarding, not a lead-capture endpoint.
 * `/api/leads` exists but is agent-only — it requires a signed-in agent or admin
 * and locks a shop for 48 hours, which is the in-mall field-agent workflow, not
 * public self-serve.
 *
 * **Nothing is stored by this form.** That is why it stays open under the
 * 2026-09-04 form-safety ruling while `/contact` and `/waitlist` are closed:
 * there is no destination to prove, and the data is written only inside
 * authenticated onboarding, which is Merchant 01's path. `FORM_STATUS` in
 * `lib/marketing/forms.ts` can still close it with one word (D273).
 *
 * **No call or visit is promised.** "We will call you to finish setting up, or
 * come to your shop if you are at BBS Mall" is removed unconditionally — D5 is
 * open, so nobody exists to make that call or that visit (ruling `10 §4.1`).
 *
 * **Split out of `page.tsx` so the route can export `metadata`** (drift D52) — a
 * client component may not. It deliberately does **not** call `useSearchParams`
 * and is not wrapped in `Suspense`, so it still server-renders: that pairing is
 * exactly what made `/contact`'s form absent from server HTML (drift D41), and
 * `waitlist-form.tsx` is the in-repo precedent for getting this right.
 */
export function MerchantJoinForm() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [cc, setCc] = useState("+254");
  const [phone, setPhone] = useState("");

  if (!isFormCollecting("merchantJoin")) {
    return (
      <div className="mx-auto max-w-xl px-5 py-14">
        <h1 className="text-3xl font-black text-ink">{CLOSED_FORM_COPY.merchantJoin.heading}</h1>
        <p className="mt-3 text-base leading-relaxed text-secondary">
          {CLOSED_FORM_COPY.merchantJoin.body}
        </p>
        <p className="mt-3 text-base leading-relaxed text-ink">
          If you have a shop at BBS Mall, Eastleigh and want to hear from us first, email{" "}
          <a className="font-semibold underline underline-offset-4" href={`mailto:${ENTITY.email}`}>
            {ENTITY.email}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">List your shop on MAANTA</h1>
      <p className="mt-3 text-base leading-relaxed text-secondary">
        Two fields to start. We will be in touch before we open at BBS Mall.
      </p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Records the handoff into onboarding. No shop name, no phone number.
          trackMarketing(MARKETING_EVENTS.formSubmit, { form: "merchant-join" });
          if (phone.trim()) stashMerchantJoin({ cc, phone: phone.trim() });
          const params = new URLSearchParams({ shop: shopName });
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
