-- Recorte de inicio/fin para videos de ejercicio (YouTube). El coach puede indicar desde que
-- segundo empieza el video (ej. saltar intro/charla) y opcionalmente donde termina. El player
-- (API JS de YouTube) loopea el tramo [start, end] real haciendo seekTo(start) al terminar.
-- Aditiva + idempotente + forward-only. Segundos enteros, user-editable (exercises tiene GRANT
-- UPDATE a nivel tabla para authenticated; sin grant de columna que restrinja).

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS video_start_time integer;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS video_end_time integer;

ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_video_trim_chk;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_video_trim_chk
  CHECK (
    (video_start_time IS NULL OR video_start_time >= 0)
    AND (video_end_time IS NULL OR video_end_time >= 0)
    AND (video_start_time IS NULL OR video_end_time IS NULL OR video_end_time > video_start_time)
  );

COMMENT ON COLUMN public.exercises.video_start_time IS 'Segundo de inicio del video de YouTube (recorte). El player loopea desde aca (seekTo). NULL = desde 0.';
COMMENT ON COLUMN public.exercises.video_end_time IS 'Segundo de fin del video de YouTube (recorte). El player reinicia el loop al llegar aca. NULL = hasta el final natural.';
