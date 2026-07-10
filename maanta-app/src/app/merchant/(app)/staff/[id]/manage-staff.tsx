"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/inputs";
import { IconArrowLeft } from "@/components/ui/icons";
import { maskPhone } from "@/lib/ui";

type Perms = { canVerify: boolean; canDeals: boolean; canTopup: boolean; canPurchase: boolean };

export function ManageStaff({
  staffId,
  name,
  phone,
  initial,
}: {
  staffId: string;
  name: string;
  phone: string;
  initial: Perms;
}) {
  const router = useRouter();
  const [perms, setPerms] = useState<Perms>(initial);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy("save");
    setError(null);
    const res = await fetch(`/api/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(perms),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save.");
      return;
    }
    router.push("/merchant/staff");
    router.refresh();
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    const res = await fetch(`/api/staff/${staffId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove.");
      return;
    }
    router.push("/merchant/staff");
    router.refresh();
  }

  return (
    <main className="flex min-h-[70dvh] flex-col px-5 pt-5">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/merchant/staff" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-center text-lg font-bold text-ink">Permissions</h1>
        <span className="w-7" />
      </div>

      <p className="text-sm font-semibold text-ink">
        What can {name} do? <span className="font-normal text-muted">· {maskPhone(phone)}</span>
      </p>
      <div className="mt-2 divide-y divide-line rounded-card border border-line bg-white px-4">
        <Toggle
          label="Verify redemptions"
          sub="Enter codes at the counter"
          checked={perms.canVerify}
          onChange={(v) => setPerms((p) => ({ ...p, canVerify: v }))}
        />
        <Toggle
          label="Create & edit deals"
          sub="Publish, pause, archive"
          checked={perms.canDeals}
          onChange={(v) => setPerms((p) => ({ ...p, canDeals: v }))}
        />
        <Toggle
          label="Top up wallet"
          sub="M-Pesa / card top-ups"
          checked={perms.canTopup}
          onChange={(v) => setPerms((p) => ({ ...p, canTopup: v }))}
        />
        <Toggle
          label="Purchase boosts & plan"
          sub="Spend from wallet"
          checked={perms.canPurchase}
          onChange={(v) => setPerms((p) => ({ ...p, canPurchase: v }))}
        />
      </div>
      <p className="mt-3 text-xs text-faint">The owner always keeps full access.</p>
      {error ? <p className="mt-3 text-sm font-medium text-flame">{error}</p> : null}

      <div className="mt-auto space-y-3 pt-8">
        <Button full onClick={save} loading={busy === "save"}>
          Save changes
        </Button>
        <Button
          variant="destructive-outline"
          full
          onClick={remove}
          loading={busy === "remove"}
        >
          Remove staff member
        </Button>
      </div>
    </main>
  );
}
