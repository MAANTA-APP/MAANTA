/**
 * Time presentation for the claimed-ticket screen (D167 item 3, D190).
 *
 * Two defects lived on that one screen, both presentation-only — the
 * authoritative timestamps (`redemptions.expires_at`, set by `claim_deal` as
 * deal end + 15 minutes) are untouched:
 *
 *  1. The ticking countdown had no hour rollover, so a day-long claim window
 *     rendered as raw minutes — `1449:12` — while `/my-deals` showed the same
 *     ticket as "Expires in 23h 54m". A shopper glancing at the ticket could
 *     not tell that was a day (observed in production 2026-08-23).
 *  2. The absolute lines ("code valid until 18:45 today") formatted in the
 *     SERVER's timezone — UTC on Vercel, three hours behind Nairobi — and
 *     hardcoded the word "today", which is false for any window that crosses
 *     midnight (exactly the case that also produced the minute overflow).
 *
 * Rules carried by this module:
 *  - The countdown ticks visible seconds in EVERY band. The counter copy
 *    "If the timer isn't moving, it's a screenshot." is an anti-fraud device
 *    merchants are trained on, so no band may go quieter than one visible
 *    change per second.
 *  - Under an hour the shape stays `M:SS` — the form the wireframes and the
 *    marketing walkthrough mockups show at the counter.
 *  - MAANTA serves Node 0 (Nairobi); wall-clock strings are rendered in
 *    Africa/Nairobi regardless of where the server runs. Kenya has no DST.
 */

export const NAIROBI_TZ = "Africa/Nairobi";

/**
 * The ticking countdown for the claimed-code card.
 *
 *   30s      -> "0:30"
 *   41m 5s   -> "41:05"
 *   23h 54m  -> "23h 54m 00s"
 *   24h 9m   -> "1d 0h 9m 12s"   (the string that used to be "1449:12")
 *
 * Non-finite input (an expiry the caller could not parse) renders as an empty
 * string rather than a fabricated time — `deals.expires_at` is NOT NULL in the
 * database, so this is defence, not a state the product reaches.
 */
export function formatClaimCountdown(msLeft: number): string {
  if (!Number.isFinite(msLeft)) return "";
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const s = total % 60;
  const totalMinutes = Math.floor(total / 60);
  if (totalMinutes < 60) return `${totalMinutes}:${String(s).padStart(2, "0")}`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const seconds = `${String(s).padStart(2, "0")}s`;
  if (h < 24) return `${h}h ${m}m ${seconds}`;
  return `${Math.floor(h / 24)}d ${h % 24}h ${m}m ${seconds}`;
}

/** "21:45" — 24h wall clock in Nairobi, wherever the server runs. */
export function nairobiTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: NAIROBI_TZ,
  });
}

/** Calendar date in Nairobi as "YYYY-MM-DD", for same-day comparison. */
function nairobiYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NAIROBI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * "21:45 today" / "00:30 tomorrow" / "21:00 yesterday" / "29 Aug, 21:45".
 *
 * The day word is computed in Nairobi's calendar, so a code valid past
 * midnight says "tomorrow" instead of asserting "today". Beyond one calendar
 * day either way, the explicit date is more honest than a counted day word.
 * `now` is injectable so the midnight boundary is testable.
 */
export function absoluteTimeLabel(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  const time = nairobiTime(iso);
  const targetDay = nairobiYmd(target);
  // Kenya is permanently UTC+3 (no DST), so a 24h offset always lands on the
  // adjacent calendar day.
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (targetDay === nairobiYmd(now)) return `${time} today`;
  if (targetDay === nairobiYmd(new Date(now.getTime() + DAY_MS))) {
    return `${time} tomorrow`;
  }
  if (targetDay === nairobiYmd(new Date(now.getTime() - DAY_MS))) {
    return `${time} yesterday`;
  }
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: NAIROBI_TZ,
    day: "numeric",
    month: "short",
  }).format(target);
  return `${date}, ${time}`;
}
