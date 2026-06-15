-- Mirror del thumbnail de YouTube en Supabase Storage (bucket exercise-media).
-- Durabilidad: si el canal borra/privatiza el video, img.youtube.com devuelve un
-- JPEG gris silencioso (HTTP 404 con body decodable -> img.onerror NO dispara).
-- Guardar una copia propia evita esa degradacion invisible en la biblioteca.
--
-- Aditiva + idempotente + forward-only. Escritura SOLO service-role
-- (mirror al crear/editar + cron backfill). El render (exerciseThumbnailUrl)
-- prioriza thumbnail_url sobre el hotlink img.youtube.com.

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS thumbnail_checked_at timestamptz;

-- Host-restringido al bucket exercise-media (mismo patron que exercises_image_url_host_chk).
-- NOT VALID: solo chequea INSERT/UPDATE nuevos, no re-escanea filas existentes (cero lock de scan).
ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_thumbnail_url_host_chk;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_thumbnail_url_host_chk
  CHECK (
    thumbnail_url IS NULL
    OR thumbnail_url LIKE 'https://jikjeokundmaafuytdcx.supabase.co/storage/v1/object/public/exercise-media/%'
  ) NOT VALID;

COMMENT ON COLUMN public.exercises.thumbnail_url IS 'Espejo en Storage (bucket exercise-media) del thumbnail de YouTube. Escrito SOLO por service-role (mirror al crear/editar ejercicio + cron backfill). Durabilidad ante borrado/privatizacion del video upstream. Render: exerciseThumbnailUrl lo prioriza sobre el hotlink img.youtube.com.';
COMMENT ON COLUMN public.exercises.thumbnail_checked_at IS 'Ultima vez que el cron intento espejar el thumbnail. Evita reintentar videos muertos (404) en cada corrida.';
