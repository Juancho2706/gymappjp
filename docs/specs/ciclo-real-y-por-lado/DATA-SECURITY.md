---
status: implemented-pending-qa
owner: product-engineering
last_verified: "2026-09-03"
canonical: false
---

# DATA-SECURITY — «Ciclo real, por lado en fuerza, ficha con tipo, Android/PWA»

> Spec: `docs/specs/ciclo-real-y-por-lado/` (OUTLINE §12). Rama `rnmobiledenuevo`, HEAD `dbdf4b5e`.
> Jerarquía: `DECISIONS.md` (owner) > `OUTLINE-16-RESOLUCIONES.md` > `DECISIONS-2.md` > OUTLINE (con
> su §13) > mapas. Este documento es la **capa de datos y seguridad** del tren: 4 migraciones
> aditivas (R15), 1 test de equivalencia, el protocolo LIVE, el rollback, el diff del contrato TS y
> el threat model por pieza. No decide UI ni motor.
>
> Todo lo que sigue está verificado contra el repo en solo lectura; cada afirmación lleva
> `ruta:línea`. Las cuatro migraciones son `CREATE OR REPLACE` / función nueva: **cero DDL de tabla,
> cero columnas nuevas, cero backfill** (OUTLINE §1: «sin columnas nuevas»).

## 0. Índice de piezas y orden de aplicación

| # | Archivo | Tipo | Depende de | Reversible |
|---|---|---|---|---|
| 1 | `supabase/migrations/20260903212441_streak_cycle_branch_and_null_start.sql` | `CREATE OR REPLACE FUNCTION public.get_client_current_streak(uuid)` | — | sí (re-aplicar `20260723110000`) |
| 2 | `supabase/migrations/20260903212038_client_start_workout_program_rpc.sql` | función nueva + grants | — | sí (`DROP FUNCTION`) |
| 3 | `supabase/migrations/20260903212700_daily_tonnage_side_metadata.sql` | `CREATE OR REPLACE FUNCTION public.get_client_daily_tonnage(uuid,integer)` | zod de metadata desplegado (§7) | sí (re-aplicar el cuerpo de `20260612052000`) |
| 4 | `supabase/migrations/20260903212800_muscle_volume_side_metadata.sql` | `CREATE OR REPLACE FUNCTION public.get_client_muscle_volume(uuid,integer)` | zod de metadata desplegado (§7) | sí (re-aplicar el cuerpo de `20260701140000`) |
| T | `supabase/tests/streak_cycle_equivalence.sql` | harness tx-rollback | 1 | no aplica (termina en `ROLLBACK`) |

Timestamps fijados el 2026-09-03 (W1 en paralelo, `date -u +%Y%m%d%H%M%S` de cada worker): la 2
(`212038`) quedó **antes** de la 1 (`212441`); como las cuatro son independientes entre sí, el orden
real de aplicación por timestamp es 2 → 1 → 3 → 4 y no se renumera. Solo importa que sean
crecientes y **posteriores a `20260902220850`** (última migración aplicada en el repo). El nombre canónico del
archivo (el sufijo tras `<ts>`) **no se cambia** (OUTLINE §12 y §13). El **test no lleva `<ts>`**:
la convención del repo para `supabase/tests/` es el nombre pelado (R25), como
`supabase/tests/student_gate_equivalence.sql`.

Orden operativo obligatorio: **las cuatro se aplican después del deploy web** (R35: deploy web →
migraciones → OTA); ninguna se adelanta al deploy. Dentro de esa ventana, el orden INTERNO es
**primero la 1 y la 2** (no dependen de código nuevo) y **la 3 y la 4 al final, con el zod ampliado
(§7) ya en producción** — sin ese zod `metadata` no trae `left_reps`/`right_reps` y las dos son un
no-op, y así el `get_advisors` y la verificación posterior miden una sola cosa por vez.

**La cuarta migración está resuelta: entra en este tren (R15).** `get_client_muscle_volume` mide el
volumen con `reps_done` y, con R3, quedaría a la mitad del tonelaje **en la misma pantalla de la
ficha**; se corrige con el mismo `reps_eff` de la migración 3 y se alinean sus dos espejos TS. El
detalle y el blast radius están en §8.4.

---

## 1. `20260903212441_streak_cycle_branch_and_null_start.sql` — racha con rama `cycle` y guard de `start_date NULL`

### 1.1 Qué cambia respecto de `20260723110000_streak_assigned_days_semantics.sql`

Ocho cambios, todos marcados en el cuerpo con `-- CAMBIO n`. Cada uno es **no-op sobre los datos de
LIVE de hoy para programas `weekly`**, que es el criterio duro de salida (OUTLINE §8):

| n | Dónde (línea del archivo vigente) | Qué | Por qué / efecto en weekly |
|---|---|---|---|
| 1 | `v_regime_start` (`:86-90`) | `min(g.start_date)` **excluyendo `start_date IS NULL`**, en vez de `min(COALESCE(g.start_date, v_from))` | R2 · `start_date NULL` = «no empezó» ⇒ el programa **no crea régimen** ⇒ esos días caen en la regla 7 («todo día entrenado suma, ningún día corta»). Hoy en LIVE **ningún programa activo de cliente tiene `start_date NULL`** (STATS §Programas) ⇒ diff 0. |
| 2 | nuevo `v_cycle_start` | ancla del régimen de ciclo = `min(start_date)` de los programas activos `cycle` con fecha | R1 · define desde cuándo se puede cortar por semana vacía. `NULL` en clientes weekly ⇒ la rama entera se apaga. |
| 3 | `assigned` JOIN `progs` (`:116`) | `g.structure <> 'cycle'` | R1 · en `cycle` **no existe «día asignado»**: `workout_plans.day_of_week` es el índice del ciclo 1..N, no ISODOW (OUTLINE §1). Elimina de raíz el bug que convertía un ciclo de 3 en «Lun/Mar/Mié». En weekly la condición es siempre verdadera ⇒ diff 0. |
| 4 | `assigned` JOIN `progs` (`:116`) | `g.start_date IS NOT NULL AND g.start_date <= dy.day`, en vez de `(g.start_date IS NULL OR g.start_date <= dy.day)` | R2 · un programa sin empezar no asigna días (si no, asignaría toda la ventana y **cortaría** la racha por días que el alumno nunca aceptó). Diff 0 hoy (no hay NULLs). |
| 5 | nueva CTE `cycledays` | días con ≥ 1 log **de un plan de un programa `cycle` activo ya empezado** | R1 · «cada día entrenado suma +1». Vacía en clientes weekly ⇒ diff 0. |
| 6 | nueva CTE `cycle_empty_weeks` | semanas Lun–Dom **ya cerradas** (`week_monday + 6 < v_today`), dentro del régimen de ciclo, con **cero logs de cualquier tipo** | R1 · única ventana de corte. Vacía si `v_cycle_start IS NULL` ⇒ diff 0 en weekly. |
| 7 | `day_status.qualifies` (`:196-199`) | `OR cd.day IS NOT NULL` | suma el día de ciclo entrenado. |
| 8 | `day_status.breaks` (`:200-201`) | `OR ew.week_monday IS NOT NULL` | corta la semana vacía cerrada. |

Se **conservan intactos**: firma `(uuid) -> integer`, `LANGUAGE plpgsql STABLE SECURITY DEFINER SET
search_path TO 'public'`, el guard IDOR con bypass service-role (`:60-65`), la poda de `v_from` al
lunes de la semana del primer log (`:69-81`), el cap de 730 días (`:67`), las CTEs `days`, `logdays`,
`anylog`, `phase1`, `leftover_logs`, `missed_occurrences`, `phase2` **byte a byte**, el loop
`IF qualifies … ELSIF breaks … EXIT` (`:209-215`) y la ACL efectiva. Sobre los grants: un
`CREATE OR REPLACE` conserva la ACL (los `REVOKE … FROM anon` de
`20260608120150_revoke_anon_definer_read_rpcs.sql:19` y de
`20260608120160_revoke_public_definer_read_rpcs.sql:20` siguen vigentes), pero **igual se
re-declaran** `REVOKE ALL … FROM PUBLIC, anon, service_role` + `GRANT` y la verificación con
`has_function_privilege` inmediatamente después del `CREATE`: es el patrón único de las cuatro
migraciones del tren (R16). Acá el `GRANT` repone `service_role`, del que depende el bypass
deliberado de la ruta mobile de pulse (§8.1). Los dos batch
—`get_clients_streaks_by_ids` (`20260612054000_rpc_clients_streaks_by_ids.sql:9`) y
`get_coach_clients_streaks` (`00000000000001_baseline.sql:281`)— delegan en esta función y heredan la
semántica **sin tocarse**.

**Decisión de diseño (writer):** no se usa el `v_cycle_only boolean` con `bool_and(...)` que proponía
`maps/ciclo-db-racha-adherencia.md §3.3`. Las ramas quedan **por programa**, no por cliente: un
programa `cycle` aporta `cycledays`/`cycle_empty_weeks` y no aporta `assigned`; un programa `weekly`
aporta `assigned` y su regla 2 de corte. Un cliente mixto (weekly + cycle activos a la vez, que el
modelo permite aunque el guardado desactive los previos —
`apps/web/src/services/workout/workout.service.ts:547-552`) obtiene la unión correcta, en vez de que
la rama permisiva apague el corte del weekly. Contrapartida: en un cliente mixto el resultado **sí**
puede diferir del actual (hoy el `cycle` aporta días asignados por ISODOW). §4 cuenta cuántos hay
antes de aplicar y el criterio es detenerse si aparece alguno.

### 1.2 Migración completa (copiable)

```sql
-- supabase/migrations/20260903212441_streak_cycle_branch_and_null_start.sql
--
-- Rama `cycle` de la racha (R1) + guard de `start_date IS NULL` (R2).
-- Antecesor directo: 20260723110000_streak_assigned_days_semantics.sql (reglas 1-7 en su cabecera).
--
-- QUE CAMBIA
--   a) `cycle`: en un programa con program_structure_type='cycle' NO existe "dia asignado".
--      workout_plans.day_of_week es el indice del ciclo 1..cycle_length, no ISODOW (ver
--      packages/schemas/workout.ts:184-256 y el CHECK de 20260826010459). Reglas para cycle:
--        - dia con >=1 log de un plan del programa cycle (ya empezado) = +1
--        - ningun dia individual corta
--        - corta SOLO una semana calendario Lun-Dom (America/Santiago) YA CERRADA con cero logs
--          de cualquier tipo, dentro del regimen de ciclo
--      El cursor "que dia del ciclo toca hoy" NO se calcula aca: vive en TS
--      (packages/workout-engine/cycle-cursor.ts, alimentado por buildCycleCompletions de
--      packages/workout-engine/cycle-completions.ts, R9). Postgres nunca reimplementa
--      deriveDayCompletion.
--   b) `start_date IS NULL` (programa flexible que el alumno todavia no empezo): deja de crear
--      regimen de asignacion y deja de asignar dias => cae en la regla 7 (todo dia entrenado suma,
--      ningun dia corta). Hoy en LIVE no hay ningun programa activo de cliente con start_date NULL,
--      asi que este guard es 0-diff al aplicar y se vuelve el caso normal recien con el deploy de
--      "Inicio flexible" (D3 / R2). R13: solo los programas CREADOS O ASIGNADOS DESPUES del deploy
--      con start_date_flexible = true nacen con start_date NULL; los 50 activos que hoy tienen el
--      flag conservan su fecha y nunca entran por este camino.
--
-- QUE NO CAMBIA: firma (uuid)->integer, flags, IDOR guard con bypass service-role, cap 730d, poda
-- de v_from, CTEs days/logdays/anylog/phase1/leftover_logs/missed_occurrences/phase2 y el loop. Los
-- grants se RE-DECLARAN al pie con el patron unico del tren (R16: REVOKE ... FROM PUBLIC, anon,
-- service_role antes del GRANT, y has_function_privilege inmediatamente despues del CREATE); aca el
-- GRANT repone service_role, del que depende el bypass de la ruta mobile de pulse. Los batch
-- get_clients_streaks_by_ids / get_coach_clients_streaks heredan gratis.
--
-- Criterio de salida verificado ANTES de aplicar: 0 filas de diferencia contra la funcion vigente
-- para todo cliente cuyos programas activos sean weekly
-- (supabase/tests/streak_cycle_equivalence.sql).
-- Aditiva, forward-only, idempotente. Rollback: re-aplicar 20260723110000 verbatim.

CREATE OR REPLACE FUNCTION public.get_client_current_streak(p_client_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := public.eva_santiago_day(now());
  v_from date;
  v_first_log date;
  v_regime_start date;
  v_has_regime boolean;
  v_cycle_start date;          -- CAMBIO 2
  v_streak integer := 0;
  rec record;
BEGIN
  -- IDOR guard: bloquea lectura cross-tenant; deja pasar service-role (auth.uid() IS NULL).
  IF auth.uid() IS NOT NULL AND NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN RETURN 0; END IF;

  v_from := v_today - 730;

  -- Poda sin cambio semantico (identica a 20260723110000:69-81).
  SELECT min(public.eva_santiago_day(wl.logged_at))
    INTO v_first_log
  FROM public.workout_logs wl
  WHERE wl.client_id = p_client_id
    AND wl.logged_at >= (v_from::timestamp AT TIME ZONE 'America/Santiago');
  IF v_first_log IS NULL THEN
    RETURN 0;
  END IF;
  v_from := GREATEST(v_from, v_first_log - (EXTRACT(ISODOW FROM v_first_log)::int - 1));

  -- CAMBIO 1 (R2): un programa sin start_date NO crea regimen de asignacion. Antes se hacia
  -- min(COALESCE(g.start_date, v_from)), que metia toda la ventana bajo regimen.
  SELECT min(g.start_date)
    INTO v_regime_start
  FROM public.workout_programs g
  WHERE g.client_id = p_client_id
    AND g.is_active = true
    AND g.start_date IS NOT NULL;
  v_has_regime := v_regime_start IS NOT NULL;

  -- CAMBIO 2 (R1): ancla del regimen de ciclo. NULL => la rama cycle queda apagada por completo.
  SELECT min(g.start_date)
    INTO v_cycle_start
  FROM public.workout_programs g
  WHERE g.client_id = p_client_id
    AND g.is_active = true
    AND g.start_date IS NOT NULL
    AND COALESCE(g.program_structure_type, 'weekly') = 'cycle';

  FOR rec IN
    WITH progs AS (
      SELECT g.id,
             g.start_date,
             COALESCE(g.program_structure_type, 'weekly') AS structure,   -- CAMBIO 3
             GREATEST(1, COALESCE(g.weeks_to_repeat, 1)) AS weeks,
             COALESCE(g.ab_mode, false) AS ab,
             EXISTS (SELECT 1 FROM public.workout_plans p
                     WHERE p.program_id = g.id AND COALESCE(NULLIF(p.week_variant, ''), 'A') = 'A') AS has_a,
             EXISTS (SELECT 1 FROM public.workout_plans p
                     WHERE p.program_id = g.id AND COALESCE(NULLIF(p.week_variant, ''), 'A') = 'B') AS has_b
      FROM public.workout_programs g
      WHERE g.client_id = p_client_id AND g.is_active = true
    ),
    days AS (
      SELECT d::date AS day,
             EXTRACT(ISODOW FROM d::date)::int AS dow,
             (d::date - (EXTRACT(ISODOW FROM d::date)::int - 1)) AS week_monday
      FROM generate_series(v_from, v_today, interval '1 day') d
    ),
    -- Asignaciones por dia: SOLO programas weekly ya empezados. En cycle el day_of_week es el
    -- indice del ciclo, no ISODOW: no se puede comparar contra dy.dow (CAMBIO 3), y un programa
    -- sin start_date no asigna nada (CAMBIO 4).
    assigned AS (
      SELECT dy.day, dy.week_monday, p.id AS plan_id
      FROM days dy
      JOIN progs g
        ON g.structure <> 'cycle'                                          -- CAMBIO 3
       AND g.start_date IS NOT NULL AND g.start_date <= dy.day             -- CAMBIO 4
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN (GREATEST(1, LEAST(g.weeks, ((dy.day - g.start_date) / 7) + 1)) % 2) = 1
                 THEN 'A' ELSE 'B'
               END AS cycle_variant
      ) cv
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN NOT g.ab THEN 'A'
                 WHEN cv.cycle_variant = 'A' THEN
                   CASE WHEN g.has_a THEN 'A' WHEN g.has_b THEN 'B' ELSE 'A' END
                 ELSE
                   CASE WHEN g.has_b THEN 'B' WHEN g.has_a THEN 'A' ELSE 'B' END
               END AS eff_variant
      ) ev
      JOIN public.workout_plans p
        ON p.program_id = g.id
       AND p.day_of_week = dy.dow
       AND COALESCE(NULLIF(p.week_variant, ''), 'A') = ev.eff_variant
      UNION
      -- Legacy: plan suelto puntual (program_id NULL). Hoy 0 filas en prod.
      SELECT p.assigned_date,
             (p.assigned_date - (EXTRACT(ISODOW FROM p.assigned_date)::int - 1)),
             p.id
      FROM public.workout_plans p
      WHERE p.program_id IS NULL
        AND p.client_id = p_client_id
        AND p.assigned_date BETWEEN v_from AND v_today
    ),
    -- Dia Santiago x plan con al menos un log. plan_id NULL = log huerfano o sesion sin bloque.
    logdays AS (
      SELECT public.eva_santiago_day(wl.logged_at) AS day, wb.plan_id
      FROM public.workout_logs wl
      LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
      WHERE wl.client_id = p_client_id
        AND wl.logged_at >= (v_from::timestamp AT TIME ZONE 'America/Santiago')
      GROUP BY 1, 2
    ),
    anylog AS (SELECT DISTINCT day FROM logdays),
    -- CAMBIO 5 (R1): dia con >=1 log de un plan de un programa CYCLE activo ya empezado = +1.
    -- Un log huerfano (bloque borrado, plan_id NULL) o de otro programa NO entra: sigue siendo
    -- NEUTRO, igual que las reglas 4 y 5 de la semantica vigente.
    cycledays AS (
      SELECT DISTINCT l.day
      FROM logdays l
      JOIN public.workout_plans p ON p.id = l.plan_id
      JOIN progs g ON g.id = p.program_id
      WHERE g.structure = 'cycle'
        AND g.start_date IS NOT NULL
        AND g.start_date <= l.day
    ),
    -- CAMBIO 6 (R1): unica ventana de corte en cycle. Semana Lun-Dom Santiago YA CERRADA
    -- (week_monday + 6 < hoy) con CERO logs de cualquier tipo. Solo se juzgan las semanas que
    -- empiezan en o despues del ancla del ciclo: una semana anterior al programa no se evalua.
    cycle_empty_weeks AS (
      SELECT dy.week_monday
      FROM days dy
      LEFT JOIN anylog al ON al.day = dy.day
      WHERE v_cycle_start IS NOT NULL
        AND dy.week_monday >= v_cycle_start
        AND dy.week_monday + 6 < v_today
      GROUP BY dy.week_monday
      HAVING count(al.day) = 0
    ),
    -- Fase 1 (regla 1): dia asignado con log de SU plan ese mismo dia.
    phase1 AS (
      SELECT DISTINCT a.day
      FROM assigned a
      JOIN logdays l ON l.plan_id = a.plan_id AND l.day = a.day
    ),
    -- Fase 2 (regla 3): atribucion greedy por (plan, semana Lun-Dom) — espejo del dashboard.
    leftover_logs AS (
      SELECT l.day, l.plan_id,
             (l.day - (EXTRACT(ISODOW FROM l.day)::int - 1)) AS week_monday,
             ROW_NUMBER() OVER (
               PARTITION BY l.plan_id, (l.day - (EXTRACT(ISODOW FROM l.day)::int - 1))
               ORDER BY l.day
             ) AS rn
      FROM logdays l
      WHERE l.plan_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM assigned a WHERE a.plan_id = l.plan_id AND a.day = l.day)
    ),
    missed_occurrences AS (
      SELECT a.day, a.plan_id, a.week_monday,
             ROW_NUMBER() OVER (PARTITION BY a.plan_id, a.week_monday ORDER BY a.day) AS rn
      FROM assigned a
      WHERE NOT EXISTS (SELECT 1 FROM logdays l WHERE l.plan_id = a.plan_id AND l.day = a.day)
    ),
    phase2 AS (
      SELECT DISTINCT ll.day
      FROM leftover_logs ll
      JOIN missed_occurrences mo
        ON mo.plan_id = ll.plan_id
       AND mo.week_monday = ll.week_monday
       AND mo.rn = ll.rn
    ),
    day_status AS (
      SELECT dy.day,
             (p1.day IS NOT NULL
              OR p2.day IS NOT NULL
              -- Regla 7: fuera de la zona con regimen, todo dia entrenado suma.
              OR ((NOT v_has_regime OR dy.day < v_regime_start) AND al.day IS NOT NULL)
              OR cd.day IS NOT NULL) AS qualifies,                        -- CAMBIO 7
             -- Regla 2 (weekly): dia asignado YA PASADO con cero logs corta. Hoy nunca corta.
             -- CAMBIO 8 (cycle): corta la semana Lun-Dom cerrada sin ningun entreno.
             ((dy.day < v_today AND ad.day IS NOT NULL AND al.day IS NULL)
              OR ew.week_monday IS NOT NULL) AS breaks
      FROM days dy
      LEFT JOIN phase1 p1 ON p1.day = dy.day
      LEFT JOIN phase2 p2 ON p2.day = dy.day
      LEFT JOIN anylog al ON al.day = dy.day
      LEFT JOIN cycledays cd ON cd.day = dy.day
      LEFT JOIN cycle_empty_weeks ew ON ew.week_monday = dy.week_monday
      LEFT JOIN (SELECT DISTINCT day FROM assigned) ad ON ad.day = dy.day
    )
    SELECT day, qualifies, breaks FROM day_status ORDER BY day DESC
  LOOP
    IF rec.qualifies THEN
      v_streak := v_streak + 1;
    ELSIF rec.breaks THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$function$;

-- Patron unico de grants del tren (R16). CREATE OR REPLACE ya conserva la ACL, pero se re-declara
-- para que el archivo sea autocontenido y para que el REVOKE liste EXPLICITAMENTE service_role: el
-- baseline hace ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO service_role
-- (00000000000001_baseline.sql:3815). Aca service_role se RE-GRANTEA a proposito: la racha tiene
-- bypass service-role (auth.uid() IS NULL) del que depende la ruta mobile de pulse.
REVOKE ALL ON FUNCTION public.get_client_current_streak(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_current_streak(uuid) TO authenticated, service_role;

-- Verificacion INMEDIATA (misma sesion, justo despues del CREATE). Esperado:
-- anon false, authenticated true, service_role true.
-- SELECT r.rolname, has_function_privilege(r.rolname, 'public.get_client_current_streak(uuid)', 'EXECUTE') AS puede
--   FROM (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname);

COMMENT ON FUNCTION public.get_client_current_streak(uuid) IS
  'Racha diaria del alumno. WEEKLY (regla CEO 2026-07-22, sin cambios): asignado hecho = +1; asignado sin entrenar nada = corta (hoy no corta; recuperar no repara); dia libre recuperando un perdido de la misma semana Lun-Dom Santiago = +1; repeticion/sesion libre = neutro; asignado entrenando otra cosa = neutro. CYCLE (2026-09, R1): no hay dia asignado (day_of_week es indice de ciclo, no ISODOW); cada dia con log del programa suma +1; ningun dia individual corta; corta solo una semana Lun-Dom ya cerrada con cero logs. start_date NULL (programa flexible sin empezar) = no crea regimen: aplica la regla 7 (todo dia entrenado suma, nada corta). Nutricion FUERA. Dia = eva_santiago_day. Cap 730d. Guard IDOR con bypass service-role.';
```

### 1.3 Consecuencias medibles (para el aviso al coach, OUTLINE §10)

- Los 5 alumnos de Movens con logs pasan de racha `0` a un valor > 0 (STATS §Racha midió 8, 6, 4, 4,
  3, 2, 2, 2 y 1×5 con la variante «todo día entrenado suma»; el corte por semana vacía puede bajar
  alguno de esos números, por eso el paso 8 del protocolo re-mide **después** de aplicar).
- **Los números de STATS no son una promesa**: se midieron sobre la definición vigente de día
  asignado y sin el corte por semana vacía. El único valor confiable es el que devuelva
  `_streak_next` en el paso 1 del §5 (hallazgo S2 del crítico).
- La racha en `cycle` **puede bajar** —a diferencia de la variante cruda de
  `maps/ciclo-db-racha-adherencia.md §3.3`—: una semana entera sin entrenar la resetea. Eso es lo que
  mantiene honestos los `MILESTONES` de `StreakRibbon.tsx:18-23` y el copy «días de racha»; sin el
  corte, el contador nunca bajaría (hueco H4 del crítico).
- **Ya no hay aviso por el volumen por grupo muscular**: R15 mete la cuarta migración
  (`20260903212800_muscle_volume_side_metadata.sql`, §8.4) en este mismo tren, así que `get_client_muscle_volume`
  y el tonelaje usan el **mismo `reps_eff`** y no queda la inconsistencia de «volumen a la mitad del
  tonelaje en la misma pantalla».
- **Segundo aviso, si el paso 0 encuentra logs huérfanos en clientes `cycle`** (`block_id NULL`, ver
  el paso 0 del §5): por R29 esos días son **neutros** —no suman ni cortan—, coherente con las reglas
  4-5 de weekly; el número prometido puede quedar por debajo de la simulación de STATS y hay que
  decirlo, no cambiar la regla.
- **Tercer aviso (R22), a los 11 coaches con bloques por lado con historial**: en bloques `per_side`
  cuyos logs viejos venían **sumados** en `reps_done`, el PR por e1RM puede no dispararse tras el
  cambio; el PR por peso sigue funcionando. Es un efecto aceptado, no un bug.

### Resultado LIVE 2026-09-03 (W1, ejecutado sobre `jikjeokundmaafuytdcx` en tx-rollback)

Archivos entregados: `supabase/migrations/20260903212441_streak_cycle_branch_and_null_start.sql`
(el `<ts>` quedó fijado) y `supabase/tests/streak_cycle_equivalence.sql`. Todo lo que sigue se corrió
dentro de `BEGIN; … ROLLBACK;`: **nada quedó aplicado en LIVE**.

**Criterio de salida — PASA.** Universo: 109 clientes con logs en 730 d (20.861 logs).

| métrica | valor | criterio |
|---|---|---|
| `difs_weekly` | **0** de 91 | duro, 0 ✅ |
| `difs_sin_programa` | **0** de 5 | 0 ✅ |
| `mixtos` | **0** | 0 ✅ |
| `clientes_cycle` | 13 (con logs) | — |
| `cycle_con_cambio` | **11** | > 0 ✅ (no es vacua) |

**Censo previo (confirma los supuestos del §1.1 y del CAMBIO 1/4):** 120 programas activos de
cliente — 105 `weekly` (37 con `start_date_flexible`) y 15 `cycle` (13 con el flag) — y **0 con
`start_date IS NULL`**. El guard de R2 es, hoy, estrictamente 0-diff.

**Tabla de diffs de `cycle`** (cliente anonimizado por prefijo de UUID; `sem_vac` = semanas Lun–Dom
ya cerradas y sin ningún log desde el ancla del ciclo):

| cliente | actual | next | ciclo | `start_date` | `sem_vac` | motivo |
|---|---|---|---|---|---|---|
| `54eb2eae` | 1 | **4** | 7 | 2026-08-25 | 0 | la rama `cycle` suma los 4 días entrenados del programa |
| `56d5fd89` | 0 | **3** | 5 | 2026-07-26 | 3 | suma; las 3 semanas vacías son anteriores al tramo vivo y el loop sale antes |
| `65bda62e` | 0 | **3** | 3 | 2026-08-29 | 0 | la rama `cycle` suma |
| `0fa33eac` | 0 | **2** | 7 | 2026-08-25 | 0 | la rama `cycle` suma |
| `281cabd1` | 1 | **2** | 2 | 2026-08-28 | 0 | la rama `cycle` suma (`ab_mode` = true) |
| `6b50d786` | 0 | **2** | 3 | 2026-08-24 | 0 | la rama `cycle` suma (`ab_mode` = true) |
| `f28ed987` | 2 | 2 | 7 | 2026-07-27 | 4 | sin cambio |
| `0e6d9de6` | 0 | **1** | 3 | 2026-08-27 | 0 | la rama `cycle` suma |
| `5c9c2cc2` | 0 | **1** | 2 | 2026-09-02 | 0 | la rama `cycle` suma |
| `8984f8b7` | 0 | **1** | 3 | 2026-09-02 | 0 | la rama `cycle` suma |
| `8bf7cb3e` | 0 | **1** | 2 | 2026-09-02 | 0 | la rama `cycle` suma |
| `eda60a19` | 0 | **1** | 3 | 2026-09-02 | 0 | la rama `cycle` suma |
| `bb6c81b2` | 0 | 0 | 4 | 2026-08-09 | 1 | sin cambio |

Los otros 2 clientes con programa `cycle` activo (`4835ed4a`, `f78fc349`) no tienen logs en 730 d:
quedan en `0` por el corte temprano de `v_first_log`, sin pasar por la rama nueva. **Ninguna racha
baja**: las 11 diferencias son todas hacia arriba y el corte por semana vacía no le resta a nadie
hoy. El aviso al coach del §1.3 sigue valiendo tal cual (`54eb2eae` es el mayor, 1 → 4).

**EXPLAIN (ANALYZE, BUFFERS) del cuerpo del `FOR` extraído, con escalares literales** (variante A del
§4 paso 6; nunca `EXPLAIN SELECT get_client_current_streak(...)`), sobre el cliente `weekly` y el
cliente `cycle` con más logs. El plan **no empeora en ningún eje**:

| caso | cliente | logs | versión | exec | plan | buffers hit/read | `Seq Scan` |
|---|---|---|---|---|---|---|---|
| weekly | `77a1717d` | 1.411 | vigente | 50,76 ms | 1,67 ms | 524 / 0 | 2 |
| weekly | `77a1717d` | 1.411 | **nueva** | **12,80 ms** | 2,21 ms | **512** / 0 | **1** |
| cycle | `54eb2eae` | 129 | vigente | 3,57 ms | 3,18 ms | 491 / 0 | 1 |
| cycle | `54eb2eae` | 129 | **nueva** | **2,20 ms** | 2,90 ms | **475** / 0 | **0** |

La mejora viene de que el JOIN de `assigned` ahora filtra `structure <> 'cycle' AND start_date IS NOT
NULL` **antes** del `CROSS JOIN LATERAL` y de que el `CASE` interno de `cycle_variant` pierde la rama
`start_date IS NULL`; `cycle_empty_weeks` agrega un `GROUP BY` sobre `days` (≤ 731 filas ya
materializadas) que no se nota. `buf_read = 0` en las cuatro corridas, así que no hay efecto de
caché frío entre versiones. La poda de `v_from` se conserva (no aparece un `Seq Scan` de
`workout_logs` completa).

**ACL verificada en LIVE**, antes y después de correr la migración dentro de la transacción — el
`proacl` queda **idéntico** (`{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`):

| rol | antes | después | esperado |
|---|---|---|---|
| `anon` | false | false | false ✅ |
| `authenticated` | true | true | true ✅ |
| `service_role` | true | true | true ✅ (W6.9b: la RPC de lectura se llama con `service_role`) |

El bloque `DO $acl$ … RAISE EXCEPTION` al pie de la migración se ejecutó y **no** disparó.

**Herencia de los batch, verificada leyendo `pg_get_functiondef` en LIVE:**
`get_clients_streaks_by_ids(uuid[])` y `get_coach_clients_streaks(uuid)` llaman
`COALESCE(public.get_client_current_streak(c.id), 0)::integer` y **no se tocan**.

**Diferencia LIVE vs. linaje (LIVE manda, se anota y no se corrige acá):** el cuerpo desplegado de
`get_client_current_streak` es el de `20260723110000_streak_assigned_days_semantics.sql` **sin la
mayoría de sus comentarios `--` internos** (`prosrc` se guarda verbatim, así que la diferencia es
real y no un artefacto de `pg_get_functiondef`; sobrevive solo el comentario del IDOR guard). El
código ejecutable es **byte a byte idéntico** con los comentarios normalizados, y la migración nueva
se escribió contra el cuerpo de LIVE. Snapshot completo (con `md5`, `proacl` y el `COMMENT` vigente,
listo para el rollback del §6) en el tmp del job W1: `streak-before.sql`.

---

## 2. `20260903212038_client_start_workout_program_rpc.sql` — «Empezar hoy» (OUTLINE §3.2 y §13, D3 / R2)

### 2.1 Por qué hace falta una RPC y no un `UPDATE` desde el cliente

Verificado sobre las policies de `workout_programs`:

- El alumno solo tiene **lectura**: `workout_programs_client_read` es `FOR SELECT`
  (`00000000000001_baseline.sql:3373`).
- La única policy permisiva de escritura es del coach: `workout_programs_workspace_manage`, `FOR ALL`
  con `coach_id = auth.uid()` (o rama org) —
  `20260609180000_harden_standalone_withcheck_client_ownership.sql:30-42`.
- `archive_gate_workout_programs` es **`AS RESTRICTIVE`**
  (`20260801023414_archive_client_access_and_nutrition_v2_history.sql:274,307`): restringe, no
  habilita.

⇒ El alumno **no puede** escribir `start_date` directamente, y no se va a abrir una policy de UPDATE
para él (le daría acceso a `is_active`, `coach_id`, `weeks_to_repeat`…). La salida es la que ya usó
la casa en `20260813040921_coach_food_last_qty_remember.sql:17-18`: mover la escritura a una función
guardada `SECURITY DEFINER` cuyos guards internos son el control real.

Contrapartida de esa elección, y por eso está explícita en el cuerpo: `SECURITY DEFINER` **saltea la
RLS**, incluidas las policies RESTRICTIVAS del gate de suscripción del coach
(`20260718120000_student_access_grace_gate.sql:148-208`). Por eso la RPC llama ella misma a
`private.student_write_allowed(auth.uid())`, igual que toda RPC `DEFINER` de escritura del alumno de
la casa (`20260718120000:290`, `:496`; `20260718140000:184`, `:397`). El trigger
`workout_programs_archived_client_guard` **no** cubre este hueco: dispara solo en
`INSERT OR UPDATE OF client_id, is_active` (`20260731123000:128-131`), nunca en un `UPDATE` de
`start_date`.

### 2.2 Migración completa (copiable)

```sql
-- supabase/migrations/20260903212038_client_start_workout_program_rpc.sql
--
-- "Empezar hoy" (D3 / OUTLINE R2 y §3.2): el ALUMNO fija el start_date de su programa flexible.
--
-- POR QUE RPC. El alumno solo tiene SELECT sobre workout_programs (baseline:3373); la unica policy
-- de escritura es la del coach (20260609180000:30-42) y el archive gate es RESTRICTIVE
-- (20260801023414:307). Abrir un UPDATE al alumno le daria is_active/coach_id/weeks_to_repeat.
-- SECURITY DEFINER + guards internos, mismo criterio que 20260813040921_coach_food_last_qty_remember.
--
-- CONTRATO (R23)
--   client_start_workout_program(p_program_id uuid, p_start_date date DEFAULT NULL)
--     RETURNS TABLE (start_date date, end_date date, started boolean)
--   - `started` = true SOLO cuando ESTA llamada escribio la fecha. Es la traza que faltaba: el
--     evento PostHog program_started_by_client (OUTLINE §9) se emite unicamente con started = true,
--     asi que el auto-start de cada serie no lo cuenta doble.
--   - Solo el alumno DUENO del programa. El guard es EXACTAMENTE el predicado de la policy INSERT
--     del alumno sobre workout_logs (R40): `workout_logs_client` (baseline:3347) es
--     `client_id = (select auth.uid())`, sin client_memberships ni student_readable_client_ids; la
--     capa restrictiva es student_write_gate_ins_workout_logs (20260718120000:141-150) =
--     private.student_write_allowed(client_id). Esta RPC replica las dos. Nunca el coach, nunca
--     service_role (auth.uid() IS NULL => 'unauthenticated'): el coach fija la fecha desde el builder.
--   - Solo programas is_active = true y start_date_flexible = true.
--   - GATE DE ESCRITURA DEL ALUMNO: private.student_write_allowed(auth.uid()). Toda RPC DEFINER de
--     escritura del alumno lo lleva (20260718120000:101-126 la define; :290 y :496 son el patron, e
--     idem 20260718140000:184,397). Sin el, esta RPC seria la unica escritura del alumno que se
--     salta el gate: SECURITY DEFINER saltea RLS (por eso las policies RESTRICTIVAS de
--     20260718120000:148-208 no la alcanzan) y el trigger workout_programs_archived_client_guard
--     solo dispara en INSERT OR UPDATE OF client_id, is_active (20260731123000:128-131), nunca en un
--     UPDATE de start_date.
--   - IDEMPOTENTE (R28): si el programa YA tiene start_date, devuelve la fecha existente con
--     started = false y sin escribir. Si el UPDATE afecta 0 filas por CUALQUIER OTRA causa =>
--     program_not_startable. Esto es lo que hace seguro el auto-start del ejecutor (web
--     workout-log.actions.ts, RN lib/workout-session.ts): puede llamarse en cada serie sin mover la
--     fecha ni "reescribir historia" (D3) y sin re-emitir el evento.
--   - Fecha por defecto = hoy en America/Santiago via public.eva_santiago_day(now()) — la MISMA
--     unidad de dia del indice unico workout_logs_one_set_per_day (20260707120000:63) y de la racha.
--   - Escribe start_date Y end_date en el MISMO UPDATE (R21: end_date = start + weeks_to_repeat*7
--     - 1, calculado server-side con la weeks_to_repeat de la propia fila; el alumno no lo elige).
--     Las dos viajan juntas y las dos son NULL mientras el programa no empezo: la ficha del coach
--     calcula semana y dias restantes solo si estan ambas (client-detail.service.ts:314).
--   - VENTANA = SOLO HOY (R14). p_start_date NULL o IGUAL a hoy (Santiago) pasa; CUALQUIER otra
--     fecha => start_date_out_of_range. No hay "Elegir otra fecha" ni estado "Empieza el <fecha>"
--     en este tren (backlog). El pasado esta cerrado porque la RPC es idempotente estricta (una
--     fecha retroactiva no se puede corregir despues) y en weekly flexible crearia dias asignados
--     hacia atras (migracion 1, CTE `assigned`) que la regla 2 cuenta como CORTE => la racha se
--     rompe en el mismo instante en que el alumno "empieza". El futuro esta cerrado porque
--     adelantaria semana, fases y variante A/B en cycle
--     (apps/web/src/lib/workout/programWeekVariant.ts:7-22) hacia un estado que la UI no tiene.
--
-- Aditiva, forward-only. Rollback al pie.

CREATE OR REPLACE FUNCTION public.client_start_workout_program(
  p_program_id uuid,
  p_start_date date DEFAULT NULL
) RETURNS TABLE (start_date date, end_date date, started boolean)   -- R23
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid      uuid := (SELECT auth.uid());
  v_today    date := public.eva_santiago_day(now());
  v_existing date;
  v_date     date;
  v_end      date;
  v_found    boolean := false;
BEGIN
  -- Sin sesion no hay dueno: service_role NO tiene camino aca (a proposito).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_program_id IS NULL THEN
    RAISE EXCEPTION 'program_not_startable' USING ERRCODE = '42501';
  END IF;

  -- Gate de acceso del alumno segun la suscripcion de SU coach (R17, 20260718120000). Espejo del
  -- patron de las RPCs V2 de nutricion (20260718120000:290, :496): post-gracia el alumno queda en
  -- SOLO-LECTURA y no empieza programas. Va ANTES del SELECT ... FOR UPDATE para no tomar el lock.
  IF NOT private.student_write_allowed(v_uid) THEN
    RAISE EXCEPTION 'coach_account_paused' USING ERRCODE = '42501';
  END IF;

  -- Guard de pertenencia + estado. Mismo predicado que la policy INSERT del alumno sobre
  -- workout_logs (R40: workout_logs_client, baseline:3347 => client_id = auth.uid(); sin
  -- client_memberships). FOR UPDATE serializa dos "Empezar hoy" simultaneos (boton + auto-start del
  -- primer set): el segundo ve la fecha ya escrita y sale por idempotencia.
  -- OJO plpgsql: los OUT de RETURNS TABLE se llaman start_date/end_date, asi que TODA referencia a
  -- esas columnas dentro del cuerpo va calificada con el alias (g.start_date, g.end_date) o Postgres
  -- lanza "column reference is ambiguous".
  SELECT true, g.start_date, g.end_date
    INTO v_found, v_existing, v_end
  FROM public.workout_programs g
  WHERE g.id = p_program_id
    AND g.client_id = v_uid
    AND g.is_active = true
    AND COALESCE(g.start_date_flexible, false) = true
  FOR UPDATE;

  -- Mismo error para "no existe", "no es tuyo", "no esta activo" y "no es flexible": no se filtra
  -- la existencia de un programa ajeno (el IDOR se cierra sin oraculo).
  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'program_not_startable' USING ERRCODE = '42501';
  END IF;

  -- R28: idempotente. La fecha ya estaba => se devuelve tal cual, con started = false y sin
  -- escribir (asi el auto-start de cada serie no re-emite program_started_by_client).
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, v_end, false;
    RETURN;
  END IF;

  v_date := COALESCE(p_start_date, v_today);

  -- VENTANA = SOLO HOY (R14). NULL o hoy pasan; cualquier otra fecha se rechaza. "Elegir otra
  -- fecha" quedo fuera de este tren, asi que la RPC no tiene por que aceptar futuro: el pasado es
  -- irreversible (idempotencia estricta) y corta la racha en weekly flexible, y el futuro crea un
  -- estado "Empieza el <fecha>" que la UI de este tren no tiene.
  IF v_date <> v_today THEN
    RAISE EXCEPTION 'start_date_out_of_range' USING ERRCODE = '22007';
  END IF;

  -- RETURNING: los valores devueltos son SIEMPRE los persistidos. Con el cinturon
  -- `start_date IS NULL`, un UPDATE que afecta 0 filas (carrera que gano otra sesion entre el SELECT
  -- y el UPDATE) dejaba v_date "de fantasia": el hero del alumno y el auto-start de cada serie
  -- (workout-log.actions.ts / workout-session.ts) pintan el estado con lo que devuelve esta RPC.
  -- end_date viaja SIEMPRE con start_date (R21): la ficha del coach calcula
  -- semana actual y dias restantes solo si estan LAS DOS
  -- (apps/web/src/services/client/client-detail.service.ts:314); fijar solo start_date dejaria el
  -- progreso del programa en 0. Misma formula que el servicio web
  -- (apps/web/src/services/workout/workout.service.ts:422-429): start + weeks*7 - 1.
  UPDATE public.workout_programs g
     SET start_date = v_date,
         end_date   = v_date + (GREATEST(1, COALESCE(g.weeks_to_repeat, 1)) * 7 - 1)
   WHERE g.id = p_program_id
     AND g.client_id = v_uid
     AND g.start_date IS NULL             -- cinturon: nunca pisa una fecha existente
  RETURNING g.start_date, g.end_date INTO v_date, v_end;

  IF FOUND THEN
    RETURN QUERY SELECT v_date, v_end, true;   -- started = true: ESTA llamada escribio (R23)
    RETURN;
  END IF;

  -- R28: 0 filas. Si es porque la fecha ya estaba (carrera que gano otra sesion entre el
  -- SELECT ... FOR UPDATE y el UPDATE), se devuelve la existente con started = false. Si es por
  -- cualquier otra causa (la fila dejo de cumplir el guard), program_not_startable.
  SELECT g.start_date, g.end_date INTO v_date, v_end
    FROM public.workout_programs g
   WHERE g.id = p_program_id AND g.client_id = v_uid;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'program_not_startable' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT v_date, v_end, false;
END;
$$;

-- Patron unico de grants del tren (R16). REVOKE tambien a service_role: el baseline tiene
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role`
-- (00000000000001_baseline.sql:3815), asi que TODA funcion nueva nace con un GRANT EXPLICITO a
-- service_role que un REVOKE de PUBLIC/anon no toca (el mismo hallazgo que motivo
-- 20260608120160_revoke_public_definer_read_rpcs.sql:1-4 para PUBLIC). Sin esta linea, el paso 3 del
-- protocolo (§5) mide `service_role = true` y contradice al threat model (§8.2).
REVOKE ALL ON FUNCTION public.client_start_workout_program(uuid, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.client_start_workout_program(uuid, date) TO authenticated;

-- Verificacion INMEDIATA (misma sesion, justo despues del CREATE): que el REVOKE haya quedado.
-- Esperado: anon false, authenticated true, service_role false.
-- SELECT r.rolname, has_function_privilege(r.rolname, 'public.client_start_workout_program(uuid, date)', 'EXECUTE') AS puede
--   FROM (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname);

COMMENT ON FUNCTION public.client_start_workout_program(uuid, date) IS
  'El alumno fija el start_date (y el end_date derivado = start + weeks_to_repeat*7 - 1) de SU programa flexible sin empezar ("Empezar hoy", D3). Devuelve TABLE(start_date, end_date, started); started = true solo cuando ESTA llamada escribio, y el evento program_started_by_client se emite unicamente en ese caso. Guards: private.student_write_allowed(auth.uid()) (gate de suscripcion del coach) + client_id = auth.uid() AND is_active AND start_date_flexible AND start_date IS NULL, mismo predicado que la policy INSERT del alumno sobre workout_logs. Idempotente: si ya tiene fecha la devuelve con started = false y sin escribir (habilita el auto-start en cada serie); devuelve SIEMPRE los valores persistidos (RETURNING + relectura). Ventana: SOLO HOY (p_start_date NULL o = eva_santiago_day(now()), America/Santiago); cualquier otra fecha => start_date_out_of_range. EXECUTE solo a authenticated; el grant por default privileges a service_role se revoca explicitamente.';

-- ============================================================================
-- ROLLBACK (referencia de operacion; no se ejecuta aca):
--   DROP FUNCTION IF EXISTS public.client_start_workout_program(uuid, date);
-- ============================================================================
```

### 2.3 Notas de contrato para los consumidores (W2 / W3)

- Web: `startWorkoutProgramAction({ coachSlug, programId })` en
  `apps/web/src/app/c/[coach_slug]/dashboard/_actions/start-program.actions.ts` (nuevo, OUTLINE §4 y
  §13; R24). Objeto, **sin fecha** (por R14 la RPC solo acepta hoy). Al volver con `started`, hace
  `revalidatePath('/c/' + coachSlug + '/dashboard')`.
- RN: `apps/mobile/lib/start-program.ts` → `startWorkoutProgram(programId)` (OUTLINE §5, R24).
- La RPC devuelve **tres columnas** (`start_date`, `end_date`, `started`, R23): los dos llamadores
  leen la fila entera. `started = true` es la **única** condición para emitir
  `program_started_by_client` (OUTLINE §9); con `started = false` (auto-start de cada serie,
  doble tap, carrera) no se emite nada.
- `end_date` **viaja siempre con `start_date`** y las dos son `NULL` mientras el programa no empezó
  (R21). Los guards que lo garantizan del lado del servicio: `workout.service.ts:977-981`
  (`assignFromTemplate`) y `resolveProgramScheduleMetadata` en `program-persistence.ts`, que devuelve
  `{ null, null }` cuando el flag es `true` y no hay fecha. Va con test.
- Solo los programas **creados o asignados después del deploy** con `start_date_flexible = true`
  nacen con `start_date NULL` (R13); los 50 activos que hoy tienen el flag conservan su fecha y nunca
  ven «Empezar hoy».
- Ambos tratan `program_not_startable` como **estado**, no como crash: el hero vuelve a leer el
  programa (probablemente ya tiene fecha, o el coach lo desactivó).
- `coach_account_paused` (gate de suscripción del coach) es el **cuarto** código posible junto con
  `unauthenticated`, `program_not_startable` y `start_date_out_of_range`. En web, la action
  `startWorkoutProgramAction` lo mapea al mismo error tipado que ya usa `logSetAction`
  (`workout-log.actions.ts:112-116`: `resolveStudentAccessForClient` → `STUDENT_ACCESS_COPY.pausedWriteError`,
  code `coach_paused`), para que el alumno vea el copy de siempre y no un 500 opaco. En RN,
  `lib/start-program.ts` devuelve el mismo estado que ya maneja la ruta de registro de series.
- El auto-start se llama **después** de que la serie se guardó, nunca antes: si la RPC falla, la
  serie ya quedó registrada.
- `service_role` no tiene `EXECUTE` (se revoca explícitamente el grant por *default privileges*).
  Cualquier ruta server-side que quisiera empezar un programa por el alumno (no existe hoy) tendría
  que hacerlo con la sesión del usuario.
- **La RPC acepta SOLO HOY (R14).** No hay date-picker: la única acción de la UI es «Empezar hoy»
  (web y RN). «Elegir otra fecha» y el estado «Empieza el \<fecha\>» quedaron **fuera de este tren**
  (backlog), y ni SPEC ni los mockups los ofrecen. W2/W3 no deben mandar `p_start_date` con otra
  fecha: sería un `start_date_out_of_range` que el alumno no puede interpretar.
- **La auditoría de quién fijó la fecha la resuelve `started` (R23).** La RPC distingue «la escribí»
  (`started = true`) de «ya estaba» (`started = false`), así que el evento PostHog
  `program_started_by_client` (OUTLINE §9) se emite una sola vez y el auto-start de cada serie no lo
  cuenta doble. El trigger `set_updated_at` (`00000000000001_baseline.sql:2135`) sigue sellando
  `updated_at` sin decir quién: la traza de negocio es el evento, y eso se declara en el PR.

### 2.4 Resultado LIVE 2026-09-03 (W1.4, tx-rollback sobre `jikjeokundmaafuytdcx`)

Archivo escrito: **`supabase/migrations/20260903212038_client_start_workout_program_rpc.sql`**.
Todo corrió con `BEGIN; … ROLLBACK;` en producción: **nada se aplicó**. Control posterior al
rollback: 0 filas sintéticas, `pg_proc` sin la RPC, `workout_programs` sigue en 308 filas y el coach
`josefit` sigue `subscription_status = 'active'` con su `current_period_end` intacto.

**Lo que dijo LIVE (y confirma la §2.2, sin divergencias que obliguen a cambiar la migración):**

| Hecho verificado | Valor en LIVE |
|---|---|
| Policy INSERT del alumno sobre `workout_logs` (R40) | `workout_logs_client`, PERMISSIVE `FOR ALL` a `authenticated`, `qual = with_check = client_id = (SELECT auth.uid())`. Sin `client_memberships` ni `student_readable_client_ids` ⇒ el guard de la RPC es `client_id = auth.uid()`. La otra permisiva, `team_workout_logs_member_all` (`current_user_pool_client_ids()`), es del **pool del coach**, no del alumno: no entra al guard. |
| Capa restrictiva del INSERT | `student_write_gate_ins_workout_logs`: `client_id <> auth.uid() OR private.student_write_allowed(client_id)` ⇒ la RPC la replica con `private.student_write_allowed(v_uid)`. |
| Helpers | `private.student_write_allowed(p_client_id uuid) → boolean`, STABLE SECURITY DEFINER · `public.eva_santiago_day(ts timestamptz) → date`, IMMUTABLE. Ambos con la firma que asume §2.2. |
| `workout_programs.weeks_to_repeat` | `integer NOT NULL DEFAULT 1` (min 1, máx 12 en las 308 filas; **0 nulos**) ⇒ el `GREATEST(1, COALESCE(...))` es cinturón, no parche. |
| Fórmula de `end_date` vigente | La casa la calcula en un solo lugar, `workout.service.ts:425-428` y `:978-981`: `start + weeks*7 - 1`, **sin ramificar por `duration_type`**. La RPC usa la misma. (En LIVE hay 51 filas históricas donde `end_date ≠ start + weeks*7-1` y 2 con `start_date` sin `end_date`: drift previo de filas editadas después, no una segunda fórmula. La RPC no las toca: solo escribe cuando `start_date IS NULL`.) |
| Triggers de `workout_programs` | `set_updated_at`, `trg_workout_programs_default_phases` y `workout_programs_archived_client_guard` — este último `BEFORE INSERT OR UPDATE OF client_id, is_active`, es decir **no** dispara en un `UPDATE` de `start_date`, tal como dice §8.2. |
| RLS vs `SECURITY DEFINER` | La función queda `owner = postgres` (BYPASSRLS) ⇒ efectivamente saltea RLS y los guards internos son el control real. |

**Matriz de aceptación (JWT reales de dos alumnos del coach de prueba `josefit`, `SET LOCAL ROLE
authenticated` + `request.jwt.claims`; programas sintéticos creados y revertidos en la misma tx).
Contexto: `eva_santiago_day(now()) = 2026-09-03`.**

| # | Caso | Resultado real | Veredicto |
|---|---|---|---|
| 1 | Dueño, programa flexible sin fecha, `p_start_date NULL` (`weeks_to_repeat = 4`) | `start_date = 2026-09-03`, `end_date = 2026-09-30`, `started = true` | ✅ fija fecha y `end_date` (= start + 4*7−1) |
| 2 | **Tercero** (otro alumno del mismo coach) sobre el mismo `program_id` | `42501 / program_not_startable` | ✅ mismo error que «no existe»: no filtra datos ni sirve de oráculo |
| 3 | Segunda llamada del dueño sobre el mismo programa | `2026-09-03`, `2026-09-30`, `started = false` | ✅ idempotente, no reescribe ni re-emitiría el evento |
| 4 | `p_start_date = mañana` (`2026-09-04`) sobre un flexible sin fecha | `22007 / start_date_out_of_range` | ✅ ventana = sólo hoy (R14) |
| 4b | *(extra)* `p_start_date = ayer` (`2026-09-02`) | `22007 / … start_date_out_of_range` | ✅ el pasado también está cerrado |
| 5 | Coach pausado: `coaches.subscription_status='expired'`, `current_period_end` y `paid_access_ended_at` a −60 d **dentro de la tx** (control: `private.student_write_allowed(alumno) = false`) | `42501 / coach_account_paused` | ✅ gate R17; el coach volvió a `active` con el ROLLBACK |
| 6a | Programa **no flexible** (`start_date_flexible = false`, sin fecha) | `42501 / … program_not_startable`; la fila queda `start_date = NULL` | ✅ no se mueve |
| 6b | Programa flexible **ya iniciado** (`2026-01-05` / `2026-02-01`) | devuelve `2026-01-05`, `2026-02-01`, `started = false`; la fila queda igual | ✅ no se mueve |
| 6c | *(extra)* Programa flexible **inactivo** (`is_active = false`) | `42501 / … program_not_startable` | ✅ |
| 9 | *(extra)* Rol `authenticated` **sin** `request.jwt.claims` | `28000 / unauthenticated` | ✅ sin sesión no hay dueño |
| 10 | ACL tras `REVOKE`/`GRANT` | `anon = false` · `authenticated = true` · **`service_role = false`** | ✅ única RPC del tren sin EXECUTE para `service_role` |

**El `REVOKE` es load-bearing y está probado en negativo.** Se creó la misma función **sin** la línea
de `REVOKE` y el bloque `DO $verify$` abortó con
`42501 / … ACL inesperada (anon=t, authenticated=t, service_role=t); esperado (false, true, false)`.
Es decir: por *default privileges* del baseline la función nace con `EXECUTE` **para `anon` y para
`service_role`**, no sólo para `service_role` como decía §8.2 — el `REVOKE ALL … FROM PUBLIC, anon,
service_role` cierra las dos y el `DO $verify$` lo detecta en el acto, en la misma sesión del
`CREATE`.

---

## 3. `20260903212700_daily_tonnage_side_metadata.sql` — tonelaje con reps por lado (R3)

Base leída: `supabase/migrations/20260612052000_rpc_client_progress_aggregations.sql:200-245`
(definición vigente de `get_client_daily_tonnage`, con su `REVOKE`/`GRANT` en `:243-244`).

R3: `reps_done` en fuerza por lado es el **mínimo** de los dos lados (protege la doble progresión y el
e1RM del PR); el **tonelaje** sí usa la suma: `weight_kg × (left_reps + right_reps)` cuando hay
metadata.

```sql
-- supabase/migrations/20260903212700_daily_tonnage_side_metadata.sql
--
-- Tonelaje diario con reps POR LADO (R3). En un bloque de fuerza con side_mode per_side/alternating
-- el alumno registra izq/der: workout_logs.reps_done guarda el MINIMO de los dos lados (para no
-- romper la doble progresion de apps/web/src/lib/workout/progression.ts:208-211 ni el e1RM de
-- packages/workout-engine/pr-detect.ts:93) y el desglose vive en workout_logs.metadata
-- {left_reps, right_reps} (columna jsonb de 20260611090003_workout_logs_polymorphic_mirror.sql:22;
-- zod en packages/schemas/workout.ts). El VOLUMEN si es la suma: 20 kg x (10 izq + 10 der) = 400.
--
-- Fallback: sin metadata (todo el historico, incluidos los 296 logs de bloques per_side ya escritos)
-- se usa reps_done tal cual => 0 diff sobre datos previos al deploy.
--
-- ROBUSTEZ DEL CAST (R27). El jsonb lo escribe el cliente; RN insertea el item de la cola crudo, sin
-- zod (apps/mobile/lib/offline-cache.ts:166, apps/mobile/lib/workout-session.ts:940,1067) y la
-- columna NO tiene CHECK (no se agrega: R27). NADA de jsonb_typeof: 'number' tambien es 10.5 (=>
-- '10.5'::int lanza 22P02) y 1e30 (=> 22003), y cualquiera de las dos tumbaria
-- get_client_daily_tonnage COMPLETA para ese alumno. El filtro es una REGEX sobre el texto:
--   reps_eff = CASE WHEN metadata->>'left_reps'  ~ '^[0-9]{1,4}$'
--                    AND metadata->>'right_reps' ~ '^[0-9]{1,4}$'
--              THEN (metadata->>'left_reps')::int + (metadata->>'right_reps')::int
--              ELSE reps_done END
-- Solo se suma cuando LOS DOS lados son enteros de 1 a 4 digitos (0..9999); cualquier otra cosa
-- (ausente, null, negativo, decimal, notacion cientifica, objeto) cae al fallback reps_done. Nunca
-- se castea algo que la regex no acepto, asi que no hay 22P02/22003 posible.
--
-- COSTO (R26). Se ACEPTA leer metadata fuera del indice covering: agregar wl.metadata a la
-- proyeccion puede sacar el Index Only Scan que sostiene esta RPC. El indice es covering PARCIAL —
-- 20260612050000_workout_logs_perf_indexes.sql:9-12, INCLUDE (weight_kg, reps_done, block_id)
-- WHERE weight_kg IS NOT NULL, con el Index Only Scan declarado en su cabecera :5,:7-8 — y metadata NO
-- esta en el INCLUDE: aparecen heap fetch + detoast del jsonb. El protocolo LIVE mide
-- EXPLAIN (ANALYZE, BUFFERS) antes/despues (paso 7.a del §5); SOLO si el tiempo sube MAS DE 2x se
-- hace una migracion extra con metadata en el INCLUDE, y como SEGUIMIENTO: no entra en este tren.
--
-- Misma firma (uuid, integer), mismos flags, mismo guard. Grants con el patron unico del tren (R16):
-- REVOKE ALL ... FROM PUBLIC, anon, service_role antes del GRANT, y has_function_privilege
-- inmediatamente despues del CREATE. El GRANT repone service_role, que el linaje ya tenia.
-- Aditiva, forward-only. Rollback: re-aplicar el cuerpo de 20260612052000:200-245.

CREATE OR REPLACE FUNCTION public.get_client_daily_tonnage(
  p_client_id uuid,
  p_max_days integer DEFAULT 21
)
RETURNS TABLE(day date, tonnage numeric, sessions integer, moving_avg numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN RETURN; END IF;

  RETURN QUERY
  WITH eff AS (
    SELECT
      (wl.logged_at AT TIME ZONE 'America/Santiago')::date AS d,
      wl.weight_kg,
      -- reps_eff (R27): se suma SOLO si LOS DOS lados matchean la regex de entero de 1-4 digitos.
      -- Nada de jsonb_typeof: 'number' tambien es 10.5 (=> 22P02) y 1e30 (=> 22003), y cualquiera
      -- de las dos TUMBA la funcion entera para ese alumno (la lee su coach). Con la regex, lo que
      -- no matchea nunca se castea y cae al fallback reps_done.
      CASE
        WHEN wl.metadata ->> 'left_reps'  ~ '^[0-9]{1,4}$'
         AND wl.metadata ->> 'right_reps' ~ '^[0-9]{1,4}$'
        THEN (wl.metadata ->> 'left_reps')::int + (wl.metadata ->> 'right_reps')::int
        ELSE wl.reps_done
      END AS reps_eff
    FROM public.workout_logs wl
    WHERE wl.client_id = p_client_id
      AND wl.weight_kg > 0
  ),
  daily AS (
    SELECT e.d, round(sum(e.weight_kg * e.reps_eff)) AS t
    FROM eff e
    WHERE e.reps_eff > 0
    GROUP BY 1
  ),
  kept AS (
    SELECT d, t FROM daily ORDER BY d DESC LIMIT p_max_days
  )
  SELECT
    k.d AS day,
    k.t AS tonnage,
    1 AS sessions,
    round(avg(k.t) OVER (ORDER BY k.d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)) AS moving_avg
  FROM kept k
  ORDER BY k.d ASC;
END;
$$;

-- Patron unico de grants del tren (R16): service_role va EXPLICITO en el REVOKE (el baseline lo
-- grantea por default privileges, 00000000000001_baseline.sql:3815) y se repone en el GRANT, que es
-- lo que ya tenia el linaje 20260612052000:243-244.
REVOKE ALL ON FUNCTION public.get_client_daily_tonnage(uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_daily_tonnage(uuid, integer) TO authenticated, service_role;

-- Verificacion INMEDIATA (misma sesion, justo despues del CREATE). Esperado:
-- anon false, authenticated true, service_role true.
-- SELECT r.rolname, has_function_privilege(r.rolname, 'public.get_client_daily_tonnage(uuid, integer)', 'EXECUTE') AS puede
--   FROM (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname);

COMMENT ON FUNCTION public.get_client_daily_tonnage(uuid, integer) IS
  'Tonelaje diario (kg x reps) del alumno, ultimos p_max_days dias con actividad, con media movil de 7. En series por lado usa left_reps + right_reps de workout_logs.metadata cuando LOS DOS matchean ^[0-9]{1,4}$ (R27); en cualquier otro caso cae a reps_done. Guard IDOR: propio, coach o pool. Dia en America/Santiago.';
```

**Diferencia de comportamiento respecto del original** (declararla en el PR): el filtro
`AND wl.reps_done > 0` pasó a `WHERE e.reps_eff > 0`. Para una fila **sin** metadata válida es
idéntico (`reps_eff = reps_done`). Solo cambia para una fila nueva por lado con un lado en 0
(p. ej. `{"left_reps":10,"right_reps":0}`, que sí matchea la regex en los dos lados): antes
`reps_done = min = 0` la excluía del tonelaje pese a haber 10 reps hechas; ahora suma 10. Es la
corrección buscada, no un efecto colateral.

**Espejo en TS:** `packages/workout-engine/session-summary.ts:196-199` (volumen) usa `left+right`
cuando el helper `sideRepsFromMetadata` devuelve lados, y `reps_done` cuando devuelve `null`
(OUTLINE §2 y §13, R27). SQL y TS tienen que dar el mismo número — es el test de paridad de W0. Para
que lo den **también con metadata mal formada** (`1.5`, `-3`, `1e30`, un solo lado), el helper aplica
**exactamente** el mismo criterio que la regex de este SQL: el contrato y los casos del test están en
§7.4.

**`get_client_muscle_volume` entra al tren como cuarta migración (R15):** usa el **mismo `reps_eff`**
que ésta, así que volumen por grupo muscular y tonelaje dejan de contradecirse en la misma pantalla.
El archivo, los `REVOKE`/`GRANT` de su linaje y los dos espejos TS están en §8.4.

#### Resultado LIVE 2026-09-03 (W1.5)

Archivo escrito: `supabase/migrations/20260903212700_daily_tonnage_side_metadata.sql`. Todo lo de
abajo se corrió contra el proyecto real `jikjeokundmaafuytdcx` en **una** transacción
`BEGIN … ROLLBACK` (migración 3 + migración 4 aplicadas dentro, nada quedó escrito).

- **Snapshot previo** (`pg_get_functiondef`) en el tmp del job. Firma real en LIVE:
  `get_client_daily_tonnage(p_client_id uuid, p_max_days integer DEFAULT 21)` → coincide con el
  linaje `20260612052000:200-245`. ACL previa `{postgres=X,authenticated=X,service_role=X}`.
- **Universo de metadata**: 20 861 filas en `workout_logs`; **0** con `metadata ? 'left_reps'` y
  **0** con `metadata ? 'right_reps'` (48 filas con metadata no vacía, de otras claves). O sea, hoy
  el `reps_eff` cae siempre al `ELSE reps_done` ⇒ 0 diff sobre datos previos al deploy, como
  predecía §3.
- **7.a · `EXPLAIN (ANALYZE, BUFFERS)` sobre la consulta extraída**, alumno con más logs
  (`77a1717d-…-e1b9d413b0ae`, 1 410 logs / 1 150 con peso), una corrida de calentamiento antes de
  cada medición:

  | | plan | buffers | Planning | **Execution** |
  |---|---|---|---|---|
  | antes | `Index Only Scan using idx_wl_client_logged_notnull` (Heap Fetches **1 030**) | `shared hit=853` | 0,234 ms | **2,182 ms** |
  | después | `Bitmap Heap Scan` + `Bitmap Index Scan using idx_workout_logs_client_id_logged_at` (Heap Blocks exact=305) | `shared hit=319` | 0,278 ms | **2,123 ms** |

  **Veredicto R26: 0,97× — muy por debajo del umbral de 2×.** Sí se pierde el *Index Only Scan*
  (era lo esperado: `metadata` no está en el `INCLUDE`), pero el plan nuevo es **más barato en
  buffers** (853 → 319) porque el index-only viejo hacía 1 030 *heap fetches* igual. **El índice
  `INCLUDE (metadata)` NO se hace ni se agenda**: no hay regresión que arreglar.
- **Equivalencia (3 clientes, JWT real por `set_config('request.jwt.claims', …)`)**:
  `77a1717d-…`, `73dcaab0-…-b4037a4838`, `a2ef39a8-…-21732e03297f`. Salida vigente vs. salida nueva:
  63 filas contra 63 filas, **difs = 0** (`EXCEPT ALL` en los dos sentidos). Idéntico, como exige §3
  mientras ninguna fila traiga lados.
- **Caso sintético (7.b) en la misma tx**: 5 logs reales del alumno pisados con
  `{"left_reps":"10","right_reps":10}` → `reps_eff = 20` (con `reps_done = 8`: el string `"10"`
  matchea la regex, paridad con `->>`), y los cuatro hostiles `"abc"`, `-1`,
  `{1.5, 1e30}` y `99999` → `reps_eff = reps_done` (12, 16, 13, 9). La RPC **no lanzó `22P02` ni
  `22003`**: devolvió sus 21 filas normalmente. Nada se castea si la regex no lo aceptó.
- **ACL después del `CREATE OR REPLACE`** (bloque `DO … has_function_privilege` de la propia
  migración, que aborta si no cuadra): `anon = false`, `authenticated = true`,
  `service_role = true`; `proacl = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.

### 3.1 `20260903212800_muscle_volume_side_metadata.sql` — cuarta migración (R15)

Base leída: `supabase/migrations/20260701140000_workout_logs_exercise_id_snapshot.sql:88-101`
(definición vigente de `get_client_muscle_volume`, con `SUM(wl.weight_kg * wl.reps_done)` en `:91` y
el filtro `(COALESCE(wl.weight_kg,0) * COALESCE(wl.reps_done,0)) > 0` en `:98`); `REVOKE`/`GRANT` del
linaje en `supabase/migrations/20260612052000_rpc_client_progress_aggregations.sql:76-77`.

`CREATE OR REPLACE` de la **misma firma** `(uuid, integer)`, mismos flags, mismo guard IDOR
(`:83-86`, sin bypass service-role) y mismos `JOIN`s. Los **dos únicos cambios**:

```sql
--        SUM(wl.weight_kg * wl.reps_done)::numeric  ->  SUM(wl.weight_kg * reps_eff)::numeric
--        y el mismo reps_eff en el filtro del WHERE.
-- reps_eff IDENTICO al de la migracion 3 (R27), sin jsonb_typeof y sin CHECK en la columna:
CASE
  WHEN wl.metadata ->> 'left_reps'  ~ '^[0-9]{1,4}$'
   AND wl.metadata ->> 'right_reps' ~ '^[0-9]{1,4}$'
  THEN (wl.metadata ->> 'left_reps')::int + (wl.metadata ->> 'right_reps')::int
  ELSE wl.reps_done
END
```

Se repone el patrón único de grants del tren (R16), que acá coincide con el linaje:

```sql
REVOKE ALL ON FUNCTION public.get_client_muscle_volume(uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_muscle_volume(uuid, integer) TO authenticated, service_role;
-- has_function_privilege inmediatamente despues del CREATE: anon false, authenticated true,
-- service_role true.
```

**Espejos TS que se alinean con el mismo `reps_eff`** (R15): el fallback por series de
`apps/mobile/lib/coach-client-detail.ts:755` y `apps/mobile/lib/enterprise-profile-analytics.ts:131`
(declara «paridad exacta con `get_client_muscle_volume`»). **Los DOS espejos entran en este tren**:
el segundo vive en `apps/mobile/lib/`, no en `apps/enterprise`, así que la congelación de
`apps/enterprise` no lo alcanza. Los dos leen los lados por `sideRepsFromMetadata` (§7.4), nunca a
mano.

Mismo orden operativo que la migración 3: se aplica **después** del deploy web con el zod (§5).
Rollback: re-aplicar el cuerpo de `20260701140000:88-101` con sus `REVOKE`/`GRANT`.

#### Resultado LIVE 2026-09-03 (W1.5b)

Archivo escrito: `supabase/migrations/20260903212800_muscle_volume_side_metadata.sql`, aplicado en la
**misma** transacción `BEGIN … ROLLBACK` que la migración 3.

- **Corrección sobre la SDD**: la definición **vigente en LIVE** no es literalmente
  `20260701140000:88-101` en el `JOIN`: usa
  `LEFT JOIN public.exercises e ON e.id = COALESCE(wb.exercise_id, wl.exercise_id)`, no
  `wb.exercise_id` a secas como el linaje `20260612052000`. La migración conserva el `COALESCE` tal
  cual (LIVE manda). Firma real: `get_client_muscle_volume(p_client_id uuid, p_days_back integer DEFAULT 30)`.
- **`EXPLAIN (ANALYZE, BUFFERS)` sobre la consulta extraída**, mismo alumno (`77a1717d-…`, 370 logs
  en la ventana de 30 d, 295 con peso×reps > 0), con calentamiento previo:

  | | plan | buffers | Planning | **Execution** |
  |---|---|---|---|---|
  | antes | `Bitmap Heap Scan` + `Memoize`/`Index Scan workout_blocks_pkey` + `Seq Scan exercises` | `shared hit=482` | 0,373 ms | **1,784 ms** |
  | después | **idéntico** (mismos nodos, mismos buffers; sólo cambia el `Filter`/`SUM`) | `shared hit=482` | 0,393 ms | **1,688 ms** |

  **Veredicto R26: 0,95×.** Esta RPC ya iba por *Bitmap Heap Scan* (no había *Index Only Scan* que
  perder), así que leer `metadata` no cuesta un solo buffer extra.
- **Equivalencia (los mismos 3 clientes, JWT real)**: 41 filas contra 41 filas, **difs = 0**.
- **Caso hostil repetido contra el volumen** (paso 7.b del §5, misma tx, con los 5 logs pisados):
  la RPC devolvió sus 12 filas sin `22P02` ni `22003`.
- **ACL después del `CREATE OR REPLACE`** (bloque `DO … has_function_privilege` de la migración):
  `anon = false`, `authenticated = true`, `service_role = true`;
  `proacl = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
- **Espejos TS alineados en el mismo tren** (los dos leen los lados con `sideRepsFromMetadata` de
  `@eva/workout-engine`, nunca a mano):
  `apps/mobile/lib/enterprise-profile-analytics.ts` → `buildMuscleVolume`
  (`peso × (izq + der)`), y `apps/mobile/lib/coach-client-detail.ts` → `buildMuscleVolumeBySets`
  (el fallback por series). Para que el helper tenga qué leer, los dos `select` de
  `coach-client-detail.ts` que alimentan esos builders ahora piden también `metadata`.
  **Queda fuera** el `buildMuscleVolume` de `coach-client-detail.ts` (espejo exacto de la RPC pero
  **código muerto**: no lo llama nadie desde que el volumen viene de la RPC; se anota para W4.2).

---

## 4. `supabase/tests/streak_cycle_equivalence.sql` — test de equivalencia

Harness copiado de la forma real de la casa: `supabase/tests/student_gate_equivalence.sql` (función
espejo dentro de la tx, loop sobre el universo completo, criterio de paso doble para que la prueba no
sea vacua, `ROLLBACK` final) y `supabase/tests/nutrition_v2_sets_equivalence.sql`
(`SET LOCAL statement_timeout`, temp tables `ON COMMIT DROP`, salida agregada en una fila). El patrón
específico de la racha además está escrito en la cabecera de la migración vigente
(`20260723110000_streak_assigned_days_semantics.sql:40-43`).

```sql
-- supabase/tests/streak_cycle_equivalence.sql
--
-- Prueba de equivalencia de la rama `cycle` de la racha (tren "Ciclo real", 2026-09).
-- Compara, para TODO cliente con logs en la ventana de 730 dias, el veredicto de la funcion
-- VIGENTE public.get_client_current_streak contra el cuerpo NUEVO (espejo public._streak_next).
--
-- CRITERIO DE PASO (cuatro condiciones; si falla cualquiera, DETENERSE y no aplicar la migracion):
--   1. difs_weekly       = 0  -> la rama no contamino el camino semanal (criterio DURO, OUTLINE §8)
--   2. difs_sin_programa = 0  -> la regla 7 sigue igual para quien no tiene programa activo
--   3. mixtos            = 0  -> nadie tiene weekly Y cycle activos a la vez; si aparece alguno hay
--                                que revisarlo A MANO (su racha cambia a proposito, ver §1.1)
--   4. cycle_con_cambio  > 0  -> la prueba no es vacua: si la rama cycle no mueve NINGUN numero, no
--                                se esta arreglando el bug que motiva el tren
--
-- Solo lectura salvo la funcion espejo (identica a la de la migracion) y termina en ROLLBACK.
-- Se corre como owner (sin JWT): la funcion tiene bypass IDOR cuando auth.uid() IS NULL, que es
-- justamente lo que permite compararla sobre todos los clientes. La verificacion de RLS con JWT
-- REALES es un paso aparte del protocolo (§5, pasos 4 y 5).

BEGIN;
SET LOCAL statement_timeout = '600s';

-- ---------------------------------------------------------------------------
-- Paso 1 — funcion espejo con el cuerpo NUEVO.
-- PEGAR AQUI, VERBATIM, el bloque CREATE OR REPLACE FUNCTION de
-- supabase/migrations/20260903212441_streak_cycle_branch_and_null_start.sql cambiando UNA sola cosa:
-- el nombre public.get_client_current_streak -> public._streak_next. Nada mas. Si se edita
-- cualquier otra linea, la prueba deja de probar lo que se va a aplicar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._streak_next(p_client_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- <<< CUERPO NUEVO VERBATIM: desde "DECLARE" hasta "END;" de la migracion 1 >>>
$function$;

REVOKE ALL ON FUNCTION public._streak_next(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Paso 2 — universo: todo cliente con al menos un log en la ventana de la funcion (730 d).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _ids(client_id uuid) ON COMMIT DROP;
INSERT INTO _ids
  SELECT DISTINCT wl.client_id
  FROM public.workout_logs wl
  WHERE wl.logged_at >= now() - interval '730 days';

-- Estructura del cliente segun sus programas ACTIVOS: weekly | cycle | mixto | sin_programa
CREATE TEMP TABLE _cls(client_id uuid, estructura text) ON COMMIT DROP;
INSERT INTO _cls
  SELECT i.client_id,
         CASE
           WHEN count(g.id) = 0 THEN 'sin_programa'
           WHEN bool_and(COALESCE(g.program_structure_type, 'weekly') = 'cycle')  THEN 'cycle'
           WHEN bool_and(COALESCE(g.program_structure_type, 'weekly') <> 'cycle') THEN 'weekly'
           ELSE 'mixto'
         END
  FROM _ids i
  LEFT JOIN public.workout_programs g
    ON g.client_id = i.client_id AND g.is_active = true
  GROUP BY i.client_id;

CREATE TEMP TABLE _d(client_id uuid, estructura text, viejo int, nuevo int) ON COMMIT DROP;
INSERT INTO _d
  SELECT c.client_id,
         c.estructura,
         public.get_client_current_streak(c.client_id),
         public._streak_next(c.client_id)
  FROM _cls c;

-- ---------------------------------------------------------------------------
-- Paso 3 — resultado agregado: la fila que decide si se aplica o no.
-- ---------------------------------------------------------------------------
SELECT
  count(*)                                                                        AS clientes,
  count(*) FILTER (WHERE estructura = 'weekly'       AND viejo IS DISTINCT FROM nuevo) AS difs_weekly,
  count(*) FILTER (WHERE estructura = 'sin_programa' AND viejo IS DISTINCT FROM nuevo) AS difs_sin_programa,
  count(*) FILTER (WHERE estructura = 'mixto')                                    AS mixtos,
  count(*) FILTER (WHERE estructura = 'cycle')                                    AS clientes_cycle,
  count(*) FILTER (WHERE estructura = 'cycle' AND viejo IS DISTINCT FROM nuevo)   AS cycle_con_cambio
FROM _d;

-- ---------------------------------------------------------------------------
-- Paso 4 — detalle: toda diferencia que NO sea de un cliente 'cycle' se mira una por una.
-- ---------------------------------------------------------------------------
SELECT estructura, client_id, viejo, nuevo
  FROM _d
 WHERE viejo IS DISTINCT FROM nuevo
   AND estructura <> 'cycle'
 ORDER BY estructura, client_id;

-- ---------------------------------------------------------------------------
-- Paso 5 — muestra de la rama cycle: el numero que van a ver los alumnos (Movens incluido).
-- Sin PII: solo ids y enteros. Se guarda como snapshot para comparar despues de aplicar.
-- ---------------------------------------------------------------------------
SELECT d.client_id, d.viejo, d.nuevo,
       g.cycle_length,
       g.start_date,
       COALESCE(g.ab_mode, false) AS ab_mode
  FROM _d d
  JOIN public.workout_programs g
    ON g.client_id = d.client_id AND g.is_active = true
 WHERE d.estructura = 'cycle'
 ORDER BY d.nuevo DESC, d.client_id;

-- ---------------------------------------------------------------------------
-- Paso 6 — costo. La funcion corre UNA VEZ POR ALUMNO dentro de get_clients_streaks_by_ids
-- (20260612054000), asi que un +30 % se nota en el dashboard de un coach con 50 alumnos.
-- Correr la comparacion sobre el MISMO cliente (el mas pesado en logs).
--
-- OJO: `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_client_current_streak(...)` NO SIRVE para esto.
-- La funcion es LANGUAGE plpgsql (20260723110000:46-51): EXPLAIN planifica solo la consulta externa
-- y devuelve un nodo Result (+ "Function Scan"); las sentencias anidadas —el WITH progs ... del
-- FOR, que es lo unico que cambia— no aparecen. Con ese plan no se puede afirmar "no se pierde la
-- poda de v_from" ni "el plan no es peor" (gate de PLAN.md y TASKS.md).
-- Dos formas validas; usar A y, si hace falta el detalle real en produccion, B.
-- ---------------------------------------------------------------------------

-- (A) Consulta suelta: sacar el cuerpo del FOR a una query con los escalares como LITERALES.
--     Primero se obtienen los escalares del cliente elegido (misma aritmetica que la funcion):
-- WITH t AS (SELECT public.eva_santiago_day(now()) AS v_today),
--      f AS (SELECT min(public.eva_santiago_day(wl.logged_at)) AS first_log
--              FROM public.workout_logs wl, t
--             WHERE wl.client_id = '<client_id>'::uuid
--               AND wl.logged_at >= (((SELECT v_today FROM t) - 730)::timestamp AT TIME ZONE 'America/Santiago'))
-- SELECT t.v_today,
--        GREATEST(t.v_today - 730, f.first_log - (EXTRACT(ISODOW FROM f.first_log)::int - 1)) AS v_from,
--        (SELECT min(g.start_date) FROM public.workout_programs g
--          WHERE g.client_id = '<client_id>'::uuid AND g.is_active AND g.start_date IS NOT NULL) AS v_regime_start,
--        (SELECT min(g.start_date) FROM public.workout_programs g
--          WHERE g.client_id = '<client_id>'::uuid AND g.is_active AND g.start_date IS NOT NULL
--            AND COALESCE(g.program_structure_type,'weekly') = 'cycle') AS v_cycle_start
--   FROM t, f;
--
--     Con esos cuatro valores pegados como literales (y v_has_regime = (v_regime_start IS NOT NULL)),
--     correr el MISMO EXPLAIN sobre las dos versiones del bloque WITH:
-- EXPLAIN (ANALYZE, BUFFERS) WITH progs AS (...) /* cuerpo VIEJO, 20260723110000:93-208 */
--   SELECT day, qualifies, breaks FROM day_status ORDER BY day DESC;
-- EXPLAIN (ANALYZE, BUFFERS) WITH progs AS (...) /* cuerpo NUEVO, §1.2 */
--   SELECT day, qualifies, breaks FROM day_status ORDER BY day DESC;
--     Criterio: el scan de workout_logs sigue acotado por v_from (no aparece un Seq Scan de la
--     tabla entera) y el total no sube mas de ~30 %.

-- (B) auto_explain con sentencias anidadas, en la MISMA sesion, para medir la funcion tal cual:
-- LOAD 'auto_explain';
-- SET auto_explain.log_min_duration = 0;
-- SET auto_explain.log_nested_statements = on;
-- SET auto_explain.log_analyze = on;
-- SELECT public.get_client_current_streak('<client_id>'::uuid);
-- SELECT public._streak_next('<client_id>'::uuid);
--     Los planes anidados quedan en los logs de Postgres (Supabase → Logs → Postgres).

ROLLBACK;
```

Cómo elegir el cliente de los `EXPLAIN` (consulta auxiliar, solo lectura):

```sql
SELECT wl.client_id, count(*) AS logs
  FROM public.workout_logs wl
 WHERE wl.logged_at >= now() - interval '730 days'
 GROUP BY 1 ORDER BY 2 DESC LIMIT 3;
```

---

## 5. Protocolo LIVE, paso a paso

Marco: `AGENTS.md` (protocolo aditivo-en-LIVE cuando Branching no conecta) + memoria
`feedback_db_y_supabase` (EXPLAIN + tx-rollback, aditivo-en-LIVE, no borrar V1). **Ninguna de las
cuatro migraciones toca datos**: no hay backfill, no hay DDL de tabla, no hay `db push` ciego.
Orden de salida del tren (R35): **deploy web → migraciones → OTA**. Por eso el **deploy web (paso 6)
se ejecuta ANTES de aplicar cualquiera de las cuatro migraciones**: los pasos 3, 5, 7 y 7.c van todos
con la web ya en producción, y entre ellos vale el orden interno del §0 (primero la 1 y la 2, después
la 3 y la 4). La numeración de los pasos se conserva por las referencias cruzadas de este documento y
de `TESTING-QA`.

**Paso 0 · Snapshot previo (solo lectura; guardar la salida en el PR).**
```sql
-- racha vigente de los clientes con programa cycle activo
SELECT g.client_id, g.cycle_length, g.start_date,
       public.get_client_current_streak(g.client_id) AS racha_hoy
  FROM public.workout_programs g
 WHERE g.is_active = true
   AND COALESCE(g.program_structure_type,'weekly') = 'cycle'
   AND g.client_id IS NOT NULL
 ORDER BY 1;

-- programas activos por estructura y flag (control de que nada mas se movio)
SELECT COALESCE(program_structure_type,'weekly')   AS estructura,
       COALESCE(start_date_flexible,false)         AS flexible,
       count(*) FILTER (WHERE start_date IS NULL)  AS sin_fecha,
       count(*)                                    AS total
  FROM public.workout_programs
 WHERE is_active = true AND client_id IS NOT NULL
 GROUP BY 1,2 ORDER BY 1,2;

-- logs HUERFANOS en clientes cycle: cuanto pierde la rama nueva por el enlace log->bloque->plan.
-- R29 ya fijo la regla (huerfano = NEUTRO); esto se mide para el aviso al coach, no para cambiarla.
-- Por que se mide: la CTE `cycledays` (§1.2, CAMBIO 5) exige ese enlace, y en un cliente cycle con
-- start_date fijado el regimen esta prendido, asi que la regla 7 NO lo rescata y `assigned` queda
-- vacio por el CAMBIO 3 => un dia entrenado con block_id NULL NO SUMA. El caso existe: el FK es
-- ON DELETE SET NULL (20260630190000_workout_logs_block_id_set_null.sql:27-29) y el re-guardado del
-- programa reconcilia en sitio justamente para no arrasar logs
-- (apps/web/src/services/workout/workout.service.ts:526-529).
WITH cyc AS (
  SELECT DISTINCT g.client_id
    FROM public.workout_programs g
   WHERE g.is_active = true AND g.client_id IS NOT NULL
     AND COALESCE(g.program_structure_type,'weekly') = 'cycle'
),
l AS (
  SELECT wl.client_id,
         public.eva_santiago_day(wl.logged_at) AS day,
         wb.plan_id,
         -- ¿este log entraria en la CTE cycledays de §1.2?
         (wb.plan_id IS NOT NULL AND EXISTS (
            SELECT 1
              FROM public.workout_plans p
              JOIN public.workout_programs g2 ON g2.id = p.program_id
             WHERE p.id = wb.plan_id
               AND g2.is_active = true
               AND COALESCE(g2.program_structure_type,'weekly') = 'cycle'
               AND g2.start_date IS NOT NULL
               AND g2.start_date <= public.eva_santiago_day(wl.logged_at)
         )) AS suma_en_cycle
    FROM public.workout_logs wl
    JOIN cyc ON cyc.client_id = wl.client_id
    LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
   WHERE wl.logged_at >= now() - interval '730 days'
),
d AS (
  SELECT client_id, day,
         count(*) FILTER (WHERE plan_id IS NULL) AS huerfanos,
         bool_or(suma_en_cycle)                  AS suma
    FROM l
   GROUP BY client_id, day
)
SELECT client_id,
       sum(huerfanos)                                      AS logs_huerfanos,
       count(*) FILTER (WHERE huerfanos > 0)               AS dias_con_huerfanos,
       count(*) FILTER (WHERE NOT suma)                    AS dias_que_no_suman
  FROM d
 GROUP BY client_id
 HAVING count(*) FILTER (WHERE NOT suma) > 0 OR sum(huerfanos) > 0
 ORDER BY 4 DESC, 2 DESC;
```

**Cómo se lee el paso 0 (ya resuelto por R29, no es una decisión de la wave):** en `cycle` suma el
día con **≥ 1 log DEL PROGRAMA** (enlace `block → plan`); un log con `block_id NULL` es **neutro**
—no suma ni corta—, coherente con las reglas 4-5 de weekly. Así que `dias_que_no_suman > 0` **no
bloquea** la migración 1: es una medición para el aviso al coach (§1.3), que tiene que decir que el
número puede quedar por debajo de la simulación de STATS. La regla no se cambia por lo que salga acá.

**Paso 1 · Test de equivalencia en tx-rollback.** Correr entero
`supabase/tests/streak_cycle_equivalence.sql` (§4). No continuar si `difs_weekly > 0`,
`difs_sin_programa > 0`, `mixtos > 0` o `cycle_con_cambio = 0`. Guardar las tres salidas.

**Paso 2 · `EXPLAIN ANALYZE` comparado** (paso 6 del test) sobre los 2-3 clientes con más logs.
**Sobre la consulta extraída, no sobre `SELECT get_client_current_streak(...)`**: la función es
`LANGUAGE plpgsql` (`20260723110000:46-51`) y un `EXPLAIN` de la llamada devuelve un nodo `Result`
sin las sentencias anidadas, con el que no se puede afirmar nada (variante A del paso 6; variante B
= `auto_explain` con `log_nested_statements`). Criterio: el plan nuevo **no** pierde la poda de
`v_from` (`20260723110000:81`) —no aparece un `Seq Scan` de `workout_logs` completa— y el tiempo no
sube más de ~30 %. Si sube más, el sospechoso es `cycle_empty_weeks` (un `GROUP BY` sobre `days`,
≤ 731 filas en el peor caso).

**Paso 3 · Aplicar la migración 1** (`apply_migration`, forward-only). Después, `get_advisors` de
seguridad y de performance: **cero críticos nuevos**. `CREATE OR REPLACE` conserva la ACL, así que
`anon` sigue sin `EXECUTE` (`20260608120150:19`); verificarlo igual:
```sql
SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS puede
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
 WHERE n.nspname = 'public'
   AND p.proname IN ('get_client_current_streak','get_client_daily_tonnage','client_start_workout_program','get_client_muscle_volume')
 ORDER BY 1,2;
```
Esperado: `get_client_current_streak` → anon **false**, authenticated true, service_role true ·
`get_client_daily_tonnage` → anon **false**, authenticated true, service_role true ·
`get_client_muscle_volume` → anon **false**, authenticated true, service_role true ·
`client_start_workout_program` → anon **false**, authenticated true, service_role **false**.

Esta consulta se corre **después de cada migración**, no una sola vez al final: en este paso 3 la RPC
nueva todavía **no existe** (se crea en el paso 5) y su fila simplemente no aparece.
La verificación de `client_start_workout_program` va **inmediatamente después de su `CREATE`**, en la
misma sesión del paso 5 — es la única forma de detectar en el acto que el `REVOKE` no alcanzó. Y el
`REVOKE` **tiene que incluir `service_role`**: el baseline hace
`ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO service_role` (`baseline:3815`), así que toda
función nueva nace con ese `EXECUTE` y un `REVOKE … FROM PUBLIC, anon` lo deja intacto (§8.2).

**Paso 4 · RLS/IDOR con JWT reales, nunca con `service_role`** (`AGENTS.md`). En una tx que termina
en `ROLLBACK`, con `set_config('request.jwt.claims', …)` como en
`supabase/tests/student_gate_equivalence.sql:79-80`:
```sql
BEGIN;
SET LOCAL statement_timeout = '120s';
-- (i) el propio alumno: devuelve su racha
SELECT set_config('request.jwt.claims', json_build_object('sub','<alumno_uuid>','role','authenticated')::text, true);
SELECT public.get_client_current_streak('<alumno_uuid>'::uuid);
-- (ii) su coach: devuelve la racha del alumno
SELECT set_config('request.jwt.claims', json_build_object('sub','<coach_uuid>','role','authenticated')::text, true);
SELECT public.get_client_current_streak('<alumno_uuid>'::uuid);
-- (iii) un coach AJENO: tiene que dar 0
SELECT set_config('request.jwt.claims', json_build_object('sub','<coach_ajeno_uuid>','role','authenticated')::text, true);
SELECT public.get_client_current_streak('<alumno_uuid>'::uuid);
-- (iv) coach del pool (team): devuelve la racha
SELECT set_config('request.jwt.claims', json_build_object('sub','<coach_pool_uuid>','role','authenticated')::text, true);
SELECT public.get_client_current_streak('<alumno_uuid>'::uuid);
ROLLBACK;
```

**Paso 5 · Aplicar la migración 2** y probarla, otra vez con JWT reales y `ROLLBACK`. Dos reglas de
forma que hacen la diferencia entre una prueba real y una que no corre:

- **La matriz de `EXECUTE` del paso 3 se corre acá, en la misma sesión, justo después del `CREATE`**
  (la fila de `client_start_workout_program`: anon false, authenticated true, service_role **false**).
- **Cada caso de error va en su propio `SAVEPOINT`.** Un `RAISE EXCEPTION` aborta la transacción
  entera: sin savepoints, los casos (c) en adelante fallan todos con *current transaction is aborted*
  y la prueba parecería «pasar» sin haber probado nada.

```sql
BEGIN;
-- fixture tx-local: hoy NO existe en LIVE ningun programa activo con start_date NULL (STATS).
-- Se fabrica aca, como owner, ANTES del primer set_config; el ROLLBACK lo revierte.
-- Los DOS programas se nulifican: <program_uuid> lo consume el caso (a) y queda CON fecha, asi que
-- los casos de ventana necesitan uno propio todavia en NULL (si no, salen por idempotencia ANTES de
-- validar la ventana y no prueban nada). <program_uuid_2> = otro programa ACTIVO y FLEXIBLE del
-- MISMO alumno.
UPDATE public.workout_programs SET start_date = NULL, end_date = NULL
 WHERE id IN ('<program_uuid>', '<program_uuid_2>')
   AND client_id = '<alumno_uuid>'
   AND COALESCE(start_date_flexible,false) = true;

-- (a) alumno dueno de un programa flexible SIN fecha: fija hoy y devuelve started = TRUE
SELECT set_config('request.jwt.claims', json_build_object('sub','<alumno_uuid>','role','authenticated')::text, true);
SELECT * FROM public.client_start_workout_program('<program_uuid>'::uuid);   -- started = true
-- (a') los valores devueltos son los PERSISTIDOS (RETURNING, no la variable calculada) y end_date
--      quedo derivado en el MISMO UPDATE (R21): end_date = start_date + weeks_to_repeat*7 - 1
SELECT start_date, end_date, weeks_to_repeat,
       end_date = start_date + (GREATEST(1, COALESCE(weeks_to_repeat,1)) * 7 - 1) AS end_date_ok
  FROM public.workout_programs WHERE id = '<program_uuid>'::uuid;
-- (b) idempotencia (R28): la segunda llamada devuelve la MISMA fecha, el MISMO end_date y
--     started = FALSE, sin escribir. Es lo que impide que el auto-start de cada serie re-emita
--     program_started_by_client.
SELECT * FROM public.client_start_workout_program('<program_uuid>'::uuid);   -- started = false

-- (c) fecha FUTURA: start_date_out_of_range (la ventana es SOLO HOY, R14)
SAVEPOINT s_c;
SELECT * FROM public.client_start_workout_program('<program_uuid_2>'::uuid, (current_date + 1)::date);
ROLLBACK TO SAVEPOINT s_c;
-- (c2) fecha PASADA: AYER tambien es start_date_out_of_range
SAVEPOINT s_c2;
SELECT * FROM public.client_start_workout_program('<program_uuid_2>'::uuid, (current_date - 1)::date);
ROLLBACK TO SAVEPOINT s_c2;
-- (c3) unicos valores VALIDOS: NULL (default) y HOY explicito; los dos escriben con started = true
SAVEPOINT s_c3;
SELECT * FROM public.client_start_workout_program('<program_uuid_2>'::uuid, public.eva_santiago_day(now()));
ROLLBACK TO SAVEPOINT s_c3;

-- (d) programa AJENO: error program_not_startable (no confirma que exista)
SAVEPOINT s_d;
SELECT * FROM public.client_start_workout_program('<program_de_otro_alumno>'::uuid);
ROLLBACK TO SAVEPOINT s_d;
-- (e) el COACH del alumno: tambien program_not_startable (esta RPC es del alumno)
SAVEPOINT s_e;
SELECT set_config('request.jwt.claims', json_build_object('sub','<coach_uuid>','role','authenticated')::text, true);
SELECT * FROM public.client_start_workout_program('<program_uuid>'::uuid);
ROLLBACK TO SAVEPOINT s_e;

-- (f) GATE DE SUSCRIPCION: alumno de un coach PAUSADO/post-gracia => coach_account_paused (42501).
--     Fixture tx-local: se vence el acceso del coach del alumno de prueba (el ROLLBACK lo revierte).
--     Espejo del caso que ya cubren las RPCs V2 de nutricion (20260718120000:290).
SAVEPOINT s_f;
SELECT set_config('request.jwt.claims', '', true);   -- volver a owner (auth.uid() = NULL) para el fixture
UPDATE public.coaches
   SET subscription_status = 'canceled',
       current_period_end  = now() - interval '60 days',
       paid_access_ended_at = now() - interval '60 days'
 WHERE id = (SELECT coach_id FROM public.clients WHERE id = '<alumno_uuid>'::uuid);
SELECT set_config('request.jwt.claims', json_build_object('sub','<alumno_uuid>','role','authenticated')::text, true);
SELECT * FROM public.client_start_workout_program('<program_uuid_2>'::uuid);  -- espera coach_account_paused
ROLLBACK TO SAVEPOINT s_f;

ROLLBACK;
```

**Paso 6 · Deploy web con el zod ampliado (§7) — se ejecuta ANTES de los pasos 3, 5, 7 y 7.c.**
Orden obligatorio del tren (R35): **deploy web → migraciones → OTA**; ninguna de las cuatro
migraciones se adelanta al deploy. La OTA va al final (paso 7.c): si sale antes, RN escribe `left_reps`/`right_reps`
y la web los **estripa** al re-guardar la serie (Zod v4 borra las claves no declaradas,
`packages/schemas/workout.ts:295-297`).

**Paso 7 · Aplicar la migración 3** (tonelaje) recién con el zod ya en producción. `get_advisors`
otra vez. Verificar sobre un alumno con series por lado nuevas que el tonelaje del día sube y que los
días históricos **no cambian**. ⚠️ A diferencia de la racha, esta RPC **no tiene bypass de
service-role** (`auth.uid() IS NULL ⇒ RETURN`, §8.3): sin `set_config` de un JWT válido devuelve
**cero filas** y la prueba no prueba nada.
```sql
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','<alumno_uuid>','role','authenticated')::text, true);
SELECT * FROM public.get_client_daily_tonnage('<alumno_uuid>'::uuid, 21);
ROLLBACK;
```

**7.a · `EXPLAIN` antes/después — el único paso de esta capa que puede perder un índice.** Agregar
`wl.metadata` a la proyección de la CTE `eff` puede sacar el *Index Only Scan* que sostiene la RPC:
el índice es **covering parcial** (`20260612050000_workout_logs_perf_indexes.sql:9-12`,
`INCLUDE (weight_kg, reps_done, block_id) WHERE weight_kg IS NOT NULL`, con el *Index Only Scan*
declarado en su cabecera `:5,:7-8`) y `metadata` **no** está en el `INCLUDE` ⇒ aparecen *heap fetch*
y *detoast* del jsonb. **R26 acepta esa lectura fuera del índice covering**: se mide sobre **el alumno
con más logs** (misma consulta auxiliar del §4) y el umbral acá es **2×**, no ±30 %. Como
`get_client_daily_tonnage` también es `plpgsql`, el
`EXPLAIN` va sobre la consulta **extraída**, no sobre `SELECT get_client_daily_tonnage(...)`:
```sql
-- viejo: WITH eff AS (SELECT (wl.logged_at AT TIME ZONE 'America/Santiago')::date AS d,
--                            wl.weight_kg, wl.reps_done AS reps_eff …)
-- nuevo: la CTE eff de §3 tal cual, con '<alumno_uuid>' como literal.
EXPLAIN (ANALYZE, BUFFERS) WITH eff AS ( /* … */ ) SELECT * FROM eff;
```
Si se pierde el index-only y el tiempo sube **más de 2×**: **no se revierte la migración**, se
agenda como **seguimiento fuera de este tren** (R26) un índice de reemplazo
`CREATE INDEX CONCURRENTLY` con `metadata` en el `INCLUDE` (fuera de transacción; el `DROP` del viejo
va en una migración **posterior**, nunca en la misma). Si sube menos de 2×, no se hace nada.

**7.b · Fila malformada (el cast no puede tumbar la función).** En tx con `ROLLBACK`, fabricar una
fila con lados que un `::int` directo rechazaría y comprobar que la RPC **devuelve filas** (cayendo
al fallback `reps_done`) en vez de abortar:
```sql
BEGIN;
-- fixture como owner (RLS bypass), ANTES del set_config
UPDATE public.workout_logs
   SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"left_reps": 1.5, "right_reps": 1e30}'::jsonb
 WHERE id = '<log_id_con_peso_del_alumno>'::uuid;
SELECT set_config('request.jwt.claims', json_build_object('sub','<alumno_uuid>','role','authenticated')::text, true);
SELECT * FROM public.get_client_daily_tonnage('<alumno_uuid>'::uuid, 21);  -- NO debe lanzar 22P02/22003
ROLLBACK;
```
Esperado (R27): la RPC devuelve sus filas y el día de ese log suma `weight_kg × reps_done` — ni
`1.5` ni `1e30` matchean `^[0-9]{1,4}$`, así que **no se castea nada** y manda el fallback. Si en
cambio sale `22P02` o `22003`, el `reps_eff` del §3 se escribió con `jsonb_typeof` + `::int` en vez
de con la regex. Se repite el mismo caso contra `get_client_muscle_volume` después del paso 7.c: las
dos RPC comparten `reps_eff`.

**Paso 7.c · Aplicar la migración 4** (`get_client_muscle_volume`, §3.1), `get_advisors`, la matriz
de `EXECUTE` en la misma sesión, y verificar sobre el mismo alumno que **volumen por grupo muscular y
tonelaje ya no se contradicen** (misma `reps_eff`). **Recién después, la OTA (runtime 1.1.2)**: es el
último eslabón del orden `deploy web → migraciones → OTA` (R35). Flota mixta: los clientes 1.1.2 sin
la OTA escriben logs sin `metadata` —válido— y ven `reps_done` en bloques por lado hasta actualizar;
se documenta, no bloquea.

**Paso 8 · Verificación posterior.** Re-correr el paso 0 y comparar contra el snapshot: los clientes
`weekly` con el mismo número, los `cycle` con el número que predijo el paso 5 del test. Avisarle al
coach (OUTLINE §10: la racha «salta» de 0 a 6-8 al desplegar y es esperado).

---

## 6. Rollback

| Pieza | Cómo se revierte | Efecto |
|---|---|---|
| Migración 1 | Re-aplicar **verbatim** el bloque `CREATE OR REPLACE FUNCTION public.get_client_current_streak(...)` de `supabase/migrations/20260723110000_streak_assigned_days_semantics.sql:44-219` **y** su `COMMENT` (`:221-222`). Ese archivo no se borra ni se edita (regla: nunca editar migraciones aplicadas). | La racha vuelve a la semántica de días asignados por ISODOW; los alumnos de ciclo vuelven a 0. Sin pérdida de datos: la racha no se persiste. |
| Migración 2 | `DROP FUNCTION IF EXISTS public.client_start_workout_program(uuid, date);` | «Empezar hoy» deja de funcionar (el botón muestra error). Los `start_date`/`end_date` ya fijados **quedan**: son datos legítimos del alumno y no se revierten. |
| Migración 3 | Re-aplicar el cuerpo de `supabase/migrations/20260612052000_rpc_client_progress_aggregations.sql:200-245`, incluidos `REVOKE`/`GRANT` (`:243-244`). | El tonelaje vuelve a `weight_kg * reps_done`: las series por lado cuentan el mínimo en vez de la suma. Solo afecta la lectura del gráfico. |
| Migración 4 | Re-aplicar el cuerpo de `supabase/migrations/20260701140000_workout_logs_exercise_id_snapshot.sql:88-101`, con los `REVOKE`/`GRANT` del linaje (`20260612052000:76-77`). | El volumen por grupo muscular vuelve a `weight_kg * reps_done` y queda otra vez a la mitad del tonelaje en bloques por lado. Solo afecta la lectura de la ficha. |

Las cuatro reversiones son idempotentes y no tocan filas. La forma canónica de escribirlas es un archivo
nuevo `supabase/migrations/<ts>_revert_<nombre>.sql` con el cuerpo viejo pegado (forward-only, como
manda `AGENTS.md`), no un `git revert` del archivo ya aplicado.

---

## 7. Diff del contrato de `metadata` (zod + tipo TS)

### 7.1 `packages/schemas/workout.ts` — `WorkoutLogSetSchema.metadata` (hoy `:301-309`)

```diff
     metadata: z
         .object({
             left_sec: z.coerce.number().int().min(0).max(86400).nullable().optional(),
             right_sec: z.coerce.number().int().min(0).max(86400).nullable().optional(),
+            // ── Reps POR LADO en FUERZA (tren «ciclo real y por lado», R3) ──
+            // Espejo de {left_sec,right_sec} para el eje de reps. `reps_done` de la fila guarda el
+            // MÍNIMO de los dos lados (R3: protege la doble progresión de progression.ts:208-211 y
+            // el e1RM de pr-detect.ts:93); el desglose vive acá y es lo que leen el tonelaje
+            // (get_client_daily_tonnage) y el resumen «10 / 10». Nullable a propósito: mandar
+            // {left_reps: null, right_reps: null} es cómo se VACÍA un lado sin borrar el resto del
+            // jsonb (§7.3). Rango 0..9999 = exactamente lo que acepta la regex `^[0-9]{1,4}$` del
+            // SQL (R27); no hay CHECK en DB y no se agrega.
+            left_reps: z.coerce.number().int().min(0).max(9999).nullable().optional(),
+            right_reps: z.coerce.number().int().min(0).max(9999).nullable().optional(),
             skipped: z.boolean().nullable().optional(),
             skip_reason: z.string().trim().max(40).nullable().optional(),
         })
         .nullable()
         .optional(),
```

**No se declaran `left_weight` / `right_weight`.** D2 fijó «un peso», y el crítico (C6) advierte que
declararlas «por las dudas» reproduce exactamente el control muerto que este tren viene a arreglar.
Queda en el backlog (OUTLINE §11).

### 7.2 `packages/workout-engine/session-logs.reconcile.ts` — `WorkoutLogSideMetadata` (hoy `:13-16`)

```diff
 export type WorkoutLogSideMetadata = {
     left_sec?: number | null
     right_sec?: number | null
+    /**
+     * Reps por lado de una serie de FUERZA unilateral (`side_mode` `per_side` | `alternating`).
+     * `workout_logs.reps_done` lleva el MÍNIMO de ambos (R3); estos dos son el desglose que ve el
+     * alumno («10 / 10») y la base del tonelaje (`weight_kg × (left + right)`).
+     */
+    left_reps?: number | null
+    right_reps?: number | null
 }
```

`WorkoutLogMetadata` (`:30-33`) **no se toca**: es `WorkoutLogSideMetadata & WorkoutSkipMetadata &
{ hr }`, así que hereda las dos claves nuevas y todo consumidor histórico sigue compilando. De los
tres transportes del pipeline, **dos** viajan tipados con él y solo cambian de contenido; el tercero
(RN) declara su propio shape y **sí** necesita cambio de tipo:

- Cola offline web: `apps/web/src/lib/workout-offline-queue.ts:152-154`
  (`if (item.metadata != null) fd.set('metadata', JSON.stringify(item.metadata))`). El `if` sirve tal
  cual; el comentario de `:153` («Sólo presente en la fila per_side de movilidad») queda
  **desactualizado** y hay que corregirlo. Lo que falta es que el enqueue de fuerza
  (`LogSetForm.tsx:780-798`) **rellene** `metadata`: hoy no lo hace (hueco H2 del crítico).
- Cola offline RN: `apps/mobile/lib/workout-session.ts:1058-1067` viaja tipado, pero
  `apps/mobile/lib/offline-cache.ts:43-44` declara el campo con un **literal propio**
  (`metadata?: { left_sec?: number | null; right_sec?: number | null } | null`), no con
  `WorkoutLogSideMetadata`. Hay que ampliarlo —lo más limpio: importar el tipo del motor en vez de
  repetir el shape— o `left_reps`/`right_reps` no compilan en el enqueue y jamás llegan al
  `insert` de `:166`, que sube el item **crudo** contra PostgREST.
- Action web: `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.ts:166`
  — `metadata: parsed.data.metadata ?? null` **borra** el jsonb al re-guardar una serie sin lados.

### 7.3 Semántica de escritura de `metadata` (cierra C8 del crítico)

Se elige **omitir la clave**, no hacer merge server-side:

```diff
-        metadata: parsed.data.metadata ?? null,
+        // El jsonb solo se escribe cuando el payload lo trae. Con `?? null`, re-guardar una serie
+        // sin lados (p. ej. corregir el peso desde una superficie que no captura izq/der) borraba
+        // {left_sec,right_sec} / {left_reps,right_reps} ya guardados. Vaciar un lado se hace
+        // MANDANDO {left_reps: null, right_reps: null}, no omitiendo la clave.
+        ...(parsed.data.metadata !== undefined ? { metadata: parsed.data.metadata } : {}),
```

Motivo de la elección: un merge server-side exige leer la fila antes de escribir (una lectura extra
por serie en el camino caliente del ejecutor) y deja sin forma de borrar. Con «omitir», el borrado
sigue siendo posible y explícito. La contrapartida (ya no se puede vaciar el jsonb entero desde web
mandando `null` implícito) es aceptable: hoy nadie lo hace.

⚠️ Este cambio es **prerrequisito** de habilitar la captura por lado en web (OUTLINE §10, riesgo
«borrado de metadata al re-guardar»): entra en W2 **antes** de que la UI ofrezca los dos campos.

### 7.4 Semántica de **lectura** de `metadata`: `sideRepsFromMetadata`, espejo exacto del SQL

El zod de §7.1 valida lo que **entra por la action de web**. No cubre la lectura: hoy los lados se
leen sin validar en los dos consumidores que este tren toca —cast ciego en
`apps/mobile/lib/workout-session.ts:418`
(`metadata: (row.metadata as ReconciledSessionLog['metadata']) ?? null`) y aritmética directa en
`packages/workout-engine/session-summary.ts:196-199` (`addVol += w * r`, que este tren pasa a
`left + right`)— mientras RN escribe el jsonb **crudo**, sin zod
(`apps/mobile/lib/workout-session.ts:940,1067` → `apps/mobile/lib/offline-cache.ts:166`) y la columna
**no tiene `CHECK`**.

Consecuencia si no se corrige: un `"10"` (string) **concatena** en TS (`"10" + "10" = "1010"`),
un `1.5` da `3` y un `1e30` desborda, mientras el SQL del §3 resuelve cada caso con su regex. Eso
rompe la paridad SQL↔TS que este mismo documento exige (§3, «SQL y TS tienen que dar el mismo
número») **sin que ningún test lo note**.

Contrato del helper único `sideRepsFromMetadata` (R27; lo implementa W0 en `@eva/workout-engine`, y
el nombre es canónico —no hay variantes):

- Entrada: `metadata` tal como vuelve de la DB (`unknown`, puede ser `null`).
- Salida: **`{ left: number; right: number } | null`**. Devuelve lados **solo si LOS DOS** son
  enteros de `0..9999`; en cualquier otro caso (uno solo presente, decimal, negativo, `1e30`,
  objeto, ausente, `null`) devuelve **`null`**. Es el espejo exacto del
  `CASE WHEN … ~ '^[0-9]{1,4}$' AND … THEN suma ELSE reps_done END` del §3 y del §3.1.
- **Paridad con `->>`**: el SQL compara el **texto** que devuelve `metadata->>'left_reps'`, así que
  el JSON string `"10"` **sí** matchea la regex y suma. Para no divergir, el helper acepta también
  una cadena de 1 a 4 dígitos (`/^[0-9]{1,4}$/`) y la convierte; cualquier otra cadena ⇒ `null`.
- **Fallback**: `null` ⇒ el consumidor usa `reps_done` tal cual (es el `ELSE reps_done` del SQL). Con
  lados válidos usa `left + right`, aunque la suma dé `0` (el SQL hace lo mismo y la fila queda fuera
  por `reps_eff > 0`).
- Un único origen (R27): lo usan `packages/workout-engine/session-summary.ts` (volumen),
  `apps/mobile/lib/workout-session.ts:418`, `build-share-data.ts` (R34: volumen = peso × (izq+der);
  top set y `repsAtMax` con `reps_done`) y los chips «10 / 10». Ningún consumidor lee
  `metadata.left_reps` a mano.
- Casos obligatorios del test de paridad de W0 (y de `TESTING-QA`): `{left_reps:10,right_reps:10}`
  ⇒ `20`; `{left_reps:"10",right_reps:"10"}` ⇒ `20` (paridad con `->>`); `{left_reps:1.5,…}` ⇒
  `null` ⇒ `reps_done`; `{left_reps:-3,…}` ⇒ `null`; `{left_reps:1e30,…}` ⇒ `null`;
  `{left_reps:10}` sin `right_reps` ⇒ `null`; `metadata` ausente y `metadata: null` ⇒ `null`. El test
  compara el resultado contra el `reps_eff` del SQL de §3 para las mismas entradas: si divergen, es
  un bug de esta capa.

---

## 8. Threat model por pieza

### 8.1 `get_client_current_streak` (migración 1) — `CREATE OR REPLACE`, superficie sin cambios

| Vector | Estado |
|---|---|
| **IDOR** | El guard de `:60-65` se copia **verbatim**: propio, coach del cliente, o pool de team; cualquier otro `authenticated` recibe `0`. No se agrega ninguna rama que lea filas fuera de `p_client_id`: las CTEs nuevas `cycledays` y `cycle_empty_weeks` filtran por `progs`, ya acotada a `client_id = p_client_id`. |
| **anon** | Sigue revocado (`20260608120150_revoke_anon_definer_read_rpcs.sql:19` y el barrido de `20260608120160:20`). `CREATE OR REPLACE` **no** restaura la ACL del baseline y, además, la migración re-declara `REVOKE ALL … FROM PUBLIC, anon, service_role` + `GRANT` (patrón único del tren, R16). Se verifica con `has_function_privilege` en la misma sesión del `CREATE` y en el paso 3 del §5. |
| **service_role** | Conserva el bypass deliberado (`auth.uid() IS NULL`), del que depende la ruta mobile de pulse (cabecera `:36-37`). No se amplía. |
| **Canal lateral** | La función devuelve un `integer`; con el guard, un tercero solo obtiene `0`, que no distingue «no autorizado» de «sin logs». Se conserva a propósito. |
| **Costo / DoS** | Sin cambio de orden de magnitud: `cycle_empty_weeks` agrega un `GROUP BY` sobre `days` (≤ 731 filas ya materializadas). La poda de `v_from` (`:81`) sigue intacta y es lo que la mantiene barata. Se mide en el paso 2 del §5. |
| **Datos personales** | Ni el test ni las consultas del protocolo devuelven nombres ni correos: solo UUIDs y enteros. |

### 8.2 `client_start_workout_program` (migración 2) — superficie **nueva**

| Vector | Mitigación |
|---|---|
| **IDOR (empezar el programa de otro alumno)** | `WHERE g.id = p_program_id AND g.client_id = auth.uid()`. Un id ajeno devuelve el mismo error que un id inexistente (`program_not_startable`) ⇒ tampoco sirve como oráculo de existencia. |
| **anon** | `REVOKE ALL … FROM PUBLIC, anon, service_role` + el guard `auth.uid() IS NULL ⇒ RAISE`. Dos capas. |
| **service_role** | **Grant por *default privileges* revocado explícitamente.** No es «sin `GRANT`»: el baseline tiene `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role` (`00000000000001_baseline.sql:3815`), así que la función **nace** con `EXECUTE` para `service_role` y un `REVOKE … FROM PUBLIC, anon` no se lo quita (mismo hallazgo que `20260608120160_revoke_public_definer_read_rpcs.sql:1-4` para PUBLIC). Por eso el `REVOKE` de la migración incluye `service_role`. Segunda capa: aunque lo tuviera, el guard lo rechaza (`auth.uid()` es NULL). Coherente con «nunca `service_role` en cliente» (D3). |
| **RLS de `workout_programs`** | La función es `SECURITY DEFINER`: corre como owner y **saltea** RLS; por eso el guard interno es el control real. Se comprobó que el alumno no tiene otra vía: su única policy es `FOR SELECT` (`baseline:3373`), la de escritura es del coach (`20260609180000:30-42`) y el archive gate es `AS RESTRICTIVE` (`20260801023414:307`), que restringe pero no habilita. |
| **Coach en pausa / post-gracia (escritura del alumno)** | `private.student_write_allowed(auth.uid())` dentro de la RPC (`20260718120000:101-126`), espejo del patrón de las RPCs V2 de nutrición (`:290`, `:496`). **No alcanzaba con lo que ya había**: las policies RESTRICTIVAS del gate (`20260718120000:148-208`) no tocan a una función `SECURITY DEFINER`, y el trigger `workout_programs_archived_client_guard` solo dispara en `INSERT OR UPDATE OF client_id, is_active` (`20260731123000:128-131`), nunca en un `UPDATE` de `start_date`. Sin el gate, empezar un programa habría sido la única escritura del alumno que se salta la política de suscripción. Error `coach_account_paused` / `42501`, igual que nutrición. |
| **Escalada de columna** | El `UPDATE` toca **dos columnas derivadas de una sola entrada** (`start_date` y su `end_date` = `start + weeks*7 - 1`, que viajan juntas por A2 / `client-detail.service.ts:314`) de **una sola fila** (`id` + `client_id` + `start_date IS NULL`). `end_date` no es un parámetro: se calcula server-side con `weeks_to_repeat` **de la propia fila**, así que el alumno no puede elegirlo. Nunca `is_active`, `coach_id`, `weeks_to_repeat` ni `program_phases`. |
| **Manipulación temporal** | Ventana = **solo hoy** (R14): `p_start_date` `NULL` o igual a `eva_santiago_day(now())`; todo lo demás ⇒ `start_date_out_of_range` (`22007`). Es la superficie mínima posible. El pasado se cierra porque, con la idempotencia estricta, una fecha retroactiva es **irreversible para el alumno**, y en un weekly flexible la migración 1 crearía días asignados hacia atrás (CTE `assigned`) que la regla 2 cuenta como corte ⇒ la racha se rompe en el instante de «empezar». El futuro se cierra porque adelantaría `weeks_to_repeat`, fases y variante A/B (`programWeekVariant.ts:7-22`) a un estado que la UI de este tren no tiene. La UI no ofrece «Elegir otra fecha», así que el cliente nunca manda otra cosa. |
| **Carrera / doble click** | `SELECT … FOR UPDATE` + `AND start_date IS NULL` en el `UPDATE`, y el valor devuelto sale del `RETURNING` (con relectura si `NOT FOUND`), nunca de la variable calculada: dos llamadas simultáneas (botón + auto-start del primer set) convergen en la **misma fecha persistida**, y ninguna devuelve una fecha que la fila no tiene. |
| **Alumno archivado / suspendido** | El guard exige `is_active = true` en el programa; el acceso del alumno archivado ya está cortado antes por el archive gate en cada lectura, y `private.student_write_allowed` corta la escritura cuando el coach está post-gracia. |
| **Cuentas con `client_memberships`** | **Resuelto por R40**: el guard usa exactamente el predicado de la policy INSERT del alumno sobre `workout_logs`, y esa policy —`workout_logs_client` (`00000000000001_baseline.sql:3347`), `client_id = (select auth.uid())` con `WITH CHECK` igual— **no** contempla `client_memberships` ni `student_readable_client_ids`; la capa restrictiva es `student_write_gate_ins_workout_logs` (`20260718120000:141-150`), que la RPC replica con `private.student_write_allowed`. ⇒ `client_id = auth.uid()`, ni más ni menos: quien puede registrar una serie es quien puede empezar el programa. Si algún día esa policy admite membresías, esta RPC se mueve con ella. |
| **Auditoría (quién fijó la fecha)** | **Cubierta por `started` (R23).** `RETURNS TABLE(start_date, end_date, started)` distingue «escribí» (`started = true`) de «ya estaba» (`false`), así que el evento PostHog `program_started_by_client` (OUTLINE §9) se emite **una sola vez** y el auto-start de cada serie no lo cuenta doble. `set_updated_at` (`baseline:2135`) sigue sellando `updated_at` sin decir quién: la traza de negocio es el evento, declarado en el PR. Impacto acotado igual (una sola fecha, siempre hoy, irreversible solo hacia adelante). |

### 8.3 `get_client_daily_tonnage` (migración 3) y `get_client_muscle_volume` (migración 4)

Las dos comparten el **mismo `reps_eff`** (R15 + R27), así que comparten el threat model.

| Vector | Estado |
|---|---|
| **IDOR** | Guard idéntico al vigente en cada una (`20260612052000:213-217` para el tonelaje; `20260701140000:83-86` para el volumen), incluido `auth.uid() IS NULL ⇒ RETURN`: **ninguna** tiene bypass de service-role, sin sesión devuelven vacío. No se tocan. |
| **anon / PUBLIC / service_role** | `REVOKE ALL … FROM PUBLIC, anon, service_role` + `GRANT … TO authenticated, service_role` re-declarados en los dos archivos, con `has_function_privilege` inmediatamente después del `CREATE` (patrón único del tren, R16). |
| **Valor hostil o mal formado en `metadata`** | `metadata` es jsonb escrito por el propio alumno, y **no siempre pasa por zod**: la web sí valida en la action, pero RN insertea el item de la cola tal cual contra PostgREST (`apps/mobile/lib/offline-cache.ts:166`, `apps/mobile/lib/workout-session.ts:940,1067`) y la columna **no tiene `CHECK`** (R27: no se agrega). Por eso **no se usa `jsonb_typeof`**: `'number'` también es `10.5` (⇒ `22P02 invalid input syntax for type integer`) y `1e30` (⇒ `22003 out of range`), y cualquiera de las dos abortaría **toda** la ejecución para ese alumno —lectura que hace su coach—. El filtro es la regex `^[0-9]{1,4}$` sobre `metadata->>'left_reps'` y `->>'right_reps'`: lo que no matchea **nunca se castea** y la fila cae al fallback `reps_done`. Nada tumba la función y ningún valor absurdo entra al agregado. No hay SQL dinámico. Caso `{"left_reps": 1.5, "right_reps": 1e30}` probado en el paso **7.b** del §5 (y repetido contra el volumen tras el 7.c), y los mismos valores en el test de paridad TS del §7.4. |
| **Datos ajenos** | Ninguna de las dos lee fuera de `p_client_id`. |

### 8.4 Superficie que **no** se toca (y por qué se dice)

- ✅ **`get_client_muscle_volume(uuid, integer)` YA NO queda afuera: es la cuarta migración del tren
  (R15), especificada en §3.1.** Por qué hacía falta: la RPC hace `SUM(wl.weight_kg * wl.reps_done)`
  (`20260701140000_workout_logs_exercise_id_snapshot.sql:91,98`, definición vigente; linaje con sus
  `REVOKE`/`GRANT` en `20260612052000_rpc_client_progress_aggregations.sql:76-77`), así que con R3
  (`reps_done` = **mínimo** de los dos lados) el volumen por grupo muscular de una serie por lado
  caería a la **mitad** mientras el tonelaje de la migración 3 usa `left + right`. Los dos números se
  piden **juntos**, en el mismo `Promise.all`, para la misma ficha:
  `apps/web/src/services/client/client-detail.service.ts:259` (volumen) y
  `apps/mobile/lib/coach-client-detail.ts:848` (volumen) contra `:854` (tonelaje). Blast radius:
  195 bloques `per_side/strength` + 75 `alternating/strength`, 49 coaches (STATS §Por lado). Con la
  migración 4 los dos comparten `reps_eff` y no hay inconsistencia que declarar en el aviso al coach.
  Espejos TS que se alinean: el fallback por series de `apps/mobile/lib/coach-client-detail.ts:755`
  y `apps/mobile/lib/enterprise-profile-analytics.ts:131` (declara «paridad exacta con
  `get_client_muscle_volume`»). **Los DOS entran en este tren**: el segundo vive en
  `apps/mobile/lib/`, no en `apps/enterprise`, así que la congelación de `apps/enterprise` no lo
  alcanza.
- Índice único `workout_logs_one_set_per_day` (`20260707120000:63`): intacto. D2 obliga a **una fila
  por serie**; los lados viajan en `metadata`.
- `get_workout_program_planned_set_totals` tiene `EXECUTE` a `PUBLIC` (hallazgo colateral,
  OUTLINE §3 «higiene colateral»): **fuera de este tren**, anotado en el backlog. Se menciona acá
  para que no se cuele como «lo arreglo de paso» dentro de una migración de este tren.
- `workout_blocks.is_unilateral` (`20260611090002:14`) sigue muerta: no se lee, no se escribe, no se
  dropea (OUTLINE §1).

---

## 9. Consulta acotada de residuos tipados antes del deploy (R6, riesgo del OUTLINE §10)

R6 hace que cambiar el tipo de un bloque limpie los campos del tipo anterior (`stripFieldsForType`,
que por R32 escribe **`null` explícito** —no `undefined`— en todos los campos polimórficos del tipo
anterior y conserva `sets`, `rest_time`, `notes`, `superset_group`, `side_mode` e `instructions`), y
W4 amplía el SELECT de la ficha del coach
(`apps/web/src/services/client/client-detail.service.ts:82-92`) para mostrar el tipo. El riesgo es que
un bloque **ya guardado** con residuos de un tipo anterior empiece a mostrar basura («5 km» en un
press de banca). Esta consulta cuenta cuántos hay **antes** de desplegar. Columnas verificadas en
`20260611090002_workout_blocks_polymorphic.sql:13-29`; tipo efectivo según
`packages/workout-engine/workout-exercise-type.ts:74-83`.

```sql
-- Residuos tipados en bloques de programas ACTIVOS de alumnos (lo que la ficha va a mostrar).
-- Solo lectura, sin PII: conteos e ids.
WITH b AS (
  SELECT wb.id,
         COALESCE(wb.exercise_type_override, e.exercise_type, 'strength') AS tipo,
         g.coach_id,
         g.id AS program_id,
         wb.duration_sec, wb.distance_value, wb.target_pace_sec_per_km,
         wb.hr_zone, wb.interval_config, wb.reps_value, wb.reps_unit,
         wb.target_weight_kg, wb.tempo
    FROM public.workout_blocks    wb
    JOIN public.exercises          e ON e.id = wb.exercise_id
    JOIN public.workout_plans      p ON p.id = wb.plan_id
    JOIN public.workout_programs   g ON g.id = p.program_id
   WHERE g.client_id IS NOT NULL
     AND g.is_active = true
),
flag AS (
  SELECT b.*,
         CASE b.tipo
           -- fuerza: no usa duracion, distancia, pace, zona, intervalos ni reps_value tipado
           WHEN 'strength' THEN (b.duration_sec IS NOT NULL OR b.distance_value IS NOT NULL
                                 OR b.target_pace_sec_per_km IS NOT NULL OR b.hr_zone IS NOT NULL
                                 OR b.interval_config IS NOT NULL
                                 OR (b.reps_unit IS NOT NULL AND b.reps_unit <> 'reps'))
           -- cardio: no usa carga objetivo, tempo ni pasadas
           WHEN 'cardio'   THEN (b.target_weight_kg IS NOT NULL OR NULLIF(b.tempo,'') IS NOT NULL
                                 OR b.reps_unit = 'passes')
           -- movilidad: usa duracion (hold) y lado; el resto es residuo
           WHEN 'mobility' THEN (b.distance_value IS NOT NULL OR b.hr_zone IS NOT NULL
                                 OR b.interval_config IS NOT NULL OR b.target_pace_sec_per_km IS NOT NULL
                                 OR b.target_weight_kg IS NOT NULL OR b.reps_unit = 'passes')
           -- roller: usa pasadas y, a veces, duracion
           WHEN 'roller'   THEN (b.distance_value IS NOT NULL OR b.hr_zone IS NOT NULL
                                 OR b.interval_config IS NOT NULL OR b.target_pace_sec_per_km IS NOT NULL
                                 OR b.target_weight_kg IS NOT NULL)
           ELSE false
         END AS con_residuo
    FROM b
)
SELECT tipo,
       count(*)                                              AS bloques,
       count(*) FILTER (WHERE con_residuo)                   AS con_residuo,
       count(DISTINCT coach_id)   FILTER (WHERE con_residuo) AS coaches_afectados,
       count(DISTINCT program_id) FILTER (WHERE con_residuo) AS programas_afectados
  FROM flag
 GROUP BY tipo
 ORDER BY con_residuo DESC, tipo;
```

**Cómo se lee el resultado** (regla de decisión; todavía no hay número de referencia medido):
- `con_residuo = 0` en todos los tipos ⇒ el SELECT ampliado se despliega sin más.
- Pocos y concentrados en 1-2 coaches ⇒ desplegar y avisar; R6 evita que crezcan.
- Muchos ⇒ el «antes o junto» de R6 pasa a ser **antes**, y se evalúa una limpieza puntual con la
  misma lógica de `stripFieldsForType` aplicada como `UPDATE` acotado. Eso sería una **migración de
  datos, fuera de este tren**: hay que pedírselo al owner, no decidirlo en la wave.

Variante para dimensionar a Movens (mismo `WITH`, cambiando solo el `SELECT` final):
```sql
SELECT count(*) FILTER (WHERE con_residuo) AS residuos_movens
  FROM flag WHERE coach_id = '<coach_id_movens>'::uuid;
```

### Resultado LIVE 2026-09-03 (W1.6)

Consulta de arriba corrida tal cual (sólo lectura, sin `BEGIN`) contra `jikjeokundmaafuytdcx`.
Universo: **2 794 bloques** de programas **activos** de alumnos.

| tipo efectivo | bloques | **con residuo** | coaches afectados | programas afectados |
|---|---:|---:|---:|---:|
| `strength` | 2 389 | **2** | 2 | 2 |
| `mobility` | 275 | **2** | 1 | 2 |
| `cardio` | 99 | 0 | 0 | 0 |
| `roller` | 31 | 0 | 0 | 0 |
| **total** | **2 794** | **4** | — | — |

Desglose de los 4 (qué campo exactamente es el residuo):
- `strength` × 2 → `duration_sec` seteado (120 y 600). Ningún `distance_value`, `hr_zone`,
  `interval_config`, `target_pace_sec_per_km` ni `reps_unit` raro en fuerza.
- `mobility` × 2 → `reps_unit = 'passes'` (con `duration_sec` 30 / 45, que en movilidad **no** es
  residuo: es el *hold*).

**Decisión (regla de lectura de arriba): «pocos y concentrados» ⇒ desplegar y avisar.** 4 bloques
sobre 2 794 (0,14 %), repartidos en 3 coaches y 4 programas. R6 impide que crezcan. **No** hace falta
la migración de datos ni adelantar nada; W4 puede ampliar el SELECT de la ficha sin bloqueo.

Nota metodológica: el `JOIN` a `exercises` de la consulta es INNER, así que en teoría podría dejar
bloques afuera. Verificado que no: de los 2 794 bloques activos, **0** tienen `exercise_id` nulo y
**0** apuntan a un ejercicio inexistente, o sea el INNER no pierde ni una fila.

---

## 10. Checklist de salida de esta capa

- [ ] Las **cuatro** migraciones escritas con los nombres canónicos del OUTLINE §13, incluida la 4.ª
      `20260903212800_muscle_volume_side_metadata.sql` (R15, §3.1), y el test como
      `supabase/tests/streak_cycle_equivalence.sql` con la función espejo `_streak_next` (R25).
- [ ] Paso 0 corrido y su salida en el PR. `dias_que_no_suman > 0` **no bloquea**: por R29 el log
      huérfano es neutro; solo entra al aviso al coach (§1.3).
- [ ] `difs_weekly = 0`, `difs_sin_programa = 0`, `mixtos = 0`, `cycle_con_cambio > 0` en el test §4.
- [ ] `EXPLAIN ANALYZE` comparado **sobre la consulta extraída** (no sobre `SELECT f(...)`: las cuatro
      funciones son `plpgsql`): racha sin regresión > ~30 % (paso 2) y tonelaje/volumen con el umbral
      de **2×** de R26 (paso 7.a); si se pierde el *Index Only Scan* y se pasa de 2×, el índice con
      `INCLUDE (metadata)` es **seguimiento fuera del tren**, no un bloqueo.
- [ ] `get_advisors` sin críticos nuevos después de cada migración.
- [ ] Matriz de `EXECUTE` con los 12 valores esperados, corrida **después de cada migración** y con
      `has_function_privilege` en la misma sesión del `CREATE` (R16) — `service_role = false` solo
      para `client_start_workout_program`; `true` para las otras tres, que lo tenían.
- [ ] Los casos de la RPC (a, a', b, c, c2, c3, d, e, f) del paso 5, **cada error en su `SAVEPOINT`**,
      en tx con `ROLLBACK` — incluido (f), alumno de coach pausado ⇒ `coach_account_paused`, y con
      `started = true` en (a) / `false` en (b) (R23, R28).
- [ ] Paso 7.b: fila con `{"left_reps": 1.5, "right_reps": 1e30}` y `get_client_daily_tonnage`
      (y después `get_client_muscle_volume`) devolviendo filas con el fallback `reps_done`, sin
      `22P02` / `22003`.
- [ ] Orden de salida respetado (R35): **deploy web → migraciones → OTA**.
- [ ] Zod + tipo TS desplegados en web **antes** de la OTA (§5, paso 6), con el literal de
      `apps/mobile/lib/offline-cache.ts:43-44` ampliado (§7.2) y `sideRepsFromMetadata` (§7.4, R27)
      con sus casos de metadata mal formada en el test de paridad de W0.
- [ ] Consumidores alineados con el contrato de la RPC:
      `startWorkoutProgramAction({ coachSlug, programId })` y `startWorkoutProgram(programId)` (R24),
      leyendo `start_date` / `end_date` / `started` (R23) y emitiendo `program_started_by_client`
      solo con `started = true`; `end_date` NULL mientras no empezó, con los guards de
      `workout.service.ts:977-981` y `resolveProgramScheduleMetadata` (R21) y su test.
- [ ] Conteo de residuos §9 registrado en el PR antes de ampliar el SELECT de la ficha.
- [ ] `docs/specs/workout-day-in-progress/SPEC.md:23-24` («la racha … **NO se toca en v1**») y `:50`
      («No tocar el RPC de racha…») actualizados en el mismo commit: este tren sí la toca (C3 del
      crítico). Lo exige `docs/README.md:79`: «`status: active` exige mantenimiento en el mismo
      cambio que altera su verdad».
