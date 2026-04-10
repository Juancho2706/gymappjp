ALTER TABLE nutrition_plan_templates
ADD COLUMN IF NOT EXISTS goal_type text DEFAULT 'general',
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;

ALTER TABLE nutrition_plan_templates DROP CONSTRAINT IF EXISTS nutrition_plan_templates_goal_type_check;
ALTER TABLE nutrition_plan_templates ADD CONSTRAINT nutrition_plan_templates_goal_type_check CHECK (
  goal_type IN ('deficit', 'mantenimiento', 'volumen', 'definicion', 'general')
);
