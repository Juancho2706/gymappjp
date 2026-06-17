-- Audit DB 2026-06-17: autovacuum/analyze por-tabla en multi-tenant + write-heavy. Las hot tables
-- tenían last_autovacuum/last_autoanalyze=NULL y con el default scale_factor=0.2 no se reanalizan
-- hasta acumular mucho (workout_logs ~1540 dead, planner ciego en clients/team_members al poblarse).
-- Bajar el factor SOLO en estas tablas (NO global, que vaciaría foods/exercises chicas sin razón).
-- ALTER TABLE SET es idempotente, aditivo, forward-only.
ALTER TABLE public.clients              SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.team_members         SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.teams                SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.organization_members SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.daily_nutrition_logs SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.check_ins            SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.workout_logs         SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.workout_blocks       SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.nutrition_meal_logs  SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
-- coach_addons: alto churn (write-through del CEO + trigger D1), 260% dead/live -> vacuum por umbral fijo
ALTER TABLE public.coach_addons         SET (autovacuum_vacuum_scale_factor = 0.0, autovacuum_vacuum_threshold = 50, autovacuum_analyze_scale_factor = 0.02);
