-- Sistema GENERICO de visibilidad de features por coach/team/alumno (PREFERENCE, no entitlement).
-- domain = 'nutrition' por ahora; extensible a 'training', etc. (config en codigo). ENTITLEMENT
-- (modulo pago) lo decide billing server-side; estas tablas SOLO achican lo permitido. Toggle =
-- render, jamas borra datos. Aditivo/idempotente/forward-only.
--
-- Correcciones del audit (14 roles) vs el draft:
--  * Funcion renombrada feature_prefs_set_updated_at (NO redefinir nutrition_set_updated_at -> colision en replay).
--  * Helpers de pool con public.  * Writes separados por cmd + UNA SELECT consolidada (evita multiple_permissive).
--  * Capa TEAM (dueno+co-gestores) + ramas de lectura pool/team (alumno/coach de pool no leen 0).
--  * DROP de scaffolding nutrition_prefs (verificado 0 filas).

DROP TABLE IF EXISTS public.coach_nutrition_prefs;   -- scaffolding vacio (0 filas verificadas), reemplazado por generico
DROP TABLE IF EXISTS public.client_nutrition_prefs;

CREATE OR REPLACE FUNCTION public.feature_prefs_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ════════════════ COACH (standalone) ════════════════
CREATE TABLE IF NOT EXISTS public.coach_feature_prefs (
  coach_id   uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  domain     text NOT NULL,
  preset     text,
  sections   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, domain)
);
ALTER TABLE public.coach_feature_prefs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_feature_prefs TO authenticated;
DROP TRIGGER IF EXISTS trg_coach_feature_prefs_updated ON public.coach_feature_prefs;
CREATE TRIGGER trg_coach_feature_prefs_updated BEFORE UPDATE ON public.coach_feature_prefs
  FOR EACH ROW EXECUTE FUNCTION public.feature_prefs_set_updated_at();

DROP POLICY IF EXISTS coach_feature_prefs_owner_insert ON public.coach_feature_prefs;
CREATE POLICY coach_feature_prefs_owner_insert ON public.coach_feature_prefs FOR INSERT TO authenticated
  WITH CHECK (coach_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS coach_feature_prefs_owner_update ON public.coach_feature_prefs;
CREATE POLICY coach_feature_prefs_owner_update ON public.coach_feature_prefs FOR UPDATE TO authenticated
  USING (coach_id = (SELECT auth.uid())) WITH CHECK (coach_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS coach_feature_prefs_owner_delete ON public.coach_feature_prefs;
CREATE POLICY coach_feature_prefs_owner_delete ON public.coach_feature_prefs FOR DELETE TO authenticated
  USING (coach_id = (SELECT auth.uid()));
-- UNA sola SELECT (owner OR alumno-del-coach OR coach del pool) -> sin multiple_permissive.
DROP POLICY IF EXISTS coach_feature_prefs_select ON public.coach_feature_prefs;
CREATE POLICY coach_feature_prefs_select ON public.coach_feature_prefs FOR SELECT TO authenticated
  USING (
    coach_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = (SELECT auth.uid()) AND c.coach_id = coach_feature_prefs.coach_id)
    OR coach_id IN (SELECT public.current_user_pool_coach_ids())
  );

-- ════════════════ TEAM (dueno + co-gestores controlan) ════════════════
CREATE TABLE IF NOT EXISTS public.team_feature_prefs (
  team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  domain     text NOT NULL,
  preset     text,
  sections   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, domain)
);
ALTER TABLE public.team_feature_prefs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_feature_prefs TO authenticated;
DROP TRIGGER IF EXISTS trg_team_feature_prefs_updated ON public.team_feature_prefs;
CREATE TRIGGER trg_team_feature_prefs_updated BEFORE UPDATE ON public.team_feature_prefs
  FOR EACH ROW EXECUTE FUNCTION public.feature_prefs_set_updated_at();

-- Escritura SOLO managers (dueno + co-gestores) del team.
DROP POLICY IF EXISTS team_feature_prefs_mgr_insert ON public.team_feature_prefs;
CREATE POLICY team_feature_prefs_mgr_insert ON public.team_feature_prefs FOR INSERT TO authenticated
  WITH CHECK (team_id IN (SELECT public.current_user_managed_team_ids()));
DROP POLICY IF EXISTS team_feature_prefs_mgr_update ON public.team_feature_prefs;
CREATE POLICY team_feature_prefs_mgr_update ON public.team_feature_prefs FOR UPDATE TO authenticated
  USING (team_id IN (SELECT public.current_user_managed_team_ids()))
  WITH CHECK (team_id IN (SELECT public.current_user_managed_team_ids()));
DROP POLICY IF EXISTS team_feature_prefs_mgr_delete ON public.team_feature_prefs;
CREATE POLICY team_feature_prefs_mgr_delete ON public.team_feature_prefs FOR DELETE TO authenticated
  USING (team_id IN (SELECT public.current_user_managed_team_ids()));
-- Lectura: cualquier coach miembro del team + el alumno del team (para renderizar su vista).
DROP POLICY IF EXISTS team_feature_prefs_select ON public.team_feature_prefs;
CREATE POLICY team_feature_prefs_select ON public.team_feature_prefs FOR SELECT TO authenticated
  USING (
    team_id IN (SELECT public.current_user_team_ids())
    OR EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = (SELECT auth.uid()) AND c.team_id = team_feature_prefs.team_id)
  );

-- ════════════════ OVERRIDE por ALUMNO (coach standalone O managers del team) ════════════════
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
  FOR EACH ROW EXECUTE FUNCTION public.feature_prefs_set_updated_at();

-- Helper de autorizacion de escritura: coach standalone del alumno O manager del team del alumno.
DROP POLICY IF EXISTS client_feature_prefs_write_insert ON public.client_feature_prefs;
CREATE POLICY client_feature_prefs_write_insert ON public.client_feature_prefs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_feature_prefs.client_id
              AND (c.coach_id = (SELECT auth.uid()) OR c.team_id IN (SELECT public.current_user_managed_team_ids()))));
DROP POLICY IF EXISTS client_feature_prefs_write_update ON public.client_feature_prefs;
CREATE POLICY client_feature_prefs_write_update ON public.client_feature_prefs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_feature_prefs.client_id
              AND (c.coach_id = (SELECT auth.uid()) OR c.team_id IN (SELECT public.current_user_managed_team_ids()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_feature_prefs.client_id
              AND (c.coach_id = (SELECT auth.uid()) OR c.team_id IN (SELECT public.current_user_managed_team_ids()))));
DROP POLICY IF EXISTS client_feature_prefs_write_delete ON public.client_feature_prefs;
CREATE POLICY client_feature_prefs_write_delete ON public.client_feature_prefs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_feature_prefs.client_id
              AND (c.coach_id = (SELECT auth.uid()) OR c.team_id IN (SELECT public.current_user_managed_team_ids()))));
-- UNA SELECT: el propio alumno + su coach + coaches del pool.
DROP POLICY IF EXISTS client_feature_prefs_select ON public.client_feature_prefs;
CREATE POLICY client_feature_prefs_select ON public.client_feature_prefs FOR SELECT TO authenticated
  USING (
    client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = client_feature_prefs.client_id AND c.coach_id = (SELECT auth.uid()))
    OR client_id IN (SELECT public.current_user_pool_client_ids())
  );
