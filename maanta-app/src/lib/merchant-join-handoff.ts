/**
 * Carries the `/merchants/join` phone number to `/merchant/onboard` without
 * putting it in a URL.
 *
 * The join form collects a shop name and a phone number, and the merchant then
 * signs in before reaching onboarding. The first version of that handoff passed
 * both as query parameters — `/login?next=/merchant/onboard?shop=…&phone=…&cc=…`
 * — which saved the merchant retyping their number and, in exchange, wrote it
 * into places nobody had agreed to put it:
 *
 *  - browser and shared-device history, where the URL survives the session;
 *  - the PostHog `$current_url` property, attached to every pageview and every
 *    autocaptured event on both pages — analytics that is otherwise careful to
 *    send no field contents at all (see `marketing-analytics.test.ts`);
 *  - `Referer` headers, server access logs, and anything downstream of them.
 *
 * A phone number is the primary identifier in this market — it is the M-Pesa
 * handle and the login. `sessionStorage` keeps it in the tab that collected it,
 * out of history and out of every URL-derived telemetry field, and it is read
 * once and cleared.
 *
 * The shop name deliberately stays in the URL: it is a business name the
 * merchant is about to publish on a public deals feed, and keeping it there
 * means the handoff still degrades gracefully — a merchant who lands on
 * onboarding in a new tab loses the phone prefill, not the whole form.
 */

const KEY = "maanta.merchant-join";

export type MerchantJoinHandoff = { cc: string; phone: string };

/** Store the number for the pending sign-in. No-op outside the browser. */
export function stashMerchantJoin(v: MerchantJoinHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Private mode, disabled storage, quota. The merchant retypes their
    // number, which is the behaviour before this handoff existed.
  }
}

/**
 * Read and clear the stored number.
 *
 * Clearing on read is the point: the value exists to survive one redirect, and
 * leaving it would prefill an unrelated later visit in the same tab.
 */
export function takeMerchantJoin(): MerchantJoinHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<MerchantJoinHandoff>;
    const phone = String(parsed.phone ?? "").replace(/\D/g, "").slice(0, 15);
    const rawCc = String(parsed.cc ?? "").trim();
    if (!phone) return null;
    return { phone, cc: /^\+\d{1,4}$/.test(rawCc) ? rawCc : "+254" };
  } catch {
    return null;
  }
}
