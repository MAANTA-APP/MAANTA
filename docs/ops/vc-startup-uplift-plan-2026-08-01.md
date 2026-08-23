# VC-startup uplift plan — 2026-08-01

Audience: founder + engineer. Scope: marketing site + app shell polish without
breaking frozen marketing guards or held claims.

Related: `docs/ops/IMPLEMENTATION-REPORT.md`, `CLAUDE.md` marketing rules.

---

## 1. Current state audit

### What already reads VC-ready

| Surface | Strength |
|---|---|
| Marketing IA | Three-audience nav (shoppers / merchants / mall operators) — rare clarity for early-stage |
| Design tokens | Frozen Pass 2 palette in `tailwind.config.ts`; `frozen-ui-rules.test.ts` enforces |
| Copy discipline | Numbers from `facts.ts`; scenario figures gated by `ScenarioNotice` |
| Typography base | DM Sans + JetBrains Mono loaded; negative tracking on headings |
| App shopper chrome | Claude-calm stone wash, LocationPill, card shadows |
| Legal/compliance | PrelaunchNotice, held-claims scanner, token checker in build |

### What still reads MVP

| Surface | Gap |
|---|---|
| Marketing hero | Flat white background; no depth hierarchy vs funded startups |
| Social proof | No trust strip; relies on copy alone for credibility |
| Motion | Minimal scroll/interaction feedback; cards feel static |
| Login | Generic centered form; no brand anchor on entry |
| Merchant chrome | Functional wallet chip; lacks premium tactile feel |
| Imagery | No product screenshots, mall photography, or device frames |
| Pricing page | Correct but utilitarian — no comparison visual hierarchy |
| Empty states | App shells OK; marketing has no "see the product" visual |

**Verdict:** Content and compliance are launch-grade. Visual polish is ~70% —
strong foundation, missing depth, motion, and product imagery typical of
Series-A marketing sites.

---

## 2. Design system gaps

| Dimension | Current | VC-startup target | Effort |
|---|---|---|---|
| Typography scale | 3xl→5xl hero | Add display tier + tighter tracking on lg screens | S |
| Color depth | Flat sections | Subtle radial washes, shadow-card elevation | S |
| Spacing rhythm | py-14/20 sections | Hero py-24; trust bar as transition band | S |
| Motion | fade-in, r3 pulse | Hover lift on cards; header scroll shadow; CTA micro-press | S |
| Imagery | None on marketing | Phone mockup of feed, BBS Mall photo (when licensed) | M |
| Social proof | None | Honest trust bar (process guarantees, not fake counts) | S |
| CTA hierarchy | Good accent discipline | Amber shadow on primary; secondary stays outlined | S |

All changes must use existing tokens — no raw hex in components.

---

## 3. Page-by-page priorities

### Marketing

| Page | Priority | Changes |
|---|---|---|
| `/` Home | P0 | Hero gradient, TrustBar, card hover, early-access section wrapper |
| `/shoppers` | P1 | Reuse TrustBar pattern; hero parity with home |
| `/merchants` | P1 | Pricing band visual hierarchy; opening-credit callout |
| `/pricing` | P1 | Plan comparison cards with shadow elevation |
| `/mall-operators` | P2 | Operator-specific trust signals |
| `/about` | P3 | Team/founder photo when available |
| `/contact` | P3 | Already functional; minor form polish |

### App shells

| Surface | Priority | Changes |
|---|---|---|
| `/login` | P0 | Logomark + tagline chrome |
| Shopper top bar | P1 | Scroll shadow (done); optional logo mark |
| Merchant top bar | P1 | Wallet chip elevation |
| Feed cards | P2 | Already Claude-soft; defer |
| Merchant dashboard | P2 | KPI card shadows; defer until pilot feedback |

---

## 4. Implementation phases

### Phase A — Quick wins (this session, ~2h) ✅

- Hero radial gradient + typography scale
- `TrustBar` component (honest guarantees)
- CTA shadow + active press
- Card hover elevation on steps + door cards
- Header scroll shadow
- Login brand chrome
- Merchant/shopper top-bar polish
- Early-access section wrapper on home

### Phase B — Medium (1–2 days)

- Product screenshot hero (feed on phone frame)
- Extend TrustBar to `/shoppers`, `/merchants`
- Pricing plan card redesign
- Subtle scroll-triggered fade-in sections (respect `prefers-reduced-motion`)
- OG image refresh with new visual language

### Phase C — Larger (1 week, needs assets)

- Licensed BBS Mall photography
- Merchant onboarding video/GIF
- Animated deal-claim demo (Lottie or CSS)
- Full `/impeccable audit` pass in Claude Code
- Visual regression snapshots for marketing pages

### Phase D — Post-launch

- Real social proof (verified redemption count, shop count) via `ScenarioStat`
- Customer logos only when signed
- Case study pages per merchant pilot

---

## 5. What NOT to change

- KES 30 success fee, Elite trial terms, verify-anyway — frozen business rules
- All numbers via `lib/marketing/facts.ts`
- Modelled figures only through `ScenarioStat` inside `ScenarioNotice`
- No `{{TOKEN}}` in rendered output
- Demo banner never on marketing routes
- No held claims from `website-handoff.md` §9
- No fake partner logos or signup counts
- Amber accent discipline: CTAs + live dots only

---

## 6. Effort summary

| Phase | Effort | Impact |
|---|---|---|
| A (this session) | ~2h | High — first-impression uplift |
| B | 1–2 days | High — product visibility |
| C | 1 week | Medium — needs external assets |
| D | Ongoing | High — but requires real data |

**Recommended path:** Ship Phase A before merchant pilot. Phase B before
public launch marketing push. Phase C/D as real traction data arrives.
