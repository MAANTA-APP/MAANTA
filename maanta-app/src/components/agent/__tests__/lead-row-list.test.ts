import { describe, expect, it } from "vitest";
import { isLockLive } from "@/components/agent/lead-row-list";

/**
 * A lead's lock is live only while `locked_until` is in the future.
 *
 * `leads.status` is set to `'locked'` on capture and **nothing ever rewrites
 * it** — there is no expiry job, and `capture_lead` treats a lock as live with
 * `l.locked_until > NOW()` rather than by reading the status. So `status =
 * 'locked'` alone means "was locked at some point", not "is locked now".
 *
 * That distinction shipped wrong once: the co-founder pipeline's "Leads open"
 * KPI counted every `status = 'locked'` row while the list directly beneath it
 * rendered the lapsed ones with a plain `StatusChip`. One screen, two answers
 * about the same lead. The count and the chip now ask this one function.
 */

const HOUR = 3600_000;
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

describe("isLockLive", () => {
  it("is true only while a locked lead's window is still open", () => {
    expect(isLockLive({ status: "locked", locked_until: iso(24 * HOUR) })).toBe(true);
    expect(isLockLive({ status: "locked", locked_until: iso(HOUR) })).toBe(true);
  });

  it("is false once the window has passed, even though status still says locked", () => {
    // The regression. Counting on status alone would call this one open.
    expect(isLockLive({ status: "locked", locked_until: iso(-HOUR) })).toBe(false);
    expect(isLockLive({ status: "locked", locked_until: iso(-365 * 24 * HOUR) })).toBe(
      false
    );
  });

  it("is false for every non-locked status regardless of the timestamp", () => {
    // A converted lead keeps its locked_until; a future timestamp must not make
    // a won shop look like an open one.
    for (const status of ["converted", "expired", "lost"]) {
      expect(isLockLive({ status, locked_until: iso(24 * HOUR) }), status).toBe(false);
      expect(isLockLive({ status, locked_until: iso(-HOUR) }), status).toBe(false);
    }
  });
});
