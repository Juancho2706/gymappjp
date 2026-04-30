-- P2: Historial de versiones del plan (snapshots) + ciclos de dieta (bloques por semana → plantilla).
-- Additivo; planes sin filas siguen igual.

CREATE TABLE IF NOT EXISTS nutrition_plan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nutrition_plan_id UUID NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  label TEXT,
  source TEXT NOT NULL DEFAULT 'auto_before_save',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plan_history_plan_created
  ON nutrition_plan_history (nutrition_plan_id, created_at DESC);

ALTER TABLE nutrition_plan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nutrition_plan_history coach all"
  ON nutrition_plan_history FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

COMMENT ON TABLE nutrition_plan_history IS 'Snapshots JSON del plan custom del alumno; rollback desde UI coach.';

CREATE TABLE IF NOT EXISTS nutrition_plan_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nutrition_plan_cycles_one_active_per_client
  ON nutrition_plan_cycles (client_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_nutrition_plan_cycles_client
  ON nutrition_plan_cycles (client_id, created_at DESC);

ALTER TABLE nutrition_plan_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nutrition_plan_cycles coach all"
  ON nutrition_plan_cycles FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

COMMENT ON TABLE nutrition_plan_cycles IS 'Ciclos por bloques de semanas (template_id); transición automática vía cron/job futuro.';
