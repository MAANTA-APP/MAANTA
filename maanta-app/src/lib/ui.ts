import { maskPhone as maskPhoneServer } from "@/lib/phone-mask";

/** Tiny class-name joiner (no dependency). */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** "482913" -> "482 913" (frozen code format from wireframe 1c/6c). */
export function formatCode(code: string) {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return code;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/** 3450 -> "KES 3,450" */
export function formatKes(amount: number | string | null | undefined) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount ?? 0;
  return `KES ${Math.round(n).toLocaleString("en-KE")}`;
}

/** Signed amount row: +KES 3,000 / -KES 30 */
export function formatKesSigned(amount: number | string) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  const sign = n >= 0 ? "+" : "-";
  return `${sign}KES ${Math.abs(Math.round(n)).toLocaleString("en-KE")}`;
}

/** Milliseconds until an ISO timestamp (negative if past). */
export function msUntil(iso: string | null | undefined) {
  if (!iso) return Infinity;
  return new Date(iso).getTime() - Date.now();
}

/** "2h 14m left" / "4m left" / "Ended" */
export function timeLeftLabel(iso: string | null | undefined) {
  const ms = msUntil(iso);
  if (!isFinite(ms)) return "";
  if (ms <= 0) return "Ended";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m left`;
  return "less than 1m left";
}

/** Near-expiry threshold used by countdown chips (rust under 60 minutes, per brief). */
export function isNearExpiry(iso: string | null | undefined) {
  const ms = msUntil(iso);
  return isFinite(ms) && ms > 0 && ms <= 60 * 60 * 1000;
}

/** "Today, 10:42am" / "Yesterday, 9:14am" / "2 Jul, 9:14am" */
export function friendlyTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d
    .toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(" ", "")
    .toLowerCase();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.getDate()} ${d.toLocaleDateString("en-KE", { month: "short" })}, ${time}`;
}

/** Relative age: "2m", "1h", "1d" */
export function relativeAge(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Mask a phone for display: +254 7•• ••• 214
 *
 * Delegates to the single masker in `lib/phone-mask.ts` — this used to be a
 * second implementation, and the copy had drifted somewhere that matters: it
 * returned the number COMPLETELY UNMASKED when the input was under 7
 * characters (`if (p.length < 7) return phone`), so a short or oddly-formatted
 * number rendered in full on admin, agent and merchant surfaces.
 *
 * Only the mask character differs now, and that is presentation. Which digits
 * are revealed — and the decision to show nothing rather than reveal too much —
 * is decided once, in phone-mask.ts.
 *
 * Returns `null` (not `""`) when the number cannot be safely masked, so callers
 * using `?? "No contact on file"` get their fallback instead of a blank.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  return maskPhoneServer(phone, "•");
}
