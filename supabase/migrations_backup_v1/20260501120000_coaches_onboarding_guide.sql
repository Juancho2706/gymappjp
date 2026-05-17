-- Dashboard coach onboarding checklist: persist dismiss / manual toggles / aha flag (cross-device).
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS onboarding_guide jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.coaches.onboarding_guide IS
  'JSON: { dismissed?: boolean, completed?: { stepKey: boolean }, ahaMomentSent?: boolean } — guía inicio dashboard coach.';

-- Si el UPDATE desde el cliente (JWT coach) falla por RLS, añadir política p.ej.:
--   FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
-- (solo si `coaches` tiene RLS activo; muchos proyectos permiten update vía service role en otras rutas).
