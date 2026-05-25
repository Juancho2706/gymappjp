-- Storage workspace policies.
-- Buckets stay public for existing public URLs; these policies protect direct
-- authenticated writes/listing by bucket and path.

CREATE OR REPLACE FUNCTION public.try_uuid(p_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_value::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "logos_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "logos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "logos_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "logos_owner_delete" ON storage.objects;

CREATE POLICY "logos_owner_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "logos_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "logos_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "logos_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "org_assets_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "org_assets_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_assets_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "org_assets_admin_delete" ON storage.objects;

CREATE POLICY "org_assets_admin_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'org-assets'
  AND (storage.foldername(name))[1] = 'orgs'
  AND public.is_org_admin_member(public.try_uuid((storage.foldername(name))[2]))
);

CREATE POLICY "org_assets_admin_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'org-assets'
  AND (storage.foldername(name))[1] = 'orgs'
  AND public.is_org_admin_member(public.try_uuid((storage.foldername(name))[2]))
);

CREATE POLICY "org_assets_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'org-assets'
  AND (storage.foldername(name))[1] = 'orgs'
  AND public.is_org_admin_member(public.try_uuid((storage.foldername(name))[2]))
)
WITH CHECK (
  bucket_id = 'org-assets'
  AND (storage.foldername(name))[1] = 'orgs'
  AND public.is_org_admin_member(public.try_uuid((storage.foldername(name))[2]))
);

CREATE POLICY "org_assets_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'org-assets'
  AND (storage.foldername(name))[1] = 'orgs'
  AND public.is_org_admin_member(public.try_uuid((storage.foldername(name))[2]))
);

DROP POLICY IF EXISTS "checkins_client_select" ON storage.objects;
DROP POLICY IF EXISTS "checkins_client_insert" ON storage.objects;
DROP POLICY IF EXISTS "checkins_client_update" ON storage.objects;
DROP POLICY IF EXISTS "checkins_client_delete" ON storage.objects;

CREATE POLICY "checkins_client_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'checkins'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "checkins_client_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'checkins'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "checkins_client_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'checkins'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'checkins'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "checkins_client_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'checkins'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
