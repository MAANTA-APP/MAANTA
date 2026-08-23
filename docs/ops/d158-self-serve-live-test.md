# D158 live self-serve onboarding test — protocol and evidence sheet

**Status: NOT YET RUN.** Written 2026-08-23, immediately after D158 was applied
to production, for the founder or the Nairobi field operator to execute.

It could not be run from the authoring session: the environment's network policy
denies `maanta.app`, `www.maanta.app`, `maanta-nuia.vercel.app` and
`clerk.maanta.app` at the proxy (403 on CONNECT), so no browser or curl reaches
production from there. Everything below the browser is already proven — see
"What is already proven" — what is unproven is the actual human path.

## Why this test exists

D158 made owner phone optional when the authenticated account has a verified
email. The migration is live and the DB behaviour is verified. But CLAUDE.md's
standing rule is that a UI-only or DB-only proof is not a proof of the product:
until a person completes this in a browser, self-serve onboarding on email alone
is **deployed, not proven**.

The test also covers the *lifecycle*, not just the form — the approval gate is
the half most likely to be wrong, because it lives on the deal-write routes
rather than in the app shell.

## Preconditions

- A Clerk account with a **verified email** and **no phone**. `aragagency@gmail.com`
  qualifies: it was demoted back to `customer` in the 2026-08-23 cleanup and owns
  no merchant.
- Do **not** use a Microsoft-hosted mailbox — **D156** is open: Clerk's shared
  sender does not deliver to outlook/hotmail/live addresses.
- An admin account for the approval half (`admin@maanta.app`).
- Note the baseline before starting: production currently has **0** merchants
  with a NULL phone. The first NULL-phone row is this test's signature.

```sql
-- baseline
SELECT count(*) AS merchants, count(*) FILTER (WHERE phone IS NULL) AS null_phone
  FROM public.merchants;
```

## Steps, and what each one proves

| # | Do this | Proves | Expected |
|---|---|---|---|
| 1 | Sign in at `/login` with the verified-email account (email code) | The email-primary path works for a would-be merchant | Signed in, no phone required |
| 2 | Go to `/merchant/onboard`, step 1 | **D158 itself** — the field is labelled optional | "Owner phone (optional)" and the helper line about email |
| 3 | Fill only the shop name. Leave phone **blank** | The Continue gate reads the verified-email predicate | Continue is **enabled** |
| 4 | Complete steps 2–4 (what3words, floor, wallet), answer the agent question **"No"** | Self-serve attribution, no admin/agent fallback | Submits without error |
| 5 | Read back the row | The RPC stored what it should | `phone` NULL, `email` set, `status='pending'`, `onboarding_mode='self_serve'` |
| 6 | Stay signed in as the merchant; open the merchant app | A pending merchant can reach the app | Wallet/redeem reachable; "Waitlist — pending approval" banner |
| 7 | **Try to publish a deal** | The approval gate is real | Refused — HTTP 403, "Your shop is pending approval — you can publish once it's live." |
| 8 | Open the admin merchant detail page for this shop | **D160** — the contact renders once, not twice | `Contact: <email>` — NOT `<email> · <email>` |
| 9 | Approve the merchant in admin | The gate opens on approval | `status` becomes `active` |
| 10 | As the merchant, publish a deal again | The whole lifecycle, not just the form | Succeeds (subject to the zero-balance gate — top up first if the wallet is empty) |

Step 7 → 9 → 10 is the part worth not skipping: it proves the lifecycle rather
than merely that the form submits.

## Evidence to record

```sql
-- after step 5
SELECT id, merchant_name, phone, email, status, tier,
       onboarding_mode, onboarded_by_user_id, assisted_by_agent_id, created_at
  FROM public.merchants
 WHERE phone IS NULL
 ORDER BY created_at DESC LIMIT 1;

-- after step 9
SELECT id, status, onboarded_at, elite_trial_active FROM public.merchants WHERE id = '<id>';

-- confirm the invariant still holds across the table
SELECT count(*) FILTER (WHERE phone IS NULL AND email IS NULL) AS contactless
  FROM public.merchants;   -- must be 0
```

Capture screenshots of steps 3, 7 and 8 — those are the three that can only be
proven visually.

## What is already proven (do not re-verify)

Against production on 2026-08-23, transaction-scoped and rolled back:

- email-only onboarding yields `pending` / `self_serve` with `phone` NULL and the
  user's role promoted to `merchant_admin`;
- a contactless attempt raises `contact_required`;
- `merchants_contact_present` rejects an UPDATE stripping the last channel.

And by read-back: `phone` nullable, the CHECK present and validated, **exactly
one** `onboard_merchant` overload, ledger **100/100**.

So a failure in this test is almost certainly in the **browser/auth layer**, not
the database — check Clerk sign-in and the deployed bundle first.

## If it fails

Follow the field-issue procedure in CLAUDE.md: preserve evidence (screenshots,
timestamps, IDs), reproduce, classify (blocker / defect / usability observation /
feature request), and add a drift-register row **before** writing any narrative.

## Afterwards

Clean up only if this was a throwaway shop. The 2026-08-23 cleanup is the
precedent: one FK-ordered transaction, and **keep the identities** — deleting
Clerk/`users` identities is what re-creates the D108 hazard.

Related open rows: **D156** (Microsoft mailboxes get no Clerk mail) and **D159**
(agent-assisted merchants are invisible to the assisting agent — parked until
agent-assisted acquisition begins, so it does not affect this test).
