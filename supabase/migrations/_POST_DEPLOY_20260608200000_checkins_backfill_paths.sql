-- ⚠️ POST-DEPLOY ONLY — NO aplicar hasta que el código de P2 (signing) esté DESPLEGADO en
-- web Y mobile. La app live vieja muestra el valor crudo como <img src>; si se hace backfill
-- a paths antes del deploy, se rompen las imágenes en la app vieja.
--
-- P2.3 — Backfill: convertir las URLs públicas completas almacenadas en check_ins a PATHS,
-- para que `resolveCheckinPhotoUrls` firme de forma uniforme. Reversible vía tabla backup.
--
-- Orden de aplicación: (1) deploy web+mobile con el helper de signing, (2) verificar render,
-- (3) ESTE backfill, (4) verificar render, (5) flip privado (_POST_DEPLOY ...flip).
--
-- Rollback:
--   UPDATE public.check_ins c SET front_photo_url = b.front_photo_url, back_photo_url = b.back_photo_url
--   FROM public.check_ins_photo_url_backup b WHERE b.id = c.id;
--   -- (opcional) DROP TABLE public.check_ins_photo_url_backup;

CREATE TABLE IF NOT EXISTS public.check_ins_photo_url_backup AS
  SELECT id, front_photo_url, back_photo_url
  FROM public.check_ins
  WHERE front_photo_url LIKE 'http%' OR back_photo_url LIKE 'http%';

UPDATE public.check_ins
SET front_photo_url = regexp_replace(front_photo_url, '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/checkins/', '')
WHERE front_photo_url LIKE 'http%';

UPDATE public.check_ins
SET back_photo_url = regexp_replace(back_photo_url, '^https?://[^/]+/storage/v1/object/(?:public|sign|authenticated)/checkins/', '')
WHERE back_photo_url LIKE 'http%';
