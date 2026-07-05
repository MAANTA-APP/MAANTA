"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type OnboardState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "success" }
  | { step: "error"; message: string };

export default function MerchantOnboardPage() {
  const router = useRouter();
  const [merchantName, setMerchantName] = useState("");
  const [mallName, setMallName] = useState("");
  const [floor, setFloor] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [what3wordsAddress, setWhat3wordsAddress] = useState("");
  const [phone, setPhone] = useState("+254");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [state, setState] = useState<OnboardState>({ step: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ step: "loading" });
    try {
      const res = await fetch("/api/merchants/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantName,
          mallName,
          floor,
          unitNumber,
          what3wordsAddress,
          phone,
          email,
          whatsapp,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({
          step: "error",
          message: body.error ?? "Could not complete onboarding.",
        });
        return;
      }
      setState({ step: "success" });
    } catch {
      setState({ step: "error", message: "Network error — please try again." });
    }
  }

  if (state.step === "success") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Shop submitted</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Your shop is pending review. We&apos;ll notify you once it&apos;s
          approved and visible to customers.
        </p>
        <button
          onClick={() => router.push("/")}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Back to Home
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">List Your Shop</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Shop name
          <input
            type="text"
            required
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
            className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mall name
          <input
            type="text"
            value={mallName}
            onChange={(e) => setMallName(e.target.value)}
            className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Floor
            <input
              type="text"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Unit number
            <input
              type="text"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          what3words address
          <input
            type="text"
            required
            value={what3wordsAddress}
            onChange={(e) => setWhat3wordsAddress(e.target.value)}
            placeholder="filled.count.soap"
            className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Phone
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+254712345678"
            className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          WhatsApp
          <input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+254712345678"
            className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          disabled={state.step === "loading"}
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {state.step === "loading" ? "Submitting…" : "Submit for Review"}
        </button>
        {state.step === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}
      </form>
    </main>
  );
}
