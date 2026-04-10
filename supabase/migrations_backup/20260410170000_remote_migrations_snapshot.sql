-- Sprint 1 snapshot migration index
-- Source: remote project migration history queried from supabase_migrations.schema_migrations.
-- This file documents the remote-applied migration chain and keeps the repo migration folder initialized.
-- Use `npx supabase db pull` with a valid SUPABASE_ACCESS_TOKEN to regenerate a full schema snapshot.

-- Remote migration versions present at snapshot time:
-- 20260313060800_create_nutrition_tables
-- 20260313062300_create_search_foods_function
-- 20260313063600_create_saved_meals_tables
-- 20260313070000_create_food_logs_table
-- 20260407222727_add_superset_group_to_workout_blocks
-- 20260407223737_add_progression_to_workout_blocks
-- 20260407223739_add_ab_mode_to_programs_and_plans
-- 20260409212729_add_foods_category
-- 20260409212733_enhance_nutrition_plan_templates
-- 20260409212911_seed_chilean_foods_a
-- 20260409212927_seed_chilean_foods_b
-- 20260409231741_nutrition_rls_phase2_saved_meals
-- 20260410160701_add_back_photo_url_to_check_ins

-- Keep this migration idempotent and no-op for local replay.
select 1;
