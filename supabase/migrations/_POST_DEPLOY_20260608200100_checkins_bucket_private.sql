-- ⚠️ POST-DEPLOY ONLY — NO aplicar hasta que: (1) el código de P2 (signing) esté DESPLEGADO en
-- web Y mobile, (2) el backfill (_POST_DEPLOY ...backfill_paths) esté aplicado y verificado,
-- (3) se confirmó que las fotos renderizan vía signed URL. Recién entonces flipear privado.
--
-- P2.4 — Flip del bucket `checkins` a PRIVADO. Tras esto, getPublicUrl deja de servir; solo
-- signed URLs (resolveCheckinPhotoUrls server-side / alumno self-sign / endpoint coach mobile).
-- Las storage policies `checkins_client_*` (carpeta propia) siguen; coaches firman vía service-role.
--
-- Si alguna app vieja sigue viva, NO aplicar (romperá sus fotos). Rollback instantáneo:
--   UPDATE storage.buckets SET public = true WHERE id = 'checkins';

UPDATE storage.buckets SET public = false WHERE id = 'checkins';
