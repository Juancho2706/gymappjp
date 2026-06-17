-- Audit DB 2026-06-16: higiene de índices.
-- (1) Drop 2 índices duplicados exactos (gemelo idéntico queda; verificado: no respaldan PK/unique/FK).
-- (2) Add índice de cobertura a 43 FKs sin índice (evita seq-scan en joins y en delete/update del padre).
-- CREATE/DROP INDEX normal (no CONCURRENTLY): tablas chicas (<=1.9MB), ventana de bajo tráfico,
-- lock sub-segundo. Idempotente (IF EXISTS / IF NOT EXISTS), forward-only. Aplicado+verificado en prod
-- (0 FK sin índice, 0 duplicados restantes).

-- (1) Duplicados
DROP INDEX IF EXISTS public.idx_daily_nutrition_logs_client_id_log_date_desc;  -- keep idx_daily_nutrition_logs_client_date
DROP INDEX IF EXISTS public.idx_workout_logs_client_id_logged_at_desc;          -- keep idx_workout_logs_client_id_logged_at

-- (2) FK covering indexes
CREATE INDEX IF NOT EXISTS idx_workout_blocks_exercise_id ON public.workout_blocks (exercise_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_meal_logs_meal_id ON public.nutrition_meal_logs (meal_id);
CREATE INDEX IF NOT EXISTS idx_daily_nutrition_logs_plan_id ON public.daily_nutrition_logs (plan_id);
CREATE INDEX IF NOT EXISTS idx_food_items_food_id ON public.food_items (food_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_program_id ON public.workout_plans (program_id);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_food_id ON public.saved_meal_items (food_id);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_saved_meal_id ON public.saved_meal_items (saved_meal_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_created_by_coach_id ON public.workout_programs (created_by_coach_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_org_id ON public.workout_programs (org_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_last_edited_by_coach_id ON public.workout_programs (last_edited_by_coach_id);
CREATE INDEX IF NOT EXISTS idx_client_memberships_coach_id ON public.client_memberships (coach_id);
CREATE INDEX IF NOT EXISTS idx_client_memberships_client_id ON public.client_memberships (client_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_reviewed_by ON public.check_ins (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_last_edited_by_coach_id ON public.nutrition_plans (last_edited_by_coach_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_org_id ON public.nutrition_plans (org_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_template_id ON public.nutrition_plans (template_id);
CREATE INDEX IF NOT EXISTS idx_organizations_brand_published_by ON public.organizations (brand_published_by);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id ON public.organizations (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_org_id ON public.subscription_events (org_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plan_history_coach_id ON public.nutrition_plan_history (coach_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plan_history_client_id ON public.nutrition_plan_history (client_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plan_templates_org_id ON public.nutrition_plan_templates (org_id);
CREATE INDEX IF NOT EXISTS idx_saved_meals_coach_id ON public.saved_meals (coach_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_meal_food_swaps_swapped_food_id ON public.nutrition_meal_food_swaps (swapped_food_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_meal_food_swaps_original_food_id ON public.nutrition_meal_food_swaps (original_food_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plan_cycles_coach_id ON public.nutrition_plan_cycles (coach_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plan_cycles_last_applied_template_id ON public.nutrition_plan_cycles (last_applied_template_id);
CREATE INDEX IF NOT EXISTS idx_coach_client_assignments_assigned_by ON public.coach_client_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS idx_template_meals_template_id ON public.template_meals (template_id);
CREATE INDEX IF NOT EXISTS idx_beta_invite_registrations_coach_id ON public.beta_invite_registrations (coach_id);
CREATE INDEX IF NOT EXISTS idx_news_items_created_by ON public.news_items (created_by);
CREATE INDEX IF NOT EXISTS idx_org_audit_logs_actor_id ON public.org_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_recipes_coach_id ON public.recipes (coach_id);
CREATE INDEX IF NOT EXISTS idx_template_meal_groups_saved_meal_id ON public.template_meal_groups (saved_meal_id);
CREATE INDEX IF NOT EXISTS idx_template_meal_groups_template_meal_id ON public.template_meal_groups (template_meal_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_plan_id ON public.workout_sessions (plan_id);
CREATE INDEX IF NOT EXISTS idx_organization_invites_created_by ON public.organization_invites (created_by);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_food_id ON public.recipe_ingredients (food_id);
CREATE INDEX IF NOT EXISTS idx_org_announcements_created_by ON public.org_announcements (created_by);
CREATE INDEX IF NOT EXISTS idx_org_nutrition_templates_created_by ON public.org_nutrition_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_payment_exceptions_approved_by ON public.payment_exceptions (approved_by);
CREATE INDEX IF NOT EXISTS idx_payment_exceptions_org_id ON public.payment_exceptions (org_id);
