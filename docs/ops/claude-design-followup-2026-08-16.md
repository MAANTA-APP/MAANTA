# Follow-up handoff to Claude Design — 2026-08-16

**What this is:** the message sent to the design-side session after the
2026-08-15/16 repo work, kept here so the repo has a record of what the design
side was told and when. The design programme itself is not in this repo (see
`docs/skills/design-alignment-programme-verification-2026-08-15.md` §"Where the
programme's premises actually came from"); this file is the outbound half.

**Why it exists as a file:** D103 happened because the design side formed a
premise from an artifact this repo owns, and nobody could later reconstruct what
they had been told. A handoff that lives only in a chat window repeats that.

**Status:** sent 2026-08-16. Replies land design-side; anything that changes repo
behaviour comes back as a drift row or a decisions-log entry, not as an edit to
this file.

---

## The prompt as sent

### Follow-up from the repo side — 2026-08-16

Three merges landed since your last sync, all verified live in production by
healthz read-back (`commit` + `ref` fields, fresh instance each time):

| PR | Squash | Live | What it was |
|---|---|---|---|
| #209 | `a082051` | 00:04:36Z | Programme verification; D103 + D104 closed |
| #210 | `68bf077` | 00:16:49Z | The D105 trigger ruling |
| #211 | `9b63f49` | 00:45:32Z | Admin/founder navigation + role gating |

**Citation fix:** D104's closure on your side cites `b10f454`. That commit
existed only on the PR branch and was replaced by the squash — it will not
resolve on `main`. Use `a082051`, or PR #209, which survives either way.

#### 1. Merchant wallet — what a merchant now sees

The Node 0 opening credit used to render as its raw ledger description, which
carried the `app_config` key controlling the promo. Fixed at the read side
(`maanta-app/src/lib/merchant-ledger-copy.ts`), so rows already granted in
production display correctly with no migration:

- Ledger row title: **"Opening credit"**
- Transaction detail: merchant-voice description, internal reference suppressed
  (a manual grant has no external payment reference worth showing)
- New-merchant wallet state, from Design Brief v1.4 §9:
  *"KES 300 starting credit — your first 10 verified redemptions covered;
  thereafter a transparent KES 30 success fee."*

Every numeral in that sentence is **derived** — credit from the merchant's own
ledger row, fee from `app_config`, count from flooring one over the other. If
either value changes, the copy follows. Please don't pin the literals in a frame.

**Frozen by founder ruling, 2026-08-16:** the state shows only while the credit
is **unspent**, and there is deliberately **no partly-spent state**. The sentence
claims "your first N redemptions covered" and that claim expires at the first
success fee. A partly-spent variant would need a new ruling *and* new copy from
the brief — please don't design one speculatively.

**Design-system note:** `InlineAlert` gained a third variant, `info` — neutral
line border, secondary icon, ink body, and `role="note"` rather than
`role="alert"`. It exists because not every persistent money state is a
be-careful state; rendering good news in rust would repeat the colour-semantics
error D80 corrected. Please record it alongside `warning` and `error`.

#### 2. Admin and founder shells — this one overlaps your Phase 0

Both console shells had no route to the live product. Now:

- **Admin sidebar** (`src/components/nav/admin-sidebar.tsx`): a separated "Live
  product" group under the ten console items — **View site** (`/`) and
  **Shopper feed** (`/feed`), icon + word, opening in a new tab so an operator
  mid-queue doesn't lose their place.
- **Founder shell** (`src/app/founder/layout.tsx`): previously a guard plus
  providers with **no navigation at all**. It now has a header — MAANTA ·
  Founder, Admin console, View site, Shopper feed.

**The overlap:** your programme's Phase 0 lands an Operations shell. The founder
shell now has a header that did not exist when you scoped that. Please reconcile
rather than draw a second one — tell us whether the shipped header is the Phase 0
shell in embryo, or something Phase 0 replaces.

#### 3. A role pattern worth reusing

`canAccessFounderDashboard` admits `admin` **and** `cofounder`;
`canAccessAdminConsole` is `admin` alone, deliberately. So every `/admin/*`
destination shown on the founder dashboard was, for a co-founder, one click from
a redirect off the product. That was live in the four Operations cards.

The fix, and the pattern to apply anywhere a co-founder meets an admin-only
destination: **keep the information, drop the action.** A co-founder still sees
every queue and its count — read-only context is what the role is for — loses
only the links, and gets one plain line saying why. No dead cards left to explain
themselves.

Note this for any founder-cockpit frame: a surface that lists admin actions needs
a designed co-founder state, not an assumption that founder implies admin.

#### 4. The inventory lesson from D103, still applying

`maanta-app/design/current-reality/frames.json` said "Merchant-authored; agent
attribution only" for `/merchant/onboard` — true, and it read as a *guarantee*
with no surface behind it, which is how the programme concluded no agent field
existed. It is now corrected and pinned by a **biconditional** test: the
inventory documents the agent step if and only if the wizard renders it.

So: **describe what renders, not what is guaranteed.** If your work changes
`/merchant/wallet` or the admin/founder shells, the inventory entries have to
move with it or CI fails — which is the intent.

#### 5. What we need back

1. Updated design-side current-reality for the merchant wallet (opening-credit
   row, detail screen, new-merchant state) and both console shells.
2. A ruling on the Phase 0 Operations shell vs the shipped founder header.
3. The `b10f454` → `a082051` citation fix.

#### 6. Unchanged, and not yours

D82 (blocked on the D59 auth strategy), D83 (the `+24h` dead column), D-08
(commit `handoff/current-reality/` to the repo), and the Notion decisions-log
mirror remain founder-held. **D50 is still open** — no product photography
exists and the home hero is a CSS mockup, so the landing revamp still cannot be
built on real captures.

---

## Repo-side references for anything that comes back

| Topic | Where it is settled here |
|---|---|
| Opening-credit copy and detection | `maanta-app/src/lib/merchant-ledger-copy.ts`, guarded by `src/lib/__tests__/merchant-ledger-copy.test.ts` |
| The unspent-only ruling | `docs/maanta-decisions-log.md`, 2026-08-16 entry; drift row **D105** |
| `InlineAlert` variants | `maanta-app/src/components/ui/inline-alert.tsx` |
| Console navigation | `maanta-app/src/components/nav/live-product-links.ts` and the two shells |
| Co-founder gating | `maanta-app/src/components/founder/operations-links.tsx`, guarded by its sibling test |
| Surface inventory | `maanta-app/design/current-reality/frames.json`, ratcheted in `src/lib/__tests__/parity-sync.test.ts` |
| Drift rows D103–D105 | `docs/maanta-drift-register.md` |
