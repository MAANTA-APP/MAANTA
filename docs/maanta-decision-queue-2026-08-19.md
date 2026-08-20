# MAANTA decision queue — 2026-08-19

**What this is.** Every open drift row that is waiting on a **ruling** rather than
a diff, ranked, with the question stated so it can be answered in a sentence, the
evidence that makes it answerable, and the options with their consequences.

**What it is not.** It makes no decisions. Where a recommendation is defensible
from evidence alone it is marked **Recommendation** and is still yours to
overturn; where the choice is genuinely value-laden it says so and offers no
default.

**It is a derived view, not a second register.** `docs/maanta-drift-register.md`
remains the only place that carries state; nothing here may be updated in place,
and no row closes by being answered in this document — it closes in the register,
by ID, with a guard named. **D27** exists because a second artifact that carries
state is how "we already tracked that" became unanswerable, so this one is dated
in its filename and goes stale on purpose. Re-derive it rather than edit it.

**Why now.** The register carries **36 open rows**. **23 are founder-owned** and
three more are eng-owned with a ruling blocking the engineering half. That ratio
has climbed every session: the constraint stopped being engineering capacity
somewhere in the last two sessions, and one item acquired a deadline yesterday
that it did not have before.

**How it is ranked.** In order of precedence:

1. **A window that closes.** Exactly one item has one.
2. **Blocks a fix that is already written and waiting.**
3. **Money, trust, or a shopper at a counter.**
4. **Blocks other rows** — answering it unblocks a chain.
5. **Cost of deciding late** exceeds the cost of deciding now.

Rows that are open but *not* waiting on you are listed in §5 so the ratio is
honest.

---

## 0. The state everything below is measured against

All read live on **2026-08-19**, not inferred.

| Fact | Value | Source |
|---|---|---|
| Production serves | `main @ 5040acda` | Vercel `maanta-nuia`, `target: production` |
| Last three production deploys | all from `main` (`5040acda`, `a6bc30cd`, `95374d6b`) | Vercel — no promote in the window |
| This session's four commits | previews, `target: null` | **D129 is not live** |
| Clerk-linked `users` rows | **10** — 9 path (a), 1 path (b) | Supabase `axrrslqssmbngbataejg` |
| …of which real | **9, all path (a)** | the one path (b) is the seeded demo admin |
| Clerk-linked admins | **3** | — |
| Newest user row | 2026-08-16 | no sign-up activity in 3 days |
| Real merchants / real staff seats | 1 / **0** | SKANDI SKAN has no staff seat |
| `app_config.demo_mode_enabled` | `'true'` | — |

> **Superseded the same evening (2026-08-19, after 22:35 UTC) — the two
> deploy-state rows above are stale.** Q1 was ruled **A** and shipped: PR #235
> merged through `main` as squash `693ca47` on a fully green CI run; production
> went READY at 22:43 UTC serving `target: production` from `main`, so **D129
> and the verified-email fallback are live**. Migration `20260819200000` was
> applied under founder authorization at 22:51 UTC, read back, and the ledger
> reconciles at **97/97**. **D108 and D142 are closed** — the register is the
> state. Still true from the table: demo mode on, 1 real merchant, 0 real staff
> seats, no sign-up since 2026-08-16, and the two all-real duplicate-email
> groups remain a founder data decision.

---

# 1. Has a deadline

## Q1 — D108, prevention half: should `ensureAppUser` fall back to a verified email?

**Rank 1 because the window is open and free, and closes on deploy.**

**The question.** When a Clerk JWT `sub` matches no `public.users` row, should
provisioning fall back to matching a **Clerk-verified email** before inserting a
new account — and if so, on what conditions?

**Why it has a deadline.** `ensureAppUser` resolves a person by Clerk `sub`
alone. On a Clerk instance change the same human arrives with a `sub` that
matches nothing, and one of two things happens, decided by a UNIQUE constraint
rather than by anyone:

- **Path (a)** — `users.phone` is NULL: the insert succeeds, they get a **second
  account** with `role: 'customer'`, no claims, no merchant, no admin rights.
  Silent.
- **Path (b)** — Clerk returns the phone the old row holds: `users_phone_key`
  violates, the catch path re-reads by `clerk_user_id`, finds nothing, and
  `ensureAppUser` returns **null** — **no account at all**.

**D129 moves people from (a) to (b).** It backfills `users.phone` on sign-in, and
the claim gate already requires a verified phone, so every active shopper
acquires one. Today 9 of 9 real users are on (a). After D129 deploys, that share
falls with every sign-in.

**Which is worse — two axes, pointing opposite ways.** This is the part worth
being precise about, because `prod-auth-deals-recovery.md` argues the other way
and is not wrong:

| Axis | Path (a) | Path (b) |
|---|---|---|
| Detection | silent — nobody reports "I have a second empty account" | **loud** — visible failure, easier to diagnose |
| Repair | duplicate row survives; the new `sub` can be harvested from it | **never inserted** — repair needs the `sub` from the Clerk dashboard, per person |
| Experience at a counter | signed in but empty | **no account at all** |

So (b) is better to *notice* and worse to *fix*, and worse for the person
standing at the till. At **9 users** that repair is an afternoon. At **200 pilot
shoppers** it is not.

**Why the window is free rather than a trade-off.** D129 fixes a **certain**
failure — invite a staff seat by phone and it will not link, guaranteed, with
nothing logged — and worsens a **conditional** one that fires only on a Clerk
instance change nobody is planning. On expected value, deploying wins. But
nothing is urgent in either direction: **zero real staff seats exist**, and no
user has been created since 2026-08-16. So the sequencing costs nothing.

**Options.**

| | Option | Consequence |
|---|---|---|
| **A** | **Rule the fallback, implement it, deploy with D129.** Match on a Clerk-**verified** email when `sub` misses, and only when exactly one row matches. | Removes both paths for anyone with a verified email. It is a real security decision: an email match is identity only if the *new* instance verified it, so the rule must be verified-only and single-match, with a hard failure on ambiguity — never a "closest match". |
| **B** | **Deploy D129 now; accept the repair cost while the population is 9.** Set a named ceiling — e.g. "before user 25" — at which the fallback must exist. | Cheapest today, and the ceiling is the whole control. Without a number it becomes "we'll do it later" and the population grows past the tolerable repair. |
| **C** | **Hold D129 until the fallback is ruled.** | Leaves the certain failure in place. Defensible only because zero staff seats exist — the moment one real seat is invited, this option costs a merchant their verify screen. |

**Recommendation: A, and it is nearly free right now.** The engineering is small
and this is the only moment where both paths are empty enough to change the rule
without a data migration. If A cannot be settled quickly, **B with a written
ceiling** — not B without one.

**Unblocks.** D129's deploy. Also touches **Q2**, which keys on the same column.

---

# 2. Money, trust, and the counter

## Q2 — D136: does "one claim per phone per day" exist, and in what form?

**The question.** It is a frozen rule in the Decisions Log and the Design Brief
and it is **implemented nowhere** — not in `claim_deal`, not in the route, not in
`check_rate_limit`. Build it, or withdraw it?

**Evidence.** `claim_deal` (read back from production) enforces only *one active
pending claim per deal per user*. A search across `src/` and `supabase/` for any
per-day or per-phone limit returns nothing.

**Three sub-questions, each of which changes the code.**

1. **Per user or per phone?** The rule says phone. `redemptions` has no phone
   column, and `users.phone` is the column **D129** exists to fill — it was NULL
   for every real user until that fix, so a phone-keyed limit had nothing to bind
   to. *This makes Q2 depend on Q1's outcome.*
2. **Does a failed or expired claim consume the day?** Given **D134**, an
   abandoned claim that is never swept would silently cost a shopper their day.
3. **Which timezone?** `date_trunc('day', now())` is UTC; Nairobi is UTC+3, so a
   naive implementation resets the limit at **03:00 local**.

**Options.** (i) Build it in `claim_deal` — the D84 reasoning: the route is not
the enforcement point. (ii) Withdraw it from the frozen rules with a dated log
entry. (iii) Defer past the 3-person pilot, where it cannot bind anyway.

**No recommendation on (i) vs (ii)** — that is a product-scope call. But whichever
is chosen, it should be recorded rather than left frozen-and-unenforced: a frozen
rule nothing enforces is the exact claim-vs-reality gap the register exists for.

---

## Q3 — D135: a real-tagged ledger row belongs to a demo merchant

**The question.** Two decisions, and only the second is really a call.

**Evidence.** `merchant_transactions` holds exactly two `is_demo = false` rows,
both KES 300 opening credits. One belongs to SKANDI SKAN (correct). The other
belongs to **Macmacaan Sweets & Café, which is `is_demo = true`**. Nothing
constrains a ledger row's `is_demo` to match its merchant's — no CHECK, no
trigger. So **every money figure filtered `is_demo = false` over-reports by KES
300**, and only a join reveals it.

**Options.**

- **The constraint** (not really a call — recommended): derive `is_demo` from the
  parent merchant rather than accepting it from the writer, making the class of
  defect unrepresentable. Worth considering for `redemptions` and `deals`, which
  carry the same independent flag.
- **The existing row** (yours): flip it to `is_demo = true` to match its merchant,
  or leave it and record why. **Claude must not correct production data.**

**Until either happens**, any wallet or revenue figure filtered `is_demo = false`
is KES 300 high and should say so. This is the guardrail `CLAUDE.md` states as
"demo data never reaches a number", failing at the one place a number is computed.

---

## Q4 — D133: does an admin's Feature action survive the next redemption?

**The question.** `recalculate_trust_metric()` unconditionally sets
`is_featured = trust > 0.90`. The admin console offers **Feature / Unfeature**
and records it in `admin_ops_log`. So an admin who features a merchant at or
below 0.90 has that decision silently undone by the next verified redemption —
with the audit log still showing the action as if it stood.

**Narrower than it first looks, and the narrowing matters.** There is **no admin
visibility override** — a grep of `src/` finds no write to `is_visible` anywhere.
Only `is_featured` is in conflict. Shadow-ban and suspend use different columns
and are unaffected.

**Options, ascending in cost.**

| | Option | Consequence |
|---|---|---|
| **A** | Accept it; correct the surface so the button reads as a nudge, not a pin. | Cheapest. The console currently implies persistence it does not have. |
| **B** | Make the override durable — a dedicated column the recalculation reads and never writes. | Audit log and behaviour finally agree. |
| **C** | Remove the admin action; trust is the only author of placement. | Simplest model, loses an ops lever. |

**Commercial, not just engineering:** placement is what Elite merchants pay
**KES 500 / 24h** to influence through boosts.

---

## Q5 — D128: what should `authenticated` hold, and should the repo assert it?

**The question.** Two, and they are separable.

**Evidence.** On production, `authenticated` holds the full
`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` set on **six**
tables — `users`, `fee_reversals`, `guardian_events`, `merchant_favourites`,
`merchant_staff`, `notifications`. The first two are the fraud-and-money audit
tables; `merchant_staff` is the seat table three rows were spent hardening.
**No migration grants or revokes anything on `public.users`** — the state is
inherited from `ALTER DEFAULT PRIVILEGES` and asserted nowhere in version
control. A fresh `supabase start` gives a *tighter* database than the one serving
shoppers, so CI tests something production is not.

**Exposure is bounded** — RLS is on for all six, so a grant reaches only rows a
policy admits, and `20260817130000` freezes the identity columns within that.

**Options.** (1) What `authenticated` *should* hold — codifying production's
`TRUNCATE`/`DELETE` is not obviously right even behind RLS. (2) Whether the repo
should assert its own default privileges so CI and production stop diverging for
**every table created from here on**. (2) is the one that compounds.

---

## Q6 — D134: what happens to an expired claim nobody redeems?

**The question.** Five redemptions are `pending` with `expires_at` in the past —
**three of them real**, expired 2026-08-14/15. Nothing will ever move them: three
`pg_cron` jobs exist and none touches redemptions; `verify_redemption` only marks
`failed` if someone presents the code, which by definition nobody will.

**Two consequences.** They are invisible to the trust metric, which counts
terminal states only. And they **inflate the denominator of claim-to-redemption
conversion** — one of the two launch metrics the Fundamentals Scorecard asks for.
At pilot scale, three stale rows are a large share of it.

**Three questions the sweeper's design turns on.**

1. **What terminal status?** `failed` matches what `verify_redemption` writes on
   a late presentation — but it also feeds the trust metric's failure count, so
   sweeping would retroactively move merchant trust for something no merchant
   did. A distinct `expired` status avoids that and widens a CHECK constraint.
2. **Cron job or lazy fixup?** The shopper already sees an expired ticket
   correctly, so this is a reporting fix, not a UX one.
3. **Sweep the three existing real rows, or keep them as pilot evidence?**

**Until ruled**, any conversion figure computed from `redemptions` must state that
expired-pending rows are in the denominator.

---

# 3. Launch gates and ops posture

## Q7 — D14 + D18 + D19: the demo switches, and the trap between them

**The question.** Not *whether* — the launch checklist already says flip
`app_config.demo_mode_enabled` to `false`. The question is **whether the two
switches get flipped together by a tool or by a person remembering.**

**The trap (D18).** `make demo-off` touches only `app_config`. Turning demo mode
off while the Vercel var `MAANTA_DEMO_MODE` stays `true` tags **real** events as
demo — the precise inversion of what the tagging exists for. D19 adds that the
var is unset on Preview, so preview traffic reaches PostHog indistinguishable
from production.

**Options.** (a) Make the ops target set both, so the pairing is mechanical.
(b) Keep them manual and put both in the launch checklist. **Recommendation: (a)**
— this is the shape the register keeps punishing, a rule enforced in one place and
depended on in two.

**Not measurable from a Claude session:** both Vercel vars. Someone with dashboard
access must read them.

---

## Q8 — D71 + D56: is promoting a branch a practice or an incident?

**The question.** Five branch promotes to production have happened. Vercel offers
**no project-level control** restricting Promote to the production branch
(checked against the REST API). The tripwire had its first live catch on
2026-08-07 — a promote went red in ~38 minutes and was rolled back.

So: **is tripwire + role audit + preview-URL protection the accepted standing
guard**, or should promote rights be narrowed to people who will not use them?

**Evidence today:** the last three production deploys are all from `main`. That is
evidence the pattern has not recurred *lately*, not that it cannot.

**D56 puts the sharper version:** if promoting a working branch is the intended
workflow rather than an accident, the row should be **rewritten as a deliberate
practice with its risks named** — what is not sustainable is a documented incident
class with no control and a recurrence rate of once every eight hours.

A closure pack is already staged at `docs/ops/d71-closure-pack-2026-08-06.md`,
gated on two dashboard items.

---

## Q9 — D59: is Supabase or Clerk the intended default, and what happens to a misconfigured deployment?

**The question.** `docs/maanta-decisions-log.md` (2026-07-28) calls `clerk` the
default. `DEFAULT_AUTH_STRATEGY` in code is `supabase`. Either the log means
"default for production", in which case it should say so — or the intended
fallback is Clerk and the code is the outlier.

**It is a fail-safe question, not a wording question:** the two answers differ in
what a deployment with missing env vars serves.

**Evidence, re-measured 2026-08-19 19:37 UTC:** production serves
`pk_live_Y2xlcmsubWFhbnRhLmFwcCQ`, loads clerk-js from `clerk.maanta.app`, renders
`ClerkAuthShell`, returns `x-clerk-auth-status: signed-out` — so **both** strategy
vars are explicitly `clerk` in Vercel Production. Note this is not new evidence:
it is the same reading that closed **D99** on 2026-08-16.

**Unblocks D82** (shopper phone/email editing), which was deferred behind it.

---

## Q10 — D95: is offline reading in product scope at all?

**The question.** MAANTA is described as a PWA in several places; `sw.js` has no
`fetch` handler, no Cache Storage, no precache. Nothing user-visible claims
offline capability any more (D92 closed on copy), so this is an internal-description
gap, not a live falsehood.

**The ceiling is worth stating before the decision, because "make the PWA work
offline" implies more than the money path can support.** Caching would let a
shopper **read** a claimed ticket without a network. It would still not let them
claim or redeem one — `claim_deal` and `verify_redemption` are RPCs. So the
ceiling is read-only resilience.

**Recommendation: defer to the pilot**, which is what the row already says —
let the 3-person Node 0 run report whether connectivity at the counter is
actually a problem.

**One trap this session surfaced:** shipping a `fetch` handler would plausibly
make Chrome's install prompt appear and thereby "fix" **D139**'s measurement.
That would answer a product question with a workaround, and it was declined.

---

## Q11 — D139: who takes the two device measurements?

**Not a ruling — an assignment**, listed here because nothing moves without it.

**The question.** Who, on what device, by when?

**What is owed.** (1) One Chrome-on-Android visit to `/download` recording whether
the install button renders — equivalently a Lighthouse installability run. (2) One
iOS Safari Add to Home Screen recording the icon used, the home-screen title
(should now read **"Maanta"**), and the `/app-bootstrap` landing.

**Why it cannot be done here.** Both are browser-behaviour questions that cannot
be settled from the repository, and nothing in CI observes them.

**State it precisely until then:** the install funnel is **unproven**, not
working. The repo-side work is complete as of today — both icon purposes at SVG
and raster 192/512, `appleWebApp` metadata shipped.

---

# 4. Product scope and documentation

Lower rank because none of them changes what happens at a counter next week.

| | Row | The question | Options |
|---|---|---|---|
| **Q12** | **D131** | Search matches title and shop name only; three specs say merchant name, item, title, description **or category**. | Widen the code (a `%q%` ilike over `description` changes result quality and cost; category matches nothing today since no live deal carries one) — or narrow the spec and correct the three documents. |
| **Q13** | **D132** | Three `SECURITY DEFINER` views exist against Notion's D-002 ban. **The two browse views are already a documented exception** (decisions log, 2026-07-23) — only `demo_data_census` is uncovered. | Convert the census view to invoker with an explicit grant, or fold it into the same documented exception. Separately: should Notion's D-002 carry the repo's exception so the two records stop disagreeing? **Do not touch the browse views** — `security_invoker = false` is the mechanism anonymous browse works by. |
| **Q14** | **D81** | Design-sync C1 claims there is no disputes surface; the queue exists. Genuinely absent: a shopper-initiated report form, and any 72-hour SLA aging. | Is 16k a new disputes surface, or an SLA-aging layer on the shipped queues (smaller, no second queue to drift)? Does the 16l shopper report form ship for the pilot, or does WhatsApp stay the channel? |
| **Q15** | **D82** | Does 16c's phone/email editing ship for the pilot? | **Blocked behind Q9.** A phone change is identity-sensitive and auth-strategy-dependent. The until-dirty Save gate is a small standalone fix that could ship regardless. |
| **Q16** | **D137** | Founder ruling G3 ranks `PROJECT_RULES` at position 2 and no such file exists. `CLAUDE.md`'s source-of-truth section is a *different* framing — a subject-matter split, never reconciled with the ranking. | Create the file and say what belongs in it that is not already elsewhere — otherwise it becomes a fourth place for a rule to drift — or amend G3 to drop rank 2 and state the subject-matter split as operative. |
| **Q17** | **D114** | Needs an asset, not a decision: one **1024×1024 PNG, square, fully opaque, no rounded corners**. | Until it exists, two marks ship knowingly — new lockup in the header, previous shield in the tab and app icon. Today's raster icons deliberately rasterise the old mark rather than pre-empt this. |
| **Q18** | **D31** | Documents still say the launch offer was "removed entirely"; only the ungoverned wording was withdrawn. | Correct the two documents, or name the single authoritative replacement they should defer to. Code path is guarded; the exposure is operator and marketing copy written from a stale doc. |
| **Q19** | **D68** | Three of four branch slices are still undisposed — merchant lifecycle, PWA install, shopper deal-list controls. | Give each a disposition: landed in a reviewed change, or explicitly declined. A ruling that the co-founder enum stays deferred settles the RBAC slice **only** — it is not permission to delete the branch. |
| **Q20** | **D50** | The founder decision was taken; the row is open because **D33's justification** no longer holds — a marketing route now renders synthetic deal rows while the demo banner is correctly not mounted there. | Restate the D33 rule on its actual basis (the banner belongs where *seeded database rows* render, not where any mockup does), or accept the drift as recorded. |
| **Q21** | **D26** | *(eng-owned, blocked on a ruling.)* Must every `design-ahead` frame cite an open drift row? | It would fail today on `/contact`, the file's only design-ahead surface, whose note is accurate and cites nothing. So adopting it means either opening a row for `/contact`'s missing API, or ruling that a self-explanatory note suffices. Narrower question: should the rule bind `gated` and `blocked` too? |
| **Q22** | **D83** | *(eng-owned; half (2) is a ruling.)* Two of three items are **already implemented** — the null-reference double-credit and the amount reconciliation. Only static-secret authentication remains. | Gate the IntaSend rail on a real payload signature before M-Pesa goes live, or accept the static challenge as authentication-only on a prepared-not-assumed rail. |

---

# 5. Open but **not** waiting on you

So the ratio above is honest. These need engineering time or an external event,
not a decision.

| Row | Why it is not yours |
|---|---|
| **D15** | Add `elite_subscription_kes` when subscription billing is wired to a processor. Revisit at the Feb 2027 price review. |
| **D27** | Fold the parity register into this one, or make it explicitly narrative. Eng cleanup. |
| **D39** | **A 30-second terminal job:** `curl -sI https://www.maanta.app/how-it-works` with redirects **not** followed. Neither Claude session can take it — this environment's proxy refuses the domain (403) and the Vercel fetch that works follows redirects, which is precisely what the row forbids. **Hand to Abdulrazak.** |
| **D51** | Fixed; open until `OFFERS.eliteTrial.expiresOn` passes and both pages drop the offer together. Nothing to decide. |
| **D54** | Fixed in code; open until someone renders the merchant/shopper/ops surfaces, which sit behind auth. |
| **D86** | The standing procedure now exists. Whether that closes it is an eng judgement. |
| **D93** | Repo half shipped today; the remainder is **Q11**. |
| **D112** | Needs a device reproduce, not a guess. Deliberately not fixed blind. |
| **D118** | Dormant at Node 0 density. Fix when it approaches the row limits, not before. |
| **D140** | Normalise `frames.json`'s `frontend` paths; eng cleanup. |
| **D141** | Assert the manifest `start_url` resolves; eng, small. |

---

# 6. If you only answer three

**Q1 (D108 prevention)** — ~~because the window is open, free, and closes the
moment D129 reaches production.~~ **Answered A and live in production the same
evening (2026-08-19); D108 closed.** Q3 and Q7 move up.

**Q3 (D135 ledger flag)** — because it is the one item that silently corrupts a
number in every report anyone will read, and the constraint half is not even a
judgement call.

**Q7 (D14/D18 demo switches)** — because it is on the launch path, and the trap
between the two switches turns a correct launch step into mis-tagged production
data.

---

## Sequencing note that survives this document

**D129 must reach production through `main`, never a promote.** Production is
clean on that front right now and has been for its last three deploys; the four
commits on `claude/work-in-progress-7nudnu` are previews carrying `target: null`.
Merging through `main` is what keeps **Q8** an open question rather than a sixth
occurrence.

**Satisfied 2026-08-19 evening:** D129 reached production exactly this way —
squash `693ca47` through `main`, deployment `target: production`, no promote.
Q8 stays an open question rather than a sixth occurrence.
