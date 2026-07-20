# Skill — Lovable prototype trust-rule verification (2026-07-20)

Record of a source-level verification of the **MAANTA Live Demo** Lovable
prototype against the money-and-trust guardrails in
`money-trust-engineering-guardrails.md`. This is a prototype outside this repo
(a separate Lovable/TanStack-Start app), captured here so the trust check is on
record and repeatable.

## What was verified

- **Project:** "MAANTA Live Demo", Lovable project
  `f53ff99b-cf8c-4c71-8fc4-9e3d7b14f382` (workspace `owQYEhcS1nVLEQf1pv8u`).
- **Preview:** https://id-preview--f53ff99b-cf8c-4c71-8fc4-9e3d7b14f382.lovable.app
- **Editor:** https://lovable.dev/projects/f53ff99b-cf8c-4c71-8fc4-9e3d7b14f382
- **Commit audited:** `b195b892` (initial build).
- **Method:** read the generated source directly (`read_file` over
  `src/lib/maanta-store.ts`, the four route files, `src/styles.css`,
  `src/routes/__root.tsx`) rather than eyeballing the running preview.
- **Scope:** core trust loop — deals feed → deal detail → claim → OTP code →
  merchant verify (with the KES 30 fee). Mock in-memory data; no auth/payments.

## Result: 3 of 4 rules fully pass; Rule 2 has one accuracy bug

| Rule | Verdict | Evidence |
|---|---|---|
| 1 — One price everywhere | Pass | `computeYouPay(deal) = priceKes + Σ charges` is the single helper (`maanta-store.ts`). Feed tile, deal-detail hero + sticky bar + breakdown total, claimed-code context + breakdown, and merchant result all call it. Canonical example holds: 450 + (72 + 9 + 41) = **KES 572** everywhere. No "from KES…"/subtotal masquerading as the final price. |
| 2 — Fee before the action | Pass, **1 bug** | Fee + wallet card renders **above** the Verify button. **Bug:** the "wallet before → after" line always shows `max(0, balance − 30)`, but in the low-balance path `verifyCode()` leaves the balance unchanged and adds 30 to arrears — so it shows "after: 0" while also saying "recorded as arrears". The disclosed number must equal the actual outcome. |
| 3 — Money + code readability | Pass | `tnum` (tabular-nums) on all amounts; `mono-code` = JetBrains Mono + `slashed-zero` + `font-feature-settings "zero"` on the OTP/input; Inter + JetBrains Mono actually loaded via Google Fonts in `__root.tsx`. OTP is the only bare numeral; every other number carries a KES/min label. |
| 4 — States without color alone | Pass | Every state = icon + word: Verified (CheckCircle2), Expired (Clock), Already-redeemed (AlertOctagon), Arrears (AlertTriangle), Not-found (XOctagon). Disabled Verify button is `bg-secondary`, never amber. One amber action per screen. |

## Fixes identified (not yet applied — Lovable workspace out of credits)

The iteration could not be pushed through the Lovable agent because the
workspace ran out of credits after the initial build. The two edits below are
drop-in replacements; apply via the Lovable editor, or re-run the agent once
credits are topped up.

### Fix 1 — arrears disclosure must match the real outcome (`src/routes/merchant.tsx`)

Replace the single "before → after" paragraph with a branch:

```tsx
{wouldGoNegative ? (
  <p className="mt-1 tnum text-xs text-muted-foreground">
    Wallet stays <span className="text-ink">{formatKes(wallet.balanceKes)}</span> ·{" "}
    <span className="text-ink">{formatKes(SUCCESS_FEE_KES)}</span> added to arrears
    {" "}(owed:{" "}
    <span className="text-ink">{formatKes(wallet.arrearsKes + SUCCESS_FEE_KES)}</span>)
  </p>
) : (
  <p className="mt-1 tnum text-xs text-muted-foreground">
    Wallet <span className="text-ink">{formatKes(wallet.balanceKes)}</span> →{" "}
    <span className="text-ink">{formatKes(wallet.balanceKes - SUCCESS_FEE_KES)}</span> after verify
  </p>
)}
```

### Fix 2 — label the feed "Was" price (`src/routes/index.tsx`)

The tile shows a struck-through `KES 750` with no label, unlike deal detail
("Was KES 750"). Prefix it:

```tsx
{d.wasKes ? (
  <span className="tnum text-xs text-muted-foreground line-through">
    Was {formatKes(d.wasKes)}
  </span>
) : null}
```

## Follow-up

- [ ] Top up Lovable credits, then apply Fix 1 + Fix 2 and re-read the diff to
      confirm the disclosed wallet number equals the post-verify outcome in both
      the covered and arrears cases.
- [ ] Optional: extend the prototype (merchant wallet/top-up, arrears ledger,
      deal creation with charge disclosure) — deferred until credits allow.
