-- ════════════════════════════════════════════════════════════════════════════
-- BACKFILL por USO de feature prefs (domain = 'nutrition') — grandfathering.
-- ════════════════════════════════════════════════════════════════════════════
--
-- PROVENANCE / por que existe este archivo:
--   El modelo de visibilidad es `visible = ENTITLED (billing, server-side, fail-closed)
--   AND ENABLED (coach/team/client pref)`. La PREFERENCIA solo ACHICA, nunca amplia.
--   Al deploy, el 100% de coaches/teams existentes NO tiene fila en *_feature_prefs.
--   Un DEFAULT de columna NO back-popula filas pre-existentes (GitLab MR122467, fly.io):
--   si "sin fila" resolviera a `basico`, cada coach que HOY usa micros/recetas/habitos/
--   registro/exchanges perderia esas secciones en su app Y en la de sus alumnos, sin
--   error ni aviso ("EVA me borro funciones"). El fundador lo prohibio explicitamente
--   (plan §5, riesgo #1, unanime en 14 roles). Este backfill deja ENCENDIDO a cada coach/
--   team exactamente lo que ya usa, derivando preset+secciones del USO OBSERVADO en prod.
--
-- SEPARACION: este es el DML de grandfathering, SEPARADO del DDL
--   (20260618200000_feature_prefs.sql). Nunca un UPDATE/INSERT largo dentro de un ALTER.
--
-- PROPIEDADES (obligatorias — merge_branch re-corre TODO el historial en cada merge):
--   * IDEMPOTENTE  — `ON CONFLICT (… , domain) DO NOTHING`. Re-ejecutable sin efecto;
--                    NUNCA pisa la eleccion explicita de un coach/team (fila ya existente).
--   * FORWARD-ONLY — solo INSERT aditivo; cero DROP/UPDATE/DELETE de datos de clientes.
--   * BATCHED      — set-based `INSERT … SELECT` (no row-loops, no cursores). Una sola
--                    pasada por coach y por team; las senales de uso se pre-agregan en CTEs.
--   * SAFE         — si las tablas DDL no existen (replay parcial), el script aborta limpio
--                    sin tocar nada (las tablas son creadas por la migracion 200000 previa).
--
-- HEURISTICA (derivada de tablas REALES, verificada contra information_schema en prod):
--   Senales de uso de nutricion por COACH:
--     - nutrition_plans                         (plan creado para un alumno; coach_id directo)
--     - nutrition_meal_logs  → meals → plan     (alumno registro adherencia; coach del plan)
--     - daily_habits         → clients.coach_id (habitos/notas/agua/pasos/sueno)
--     - nutrition_recipes    (coach_id)         (biblioteca de recetas del coach)
--     - nutrition_recipe_assignments → clients.coach_id (receta asignada a un alumno)
--   Senal "PROFESIONAL" (uso avanzado → preset 'profesional'):
--     - nutrition_plans.plan_mode = 'exchanges' (plan por intercambios)
--     - meal_exchange_targets → meals → plan    (objetivos de intercambio definidos)
--   Mapeo preset:
--     - profesional : tiene CUALQUIER senal de exchanges  → secciones intermedio + pro ON.
--     - intermedio  : tiene CUALQUIER senal de nutricion (sin exchanges) → secciones intermedio ON.
--     - basico      : CERO uso de nutricion → solo core (sections '{}'; core no es toggleable).
--   Solo se siembra el PRESET (basico/intermedio/profesional) + provenance; las secciones
--   las enciende el preset via la config @eva/feature-prefs (no se setean overrides por-key
--   para evitar drift). 'goals_bodycomp'/'micros_advanced' del preset profesional quedan
--   gated por entitlement en el resolver (la pref solo achica). Provenance en
--   sections._seeded_from = 'usage' | 'default' (evidencia SERNAC, plan §5.1).
--
-- TEAMS: backfill paralelo por USO a nivel team (owner del team controla team_feature_prefs).
--   Senal team: recetas del team (nutrition_recipes.team_id) o planes/logs/habitos de
--   CUALQUIER alumno del pool (clients.team_id). exchanges del pool → preset team 'profesional'.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Guard: si el DDL previo no corrio (replay parcial), no hacemos nada (no romper).
  IF to_regclass('public.coach_feature_prefs') IS NULL
     OR to_regclass('public.team_feature_prefs') IS NULL THEN
    RAISE NOTICE 'feature_prefs backfill: tablas DDL ausentes, skip (replay parcial).';
    RETURN;
  END IF;

  -- ──────────────────────────── COACH (standalone) ────────────────────────────
  WITH
  -- Uso "intermedio" (cualquier senal de nutricion atribuible a un coach).
  coach_basic_use AS (
    SELECT coach_id FROM public.nutrition_plans WHERE coach_id IS NOT NULL
    UNION
    SELECT np.coach_id
      FROM public.nutrition_meal_logs ml
      JOIN public.nutrition_meals m ON m.id = ml.meal_id
      JOIN public.nutrition_plans np ON np.id = m.plan_id
     WHERE np.coach_id IS NOT NULL
    UNION
    SELECT c.coach_id
      FROM public.daily_habits dh
      JOIN public.clients c ON c.id = dh.client_id
     WHERE c.coach_id IS NOT NULL
    UNION
    SELECT coach_id FROM public.nutrition_recipes WHERE coach_id IS NOT NULL
    UNION
    SELECT c.coach_id
      FROM public.nutrition_recipe_assignments ra
      JOIN public.clients c ON c.id = ra.client_id
     WHERE c.coach_id IS NOT NULL
  ),
  -- Uso "profesional" (intercambios) atribuible a un coach.
  coach_pro_use AS (
    SELECT coach_id FROM public.nutrition_plans
     WHERE coach_id IS NOT NULL AND plan_mode = 'exchanges'
    UNION
    SELECT np.coach_id
      FROM public.meal_exchange_targets met
      JOIN public.nutrition_meals m ON m.id = met.meal_id
      JOIN public.nutrition_plans np ON np.id = m.plan_id
     WHERE np.coach_id IS NOT NULL
  ),
  coach_levels AS (
    SELECT
      co.id AS coach_id,
      (bu.coach_id IS NOT NULL) AS has_basic,
      (pu.coach_id IS NOT NULL) AS has_pro
    FROM public.coaches co
    LEFT JOIN (SELECT DISTINCT coach_id FROM coach_basic_use) bu ON bu.coach_id = co.id
    LEFT JOIN (SELECT DISTINCT coach_id FROM coach_pro_use)   pu ON pu.coach_id = co.id
  )
  INSERT INTO public.coach_feature_prefs (coach_id, domain, preset, sections)
  SELECT
    cl.coach_id,
    'nutrition',
    CASE WHEN cl.has_pro THEN 'profesional'
         WHEN cl.has_basic THEN 'intermedio'
         ELSE 'basico' END,
    -- El PRESET (intermedio/profesional) ya enciende las secciones correctas via la config
    -- @eva/feature-prefs (intermedio = micros_base/plate/off_plan_log/notes/habits/recipes/shopping;
    -- profesional ademas micros_advanced+goals_bodycomp, gated por entitlement). No seteamos
    -- overrides por-seccion (evita drift de keys); solo marcamos provenance.
    CASE WHEN cl.has_pro OR cl.has_basic THEN jsonb_build_object('_seeded_from', 'usage')
         ELSE jsonb_build_object('_seeded_from', 'default') END
  FROM coach_levels cl
  ON CONFLICT (coach_id, domain) DO NOTHING;  -- nunca pisar eleccion explicita

  -- ──────────────────────────── TEAM (pool) ────────────────────────────
  WITH
  team_basic_use AS (
    SELECT team_id FROM public.nutrition_recipes WHERE team_id IS NOT NULL
    UNION
    SELECT c.team_id FROM public.nutrition_plans np
      JOIN public.clients c ON c.id = np.client_id
     WHERE c.team_id IS NOT NULL
    UNION
    SELECT c.team_id
      FROM public.nutrition_meal_logs ml
      JOIN public.nutrition_meals m ON m.id = ml.meal_id
      JOIN public.nutrition_plans np ON np.id = m.plan_id
      JOIN public.clients c ON c.id = np.client_id
     WHERE c.team_id IS NOT NULL
    UNION
    SELECT c.team_id FROM public.daily_habits dh
      JOIN public.clients c ON c.id = dh.client_id
     WHERE c.team_id IS NOT NULL
    UNION
    SELECT c.team_id FROM public.nutrition_recipe_assignments ra
      JOIN public.clients c ON c.id = ra.client_id
     WHERE c.team_id IS NOT NULL
  ),
  team_pro_use AS (
    SELECT c.team_id FROM public.nutrition_plans np
      JOIN public.clients c ON c.id = np.client_id
     WHERE c.team_id IS NOT NULL AND np.plan_mode = 'exchanges'
    UNION
    SELECT c.team_id
      FROM public.meal_exchange_targets met
      JOIN public.nutrition_meals m ON m.id = met.meal_id
      JOIN public.nutrition_plans np ON np.id = m.plan_id
      JOIN public.clients c ON c.id = np.client_id
     WHERE c.team_id IS NOT NULL
  ),
  team_levels AS (
    SELECT
      t.id AS team_id,
      (bu.team_id IS NOT NULL) AS has_basic,
      (pu.team_id IS NOT NULL) AS has_pro
    FROM public.teams t
    LEFT JOIN (SELECT DISTINCT team_id FROM team_basic_use) bu ON bu.team_id = t.id
    LEFT JOIN (SELECT DISTINCT team_id FROM team_pro_use)   pu ON pu.team_id = t.id
    WHERE t.deleted_at IS NULL  -- no seedear teams soft-deleted
  )
  INSERT INTO public.team_feature_prefs (team_id, domain, preset, sections)
  SELECT
    tl.team_id,
    'nutrition',
    CASE WHEN tl.has_pro THEN 'profesional'
         WHEN tl.has_basic THEN 'intermedio'
         ELSE 'basico' END,
    -- Provenance only; el preset del team enciende las secciones via la config (ver coach arriba).
    CASE WHEN tl.has_pro OR tl.has_basic THEN jsonb_build_object('_seeded_from', 'usage')
         ELSE jsonb_build_object('_seeded_from', 'default') END
  FROM team_levels tl
  ON CONFLICT (team_id, domain) DO NOTHING;

  -- client_feature_prefs NO se backfillea: el resolver hereda del coach/team cuando la
  -- fila de alumno falta (plan §4.4 / §5.1). Sembrar overrides por-alumno seria ruido.
END $$;
