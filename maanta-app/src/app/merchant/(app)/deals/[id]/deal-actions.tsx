"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/overlays";
import { TextField, inputClass } from "@/components/ui/inputs";
import { StatusChip } from "@/components/ui/chips";
import { cn, formatKes } from "@/lib/ui";
import {
  DEAL_CATEGORIES,
  isDealCategory,
  type DealCategory,
} from "@/lib/deal-categories";
import posthog from "posthog-js";

/**
 * Deal management actions: Boost (10e sheet) / Move boost (10f) /
 * Pause–Resume (10ab) / Edit / Archive (10p).
 */
export function DealActions({
  dealId,
  title: initialTitle,
  description: initialDescription,
  category: initialCategory,
  status,
  boosted,
  boostEndsAt,
  boostFee,
  balance,
  canPurchase,
  canDeals,
  otherDeals,
}: {
  dealId: string;
  title: string;
  description: string;
  /** Null on deals created before the taxonomy — the edit sheet is where they get one. */
  category: string | null;
  status: "active" | "paused" | "ended";
  boosted: boolean;
  boostEndsAt: string | null;
  boostFee: number;
  balance: number;
  canPurchase: boolean;
  canDeals: boolean;
  otherDeals: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"none" | "boost" | "move" | "edit" | "archive">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState<DealCategory | null>(
    isDealCategory(initialCategory) ? initialCategory : null
  );
  const [moveTarget, setMoveTarget] = useState<string | null>(null);

  async function call(fn: () => Promise<Response>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Something went wrong.");
        setBusy(false);
        return false;
      }
      setBusy(false);
      setSheet("none");
      router.refresh();
      return true;
    } catch {
      setError("Network error — try again.");
      setBusy(false);
      return false;
    }
  }

  const patch = (payload: Record<string, unknown>) =>
    call(() =>
      fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

  const remainingLabel = boostEndsAt
    ? `${Math.max(1, Math.round((new Date(boostEndsAt).getTime() - Date.now()) / 3600_000))}h remaining`
    : "";

  return (
    <>
      {error && sheet === "none" ? (
        <p className="mt-4 text-sm font-medium text-ink">{error}</p>
      ) : null}

      <div className="mt-5 space-y-3">
        {status !== "ended" ? (
          <div className="flex gap-2.5">
            {!boosted && canPurchase ? (
              <Button size="md" className="flex-1" onClick={() => setSheet("boost")}>
                Boost
              </Button>
            ) : null}
            {canDeals ? (
              <>
                <Button
                  size="md"
                  variant="ghost"
                  className="flex-1"
                  loading={busy && sheet === "none"}
                  onClick={() => patch({ action: status === "paused" ? "resume" : "pause" })}
                >
                  {status === "paused" ? "Resume deal" : "Pause"}
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setSheet("edit")}
                >
                  Edit
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {boosted && canPurchase && otherDeals.length > 0 ? (
          <Button variant="ghost" full onClick={() => setSheet("move")}>
            Move boost to another deal
          </Button>
        ) : null}

        {canDeals && status !== "ended" ? (
          <Button variant="destructive-outline" full onClick={() => setSheet("archive")}>
            Archive deal
          </Button>
        ) : null}
      </div>

      {/* 10e Boost purchase sheet */}
      <BottomSheet open={sheet === "boost"} onClose={() => setSheet("none")}>
        <h2 className="text-lg font-bold text-ink">Boost this deal</h2>
        <p className="mt-1 text-sm text-muted">
          {formatKes(boostFee)} / 24h · appears in Neighbourhood favourites
        </p>
        <span className="mt-3 inline-block rounded-full bg-brand px-3 py-1 text-xs font-bold text-ink">
          Pay from wallet ({Math.round(balance).toLocaleString("en-KE")})
        </span>
        {error ? <p className="mt-3 text-sm font-medium text-ink">{error}</p> : null}
        <Button
          full
          className="mt-5"
          loading={busy}
          disabled={balance < boostFee}
          onClick={() =>
            call(() =>
              fetch("/api/boosts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dealId }),
              })
            ).then((ok) => {
              if (ok) posthog.capture("deal_boost_purchased", { deal_id: dealId, boost_fee: boostFee });
            })
          }
        >
          Confirm boost — {formatKes(boostFee)}
        </Button>
        <Button
          variant="ghost"
          full
          className="mt-3"
          onClick={() => router.push("/merchant/topup")}
        >
          {balance < boostFee ? "Top up via M-Pesa STK first" : "Pay via M-Pesa STK instead"}
        </Button>
      </BottomSheet>

      {/* 10f Move boost sheet */}
      <BottomSheet open={sheet === "move"} onClose={() => setSheet("none")}>
        <h2 className="text-lg font-bold text-ink">Move boost — {remainingLabel}</h2>
        <p className="mt-1 text-sm text-muted">Select which deal keeps the boost</p>
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
            <span className="truncate text-sm font-semibold text-ink">{initialTitle}</span>
            <StatusChip status="current" label="Current" />
          </div>
          {otherDeals.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setMoveTarget(d.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-card border bg-white px-4 py-3.5 text-left",
                moveTarget === d.id ? "border-2 border-ink" : "border-line"
              )}
            >
              <span className="truncate text-sm font-semibold text-ink">{d.title}</span>
              <span className="text-sm text-muted">
                {moveTarget === d.id ? "Selected" : "Select"}
              </span>
            </button>
          ))}
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-ink">{error}</p> : null}
        <Button
          full
          className="mt-5"
          loading={busy}
          disabled={!moveTarget}
          onClick={() =>
            call(() =>
              fetch("/api/boosts/move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fromDealId: dealId, toDealId: moveTarget }),
              })
            ).then((ok) => {
              if (ok && moveTarget) router.push(`/merchant/deals/${moveTarget}`);
            })
          }
        >
          Confirm
        </Button>
      </BottomSheet>

      {/* Edit sheet */}
      <BottomSheet open={sheet === "edit"} onClose={() => setSheet("none")}>
        <h2 className="text-lg font-bold text-ink">Edit deal</h2>
        <div className="mt-4 space-y-4">
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={cn(inputClass, "h-auto py-3")}
            />
          </label>
          <fieldset>
            <legend className="mb-1.5 block text-xs font-medium text-muted">Category</legend>
            {/*
              The correction path. A deal filed in the wrong bucket, or one
              created before the taxonomy existed, is fixed here by the merchant
              rather than by an admin ticket.
            */}
            <div className="flex flex-wrap gap-2">
              {DEAL_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  aria-pressed={category === c.key}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-[13px] font-semibold transition",
                    category === c.key
                      ? "border-2 border-ink bg-white text-ink"
                      : "border border-line bg-white text-muted"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {!category ? (
              <p className="mt-2 text-xs text-muted">
                Uncategorised — this deal shows under All, but under no category
                filter.
              </p>
            ) : null}
          </fieldset>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-ink">{error}</p> : null}
        <Button
          full
          className="mt-5"
          loading={busy}
          disabled={!title.trim()}
          onClick={() =>
            patch({
              action: "edit",
              title,
              description,
              ...(category ? { category } : {}),
            })
          }
        >
          Save changes
        </Button>
      </BottomSheet>

      {/* 10p Archive sheet */}
      <BottomSheet open={sheet === "archive"} onClose={() => setSheet("none")}>
        <h2 className="text-lg font-bold text-ink">Archive {initialTitle}?</h2>
        <p className="mt-2 text-sm text-muted">
          The deal comes off the feed and moves to Archived deals (you can repost it later).
          Codes already claimed stay valid until they expire.
        </p>
        {error ? <p className="mt-3 text-sm font-medium text-ink">{error}</p> : null}
        <Button
          variant="destructive"
          full
          className="mt-5"
          loading={busy}
          onClick={() =>
            patch({ action: "archive" }).then((ok) => {
              if (ok) {
                posthog.capture("deal_archived", { deal_id: dealId });
                router.push("/merchant/deals/archived");
              }
            })
          }
        >
          Archive
        </Button>
        <Button variant="ghost" full className="mt-3" onClick={() => setSheet("none")}>
          Cancel
        </Button>
      </BottomSheet>
    </>
  );
}
