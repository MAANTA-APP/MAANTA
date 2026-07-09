"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { ImageUploader, TextField, FlashSlider, inputClass } from "@/components/ui/inputs";
import { IconArrowLeft, IconBolt } from "@/components/ui/icons";
import { PlanChip, StatusChip } from "@/components/ui/chips";
import { cn, formatKes } from "@/lib/ui";

type Step = "type" | "details" | "schedule" | "review";

/** 9n type select (plan compare) → 9o details (cover REQUIRED) → 9p/9q schedule → 9s review. */
export function NewDealWizard({
  tier,
  fee,
  canDeals,
}: {
  tier: "standard" | "elite";
  fee: number;
  canDeals: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("type");
  const [dealType, setDealType] = useState<"standard" | "flash">("standard");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxClaims, setMaxClaims] = useState("100");
  const [flashHours, setFlashHours] = useState(6);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isElite = tier === "elite";

  if (!canDeals) {
    return (
      <main className="px-6 py-24 text-center">
        <p className="text-sm font-semibold text-ink">
          You don&apos;t have permission to create deals.
        </p>
        <p className="mt-1 text-xs text-muted">Ask the shop owner to enable it in Staff.</p>
      </main>
    );
  }

  async function publish() {
    if (!cover) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("title", title.trim());
    form.set("description", description.trim());
    form.set("dealType", dealType);
    form.set("flashHours", String(flashHours));
    form.set("maxClaims", maxClaims);
    form.set("cover", cover);
    try {
      const res = await fetch("/api/deals", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not publish.");
        setBusy(false);
        return;
      }
      router.push(`/merchant/deals/${body.dealId}`);
      router.refresh();
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  }

  function Header({ title: t, back }: { title: string; back: Step | null }) {
    return (
      <div className="mb-6 flex items-center gap-3">
        {back ? (
          <button type="button" onClick={() => setStep(back)} aria-label="Back" className="p-1">
            <IconArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link href="/merchant/deals" aria-label="Back" className="p-1">
            <IconArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="flex-1 text-center text-lg font-bold text-ink">{t}</h1>
        <span className="w-7" />
      </div>
    );
  }

  return (
    <main className="flex min-h-[70dvh] flex-col px-5 pt-5">
      {step === "type" ? (
        <>
          <Header title="New deal" back={null} />

          <button
            type="button"
            onClick={() => setDealType("standard")}
            className={cn(
              "flex w-full items-center justify-between rounded-card border bg-white px-4 py-4 text-left",
              dealType === "standard" ? "border-2 border-ink" : "border-line"
            )}
          >
            <span className="text-base font-bold text-ink">Standard</span>
            {dealType === "standard" ? <StatusChip status="selected" label="Selected" /> : null}
          </button>

          <button
            type="button"
            disabled={!isElite}
            onClick={() => isElite && setDealType("flash")}
            className={cn(
              "mt-3 flex w-full items-center justify-between rounded-card border bg-white px-4 py-4 text-left",
              dealType === "flash" ? "border-2 border-ink" : "border-line",
              !isElite && "opacity-70"
            )}
          >
            <span className="flex items-center gap-1.5 text-base font-bold text-ink">
              <IconBolt className="h-4 w-4 text-flame" />
              Flash
            </span>
            {isElite ? (
              dealType === "flash" ? (
                <StatusChip status="selected" label="Selected" />
              ) : null
            ) : (
              <span className="rounded-full bg-cream-dark px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                Elite only — Upgrade
              </span>
            )}
          </button>

          {/* Plan compare table (9n) */}
          <div className="mt-6 overflow-hidden rounded-card border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-semibold">Compare</th>
                  <th className="px-2 py-2.5 text-center font-semibold">Standard</th>
                  <th className="bg-brand px-2 py-2.5 text-center font-bold text-ink">Elite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                <tr>
                  <td className="px-4 py-2.5 text-ink">Active deals at once</td>
                  <td className="px-2 py-2.5 text-center">1</td>
                  <td className="px-2 py-2.5 text-center font-bold">2</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-ink">⚡ Flash deals</td>
                  <td className="px-2 py-2.5 text-center text-faint">—</td>
                  <td className="px-2 py-2.5 text-center">✓</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-ink">Boosts</td>
                  <td className="px-2 py-2.5 text-center text-faint">—</td>
                  <td className="px-2 py-2.5 text-center">✓</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-ink">Monthly</td>
                  <td className="px-2 py-2.5 text-center text-faint">—</td>
                  <td className="px-2 py-2.5 text-center font-bold">KES 3,500</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">
            Both plans pay the {formatKes(fee)} success fee per verified redemption.
          </p>

          <div className="mt-auto space-y-3 pt-8">
            <Button full onClick={() => setStep("details")}>
              Continue
            </Button>
            {!isElite ? (
              <ButtonLink href="/merchant/plan/upgrade" variant="ghost" full>
                Upgrade to Elite
              </ButtonLink>
            ) : null}
          </div>
        </>
      ) : null}

      {step === "details" ? (
        <>
          <Header title="Details" back="type" />
          <ImageUploader
            previewUrl={coverPreview}
            onFile={(f) => {
              setCover(f);
              setCoverPreview(URL.createObjectURL(f));
            }}
          />
          <div className="mt-4 space-y-4">
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="20% off all fabric"
            />
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                Description (optional)
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={cn(inputClass, "h-auto py-3")}
              />
            </label>
          </div>
          <div className="mt-auto pt-8">
            <Button full disabled={!cover || !title.trim()} onClick={() => setStep("schedule")}>
              Continue
            </Button>
            <p className="mt-2 text-center text-xs text-flame">
              {!cover || !title.trim() ? "Add a cover image and title to continue" : " "}
            </p>
          </div>
        </>
      ) : null}

      {step === "schedule" ? (
        <>
          <Header title={dealType === "flash" ? "Flash duration" : "Schedule"} back="details" />
          {dealType === "standard" ? (
            <>
              <div className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
                <span className="text-sm font-semibold text-ink">Duration</span>
                <span className="text-sm font-bold text-ink">Fixed — 24 hours</span>
              </div>
              <div className="mt-4">
                <TextField
                  label="Max claims"
                  inputMode="numeric"
                  value={maxClaims}
                  onChange={(e) => setMaxClaims(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </>
          ) : (
            <>
              <FlashSlider hours={flashHours} onChange={setFlashHours} />
              <div className="mt-4">
                <TextField
                  label="Max claims"
                  inputMode="numeric"
                  value={maxClaims}
                  onChange={(e) => setMaxClaims(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </>
          )}
          <div className="mt-auto pt-8">
            <Button full onClick={() => setStep("review")}>
              {dealType === "flash" ? "Review flash deal" : "Review deal"}
            </Button>
          </div>
        </>
      ) : null}

      {step === "review" ? (
        <>
          <Header title="Review" back="schedule" />
          <div className="flex items-center gap-3 rounded-card border border-line bg-white p-3.5">
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverPreview}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {dealType === "flash" ? `Flash · ${flashHours}h` : "Standard · 24h"}
                {maxClaims ? ` · max ${maxClaims} claims` : ""}
              </p>
            </div>
            <PlanChip plan={dealType === "flash" ? "elite" : "standard"} />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
            <span className="text-xs text-muted">Goes live</span>
            <span className="text-sm font-semibold text-ink">Immediately</span>
          </div>
          <p className="mt-3 text-xs text-muted">
            You pay a {formatKes(fee)} success fee per verified redemption. Nothing else.
          </p>
          {error ? <p className="mt-3 text-sm font-medium text-flame">{error}</p> : null}
          <div className="mt-auto space-y-3 pt-8">
            <Button full onClick={publish} loading={busy}>
              {dealType === "flash" ? "Publish flash deal" : "Publish deal"}
            </Button>
            <Button variant="ghost" full onClick={() => setStep("details")}>
              Back to edit
            </Button>
          </div>
        </>
      ) : null}
    </main>
  );
}
