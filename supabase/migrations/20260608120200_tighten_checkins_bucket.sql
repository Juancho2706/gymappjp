-- F16: the `checkins` storage bucket (progress photos = sensitive health data,
-- Ley 21.719 / 19.628) had a broad SELECT policy on storage.objects:
--   "Public checkin images are viewable by everyone" USING (bucket_id = 'checkins')
-- granted to `public`, which lets anyone LIST/enumerate every client's photos via the
-- storage API. A scoped policy `checkins_client_select` (own folder only) already exists.
--
-- Images are displayed via getPublicUrl() (public CDN path /object/public/checkins/...),
-- which does NOT consult storage.objects RLS, so dropping the broad listing policy does
-- not affect image display for coaches/clients (verified: check-in.actions.ts:37 uses
-- getPublicUrl; VisualEvolution + mobile render stored public URLs). It only removes the
-- enumeration surface.
--
-- DEEPER FOLLOW-UP (tracked, not done here): make the bucket private + serve via signed
-- URLs so progress photos aren't reachable by direct public URL at all.
--
-- Rollback:
--   CREATE POLICY "Public checkin images are viewable by everyone"
--     ON storage.objects FOR SELECT TO public USING (bucket_id = 'checkins');

DROP POLICY IF EXISTS "Public checkin images are viewable by everyone" ON storage.objects;
