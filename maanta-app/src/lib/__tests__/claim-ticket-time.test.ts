import { describe, it, expect } from "vitest";
import {
  formatClaimCountdown,
  absoluteTimeLabel,
  nairobiTime,
} from "@/lib/claim-ticket-time";

// D167 item 3 / D190. The claimed-ticket screen carried two timing defects:
// a countdown with no hour rollover ("1449:12" for a day-long window) and
// absolute times rendered in the server's timezone with a hardcoded "today".
// These tests pin the corrected presentation. The authoritative timestamps
// (`redemptions.expires_at` = deal end + 15min, set by `claim_deal`) are not
// touched by the fix and not exercised here — this is display only.

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatClaimCountdown — band shapes", () => {
  it("keeps M:SS under an hour (the counter shape the mockups show)", () => {
    expect(formatClaimCountdown(30 * SEC)).toBe("0:30");
    expect(formatClaimCountdown(90 * SEC)).toBe("1:30");
    expect(formatClaimCountdown(41 * MIN + 5 * SEC)).toBe("41:05");
    expect(formatClaimCountdown(59 * MIN + 59 * SEC)).toBe("59:59");
  });

  it("rolls minutes into hours at exactly one hour", () => {
    expect(formatClaimCountdown(HOUR)).toBe("1h 0m 00s");
    expect(formatClaimCountdown(3 * HOUR)).toBe("3h 0m 00s");
    expect(formatClaimCountdown(23 * HOUR + 54 * MIN)).toBe("23h 54m 00s");
    expect(formatClaimCountdown(23 * HOUR + 59 * MIN + 59 * SEC)).toBe(
      "23h 59m 59s"
    );
  });

  it("rolls hours into days at exactly one day", () => {
    expect(formatClaimCountdown(DAY)).toBe("1d 0h 0m 00s");
    // The exact production observation: a 23h54m deal + the 15-minute
    // redemption grace rendered as "1449:12". Never again.
    expect(formatClaimCountdown(DAY + 9 * MIN + 12 * SEC)).toBe("1d 0h 9m 12s");
    expect(formatClaimCountdown(DAY + 4 * HOUR + 41 * MIN + 5 * SEC)).toBe(
      "1d 4h 41m 05s"
    );
  });

  it("never renders raw-minute overflow for any duration up to a week", () => {
    for (let ms = 0; ms <= 7 * DAY; ms += 17 * MIN + 13 * SEC) {
      expect(formatClaimCountdown(ms)).not.toMatch(/^\d{3,}:/);
    }
  });

  it("keeps visible seconds in every band — the anti-screenshot device", () => {
    // "If the timer isn't moving, it's a screenshot." depends on a string that
    // changes every second, whatever the remaining time.
    const bands = [45 * MIN, 3 * HOUR, DAY + 2 * HOUR];
    for (const ms of bands) {
      expect(formatClaimCountdown(ms)).not.toBe(formatClaimCountdown(ms - SEC));
    }
  });

  it("clamps at zero and refuses to fabricate a time from bad input", () => {
    expect(formatClaimCountdown(0)).toBe("0:00");
    expect(formatClaimCountdown(-5 * MIN)).toBe("0:00");
    expect(formatClaimCountdown(Infinity)).toBe("");
    expect(formatClaimCountdown(NaN)).toBe("");
  });
});

describe("absoluteTimeLabel — Nairobi wall clock with an honest day word", () => {
  // 12:00 UTC = 15:00 in Nairobi (permanent UTC+3, no DST).
  const now = new Date("2026-08-26T12:00:00Z");

  it("renders Nairobi time, not the server's timezone", () => {
    // 18:45 UTC is 21:45 in Nairobi. Rendering "18:45" was the D190 defect.
    expect(nairobiTime("2026-08-26T18:45:00.000Z")).toBe("21:45");
    expect(absoluteTimeLabel("2026-08-26T18:45:00.000Z", now)).toBe(
      "21:45 today"
    );
  });

  it("says tomorrow when the window crosses Nairobi midnight", () => {
    // 21:30 UTC today is 00:30 in Nairobi TOMORROW — the exact case the old
    // hardcoded "today" got wrong.
    expect(absoluteTimeLabel("2026-08-26T21:30:00.000Z", now)).toBe(
      "00:30 tomorrow"
    );
  });

  it("says yesterday for a redemption revisited a day later", () => {
    expect(absoluteTimeLabel("2026-08-25T18:00:00.000Z", now)).toBe(
      "21:00 yesterday"
    );
  });

  it("falls back to an explicit date beyond one calendar day", () => {
    expect(absoluteTimeLabel("2026-08-29T18:45:00.000Z", now)).toBe(
      "29 Aug, 21:45"
    );
    expect(absoluteTimeLabel("2026-08-23T18:45:00.000Z", now)).toBe(
      "23 Aug, 21:45"
    );
  });
});
