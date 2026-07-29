# Design sync checklist

Paste into the PR description of any change that touches routes, user-visible
labels, runtime rules, or role/permission visibility. Rules:
`docs/design-truth-protocol.md`.

```markdown
## Design sync

- [ ] Checked `maanta-app/design/current-reality/frames.json` for the frames this touches
- [ ] `frames.json` updated (route / label / rule / status) — or N/A, and why:
- [ ] `lastVerified` bumped if `frames.json` changed
- [ ] Every drift claim in this PR names its evidence (file:line, migration, or doc)
- [ ] No `design-ahead` frame was implemented without a decision linked here
- [ ] Server-side guard is still the authority; UI hiding is clarity only
- [ ] Frozen business rules untouched, or a decisions-log entry is linked
- [ ] `npm test` passes (includes the design-truth route check)
```

## Reviewer prompts

Cheap questions that catch most design-sync regressions:

1. **Does a hidden control have a matching server guard?** UI hiding is never
   the enforcement. Look for the `requireMerchant("can_*")` / `require*Api()`
   on the other side.
2. **Does a shown control actually work for this role?** The opposite failure —
   a button that only 403s. Both are drift.
3. **Does a label promise something the query doesn't deliver?** ("Deals near
   me" over a rail that isn't distance-filtered.)
4. **Is a rail/tab/CTA reachable state representable in its own filter UI?**
   (A See-all link landing on a filter value the sheet can't show.)
5. **Does a runtime rule surface before the user invests effort,** or only as an
   error at submit? Plan limits and balance gates belong up front.
6. **Is a planned-but-unprovisioned rail presented as live?** Payment rails are
   the recurring case — card is Phase 1; M-Pesa is blocked on credentials.
7. **If the PR cites an audit, is that audit in the repo?** If not, the claim is
   unverified and must say so.

## When frames.json needs a new row

Adding a route means adding a frame. Minimum shape:

```json
{
  "id": "M-something",
  "title": "Human name of the screen",
  "route": "/merchant/something",
  "role": "merchant",
  "status": "current",
  "rules": ["staff-permissions"],
  "notes": "Anything a future engineer would otherwise have to re-derive."
}
```

`role` is one of `shopper | merchant | admin | agent | founder | public |
mall-operator`. `rules` keys must already exist in `runtimeRules` — add the
definition there first if the rule is new.
