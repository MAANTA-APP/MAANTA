# Production verification — 2026-08-22

A read of what production actually serves at the close of the 2026-08-22 build
cycle, taken before the Nairobi field pilot begins. Every line below is either a
measurement with its method named, or an explicit statement that something could
**not** be measured from this session. Nothing here is inferred from the repo.

**Method.** Plain `curl` to `www.maanta.app` is refused by this environment's
egress proxy (the standing method note from **D99**), so the HTTP read went
through the Vercel MCP fetch. That fetch appends a `_vercel_share` bypass token;
the token selects nothing on an apex domain — it cannot change which deployment
`www.maanta.app` serves — so the findings rest on the response headers and
embedded keys, not on the token.

---

## What was measured

| # | Fact | Evidence | Time (UTC) |
|---|---|---|---|
| 1 | Production is `READY` on `main @ ecfbd54`, deployed **from `main`** | Vercel deployment `dpl_82rwm9suHYUPSxSSxnF4AHQ6Ngz4`, `target: production`, `githubCommitRef: main` | 17:59 |
| 2 | The six most recent production deployments are all from `main` — **no branch promotes** | Same listing, `githubCommitRef` on each | 17:59 |
| 3 | `/login` serves the real login route | HTTP 200, `x-matched-path: /login/[[...sign-in]]` | 18:25 |
| 4 | Production runs the **production** Clerk instance | `data-clerk-publishable-key="pk_live_Y2xlcmsubWFhbnRhLmFwcCQ"` (base64 payload `clerk.maanta.app$`); clerk-js from `https://clerk.maanta.app`; `x-clerk-auth-reason: session-token-and-uat-missing` | 18:25 |
| 5 | Direction A is live, not just merged | Served HTML carries `bg-stone`, `rounded-card bg-white shadow-card`, `tracking-[-0.03em]` | 18:25 |
| 6 | Security headers intact | `x-frame-options: DENY`, `content-security-policy: frame-ancestors 'none'`, HSTS `max-age=63072000`, `x-content-type-options: nosniff` | 18:25 |

### Finding 4 is the third independent confirmation of the D151 correction

**D151** was opened on the belief that production ran the Clerk *development*
instance, which would have explained the SMS failures as an instance limitation.
That belief traced to **D99**'s *opening* measurement (2026-08-14) and missed
D99's closure (2026-08-16). D59 re-measured on 2026-08-19. **This is the third
reading, and it agrees:** production serves `pk_live` / `clerk.maanta.app`, and
returns the production-instance auth-reason header rather than the
`dev-browser-missing` header that identified the development instance.

The consequence stands as recorded: the SMS failures happened on a production
instance, so the investigation belongs in that instance's **SMS settings**
(country permissions, destination allowlist, sender identity, fraud
protections), and the field SMS test is **not** blocked on provisioning
anything.

---

## What could NOT be measured, and why

These are the honest gaps. None of them is an inference — each is a check that
was attempted or identified and could not be completed from this session.

### 1. Whether Clerk offers **email** sign-in — the one that gates Phase 4

**Unresolved, and it is the blocking unknown for the pilot's email premise.**

The sign-in widget is client-rendered. The server HTML contains only a skeleton
(`aria-busy="true"`, `aria-label="Loading sign-in"`, pulse placeholders) plus the
`ClerkAuthShell` component; which factors are presented is decided by
`clerk.browser.js` at runtime. A headless render was attempted twice — direct,
then through the agent proxy with `HTTPS_PROXY` set — and both failed with
`net::ERR_TUNNEL_CONNECTION_FAILED` / `connect_rejected`. This environment's
egress policy does not permit browsing to `maanta.app`.

This is precisely the **SPEC-GAP** recorded in `src/lib/launch-auth.ts`: app code
records the intended sign-up mix, but the Clerk dashboard owns which factors the
hosted widget renders. The two can disagree and the repo cannot tell.

**Why it matters:** if email sign-up with verification is not enabled on the
production instance, Shopper 01 cannot obtain a verified email, and the claim
gate widened on 2026-08-22 delivers nothing — the pilot stalls at the step the
plan calls its most important.

**How to close it** (either is sufficient, both are quick, neither is a Claude
task): open the Clerk dashboard → *User & Authentication* → confirm **Email
address** is an enabled identifier with verification on; **or** open
`www.maanta.app/login` in an ordinary browser and look at what the widget
offers.

### 2. Production database state

`demo_mode_enabled`, the live row counts, and the opening-credit config values
were **not** read. A read-only Supabase query was attempted and refused by this
session's sandbox. `make demo-status` is the human step; the counts in the
OpTruth snapshot tables still date from 2026-08-16 and the 2026-08-19 delta,
which those tables say on their face.

### 3. Everything that requires a real person

No merchant, staff seat, claim or redemption was exercised. **Zero genuine
Node 0 merchants exist**, which is the pilot's purpose rather than a defect. The
first physical attribution cannot be verified from a terminal, by anyone.

---

## Standing hazards this read does not change

- **Demo mode is on and `claim_deal` has no demo guard.** A real shopper
  browsing `/feed` can claim a synthetic deal, and the code will then fail at the
  counter looking like a product bug. Shopper 01 must open the real deal by
  **direct link** `/deals/{id}`.
- **The KES 300 credit buys exactly 10 verified redemptions.** Past that,
  verification still succeeds (the fee records as owed) but the merchant cannot
  create a new deal. Ruled 2026-08-22 to stay, as a willingness-to-pay
  measurement.
- **No live top-up rail** (**E6**, IntaSend blocked; Stripe sandbox-only by
  frozen rule). It bites at redemption 11, not on day one.

---

## Verdict

**Everything the engineering side owes is shipped and serving.** The deployment
is aligned, the production Clerk instance is live, and the visual refresh is
real rather than merely merged.

**The loop is runnable end to end as soon as two things are true**, neither of
them an engineering task: the email sign-in factor is confirmed enabled, and a
genuine Node 0 merchant agrees to take part.

*No production database read was taken on 2026-08-22. Do not cite this document
for row counts or config values.*
