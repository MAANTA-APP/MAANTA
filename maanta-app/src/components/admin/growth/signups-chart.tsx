import { CardHeading } from "@/components/admin/growth/growth-ui";

export type SignupDay = {
  day: string;
  shopper: number;
  merchant: number;
  mall_operator: number;
};

/**
 * Signups by role over the window.
 *
 * **The merchant series is the one amber thing on the page.** Amber is rationed
 * to a single meaning per surface; in the console it marks the active sidebar
 * item, and the only other place it earns its keep is here, on the series that
 * decides whether Node 0 opens at all. Shopper is ink, operator is a neutral
 * line grey — three values distinguishable in greyscale by lightness, so the
 * chart survives a black-and-white screenshot (rule 4).
 *
 * **It degrades to a figure and a sentence.** Fourteen stacked bars are
 * unreadable at 390px, so below `sm` the bars are replaced by the total, the
 * role split and the direction in words — not a squeezed chart, and not a
 * horizontally-scrolling one that hides half its own data.
 */
export function SignupsChart({
  days,
  label,
  unknownJoinDate = 0,
}: {
  days: SignupDay[];
  label: string;
  /**
   * People the mirror holds but whose Resend join date it has not read yet.
   * Rendered as a stated exclusion rather than dropped: a bare `continue` on a
   * null date is how a person vanishes from a figure with nothing admitting it.
   */
  unknownJoinDate?: number;
}) {
  const totals = days.reduce(
    (acc, d) => ({
      shopper: acc.shopper + d.shopper,
      merchant: acc.merchant + d.merchant,
      mall_operator: acc.mall_operator + d.mall_operator,
    }),
    { shopper: 0, merchant: 0, mall_operator: 0 }
  );
  const total = totals.shopper + totals.merchant + totals.mall_operator;

  const dayTotal = (d: SignupDay) => d.shopper + d.merchant + d.mall_operator;
  const peak = Math.max(1, ...days.map(dayTotal));

  // Direction, stated rather than drawn: the second half against the first.
  const half = Math.floor(days.length / 2);
  const early = days.slice(0, half).reduce((n, d) => n + dayTotal(d), 0);
  const late = days.slice(half).reduce((n, d) => n + dayTotal(d), 0);
  const direction =
    total === 0
      ? "No signups in this window."
      : late > early
        ? "Rising across the window."
        : late < early
          ? "Falling across the window."
          : "Flat across the window.";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardHeading>Signups by role</CardHeading>
          <p className="mt-1 text-[13px] text-muted">{label}</p>
        </div>
        <ul className="flex flex-wrap items-center gap-3.5">
          {[
            { key: "Shopper", swatch: "bg-ink" },
            { key: "Merchant", swatch: "bg-brand" },
            { key: "Operator", swatch: "bg-line" },
          ].map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs font-medium text-secondary">
              <span aria-hidden className={`block h-2.5 w-2.5 rounded-[3px] ${s.swatch}`} />
              {s.key}
            </li>
          ))}
        </ul>
      </div>

      {unknownJoinDate > 0 ? (
        <p className="mt-3 rounded-lg border-l-2 border-rust bg-stone px-3 py-2 text-xs leading-relaxed text-ink">
          {unknownJoinDate} {unknownJoinDate === 1 ? "person is" : "people are"} not
          in this chart: the mirror has not read their join date from the sending
          platform yet. Run a sync to place them.
        </p>
      ) : null}

      {total === 0 ? (
        <p className="mt-5 rounded-xl bg-stone px-3.5 py-3 text-xs leading-relaxed text-secondary">
          No signups in this window yet. Pre-launch that is a real reading, not a
          broken feed — the chart appears once there is something to draw.
        </p>
      ) : (
        <>
          {/* Phone: the numbers, in words. */}
          <div className="mt-4 sm:hidden">
            <p className="text-[32px] font-extrabold leading-none tracking-tight text-ink [font-variant-numeric:tabular-nums]">
              {total}
            </p>
            <p className="mt-1.5 text-[13px] text-secondary">
              {totals.shopper} shopper · {totals.merchant} merchant ·{" "}
              {totals.mall_operator} operator
            </p>
            <p className="mt-1 text-xs text-muted">{direction}</p>
          </div>

          {/* Desktop: the stack. */}
          <div
            className="mt-5 hidden h-[150px] items-end gap-2 border-b border-line pb-2 sm:flex"
            role="img"
            aria-label={`Signups by role, ${label}. ${total} in total: ${totals.shopper} shopper, ${totals.merchant} merchant, ${totals.mall_operator} mall operator. ${direction}`}
          >
            {days.map((d) => {
              const scale = (n: number) => (n / peak) * 132;
              return (
                <div key={d.day} className="flex flex-1 flex-col justify-end gap-0.5">
                  <span
                    className="rounded-t-[3px] bg-ink"
                    style={{ height: `${scale(d.shopper)}px` }}
                  />
                  <span className="bg-brand" style={{ height: `${scale(d.merchant)}px` }} />
                  <span className="bg-line" style={{ height: `${scale(d.mall_operator)}px` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 hidden justify-between sm:flex">
            <span className="font-mono text-[11px] text-faint">{days[0]?.day}</span>
            <span className="font-mono text-[11px] text-faint">{days[days.length - 1]?.day}</span>
          </div>
        </>
      )}
    </div>
  );
}
