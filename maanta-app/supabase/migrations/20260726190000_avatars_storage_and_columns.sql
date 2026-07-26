-- Shopper + merchant profile photos.
-- Bucket: public read; writes go through service-role API routes (defense-in-depth RLS below).
-- Paths: avatars/users/<user_id>/profile.<ext>
--        avatars/merchants/<merchant_id>/profile.<ext>

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.users.avatar_url IS
  'Public URL for shopper profile photo (Supabase Storage avatars bucket).';
COMMENT ON COLUMN public.merchants.avatar_url IS
  'Public URL for merchant business avatar (Supabase Storage avatars bucket).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  1048576, -- 1MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated users may upload/replace only under avatars/users/<their user id>/
DROP POLICY IF EXISTS "avatars_user_upload" ON storage.objects;
CREATE POLICY "avatars_user_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = public.current_user_id()::text
);

DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
CREATE POLICY "avatars_user_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = public.current_user_id()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = public.current_user_id()::text
);

DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;
CREATE POLICY "avatars_user_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = public.current_user_id()::text
);

-- Merchant owners may manage avatars/merchants/<their merchant id>/
DROP POLICY IF EXISTS "avatars_merchant_upload" ON storage.objects;
CREATE POLICY "avatars_merchant_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'merchants'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.merchants WHERE user_id = public.current_user_id()
  )
);

DROP POLICY IF EXISTS "avatars_merchant_update" ON storage.objects;
CREATE POLICY "avatars_merchant_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'merchants'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.merchants WHERE user_id = public.current_user_id()
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'merchants'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.merchants WHERE user_id = public.current_user_id()
  )
);

DROP POLICY IF EXISTS "avatars_merchant_delete" ON storage.objects;
CREATE POLICY "avatars_merchant_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'merchants'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.merchants WHERE user_id = public.current_user_id()
  )
);

-- Public read (bucket is public; policy allows authenticated/anon SELECT for listing edges)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
