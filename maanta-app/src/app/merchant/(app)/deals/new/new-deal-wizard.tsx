"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { ImageUploader, TextField, FlashSlider, inputClass } from "@/components/ui/inputs";
import { InlineAlert } from "@/components/ui/inline-alert";
import { IconArrowLeft, IconBolt, IconPlus, IconX, IconCheck } from "@/components/ui/icons";
import { PlanChip } from "@/components/ui/chips";
import { cn, formatKes } from "@/lib/ui";
import { extrasTotal, youPay, type DealCharge } from "@/lib/pricing";
import { shouldPromptTopUp } from "@/lib/merchant-wallet";

type Step = "type" | "details" | "price" | "schedule" | "review";
type ChargeDraft = { id: string; label: string; type: "fixed" | "percent"; value: string };
type ExtrasChoice = "none" | "extras" | null;

/** 9n type select (plan compare) → 9o details (cover REQUIRED) → 9p/9q schedule → 9s review. */
export function NewDealWizard({
  tier,
  fee,
  canDeals,
  balance,
}: {
  tier: "standard" | "elite";
  fee: number;
  canDeals: boolean;
  balance: number;
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
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");
  const [extrasChoice, setExtrasChoice] = useState<ExtrasChoice>(null);
  const [drafts, setDrafts] = useState<ChargeDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTopUp, setNeedsTopUp] = useState(false);

  const isElite = tier === "elite";
  // Zero-balance gate (frozen rule): merchants with no balance can't create
  // deals. The gate is enforced server-side; here we surface the fix — a
  // top-up CTA — proactively (upfront on step 1 AND at review) and on the 402,
  // never an override.
  const zeroBalance = shouldPromptTopUp(balance);
  // shouldPromptTopUp also returns true for a NaN/invalid balance (fail-safe),
  // so never render "KES NaN" — show an unavailable-balance phrasing instead.
  const balanceKnown = Number.isFinite(balance);
  const balanceLabel = balanceKnown ? formatKes(balance) : "unavailable";

  // Price policy (brief §4/§10): YOU PAY = price + disclosed extras, computed in
  // exactly one place (lib/pricing) so the merchant preview here and the
  // shopper's screens can never disagree.
  const priceKes = parseInt(price.replace(/\D/g, ""), 10);
  const validCharges: DealCharge[] =
    extrasChoice === "extras"
      ? drafts
          .map((d) => ({
            label: d.label.trim(),
            type: d.type,
            value: parseFloat(d.value),
          }))
          .filter((c) => c.label && Number.isFinite(c.value) && c.value > 0)
      : [];
  const previewPay = youPay(isNaN(priceKes) ? null : priceKes, validCharges);
  const previewExtras =
    isNaN(priceKes) ? 0 : extrasTotal(validCharges, priceKes);
  const priceReady =
    !isNaN(priceKes) &&
    priceKes >= 0 &&
    extrasChoice !== null &&
    (extrasChoice === "none" || validCharges.length > 0);

  function addCharge(label = "", type: "fixed" | "percent" = "fixed", value = "") {
    setDrafts((d) => [
      ...d,
      { id: Math.random().toString(36).slice(2), label, type, value },
    ]);
  }
  function updateCharge(id: string, patch: Partial<ChargeDraft>) {
    setDrafts((d) => d.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeCharge(id: string) {
    setDrafts((d) => d.filter((c) => c.id !== id));
  }

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
    form.set("price", String(isNaN(priceKes) ? "" : priceKes));
    if (compareAt.replace(/\D/g, "")) form.set("compareAt", compareAt.replace(/\D/g, ""));
    form.set("charges", JSON.stringify(validCharges));
    try {
      const res = await fetch("/api/deals", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not publish.");
        setNeedsTopUp(res.status === 402);
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

          {/* M1 — surface the zero-balance top-up need UP FRONT (not only at
              Publish), so a merchant with an empty wallet isn't led through the
              whole wizard first. Rust warning + underlined link — never a
              second amber action, so the single amber primary stays "Continue"
              (R1). */}
          {zeroBalance ? (
            <InlineAlert variant="warning" title="Top up to publish a deal." className="mb-4">
              {balanceKnown
                ? `Your wallet balance is ${balanceLabel}. `
                : "Your wallet balance is unavailable. "}
              A deal needs a funded wallet —{" "}
              <Link href="/merchant/topup" className="font-semibold text-ink underline">
                top up
              </Link>{" "}
              before you finish.
            </InlineAlert>
          ) : null}

          <button
            type="button"
            onClick={() => setDealType("standard")}
            className={cn(
              "flex w-full items-center justify-between rounded-card border bg-white px-4 py-4 text-left",
              dealType === "standard" ? "border-2 border-ink" : "border-line"
            )}
          >
            <span className="text-base font-bold text-ink">Standard</span>
            {dealType === "standard" ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-ink">
                <IconCheck className="h-3.5 w-3.5" />
                Selected
              </span>
            ) : null}
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
              <IconBolt className="h-4 w-4 text-ink" />
              Flash
            </span>
            {isElite ? (
              dealType === "flash" ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-ink">
                  <IconCheck className="h-3.5 w-3.5" />
                  Selected
                </span>
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
                  <th className="bg-ink px-2 py-2.5 text-center font-bold text-white">Elite</th>
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
            <Button full disabled={!cover || !title.trim()} onClick={() => setStep("price")}>
              Continue
            </Button>
            <p className="mt-2 text-center text-xs text-ink">
              {!cover || !title.trim() ? "Add a cover image and title to continue" : " "}
            </p>
          </div>
        </>
      ) : null}

      {step === "price" ? (
        <>
          <Header title="Price" back="details" />
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">
                Deal price (KES)
              </span>
              <div className="flex h-12 items-center rounded-xl border border-ink/80 bg-white px-4 focus-within:ring-2 focus-within:ring-brand">
                <span className="mr-2 text-base font-semibold text-ink">KES</span>
                <input
                  inputMode="numeric"
                  value={price ? Number(price.replace(/\D/g, "")).toLocaleString("en-KE") : ""}
                  onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
                  placeholder="450"
                  className="w-full text-base font-semibold text-ink focus:outline-none"
                  aria-label="Deal price in KES"
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                What the shopper pays before any taxes or charges below.
              </p>
            </div>
            <TextField
              label="Was price (optional)"
              inputMode="numeric"
              value={compareAt ? Number(compareAt.replace(/\D/g, "")).toLocaleString("en-KE") : ""}
              onChange={(e) => setCompareAt(e.target.value.replace(/\D/g, ""))}
              placeholder="700"
            />
          </div>

          {/* M9 charge disclosure — neither option preselected; the choice is the point. */}
          <div className="mt-6">
            <p className="text-sm font-bold text-ink">
              Will the shopper pay anything on top of{" "}
              {isNaN(priceKes) ? "the deal price" : formatKes(priceKes)}?
            </p>
            <div className="mt-3 space-y-3">
              <button
                type="button"
                onClick={() => setExtrasChoice("none")}
                className={cn(
                  "w-full rounded-card border bg-white px-4 py-3.5 text-left",
                  extrasChoice === "none" ? "border-2 border-ink" : "border-line"
                )}
              >
                <span className="block text-sm font-semibold text-ink">
                  No — {isNaN(priceKes) ? "the price" : formatKes(priceKes)} is everything
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  You will not be able to add charges at the counter.
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setExtrasChoice("extras");
                  if (drafts.length === 0) addCharge();
                }}
                className={cn(
                  "w-full rounded-card border bg-white px-4 py-3.5 text-left",
                  extrasChoice === "extras" ? "border-2 border-ink" : "border-line"
                )}
              >
                <span className="block text-sm font-semibold text-ink">
                  Yes — there are extra charges
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Every charge is mandatory and folded into the shopper&apos;s price.
                </span>
              </button>
            </div>
          </div>

          {extrasChoice === "extras" ? (
            <div className="mt-4 space-y-3">
              {drafts.map((c) => (
                <div key={c.id} className="rounded-card border border-line bg-white p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={c.label}
                      onChange={(e) => updateCharge(c.id, { label: e.target.value })}
                      placeholder="VAT, service charge…"
                      className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                      aria-label="Charge name"
                    />
                    <button
                      type="button"
                      onClick={() => removeCharge(c.id)}
                      aria-label="Remove charge"
                      className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-line text-muted"
                    >
                      <IconX className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex h-11 overflow-hidden rounded-lg border border-line">
                      {(["fixed", "percent"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateCharge(c.id, { type: t })}
                          className={cn(
                            "px-3 text-sm font-semibold",
                            c.type === t ? "bg-ink text-white" : "bg-white text-muted"
                          )}
                        >
                          {t === "fixed" ? "KES" : "%"}
                        </button>
                      ))}
                    </div>
                    <input
                      inputMode="decimal"
                      value={c.value}
                      onChange={(e) =>
                        updateCharge(c.id, { value: e.target.value.replace(/[^\d.]/g, "") })
                      }
                      placeholder={c.type === "percent" ? "16" : "30"}
                      className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                      aria-label="Charge amount"
                    />
                    <span className="tnum w-20 flex-none text-right text-sm text-secondary">
                      {c.value && !isNaN(priceKes)
                        ? `KES ${(c.type === "percent"
                            ? Math.round((priceKes * parseFloat(c.value || "0")) / 100)
                            : Math.round(parseFloat(c.value || "0"))
                          ).toLocaleString("en-KE")}`
                        : "—"}
                    </span>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addCharge()}
                className="flex items-center gap-1.5 text-sm font-semibold text-ink"
              >
                <IconPlus className="h-4 w-4" /> Add another charge
              </button>
            </div>
          ) : null}

          {/* Live preview — the merchant is writing the shopper's screen. */}
          {priceReady && previewPay != null ? (
            <div className="mt-6 rounded-card border border-line bg-cream p-4">
              <p className="text-xs text-muted">Shoppers will see</p>
              <p className="tnum mt-1 text-lg font-bold text-ink">
                You pay KES {previewPay.toLocaleString("en-KE")}
              </p>
              {previewExtras > 0 ? (
                <p className="tnum mt-0.5 text-xs text-secondary">
                  Includes KES {previewExtras.toLocaleString("en-KE")} in taxes and charges
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-auto pt-8">
            <Button full disabled={!priceReady} onClick={() => setStep("schedule")}>
              Continue
            </Button>
            <p className="mt-2 text-center text-xs text-muted">
              {extrasChoice === null
                ? "Choose whether there are extra charges to continue."
                : " "}
            </p>
          </div>
        </>
      ) : null}

      {step === "schedule" ? (
        <>
          <Header title={dealType === "flash" ? "Flash duration" : "Schedule"} back="price" />
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
          <div className="mt-3 rounded-card border border-line bg-white px-4 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                Shoppers pay
              </span>
              <span className="tnum text-lg font-bold text-ink">
                {previewPay != null ? `KES ${previewPay.toLocaleString("en-KE")}` : "—"}
              </span>
            </div>
            {previewExtras > 0 ? (
              <p className="tnum mt-1 text-right text-xs text-secondary">
                Includes KES {previewExtras.toLocaleString("en-KE")} in taxes and charges
              </p>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
            <span className="text-xs text-muted">Goes live</span>
            <span className="text-sm font-semibold text-ink">Immediately</span>
          </div>
          <p className="mt-3 text-xs text-muted">
            You pay a {formatKes(fee)} success fee per verified redemption. Nothing else.
          </p>
          {zeroBalance ? (
            <div className="mt-3 rounded-card border border-line bg-white p-3.5">
              <p className="text-sm font-medium text-ink">
                {balanceKnown
                  ? `Your wallet balance is ${balanceLabel}. `
                  : "Your wallet balance is unavailable. "}
                Top up before publishing — a deal needs a funded wallet.
              </p>
              <ButtonLink href="/merchant/topup" variant="secondary" full className="mt-3">
                Top up wallet
              </ButtonLink>
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-card border border-line bg-white p-3.5">
              <p className="text-sm font-medium text-ink">{error}</p>
              {needsTopUp ? (
                <ButtonLink href="/merchant/topup" variant="secondary" full className="mt-3">
                  Top up wallet to publish
                </ButtonLink>
              ) : null}
            </div>
          ) : null}
          <div className="mt-auto space-y-3 pt-8">
            <Button full onClick={publish} loading={busy}>
              {previewPay != null
                ? `Publish — shoppers pay KES ${previewPay.toLocaleString("en-KE")}`
                : "Publish deal"}
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
