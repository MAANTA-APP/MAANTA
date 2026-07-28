# Role task checklists — Nairobi 150 seed

Last updated: 2026-07-28

Concrete UI/UX verification tasks for each `@maanta.app` test account in the Nairobi 3-node rehearsal world. Apply seeds first (`make db-seed-nairobi-150` then `make db-seed-test-accounts`).

**Auth:** use `MAANTA_AUTH_STRATEGY=supabase` and email OTP at `/login`. Phone/SMS OTP gates are relaxed in Supabase auth mode.

**Known limitations:**

- Interactive browser testing needs valid Clerk keys unless using Supabase auth strategy.
- Map view may be sparse outside BBS Mall centroid; Browse does not embed the map.
- `lifecycle_stage` is computed in app code — not a DB column.

---

## 1. Founder — `founder@maanta.app`

| Step | Route | What to verify |
|---|---|---|
| Install PWA | `/download` | Add-to-home-screen prompt or install instructions render |
| Sign in | `/login` → OTP | Lands on `/app-bootstrap` then redirects to `/founder` |
| Node overview | `/founder` | Can see cross-node summary (merchant counts, elite vs standard) |
| Merchant counts | `/founder` or `/admin/merchants` | BBS ~60, CBD ~45, Westlands ~45 |
| Deal rails | `/feed` (switch nodes) | Flash and boosted labels visible on elite-heavy nodes |

**Visual cues:** Elite badge on merchant cards; flash timer on flash deals; “Boosted” rail or badge on boosted standards.

---

## 2. Admin — `admin@maanta.app`

| Step | Route | What to verify |
|---|---|---|
| Sign in | `/login` | Lands on `/admin` |
| Merchant filter | `/admin/merchants` | Filter or search by node: BBS Mall, CBD Galleria, Westlands Hub |
| Elite vs standard | `/admin/merchants` | Tier column or badge matches seed (60 elite / 90 standard total) |
| Deals list | `/admin/deals` or merchant detail | Flash vs standard deal types visible |
| Lifecycle actions | `/admin/merchants/[id]` | Can activate waitlist merchant (e.g. seed #58 BBS pending) |
| Search synthetic shop | `/admin/merchants` | Find “Eastleigh Spices (Demo A)”, “Juniper Spa (Demo B)” |

---

## 3. Agent — `agent@maanta.app`

| Step | Route | What to verify |
|---|---|---|
| Sign in | `/login` | Lands on `/agent` |
| Default node | `/agent` | BBS Mall context (primary assignment) |
| Merchant list | `/agent` or assigned merchants view | BBS Mall merchants visible |
| Visit workflow | Merchant detail / tasks | Mark visit or complete agent task if UI present |
| Churn-risk signal | `/agent` or admin queue | Merchants with no live deals flagged (seed #59 BBS, #149 Westlands) |
| Lead capture | `/agent/leads/new` | Can create a lead for a synthetic merchant |

---

## 4. Merchant A owner — `merchant.a.owner@maanta.app`

**Shop:** Eastleigh Spices (Demo A) · BBS Mall · Elite

| Step | Route | What to verify |
|---|---|---|
| Sign in | `/login` | Lands on `/merchant/dashboard` |
| Profile | `/merchant/settings` or dashboard | BBS Mall node, Elite tier, funded wallet (~KES 1500) |
| Flash deal | `/merchant/deals` | At least one flash deal with expiry timer |
| Boosted deal | `/merchant/deals` | At least one standard deal with boost active |
| Create deal | `/merchant/deals/new` | Can create or edit a standard deal (within Elite 2-deal limit) |
| Redemptions | `/merchant/redemptions` | History empty or shows seeded pending OTP |
| Wallet | `/merchant/wallet` | Balance sufficient for success fees |

---

## 5. Merchant A staff — `merchant.a.staff@maanta.app`

**Shop:** same as Merchant A owner

| Step | Route | What to verify |
|---|---|---|
| Sign in | `/login` | Lands on `/merchant/dashboard` (staff view) |
| Redeem flash | `/merchant/redeem` | Enter OTP `881122` → success for flash deal |
| Redeem standard | `/merchant/redeem` | Claim a new deal as shopper, then verify OTP |
| Failed redemption | `/merchant/redeem` | Wrong OTP shows clear error (no false success) |
| Permissions | `/merchant/deals/new` | Staff should **not** have deal-creation if `can_deals = false` |

---

## 6. Merchant B owner — `merchant.b.owner@maanta.app`

**Shop:** Juniper Spa (Demo B) · CBD Galleria · Standard

| Step | Route | What to verify |
|---|---|---|
| Sign in | `/login` | Lands on `/merchant/dashboard` |
| Node context | Dashboard / deals | CBD Galleria — not BBS Mall |
| Standard deal only | `/merchant/deals` | One standard deal; no flash, no boost |
| Deal limit | `/merchant/deals` | Standard tier: max 1 active deal |
| Create attempt | `/merchant/deals/new` | Flash option disabled or blocked for Standard tier |

---

## 7. Merchant B staff — `merchant.b.staff@maanta.app`

**Shop:** Juniper Spa (Demo B) · CBD Galleria

| Step | Route | What to verify |
|---|---|---|
| Sign in | `/login` | Staff dashboard for CBD merchant |
| Redemption | `/merchant/redeem` | Standard deal OTP flow works |
| Node isolation | `/feed` as staff (if accessible) | CBD deals differ from BBS feed when node cookie switched |

---

## 8. Shopper Everyday — `shopper.everyday@maanta.app`

| Step | Route | What to verify |
|---|---|---|
| Install PWA | `/download` | PWA install path works |
| Feed | `/feed` | Flash rail + boosted rail + standard deals visible (BBS Mall default) |
| Browse | `/browse` | Filter by node and category; no embedded map on Browse |
| Node switch | Browse node selector | Switch to CBD / Westlands — deals update |
| Claim flash | Deal detail → Claim | Flash deal claimed; expiry + grace messaging shown |
| Claim standard | Deal detail → Claim | Standard deal in My Deals |
| Redeem flash | `/merchant/redeem` (as merchant) or in-store | OTP `881122` already pending — complete redemption |
| My deals | `/deals` or saved deals | Active claims listed with timers |

**Labels to look for:** “Flash”, countdown timer, “YOU PAY KES …”, grace period copy after expiry window.

---

## 9. Shopper Occasional — `shopper.occasional@maanta.app`

Simulate three separate sessions (document as separate visits):

### Session 1 — Browse and save

| Step | Route | What to verify |
|---|---|---|
| Sign in | `/login` | `/feed` loads |
| Browse | `/browse` | Save or favourite deals across nodes |
| No redeem yet | — | My Deals empty or saved-only |

### Session 2 — Return after 2–3 days (or re-run seed to refresh timers)

| Step | Route | What to verify |
|---|---|---|
| My deals | `/deals` | Previously saved deals show expired vs still-valid state |
| Feed | `/feed` | New flash deals may have rotated (seed refresh on re-apply) |

### Session 3 — Redeem

| Step | Route | What to verify |
|---|---|---|
| Claim | Deal detail | Claim one standard deal at CBD or Westlands |
| Redeem | In-store / merchant keypad | OTP verification → success state |
| Post-redemption | `/deals` | Deal moves to redeemed / history |

---

## Quick verification matrix

| Surface | BBS Mall | CBD Galleria | Westlands Hub |
|---|---|---|---|
| `/feed` | 60 merchants’ deals | 45 merchants’ deals | 45 merchants’ deals |
| `/browse` | Category + node filter | Same | Same |
| `/merchant/dashboard` | Merchant A | Merchant B | — |
| `/admin/merchants` | ~60 rows | ~45 rows | ~45 rows |
| `/agent` | Primary | Secondary visibility | Secondary |

## Related

- Accounts: `docs/ops/test-accounts-seed-2026-07.md`
- Nodes: `docs/ops/nodes-nairobi-2026-07.md`
