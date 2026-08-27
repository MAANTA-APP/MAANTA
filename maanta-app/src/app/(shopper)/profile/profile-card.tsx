"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AvatarUpload,
  Body,
  HeadingMd,
  Label,
  Meta,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/claude";
import { TextField } from "@/components/ui/inputs";
import { NODES, ALL_NODES, nodeLabel } from "@/lib/nodes";
import { cn } from "@/lib/ui";

export function ProfileCard({
  fullName,
  phoneMasked,
  preferredLanguage,
  node,
  avatarUrl,
}: {
  fullName: string | null;
  phoneMasked: string | null;
  preferredLanguage: "en" | "sw";
  node: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(parts[0] ?? "");
  const [lastName, setLastName] = useState(parts.slice(1).join(" "));
  const [mall, setMall] = useState(node);

  function openEdit() {
    const next = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
    setFirstName(next[0] ?? "");
    setLastName(next.slice(1).join(" "));
    setMall(node);
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          preferredLanguage,
          node: mall,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  const displayName = fullName?.trim() || "Maanta shopper";

  // Until-dirty Save gate (16c / drift D82's standalone half): Save is inert
  // until something actually changed, so it cannot fire a no-op PATCH and the
  // disabled state tells the truth — "there is nothing to save yet". Compared
  // against the same parsing openEdit seeds the fields from, so reopening the
  // editor always starts clean. The frozen Button already renders disabled as
  // grey, never dimmed amber (L9b), so no styling is needed here.
  const savedParts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const dirty =
    firstName.trim() !== (savedParts[0] ?? "") ||
    lastName.trim() !== savedParts.slice(1).join(" ") ||
    mall !== node;

  return (
    <div className="rounded-card bg-white p-4 shadow-card">
      <div className="flex items-start gap-4">
        <AvatarUpload
          avatarUrl={avatarUrl}
          initials={displayName}
          uploadUrl="/api/profile/avatar"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <HeadingMd as="h2" className="truncate">
              {displayName}
            </HeadingMd>
            {!editing ? (
              <button
                type="button"
                onClick={openEdit}
                className="shrink-0 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Edit profile
              </button>
            ) : null}
          </div>
          <Meta as="p" className="tnum mt-1 text-xs">
            {nodeLabel(node)}
            {phoneMasked ? ` · ${phoneMasked}` : ""}
          </Meta>
        </div>
      </div>

      {editing ? (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <TextField
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            required
          />
          <TextField
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Mall</span>
            <select
              value={mall}
              onChange={(e) => setMall(e.target.value)}
              className="h-12 w-full rounded-xl border border-ink/80 bg-white px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2"
            >
              {NODES.filter((n) => n.live).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
              <option value={ALL_NODES}>All nodes</option>
            </select>
          </label>
          {error ? <Body className="text-sm text-ink">{error}</Body> : null}
          <div className="flex gap-2 pt-1">
            <PrimaryButton
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="flex-1"
            >
              {pending ? "Saving…" : "Save"}
            </PrimaryButton>
            <SecondaryButton
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="flex-1"
            >
              Cancel
            </SecondaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LanguageCard({
  preferredLanguage,
}: {
  preferredLanguage: "en" | "sw";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = preferredLanguage === "sw" ? "sw" : "en";

  return (
    <div className="rounded-card bg-white px-4 py-3.5 shadow-card">
      <Label as="p" className="text-muted">
        Language
      </Label>
      <ul className="mt-3 space-y-2" role="listbox" aria-label="Language">
        <li>
          <button
            type="button"
            role="option"
            aria-selected={active === "en"}
            disabled={pending || active === "en"}
            onClick={() => {
              startTransition(async () => {
                const res = await fetch("/api/profile", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    preferredLanguage: "en",
                    languageOnly: true,
                  }),
                });
                if (res.ok) router.refresh();
              });
            }}
            className={cn(
              "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition",
              active === "en"
                ? "border-ink bg-ink text-white"
                : "border-line bg-stone-soft text-ink hover:bg-white"
            )}
          >
            English
            {active === "en" ? (
              <span className="text-[11px] font-medium opacity-80">Active</span>
            ) : null}
          </button>
        </li>
        <li>
          <button
            type="button"
            role="option"
            aria-selected={false}
            disabled
            className="flex w-full cursor-not-allowed items-center justify-between rounded-xl border border-line bg-white px-3.5 py-2.5 text-left text-sm font-semibold text-faint"
          >
            Kiswahili
            <span className="text-[11px] font-medium">Coming soon</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
