-- Bucket público (lectura abierta vía URL), escritura por policy de path
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'exercise-media',
    'exercise-media',
    true,
    2097152,
    ARRAY['image/gif', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types,
        public = EXCLUDED.public;

DROP POLICY IF EXISTS "exercise_media_owner_insert" ON storage.objects;
CREATE POLICY "exercise_media_owner_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'exercise-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "exercise_media_owner_update" ON storage.objects;
CREATE POLICY "exercise_media_owner_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'exercise-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "exercise_media_owner_delete" ON storage.objects;
CREATE POLICY "exercise_media_owner_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'exercise-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "exercise_media_public_read" ON storage.objects;
CREATE POLICY "exercise_media_public_read"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'exercise-media');
