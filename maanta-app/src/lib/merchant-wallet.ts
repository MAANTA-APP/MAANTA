/**
 * Zero-balance gate (frozen business rule, decisions log 2026-07-03): a
 * merchant with no positive wallet balance cannot create new deals. The gate
 * is enforced server-side (DB trigger + `/api/deals` 402); this predicate is
 * the client-side mirror used to surface a top-up CTA proactively (never an
 * override, never a block on verification — only new-deal creation).
 *
 * Uses `!(balance > 0)` so NaN/undefined-shaped input also prompts a top-up
 * (fail-safe: prompt rather than silently allow).
 */
export function shouldPromptTopUp(balance: number): boolean {
  return !(balance > 0);
}
