# Skill — Profile settings + notification preferences

**Status:** prefs nested under Notifications (2026-07-26).  
**Related:** `docs/skills/claude-design-system.md`, push skill if present.

## You / Profile Settings

Settings card links only:

1. **Notifications** → `/notifications`
2. **Help & support** → `/help`
3. **Sign out** (below the card)

There is **no** “Notification preferences” row on Profile.

## Notifications screen

`/notifications` shows:

- Activity list (or empty state)
- **Preferences** section with three device-local toggles:
  - Flash deals near me
  - New deals from saved shops
  - Code expiry reminders

Storage key: `maanta_notification_prefs` (localStorage) until a DB column ships.

`/notifications/preferences` **redirects** to `/notifications`.

## Components

| Path | Role |
|---|---|
| `src/components/notifications/notification-preferences-panel.tsx` | Client toggles |
| `src/app/(shopper)/notifications/page.tsx` | List + panel |
| `src/app/(shopper)/profile/page.tsx` | Settings without prefs row |
