-- Staff seats can be invited by verified EMAIL as well as verified phone (D154).
--
-- Founder ruling 2026-08-23, following the email-primary ruling of 2026-08-22
-- (decisions log, sixth entry): Clerk phone sign-in is a paid feature MAANTA is
-- not buying for the Node 0 pilot, so email is the production auth path. The
-- shopper claim gate was widened to "a verified contact channel" on 2026-08-22;
-- the staff seat was NOT, and that left Staff 01 impossible to onboard:
-- `merchant_staff.phone` was NOT NULL, the invite API demanded a phone, and a
-- seat linked to a person only when a Clerk-verified `users.phone` matched it.
-- With the phone attribute disabled on the production Clerk instance,
-- `users.phone` is NULL for every account, so no seat could ever link.
--
-- WHY EMAIL IS A SAFE LINKING KEY — the same argument that made phone one.
-- Linking a pre-invited seat is an access-control decision, so it may only
-- trust a value the person has PROVEN they control:
--   * `users.email` is written from `verifiedPrimaryEmail()` alone
--     (src/lib/auth.ts) — a Clerk-VERIFIED primary address or nothing, the
--     same discipline `verifiedPrimaryPhone()` applies to the phone column;
--   * `20260819200000_freeze_users_email_identity` (D142) froze the column
--     against its own holder, exactly as D124 froze the phone;
--   * the verified-email relink (founder ruling A, 2026-08-19) already treats
--     it as an identity key strong enough to move an account onto a new Clerk
--     instance.
-- So this migration does not weaken the seat-hijack guard D124 established; it
-- reuses it on a second column that carries the same proof. Any future writer
-- of `users.email` that skips the verified check would break BOTH the relink
-- and this — do not add one.
--
-- Shape:
--   * `email` added, nullable, stored lower-cased (CHECK) so the match is exact
--     string equality, mirroring `normalizeStaffPhone`'s canonical E.164 rule.
--   * `phone` becomes NULLABLE — an email-only seat is now legitimate.
--   * A CHECK keeps at least one contact channel present, so a seat can never
--     be created that nothing could ever link to.
--   * UNIQUE (merchant_id, email) mirrors the phone uniqueness. Postgres treats
--     NULLs as distinct, so many phone-only seats (email NULL) coexist, and
--     likewise many email-only seats (phone NULL), under both constraints.
--
-- No existing row changes: every current seat keeps its phone and gets a NULL
-- email. Nothing here touches money, the KES 30 fee, or the claim gate.

ALTER TABLE public.merchant_staff
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.merchant_staff
  ALTER COLUMN phone DROP NOT NULL;

-- Lower-case by construction: the linking lookup is an exact `=` against
-- `users.email`, and a seat typed "Sam@Shop.CO" would otherwise never match.
ALTER TABLE public.merchant_staff
  DROP CONSTRAINT IF EXISTS merchant_staff_email_lowercase;
ALTER TABLE public.merchant_staff
  ADD CONSTRAINT merchant_staff_email_lowercase
  CHECK (email IS NULL OR email = lower(email));

-- A seat with neither channel is unlinkable dead data, not a valid invite.
ALTER TABLE public.merchant_staff
  DROP CONSTRAINT IF EXISTS merchant_staff_contact_present;
ALTER TABLE public.merchant_staff
  ADD CONSTRAINT merchant_staff_contact_present
  CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- Mirrors merchant_staff_merchant_id_phone_key.
CREATE UNIQUE INDEX IF NOT EXISTS merchant_staff_merchant_id_email_key
  ON public.merchant_staff (merchant_id, email);

-- The linking lookup filters on email + user_id IS NULL, like idx_staff_phone.
CREATE INDEX IF NOT EXISTS idx_staff_email
  ON public.merchant_staff (email);

COMMENT ON COLUMN public.merchant_staff.email IS
  'Invite address for an email-first staff seat. Linked on first sign-in by '
  'exact match against public.users.email, which is Clerk-VERIFIED by '
  'construction (verifiedPrimaryEmail) and frozen against its holder (D142) — '
  'the same access-control argument that lets the phone column link a seat '
  '(D124/D126). Stored lower-cased. D154.';
