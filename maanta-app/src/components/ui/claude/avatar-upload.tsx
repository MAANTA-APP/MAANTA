"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/ui";
import { Body } from "@/components/ui/claude/typography";

const MAX_BYTES = 1_048_576; // 1MB

type Props = {
  /** Current public avatar URL, if any. */
  avatarUrl: string | null;
  /** Initials fallback (single character preferred). */
  initials: string;
  /** Upload endpoint — shopper `/api/profile/avatar` or merchant `/api/merchant/avatar`. */
  uploadUrl: string;
  className?: string;
  /** Disable change control (e.g. merchant staff who aren't owners). */
  disabled?: boolean;
};

/** Circular avatar + “Change photo” — Claude-sized, uploads via server route. */
export function AvatarUpload({
  avatarUrl,
  initials,
  uploadUrl,
  className,
  disabled,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = preview ?? avatarUrl;
  const letter = (initials || "M").trim().charAt(0).toUpperCase() || "M";

  function onPick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Keep photos under 1 MB.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    startTransition(async () => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        avatarUrl?: string;
      };
      if (!res.ok) {
        setPreview(null);
        setError(data.error ?? "Could not upload photo.");
        URL.revokeObjectURL(localUrl);
        return;
      }
      if (data.avatarUrl) setPreview(data.avatarUrl);
      URL.revokeObjectURL(localUrl);
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <div className="flex items-center gap-3">
        <div
          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-stone text-2xl font-semibold text-ink"
          aria-hidden={!shown}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            letter
          )}
        </div>
        {!disabled ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
          >
            {pending ? "Uploading…" : shown ? "Change photo" : "Add photo"}
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>
      {error ? <Body className="text-sm text-ink">{error}</Body> : null}
    </div>
  );
}
