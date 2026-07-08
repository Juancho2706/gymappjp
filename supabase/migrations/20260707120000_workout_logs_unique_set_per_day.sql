-- WA-2 (informe forense 2026-07-07 · resiliencia de la ejecución del alumno) —
-- idempotencia del guardado de series a nivel DB.
--
-- CAUSA RAÍZ: workout-log.actions.ts hacía un "upsert por día" MANUAL (SELECT filas de hoy en
-- Santiago → UPDATE la primera / INSERT si no había → DELETE sobrantes). NO es atómico y
-- workout_logs NO tenía índice único. El flush de la cola offline (evento 'online') podía correr
-- CONCURRENTE con el submit online de la MISMA serie: ambos SELECT no veían nada → doble INSERT →
-- fila duplicada que inflaba volumen/series del lado del coach.
--
-- FIX: índice único sobre (client_id, block_id, set_number, día-Santiago(logged_at)). La carrera
-- pierde en el segundo INSERT con 23505 y el action lo degrada a UPDATE (last-wins). Los logs con
-- block_id NULL (bloque borrado, ON DELETE SET NULL de 20260630190000) NO colisionan entre sí:
-- Postgres trata cada NULL como distinto en un índice único (comportamiento deseado — huérfanos).
--
-- Aditivo / forward-only / idempotente: el historial se re-ejecuta completo en cada merge de branch,
-- así que TODO acá usa CREATE OR REPLACE / IF NOT EXISTS y la limpieza de duplicados es reentrante.
-- ⚠️ NO se aplica a ninguna base de datos en este cambio: la aplicación a prod la decide el CEO con
-- el protocolo aparte (snapshot _bak + data sintética + advisors), no este .sql.

-- 1. Wrapper IMMUTABLE del día calendario en America/Santiago ------------------------------------
--    `timezone(text, timestamptz)` (lo que expande `AT TIME ZONE`) es STABLE, no IMMUTABLE, porque
--    la base de datos de zonas horarias puede cambiar entre versiones → Postgres no deja indexar
--    directo por esa expresión. Se envuelve en una función marcada IMMUTABLE: patrón ESTÁNDAR para
--    poder construir el índice de expresión por día local. Caveat aceptado: si Chile cambiara sus
--    reglas históricas de DST el índice podría necesitar REINDEX; el riesgo es teórico y se asume a
--    cambio de la unicidad por día. NO se usa columna generada: `GENERATED ALWAYS` con `AT TIME
--    ZONE` no pasa el check de inmutabilidad de Postgres; el índice de expresión con esta wrapper es
--    el patrón correcto. Cuerpo con solo built-ins (AT TIME ZONE + ::date) → search_path irrelevante;
--    se fija a '' de todos modos para no gatillar el advisor `function_search_path_mutable`.
CREATE OR REPLACE FUNCTION public.eva_santiago_day(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (ts AT TIME ZONE 'America/Santiago')::date;
$$;

-- 2. Limpieza de duplicados EXISTENTES antes de crear el índice único ----------------------------
--    Si prod ya acumuló filas dobles por la carrera, el CREATE UNIQUE INDEX fallaría. Conservamos la
--    fila de `logged_at` más reciente por (client_id, block_id, set_number, día-Santiago); desempate
--    por `id` DESC para determinismo. Idempotente por naturaleza: tras la primera pasada rn > 1 no
--    devuelve filas.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, block_id, set_number, public.eva_santiago_day(logged_at)
      ORDER BY logged_at DESC, id DESC
    ) AS rn
  FROM public.workout_logs
  WHERE block_id IS NOT NULL
)
DELETE FROM public.workout_logs wl
USING ranked
WHERE wl.id = ranked.id
  AND ranked.rn > 1;

-- 3. Índice único: 1 sola fila por serie por día-Santiago ----------------------------------------
--    Índice de EXPRESIÓN con la wrapper IMMUTABLE (no columna generada). Respalda el "upsert por
--    día" del action: la carrera flush-vs-submit pierde con 23505 y el action la maneja como UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS workout_logs_one_set_per_day
  ON public.workout_logs (client_id, block_id, set_number, public.eva_santiago_day(logged_at));
