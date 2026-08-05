# Email code delivery (pre-launch tester option)

Status: **live behaviour once merged** · Added 2026-08-05 · Sunset tracked as
**D74** in `docs/maanta-drift-register.md`.

## What it is

Until launch, a shopper claiming a deal can tick **"Also email my code to
<account email>"** on the claim confirm sheet. After `claim_deal` succeeds, the
server sends the 6-digit code to the account's email via Resend. It is a
founder-requested convenience so testers can exercise claim → redeem without
keeping the app open at the till.

The ticket screen (`/tickets/[id]`) remains the source of truth for the code.
The email is a **copy**: a failed send never fails, delays into error, or rolls
back the claim — the API responds `codeEmailed: false` and the ticket works as
before.

## Where it lives

- `maanta-app/src/lib/email-code-delivery.ts` — the gate
  (`emailCodeDeliveryEnabled()`) and the one place the email copy is built
  (`claimCodeEmail()`). No prices in the email (frozen UI rule 6 — the code
  stands alone), no emoji, closed vocabulary.
- `maanta-app/src/app/api/redemptions/route.ts` — accepts `emailCode: true`,
  re-checks the gate server-side, sends via `sendEmail()` in
  `maanta-app/src/lib/resend.ts` (10s deadline), returns `codeEmailed`.
- `maanta-app/src/app/(shopper)/deals/[id]/claim-flow.tsx` — the opt-in
  checkbox, rendered only when the gate is on **and** the account has an email.
- Tests: `maanta-app/src/lib/__tests__/email-code-delivery.test.ts` and
  `maanta-app/src/app/api/redemptions/__tests__/route.test.ts`.

## Boundaries (deliberate)

- **Account email only.** No free-typed address — a claim code goes to the
  identity that claimed, never to a third party.
- **Opt-in per claim**, default unchecked.
- **Phone-required-at-claim is untouched.** The email option runs after the
  claim gate; it is not an alternative way to claim (S2 ruling 2026-07-23).
- **The claim RPC is untouched.** No migration; this is app-layer delivery of
  a code the RPC already returned to the server.
- Sending needs `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (same env as the
  waitlist/contact mail). Missing config → send returns false, claim unaffected.

## The gate, and how to turn it off at launch

Server-only env var **`MAANTA_EMAIL_CODE_DELIVERY`**:

| Value | Behaviour |
|---|---|
| unset (today) | **ON** — testers get the option with no config step |
| `off` / `false` / `0` | OFF — checkbox never renders, API ignores `emailCode` |
| anything else | ON |

Default-ON is the point of the feature (it must work for testers now), which
means **turning it off is a launch step someone has to do**: set
`MAANTA_EMAIL_CODE_DELIVERY=off` in Vercel production env and redeploy. That
obligation is what D74 tracks — close D74 only when the env var is set in
production (or a decisions-log entry keeps the feature past launch).
