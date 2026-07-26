-- Shopper language preference (English live; Kiswahili reserved / coming soon).
-- Stored on public.users so preference survives across devices once signed in.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_preferred_language_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_preferred_language_check
  CHECK (preferred_language IN ('en', 'sw'));

COMMENT ON COLUMN public.users.preferred_language IS
  'UI locale preference: en (active) or sw (Kiswahili, coming soon).';
