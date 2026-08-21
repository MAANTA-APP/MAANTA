# Auth screens polish — 2026-08-21

Scope: `/login`, `/sign-up` (both strategy branches), `/verify-phone`, and the
shared pieces (`AuthChrome`, `SupabaseEmailLogin`, `OtpInput`, `PhoneField`).
Both auth strategies audited — Clerk (production) and Supabase email OTP (code
default, what CI exercises). Clerk's own form internals are vendor-rendered
and style-configured via `ClerkAuthShell`; the fixes below are on the
MAANTA-rendered surfaces.

## Audit verdicts

| Guideline | Verdict |
|---|---|
| Input semantics | PASS — `autocomplete="email"` / `"one-time-code"`, `inputMode` numeric/tel, labels wrap their inputs |
| Errors announced | PASS — both flows render through `InlineAlert` (`role="alert"`), with mapped, human error copy |
| Resend with cooldown | PASS — 30s countdown, disabled state explained in the button label |
| Open-redirect safety | PASS — `safeInternalPath` on `?next=` |
| Honest success | PASS — verified state is icon + word, verified tint, auto-return announced ("Taking you back…") |
| Enter submits a single-field step | **Fixed** — no stage was a real `<form>`; Enter in the email, phone, or code field dead-ended. All four stages (email/code, phone/code) now submit on Enter with `type="submit"` primaries and explicit `type="button"` ghosts (an untyped button inside a form is a second submit) |
| Label semantics | **Fixed** — verify-phone's "Enter the 6-digit code" was a bare `<label>` associated with nothing; now a `<p>` (OtpInput names itself via `ariaLabel`) |

## Changes

- `src/components/auth/supabase-email-login.tsx` — both stages wrapped in
  `<form onSubmit>`; primary `type="submit"`, ghost `type="button"`.
- `src/app/verify-phone/page.tsx` — same for both Clerk stages; bare label →
  `<p>`.
- `src/components/__tests__/auth-ui-polish.test.ts` — ratchets: two forms and
  exactly two submits per file, ghost buttons typed, no unassociated label.

## Verification

From `maanta-app/`: `npm run lint` clean · `npm run typecheck` clean ·
`npm test` 117 files / 993 tests passed · `npm run build` passed with all
three post-build gates clean. CI's own e2e path runs the Supabase branch,
which is one of the two branches changed here; the Clerk branch change is the
same mechanical form-wrapping on `verify-phone`.

## Drift

None found; D59 (decisions log calls Clerk the default vs `supabase` in code)
remains open and founder-owned — nothing here touches strategy selection.

## Open decisions

None.
