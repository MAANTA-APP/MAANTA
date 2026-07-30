# Skills: Notification prefs canonical routes (2026-07-30)

Last updated: 2026-07-30 · Status: **shipped**.

## Decision

**One canonical prefs surface:** `/you/notifications` (wireframe You → Notifications).

| Route | Role |
|---|---|
| `/you/notifications` | **Canonical** preference toggles (`NotificationToggles`) |
| `/you` | Avatar + profile settings; Settings row links to `/you/notifications` |
| `/notifications` | Inbox / alerts list only — link out to prefs, do **not** nest toggles |
| `/notifications/preferences` | Legacy redirect → `/you/notifications` |
| `/profile` | Legacy redirect → `/you` |

## Why not nest prefs on `/notifications`

PR #94 briefly nested the same toggles on the inbox. That duplicated
`/you/notifications` and drifted from the frozen You wireframe. Consolidation
keeps avatar upload on `/you` and prefs only on `/you/notifications`.

## Prefs storage

Device-local `localStorage` key `maanta_notification_prefs` until a server
column ships (Flash near me · Saved shops · Code expiry).
