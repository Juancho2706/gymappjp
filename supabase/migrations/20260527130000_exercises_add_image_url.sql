-- Aditiva. Sin tocar filas existentes.
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS image_url text;

-- Constraint suave (NOT VALID = no escanea filas existentes): solo URL del bucket nuestro permitida.
ALTER TABLE public.exercises
    DROP CONSTRAINT IF EXISTS exercises_image_url_host_chk;

ALTER TABLE public.exercises
    ADD CONSTRAINT exercises_image_url_host_chk
    CHECK (
        image_url IS NULL
        OR image_url LIKE 'https://jikjeokundmaafuytdcx.supabase.co/storage/v1/object/public/exercise-media/%'
    )
    NOT VALID;
-- Cuando se valide en prod: ALTER TABLE public.exercises VALIDATE CONSTRAINT exercises_image_url_host_chk;
