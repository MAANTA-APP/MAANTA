"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PhoneField, TextField } from "@/components/ui/inputs";
import { IconCheck } from "@/components/ui/icons";

/** 12m Merchant signup landing (lead-gen) — funnels into the onboarding wizard. */
export default function MerchantSignupPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [cc, setCc] = useState("+254");
  const [phone, setPhone] = useState("");

  return (
    <main className="mx-auto max-w-xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">Pay only for verified redemptions</h1>
      <ul className="mt-6 space-y-2.5">
        {[
          "KES 30 success fee per verified redemption — nothing else",
          "No listing fees, no percentage cut",
          "Boost any deal for KES 500 / 24h",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-sm font-semibold text-ink">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
            {line}
          </li>
        ))}
      </ul>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
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
      <p className="mt-3 text-center text-xs text-faint">
        Or ask a Maanta agent at BBS Mall to sign you up in person.
      </p>
    </main>
  );
}
