"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PhoneField, TextField, inputClass } from "@/components/ui/inputs";
import { IconArrowLeft } from "@/components/ui/icons";
import { cn } from "@/lib/ui";

/** 11i Agent lead capture — "Save lead — locks for 48h". */
export function NewLeadForm() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [cc, setCc] = useState("+254");
  const [phone, setPhone] = useState("");
  const [floorUnit, setFloorUnit] = useState("");
  const [w3w, setW3w] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: shopName.trim(),
          ownerName: ownerName.trim() || null,
          phone: phone.trim()
            ? `${cc}${phone.replace(/\D/g, "").replace(/^0+/, "")}`
            : null,
          unitNumber: floorUnit.trim() || null,
          what3words: w3w.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const body = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(body.error ?? "Could not save the lead.");
        return;
      }
      router.push("/agent/leads");
      router.refresh();
    } catch {
      setBusy(false);
      setError("Network error — try again.");
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-mobile border-x border-line bg-white px-5 pb-10 pt-5">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/agent" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-center text-lg font-bold text-ink">New lead</h1>
        <span className="w-7" />
      </div>

      <div className="space-y-4">
        <TextField
          label="Shop name"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Business owner name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
          <PhoneField
            label="Owner phone"
            countryCode={cc}
            onCountryCode={setCc}
            value={phone}
            onChange={setPhone}
          />
        </div>
        <TextField
          label="Floor / unit"
          value={floorUnit}
          onChange={(e) => setFloorUnit(e.target.value)}
        />
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">what3words</span>
          <input
            value={w3w}
            onChange={(e) => setW3w(e.target.value)}
            placeholder="///rally.plank.spark"
            className={cn(inputClass, "font-mono")}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={cn(inputClass, "h-auto py-3")}
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 text-sm font-medium text-ink" role="alert">
          {error}
        </p>
      ) : null}

      <Button full className="mt-6" onClick={save} loading={busy} disabled={!shopName.trim()}>
        Save lead — locks for 48h
      </Button>
    </main>
  );
}
