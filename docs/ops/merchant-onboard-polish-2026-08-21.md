# Merchant onboard wizard polish — 2026-08-21

Follow-up to `merchant-ui-polish-2026-08-20.md`, which deliberately left
`/merchant/onboard` out. Same method; the constraint this surface adds is
**G1**: the agent-attribution question on the review step is a rendered step,
not just a stored property (`frames.json`, `docs/skills/agent-attribution.md`)
— polish must not design it away. It wasn't touched, and a ratchet now guards
its presence.

## Audit verdicts

| Guideline | Verdict |
|---|---|
| Real fee, not a literal | PASS — `successFee` fetched server-side and passed in |
| Attribution honesty (G1) | PASS — explicit Yes/No + picker, submit gated on `attributionAnswered`, helper copy explains the disabled state |
| Prefill without overwrite | PASS — `/merchants/join` handoff via sessionStorage, empty-fields-only |
| Validated-address gate | PASS — Continue disabled until w3w resolves, disabled state explained |
| Step progress | **Fixed** — intro promises "4 steps to go live" but step headers had no position; now "Step N of 4" (location and floor both read as step 2) |
| Errors announced | **Fixed** — the two error paragraphs (validate, submit) gained `role="alert"` |
| Input labels attached | **Fixed** — the w3w label was a sibling of its input, so the wizard's one required free-text field was unnamed to assistive tech; the label now wraps it |
| Input semantics | **Fixed** — Shop WhatsApp gained `type="tel" inputMode="tel"` (owner phone/email already correct) |

Observed, deliberately unchanged: the done screen's amber check circle
(decoration, not a second amber action — R1 counts actions) and the
"KES 3,000" suggested top-up literal (a UI suggestion matching the AmountField
chips, not a fee; it appears three times and could be single-sourced if it ever
changes, but that is a refactor, not a polish fix).

## Changes

- `src/app/merchant/onboard/onboard-wizard.tsx` — the four fixes above.
- `src/components/__tests__/merchant-ui-polish.test.ts` — three new ratchets:
  step progress + announced errors; w3w label wraps its input; the G1
  attribution step and its submit gate stay present.

## Verification

From `maanta-app/`: `npm run lint` clean · `npm run typecheck` clean ·
`npm test` 116 files / 987 tests passed · `npm run build` passed with all
three post-build gates clean.

## Drift

None — the gaps were unclaimed polish debt, same class as the rest of the
series. No register rows opened.

## Open decisions

None. The polish series now covers every surface family: shopper, merchant
(app + onboard), admin/agent/founder, marketing.
