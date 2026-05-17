-- Track last applied cycle block to avoid reapplying every cron run.

ALTER TABLE nutrition_plan_cycles
  ADD COLUMN IF NOT EXISTS last_applied_week INT,
  ADD COLUMN IF NOT EXISTS last_applied_template_id UUID REFERENCES nutrition_plan_templates(id);

CREATE INDEX IF NOT EXISTS idx_nutrition_plan_cycles_last_applied
  ON nutrition_plan_cycles (is_active, last_applied_week);

