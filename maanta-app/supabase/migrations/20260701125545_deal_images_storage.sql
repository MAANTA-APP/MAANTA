-- ============================================================
-- Deal images storage bucket + RLS policies
--
-- Merchants upload cover images before creating a deal.
-- Images are public (served via CDN to shoppers in the feed).
-- Upload is restricted to merchant_admin + admin roles only.
-- Path convention: deal-images/{merchant_id}/{filename}
-- Max size enforced in app code (5MB per ARCHITECTURE.md).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deal-images',
  'deal-images',
  true,  -- public: images served directly to shoppers in feed
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Upload: merchant_admin and admin only
-- Path must start with their own merchant_id to prevent cross-merchant uploads
CREATE POLICY "deal_images_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'deal-images'
  AND (
    -- merchant_admin: path must start with their merchant_id
    (
      public.current_user_role() = 'merchant_admin'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.merchants WHERE user_id = public.current_user_id()
      )
    )
    OR public.current_user_role() = 'admin'
  )
);

-- Read: public (anyone can read — images appear in the shopper feed)
CREATE POLICY "deal_images_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'deal-images');

-- Delete: own merchant images only, or admin
CREATE POLICY "deal_images_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'deal-images'
  AND (
    (
      public.current_user_role() = 'merchant_admin'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.merchants WHERE user_id = public.current_user_id()
      )
    )
    OR public.current_user_role() = 'admin'
  )
);
