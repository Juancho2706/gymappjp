-- B4 del plan «Activación» (docs/specs/coach-onboarding-v2/TASKS.md): superficie desde la que se
-- dio de alta el coach, para separar el embudo semanal por web de escritorio, web del teléfono
-- (navegador o PWA) y app. Hasta hoy la plataforma solo viajaba en el evento de PostHog
-- `coach_registered`, que no se cruza con las tablas de alumnos.
-- La escriben SOLO los cuatro inserts de alta del servidor (`lib/auth/signup-surface.ts`).
-- Aditiva: columna nullable sin default (solo metadata) + CHECK sobre una tabla de ~160 filas.
-- Aplicada en LIVE el 2026-10-02 vía MCP (prueba en transacción con rollback: CHECK rechaza un valor
-- inválido y acepta uno válido; grants resultantes: authenticated SELECT/REFERENCES, sin UPDATE).
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS signup_surface text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coaches_signup_surface_check'
      AND conrelid = 'public.coaches'::regclass
  ) THEN
    ALTER TABLE public.coaches
      ADD CONSTRAINT coaches_signup_surface_check
      CHECK (signup_surface IS NULL OR signup_surface IN (
        'web_desktop', 'web_mobile', 'app_ios', 'app_android', 'app_unknown'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.coaches.signup_surface IS
  'Superficie del alta (web_desktop | web_mobile | app_ios | app_android | app_unknown), escrita por el servidor en el insert del alta. Etiqueta de medicion: nunca autoriza nada. NULL = alta anterior al 2026-10-02 sin evidencia o creada por admin/team/org. Sin GRANT UPDATE a authenticated/anon (default-deny por columna).';
