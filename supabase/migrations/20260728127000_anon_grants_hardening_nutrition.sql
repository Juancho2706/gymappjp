-- ============================================================================
-- EVA — NUT-035 (fase 1): cerrar el default privilege que abre TODO a `anon`
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G4B). Las 6 lineas citadas del baseline
-- siguen vigentes (no existe ningun REVOKE posterior para ninguna de ellas):
--   00000000000001_baseline.sql:3544 foods · :3628 daily_nutrition_logs ·
--   :3646 food_items · :3658 nutrition_meal_logs · :3688 nutrition_meals ·
--   :3712 nutrition_plans   -> todas con `GRANT ALL ON TABLE ... TO "anon"`.
--
-- Que mitiga RLS y que NO:
--   · Las policies de daily_nutrition_logs (:2475), nutrition_meal_logs (:2483),
--     food_items (:2515), nutrition_meals (:2522) y nutrition_plans (:2528) dependen de
--     `auth.uid()`, que para `anon` es NULL => no devuelven filas ni permiten insertar.
--   · PERO `baseline:2467` — `CREATE POLICY "Anyone can view global foods" ON public.foods
--     FOR SELECT USING (coach_id IS NULL)` NO lleva clausula `TO`, o sea aplica a PUBLIC
--     (incluye anon). Combinado con el grant de :3544, `anon` puede leer TODO el catalogo
--     global de alimentos sin autenticarse. Es dato de catalogo, no PII: exposicion de
--     scraping, no de privacidad.
--   · `GRANT ALL` incluye TRUNCATE, que NO pasa por RLS. Hoy no es alcanzable (PostgREST
--     solo emite SELECT/INSERT/UPDATE/DELETE), pero queda como riesgo latente.
--
-- CAUSA RAIZ (lo importante): baseline:3803/3813/3823 dejan
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES / FUNCTIONS / SEQUENCES TO anon;
-- => TODA tabla y funcion nueva creada por `postgres` en `public` nace accesible para
-- `anon` salvo que la migracion revoque explicitamente. Por eso las migraciones V2 estan
-- llenas de `revoke all ... from public, anon, authenticated`. El dia que una migracion
-- olvide el revoke, el objeto sale a produccion abierto y nada lo avisa.
--
-- VERIFICACION HECHA ANTES DEL REVOKE DE `foods` (paso 2):
--   grep -rn "from('foods')" apps/web/src apps/mobile packages  -> 40 call sites, TODOS
--   detras de sesion (superficies /coach/*, /c/[coach_slug]/* y rutas /api/mobile/*).
--   Ninguna pagina publica (landing, sitemap, /login) lee `foods` con la anon key.
--   Aun asi, esta fase 1 CONSERVA `grant select on public.foods to anon` (movimiento
--   conservador): la policy baseline:2467 sigue existiendo y solo expone el catalogo
--   global. Ir a `revoke all` sin grant de select es un paso posterior, con logs.
--
-- Alcance: `alter default privileges` NO cambia nada de lo YA existente (solo objetos
-- futuros) => riesgo cero para prod hoy, pero cambia el comportamiento esperado de las
-- migraciones futuras. Documentarlo para que nadie asuma el default viejo.
-- `service_role` (BYPASSRLS y grants propios) no se toca: los caminos server-side de la
-- app siguen intactos. `authenticated` tampoco se toca en esta fase.
--
-- FASE 2 (fuera de esta migracion): reducir `GRANT ALL` a verbos reales en las 41 tablas
-- del baseline, por tandas de dominio, cada tanda con su smoke.
--
-- ROLLBACK (una pasada):
--   alter default privileges for role postgres in schema public grant all on tables    to anon;
--   alter default privileges for role postgres in schema public grant all on functions to anon;
--   alter default privileges for role postgres in schema public grant all on sequences to anon;
--   grant all on public.foods, public.daily_nutrition_logs, public.food_items,
--             public.nutrition_meal_logs, public.nutrition_meals, public.nutrition_plans
--     to anon;
-- ============================================================================

-- ── 1) Cortar el default que abre todo lo NUEVO a anon ───────────────────────
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ── 2) foods: anon solo necesita LEER el catalogo global (policy baseline:2467) ──
revoke all on public.foods from anon;
grant select on public.foods to anon;

-- ── 3) Las otras cinco no tienen ningun caso de uso anonimo ──────────────────
revoke all on public.daily_nutrition_logs from anon;
revoke all on public.food_items           from anon;
revoke all on public.nutrition_meal_logs  from anon;
revoke all on public.nutrition_meals      from anon;
revoke all on public.nutrition_plans      from anon;
