-- Sistema GENERICO de visibilidad de features por coach/alumno (preferences, no entitlement).
-- domain = 'nutrition' por ahora; extensible a 'training', etc. sin migracion (NUTRITION_SECTIONS
-- y futuros {domain}_SECTIONS viven en codigo). ENTITLEMENT (modulo pago) lo decide billing
-- server-side; estas tablas SOLO achican lo permitido. Toggle = render, jamas borra datos.
-- Aditivo/idempotente. DROP de las tablas nutrition-especificas vacias (scaffolding transitorio).
DROP TABLE IF EXISTS public.coach_nutrition_prefs;
DROP TABLE IF EXISTS public.client_nutrition_prefs;

CREATE OR REPLACE FUNCTION public.nutrition_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ── Preferencias por COACH, por dominio ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_feature_prefs (
  coach_id   uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  domain     text NOT NULL,                       -- 'nutrition' | 'training' | ...
  preset     text,                                -- ej. nutrition: basico|intermedio|profesional (valida la app)
  sections   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- overrides por key
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, domain)
);
ALTER TABLE public.coach_feature_prefs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_feature_prefs TO authenticated;
DROP TRIGGER IF EXISTS trg_coach_feature_prefs_updated ON public.coach_feature_prefs;
CREATE TRIGGER trg_coach_feature_prefs_updated BEFORE UPDATE ON public.coach_feature_prefs
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_set_updated_at();

DROP POLICY IF EXISTS coach_feature_prefs_owner_all ON public.coach_feature_prefs;
CREATE POLICY coach_feature_prefs_owner_all ON public.coach_feature_prefs FOR ALL TO authenticated
  USING (coach_id = (SELECT auth.uid())) WITH CHECK (coach_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS coach_feature_prefs_client_read ON public.coach_feature_prefs;
CREATE POLICY coach_feature_prefs_client_read ON public.coach_feature_prefs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = (SELECT auth.uid()) AND c.coach_id = coach_feature_prefs.coach_id));
DROP POLICY IF EXISTS coach_feature_prefs_team_read ON public.coach_feature_prefs;
CREATE POLICY coach_feature_prefs_team_read ON public.coach_feature_prefs FOR SELECT TO authenticated
  USING (coach_id IN (SELECT current_user_pool_coach_ids()));

-- ── Override por ALUMNO, por dominio (el coach afina por cliente) ─────────────
CREATE TABLE IF NOT EXISTS public.client_feature_prefs (
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  domain     text NOT NULL,
  sections   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, domain)
);
ALTER TABLE public.client_feature_prefs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_feature_prefs TO authenticated;
DROP TRIGGER IF EXISTS trg_client_feature_prefs_updated ON public.client_feature_prefs;
CREATE TRIGGER trg_client_feature_prefs_updated BEFORE UPDATE ON public.client_feature_prefs
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_set_updated_at();

DROP POLICY IF EXISTS client_feature_prefs_coach_all ON public.client_feature_prefs;
CREATE POLICY client_feature_prefs_coach_all ON public.client_feature_prefs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = client_feature_prefs.client_id AND c.coach_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = client_feature_prefs.client_id AND c.coach_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS client_feature_prefs_client_read ON public.client_feature_prefs;
CREATE POLICY client_feature_prefs_client_read ON public.client_feature_prefs FOR SELECT TO authenticated
  USING (client_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS client_feature_prefs_team_all ON public.client_feature_prefs;
CREATE POLICY client_feature_prefs_team_all ON public.client_feature_prefs FOR ALL TO authenticated
  USING (client_id IN (SELECT current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT current_user_pool_client_ids()));
