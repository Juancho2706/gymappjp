-- F1 · nutrient_targets: piso/meta/techo por nutriente (feature A). Tabla nueva, aislada.
-- Scope: por coach (default) y/o por cliente. El coach ingresa los umbrales; EVA no
-- pre-rellena defaults clinicos. RLS: coach gestiona los suyos + de sus alumnos; el
-- alumno lee los suyos; pool de team via helper existente.

CREATE OR REPLACE FUNCTION public.nutrition_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.nutrient_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id     uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
  client_id    uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  nutrient_key text NOT NULL,
  floor_value   numeric,
  target_value  numeric,
  ceiling_value numeric,
  intent       text NOT NULL DEFAULT 'aimup' CHECK (intent IN ('aimup','cap')),
  provenance   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrient_targets_scope_chk CHECK (num_nonnulls(coach_id, client_id) >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS nutrient_targets_client_key_uq
  ON public.nutrient_targets(client_id, nutrient_key) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS nutrient_targets_coach_key_uq
  ON public.nutrient_targets(coach_id, nutrient_key) WHERE client_id IS NULL AND coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS nutrient_targets_coach_idx  ON public.nutrient_targets(coach_id);
CREATE INDEX IF NOT EXISTS nutrient_targets_client_idx ON public.nutrient_targets(client_id);

ALTER TABLE public.nutrient_targets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrient_targets TO authenticated;

DROP TRIGGER IF EXISTS trg_nutrient_targets_updated ON public.nutrient_targets;
CREATE TRIGGER trg_nutrient_targets_updated BEFORE UPDATE ON public.nutrient_targets
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_set_updated_at();

DROP POLICY IF EXISTS nutrient_targets_coach_all ON public.nutrient_targets;
CREATE POLICY nutrient_targets_coach_all ON public.nutrient_targets FOR ALL TO authenticated
  USING (coach_id = (SELECT auth.uid())
         OR (client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c
              WHERE c.id = nutrient_targets.client_id AND c.coach_id = (SELECT auth.uid()))))
  WITH CHECK (coach_id = (SELECT auth.uid())
         OR (client_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clients c
              WHERE c.id = nutrient_targets.client_id AND c.coach_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS nutrient_targets_client_select ON public.nutrient_targets;
CREATE POLICY nutrient_targets_client_select ON public.nutrient_targets FOR SELECT TO authenticated
  USING (client_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS nutrient_targets_team_all ON public.nutrient_targets;
CREATE POLICY nutrient_targets_team_all ON public.nutrient_targets FOR ALL TO authenticated
  USING (client_id IN (SELECT current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT current_user_pool_client_ids()));
