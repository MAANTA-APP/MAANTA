# Skill — Avatars + Notifications (shopper/merchant)

**Status:** shipped in code 2026-07-26.  
**Related:** `docs/skills/claude-design-system.md`, `docs/skills/node0-seed-bbs-mall.md`.

## Notifications UX

- **Single home:** `/notifications` — inbox alerts + preference toggles.
- Profile Settings keeps **Notifications** and **Help & support** only (no
  separate “Notification preferences” row).
- `/notifications/preferences` redirects to `/notifications`.
- Prefs are device-local (`localStorage` key `maanta_notification_prefs`) until
  a server prefs column ships: Flash near me · Saved shops · Code expiry.

## Avatars

### Schema / storage

Migration `20260726190000_avatars_storage_and_columns.sql`:

| Piece | Detail |
|---|---|
| `users.avatar_url` | Shopper profile photo URL |
| `merchants.avatar_url` | Merchant shop photo URL |
| Bucket `avatars` | Public read, 1 MB, jpeg/png/webp |
| Paths | `users/<user_id>/profile.<ext>` · `merchants/<merchant_id>/profile.<ext>` |
| RLS | Authenticated users manage own user folder; merchant owners manage own merchant folder |

### App wiring

| Surface | Component / route |
|---|---|
| Shopper Profile | `AvatarUpload` → `POST /api/profile/avatar` |
| Merchant Settings | `AvatarUpload` → `POST /api/merchant/avatar` (owners only) |
| UI | `src/components/ui/claude/avatar-upload.tsx` |

Uploads use the **service role** (same pattern as deal-images). Existing photo
is kept if the new upload fails.

## Operator

```bash
cd maanta-app
supabase db push   # applies avatar + preferred_language migrations
```
