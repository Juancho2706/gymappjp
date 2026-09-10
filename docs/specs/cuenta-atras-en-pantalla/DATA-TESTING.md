---
status: active
owner: product-engineering
last_verified: "2026-09-10"
canonical: false
---

# DATA-TESTING — Cuenta atrás en pantalla

> Spec: `docs/specs/cuenta-atras-en-pantalla/` — ver [SPEC](SPEC.md) · [PLAN](PLAN.md) · [TASKS](TASKS.md).
> Jerarquía: `DECISIONS.md` (owner) > OUTLINE del jefe (§R1–R23, **con R24–R38 mandando donde
> choquen**) > mapas. Este archivo es la **capa de
> datos y de pruebas** del tren: 2 migraciones aditivas (R4) que se **aplican en LIVE en W0** (R35),
> el contrato TS/Zod copiable, la paridad
> del payload web ↔ RN (R15), el plan de pruebas completo, el QA del owner en 3 plataformas, la
> observabilidad (R19) y el threat model. No decide UI ni copys de pantalla (eso es el SPEC).
>
> Verificado en solo lectura contra el repo (rama `rnmobiledenuevo`, HEAD `f93378c3`) y contra **LIVE
> con SELECT** (`pg_constraint`, `pg_proc`, `pg_indexes`, conteos agregados sobre `workout_blocks` y
> `workout_logs`): cero escrituras, cero DDL. Cada afirmación de código lleva `ruta:línea`; cada
> afirmación de DB lleva la consulta que la produjo.
>
> **A5 está refutado**: el tren SÍ lleva migración. `reps_unit = 'sec'` viola hoy el CHECK
> `workout_blocks_poly_check` (§1.1) y el enum de Zod (`packages/schemas/workout.ts:64`).

---

## 0. Índice de piezas y orden de aplicación

### 0.1 Piezas

| # | Pieza | Tipo | Wave | Depende de | Reversible |
|---|---|---|---|---|---|
| M1 | `supabase/migrations/<ts1>_workout_blocks_reps_unit_sec.sql` | DROP + ADD del CHECK `workout_blocks_poly_check` (solo amplía) | W0 | — | sí (§1.5) |
| M2 | `supabase/migrations/<ts2>_get_client_exercise_prs_reps_filter.sql` | `CREATE OR REPLACE FUNCTION public.get_client_exercise_prs(uuid)` | W0 | — | sí (§2.4) |
| Z1 | `packages/schemas/workout.ts` — `REPS_UNIT_VALUES` + `'sec'`, `metadata.hold_source`, `superRefine` 5–600 s | contrato Zod | W0 | M1 aplicada | sí (revert de código) |
| Z2 | `packages/plan-builder/types.ts` + `block-type-fields.ts` (`stripFieldsForStrengthMode`) | contrato TS del builder | W0 | Z1 | sí |
| E1 | `packages/workout-engine/` — `hold-autolog.ts` (nuevo), `buildStrengthTimePayload`, `isStrengthTimeBlock`, resúmenes, mapa muscular, keypad | motor puro | W1 | Z1, Z2 | sí |
| C1 | `apps/web/src/app/api/pr-card/route.tsx:77-87` — filtro `reps_done` | fix de cliente | W4 | — | sí |
| C2 | `apps/web/src/lib/workout/progression.ts:142-149` — guard de doble progresión en modo tiempo | fix de cliente | W1 | — | sí |

`<ts1>` y `<ts2>` se generan en W0 con `date -u +%Y%m%d%H%M%S` (dos llamados consecutivos, `<ts1> < <ts2>`)
y **deben ser posteriores a `20260910015432`** (última migración aplicada; verificado con
`mcp__supabase__list_migrations`, 297 filas). El sufijo del nombre es canónico (OUTLINE §10) y no se
cambia. **Nunca** se edita una migración ya aplicada.

### 0.2 Orden duro de salida

```
W0: M1 → M2 (LIVE)  →  W6: deploy web  →  W6: OTA (android + ios, runtime 1.1.2)
```

**Un solo orden en todo el SDD (R35): W0 migra → W6 deploya → W6 OTA.** Las dos migraciones se
validan con tx-rollback y **se aplican en LIVE en W0**, no en W6. Son aditivas y ningún cliente
desplegado escribe `'sec'` todavía, así que **no hay ventana rota** entre W0 y W6: el código que
escribe `'sec'` sale recién con el deploy de W6. Aplicarlas en W0 desbloquea además las pruebas
reales de W1–W5 (un dry-run no deja el CHECK ampliado para el resto del tren).

- **Las migraciones van primero.** Son aditivas puras: no hay ninguna fila con `reps_unit='sec'`
  (§1.2) ni ninguna lectura nueva que dependa de código nuevo. Un cliente **viejo** (web sin desplegar,
  app sin la OTA) nunca escribe `'sec'` porque su Zod no lo acepta (`packages/schemas/workout.ts:64`)
  y su builder no ofrece el selector: la DB ampliada le es invisible.
- **Al revés no funciona**: con el deploy web antes de M1, el primer coach que toque «Segundos» come
  un `23514 check_violation` y pierde el bloque.
- **La OTA va última.** Entre el deploy web y la OTA conviven dos clientes escribiendo en la misma
  base (§9, amenaza T4): la web ya sabe leer y escribir `'sec'`; la app 1.1.2 sin OTA resuelve
  `effectiveExerciseType = 'strength'` (`packages/workout-engine/workout-exercise-type.ts:74-83`) y le
  muestra al alumno la fila de fuerza clásica con `reps = "30s"` como objetivo. **Degradación honesta,
  sin crash**; es lo que hay que decirle a Movens en el aviso (TASKS W6).
- D1 («un solo tren») se mantiene: es **un** tren con **tres** artefactos (migraciones, deploy, OTA),
  no tres trenes.

### 0.3 Protocolo LIVE (regla del owner: tx-rollback primero)

Marco: `AGENTS.md` (aditivo-en-LIVE cuando Branching no conecta) + memoria `feedback_db_y_supabase`
(EXPLAIN + tx-rollback, aditivo-en-LIVE, no borrar V1). Ninguna de las dos migraciones toca datos: sin
backfill, sin DDL de tabla, sin columnas nuevas, sin `db push` ciego.

| Paso | Qué | Herramienta | Criterio de salida |
|---|---|---|---|
| 0 | **Snapshot previo** (solo lectura): §1.2 (conteo de `reps_unit`), §2.1 (pares con PR sin reps). Guardar la salida en el PR. | `execute_sql` | Números anotados en TASKS W0 |
| 1 | **Dry-run de M1 en tx-rollback** (§1.4): `BEGIN` → DROP+ADD → `SELECT count(*)` de validación → `ROLLBACK` | `execute_sql` | 0 errores, 0 filas violando |
| 2 | **Dry-run de M2 en tx-rollback** (§2.4): `BEGIN` → `CREATE OR REPLACE` → llamar la función con un `client_id` real de prueba → comparar con el snapshot → `ROLLBACK` | `execute_sql` | La función devuelve filas y ninguna con `reps_at_max = 0` |
| 3 | **Aplicar M1** | `apply_migration` con el nombre canónico | `pg_get_constraintdef` contiene `'sec'` |
| 4 | **Aplicar M2** | `apply_migration` | `pg_get_functiondef` contiene el filtro nuevo |
| 5 | **Advisors** | `get_advisors` (security + performance) | Sin advisor nuevo respecto del snapshot |
| 6 | **Deploy web** (W6) → verificar `qa:prod:suave` | Vercel + Playwright | 9/9 |
| 7 | **OTA** android + ios sobre runtime 1.1.2 (W6) | EAS Update | Grupo de update publicado, QA §7 |

Los pasos 0–5 son **W0**; los pasos 6–7 son **W6** (R35). Entre uno y otro pasan W1–W5 con la base ya
ampliada y ningún cliente escribiendo `'sec'`.

El paso 1 es **obligatorio antes** de cualquier `apply_migration`: es la regla del owner, no una
sugerencia. Un `DROP CONSTRAINT` sin dry-run deja la tabla sin CHECK si el `ADD` falla por sintaxis.

### 0.4 Rollback (resumen; detalle en §1.5 y §2.4)

| Pieza | Cómo se revierte | Efecto |
|---|---|---|
| M1 | Archivo nuevo `<ts>_revert_workout_blocks_reps_unit_sec.sql` con `UPDATE public.workout_blocks SET reps_unit = NULL WHERE reps_unit = 'sec';` + DROP/ADD del CHECK **sin** `'sec'` (forward-only, como manda `AGENTS.md`) | Los bloques en modo tiempo vuelven a ser fuerza clásica con `reps` `"30s"` de objetivo. **Pierde el modo**, no el bloque ni sus logs |
| M2 | Archivo nuevo con el `CREATE OR REPLACE` **verbatim** del cuerpo de §2.2 (el de hoy) | La ficha vuelve a mostrar «N kg × 0 reps» en 72 pares (§2.1). No toca filas |
| Z1/Z2/E1/C1/C2 | Revert de código + redeploy + OTA | El cliente deja de ofrecer el modo tiempo; los bloques ya guardados quedan como fuerza clásica |

**Regla:** el rollback de M1 es el único destructivo del tren (pone `reps_unit = NULL`). Si ya hay
bloques en modo tiempo en producción, revertir M1 **no** es la salida: la salida es revertir el código
y dejar el CHECK ampliado (un `IN` más grande no molesta a nadie).

### 0.5 Ejecución real de W0 en LIVE (2026-09-10, 20:47–20:51Z, sesión «Asistente Principal», por MCP)

| Paso | Salida real |
|---|---|
| 0 · Snapshot previo | `reps_unit`: `NULL` 8 878 · `passes` 72 · `reps` 4 · `floors` 2 · `breaths` 2 · `jumps` 2 (0 `sec`). §2.1 (a): **617 filas, 25 alumnos**. §2.1 (b): **2 108 pares totales, 72 con PR falso, 17 alumnos** (el SDD decía 2 102 pares: 6 pares nuevos desde la lectura del plan). Constraint y función vigentes **byte-idénticos** a §1.1 y §2.2. |
| 1 · Dry-run M1 (bloque `DO` que termina en `RAISE EXCEPTION` ⇒ rollback automático) | `W0 DRYRUN M1 OK \| tiene_sec=t \| filas_totales=8960 \| filas_en_violacion=0 \| plan_qa=dc7888a4-… (qa-cat-rojas@josefit-designqa.cl) \| bloque_temporal=7ab6a27f-… reps_unit=sec duration_sec=30 reps=30s \| negativa: OK 23514 en segundos \| ROLLBACK por excepcion`. ⚠ Desvío declarado: las personas `e2e-*@evatest.cl` **no existen en LIVE** (0 en `auth.users`; se siembran solo en CI y se limpian), así que la prueba positiva usó un plan del seed de QA de diseño de `josefit` (`@josefit-designqa.cl`, cuenta de prueba del owner) — dentro de la misma transacción revertida, cero filas persistidas. |
| 2 · Dry-run M2 (mismo patrón, con `set_config('request.jwt.claims', …)` para que `auth.uid()` sea el alumno de QA) | `W0 DRYRUN M2 OK \| antes: filas=31 con_cero=0 \| despues: filas=31 con_cero=0 \| def_con_filtro=t \| acl_antes={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} acl_despues=(idéntica) \| ROLLBACK por excepcion`. `EXPLAIN (ANALYZE, BUFFERS)` de la consulta interna para ese alumno: mismo plan (Bitmap Index Scan `idx_wl_client_logged_notnull` + Nested Loop), **antes** 294 filas / 1 015 buffers / 1,76 ms, **después** 286 filas (`Rows Removed by Filter: 8`) / 991 buffers / 1,50 ms. Sin plan peor. |
| 3 · Aplicar M1 | `apply_migration` ⇒ versión LIVE **`20260910205046`** `workout_blocks_reps_unit_sec`. Verificado: `pg_get_constraintdef` contiene `'sec'`, 0 filas con `sec`, 8 960 totales, comentario de columna presente. |
| 4 · Aplicar M2 | `apply_migration` ⇒ versión LIVE **`20260910205101`** `get_client_exercise_prs_reps_filter`. Verificado: `pg_get_functiondef` contiene `AND wl.reps_done IS NOT NULL AND wl.reps_done > 0`; `has_function_privilege`: anon **false**, authenticated true, service_role true; `proacl` idéntica a la previa; comentario presente. |
| 5 · Advisors | Security: solo hallazgos preexistentes (`_bak_*` sin policies, definers ya conocidos; `get_client_exercise_prs` ya figuraba como definer ejecutable por `authenticated`, igual que antes). Performance: 0 menciones a `get_client_exercise_prs`, `workout_blocks_poly_check` ni `reps_unit` (búsqueda por nombre sobre la salida completa). |

Espejos en el repo con la **misma versión que LIVE**: `supabase/migrations/20260910205046_workout_blocks_reps_unit_sec.sql` y `20260910205101_get_client_exercise_prs_reps_filter.sql`.

---

## 1. Migración 1 · `<ts1>_workout_blocks_reps_unit_sec.sql`

### 1.1 Evidencia: la definición VIGENTE en LIVE

Consulta corrida en LIVE (solo lectura, 2026-09-10):

```sql
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conname = 'workout_blocks_poly_check';
```

Resultado (copiado íntegro, es la fuente del texto de la migración):

```
CHECK ((((side_mode IS NULL) OR (side_mode = ANY (ARRAY['bilateral'::text, 'per_side'::text, 'alternating'::text])))
  AND ((reps_unit IS NULL) OR (reps_unit = ANY (ARRAY['reps'::text, 'passes'::text, 'breaths'::text, 'jumps'::text, 'floors'::text])))
  AND ((load_type IS NULL) OR (load_type = ANY (ARRAY['weight'::text, 'time'::text, 'bodyweight'::text, 'none'::text])))
  AND ((load_unit IS NULL) OR (load_unit = ANY (ARRAY['kg'::text, 'lb'::text, 'sec'::text])))
  AND ((distance_unit IS NULL) OR (distance_unit = ANY (ARRAY['m'::text, 'km'::text])))
  AND ((hr_zone IS NULL) OR ((hr_zone >= 1) AND (hr_zone <= 5)))
  AND ((exercise_type_override IS NULL) OR (exercise_type_override = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text, 'roller'::text])))
  AND ((reps_value IS NULL) OR (reps_value >= 0))
  AND ((load_value IS NULL) OR (load_value >= (0)::numeric))
  AND ((distance_value IS NULL) OR (distance_value >= (0)::numeric))
  AND ((duration_sec IS NULL) OR (duration_sec >= 0))
  AND ((target_pace_sec_per_km IS NULL) OR (target_pace_sec_per_km > 0))))
```

Tres lecturas obligatorias de este texto:

1. **`reps_unit` NO acepta `'sec'`** ⇒ es el bloqueante de D3. Un `INSERT`/`UPDATE` con `'sec'`
   devuelve `23514 check_violation`.
2. **`duration_sec` no estorba**: solo pide `>= 0`. La columna ya acepta cualquier hold.
3. **`load_unit` SÍ tiene `'sec'`** — es la unidad de **carga por tiempo** (`LOAD_UNIT_VALUES`,
   `packages/schemas/workout.ts:56`), **no** el modo de prescripción. No confundir: el tren no toca
   `load_unit` ni `load_type`.

El precedente exacto del cambio está en el repo: `supabase/migrations/20260725221804_cardio_modality_axes.sql:49-65`
hizo esto mismo para sumar `'jumps'` y `'floors'`, con el comentario `:50` «Se recrea el constraint
completo con la MISMA definicion vigente + el superset (solo amplia)».

### 1.2 Filas afectadas: **0** (con la consulta que lo prueba)

```sql
SELECT count(*) AS filas_con_sec FROM public.workout_blocks WHERE reps_unit = 'sec';
-- LIVE 2026-09-10 ⇒ 0
```

Distribución completa de la columna (r3 §3.6, re-verificada): `NULL` 8 878 · `passes` 72 · `reps` 4 ·
`floors` 2 · `breaths` 2 · `jumps` 2. **Ninguna fila puede violar un `IN` que solo crece**, así que la
revalidación implícita del `ADD CONSTRAINT` recorre las ~8 960 filas y no falla (en el precedente de
2026-07-25 revalidaron 5 975 filas «al instante», `20260725221804_cardio_modality_axes.sql:4`).

### 1.3 Migración completa (copiable)

Cabecera con rollback documentado, calcada de `supabase/migrations/20260725221804_cardio_modality_axes.sql:1-10`.

```sql
-- Cuenta atras en pantalla (specs/cuenta-atras-en-pantalla, D3/R4): reps_unit gana 'sec' para la
-- prescripcion de FUERZA POR TIEMPO. 100% aditiva, idempotente, forward-only.
-- Definicion copiada VERBATIM de LIVE con pg_get_constraintdef(oid) el 2026-09-10 + el superset:
-- solo amplia el ARRAY de reps_unit; el resto del CHECK queda byte-identico.
-- Dry-run BEGIN/ROLLBACK previo: 0 filas con reps_unit='sec' (SELECT count(*) sobre workout_blocks),
-- 0 filas violaban el CHECK ampliado.
-- Rollback documentado: UPDATE public.workout_blocks SET reps_unit = NULL WHERE reps_unit = 'sec';
-- luego recrear workout_blocks_poly_check con la lista previa
-- ('reps','passes','breaths','jumps','floors'), en un archivo NUEVO (forward-only).

ALTER TABLE public.workout_blocks DROP CONSTRAINT IF EXISTS workout_blocks_poly_check;
ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_poly_check CHECK (
  ((side_mode IS NULL) OR (side_mode = ANY (ARRAY['bilateral'::text, 'per_side'::text, 'alternating'::text])))
  AND ((reps_unit IS NULL) OR (reps_unit = ANY (ARRAY['reps'::text, 'passes'::text, 'breaths'::text, 'jumps'::text, 'floors'::text, 'sec'::text])))
  AND ((load_type IS NULL) OR (load_type = ANY (ARRAY['weight'::text, 'time'::text, 'bodyweight'::text, 'none'::text])))
  AND ((load_unit IS NULL) OR (load_unit = ANY (ARRAY['kg'::text, 'lb'::text, 'sec'::text])))
  AND ((distance_unit IS NULL) OR (distance_unit = ANY (ARRAY['m'::text, 'km'::text])))
  AND ((hr_zone IS NULL) OR ((hr_zone >= 1) AND (hr_zone <= 5)))
  AND ((exercise_type_override IS NULL) OR (exercise_type_override = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text, 'roller'::text])))
  AND ((reps_value IS NULL) OR (reps_value >= 0))
  AND ((load_value IS NULL) OR (load_value >= (0)::numeric))
  AND ((distance_value IS NULL) OR (distance_value >= (0)::numeric))
  AND ((duration_sec IS NULL) OR (duration_sec >= 0))
  AND ((target_pace_sec_per_km IS NULL) OR (target_pace_sec_per_km > 0))
);

COMMENT ON COLUMN public.workout_blocks.reps_unit IS
  'Unidad del conteo prescrito. reps|passes|breaths|jumps|floors (cardio/movilidad/roller) + sec = FUERZA POR TIEMPO (D3): el bloque sigue siendo strength, con duration_sec como objetivo del hold y reps como espejo legacy. Espejo TS: REPS_UNIT_VALUES en packages/schemas/workout.ts.';
```

**Nota de estilo:** el `pg_get_constraintdef` devuelve un paréntesis externo extra (`CHECK ((( … )))`);
al escribirlo como `ADD CONSTRAINT … CHECK ( … )` ese paréntesis lo pone Postgres solo. La forma de
arriba es la misma que quedó en LIVE tras la migración de 2026-07-25, así que el `pg_get_constraintdef`
posterior será idéntico salvo por `'sec'` — eso es exactamente el criterio de verificación del paso 3.

### 1.4 Dry-run en tx-rollback (paso 1 del protocolo)

```sql
BEGIN;

ALTER TABLE public.workout_blocks DROP CONSTRAINT IF EXISTS workout_blocks_poly_check;
ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_poly_check CHECK (
  -- … cuerpo idéntico a §1.3 …
  ((side_mode IS NULL) OR (side_mode = ANY (ARRAY['bilateral'::text, 'per_side'::text, 'alternating'::text])))
  AND ((reps_unit IS NULL) OR (reps_unit = ANY (ARRAY['reps'::text, 'passes'::text, 'breaths'::text, 'jumps'::text, 'floors'::text, 'sec'::text])))
  AND ((load_type IS NULL) OR (load_type = ANY (ARRAY['weight'::text, 'time'::text, 'bodyweight'::text, 'none'::text])))
  AND ((load_unit IS NULL) OR (load_unit = ANY (ARRAY['kg'::text, 'lb'::text, 'sec'::text])))
  AND ((distance_unit IS NULL) OR (distance_unit = ANY (ARRAY['m'::text, 'km'::text])))
  AND ((hr_zone IS NULL) OR ((hr_zone >= 1) AND (hr_zone <= 5)))
  AND ((exercise_type_override IS NULL) OR (exercise_type_override = ANY (ARRAY['strength'::text, 'cardio'::text, 'mobility'::text, 'roller'::text])))
  AND ((reps_value IS NULL) OR (reps_value >= 0))
  AND ((load_value IS NULL) OR (load_value >= (0)::numeric))
  AND ((distance_value IS NULL) OR (distance_value >= (0)::numeric))
  AND ((duration_sec IS NULL) OR (duration_sec >= 0))
  AND ((target_pace_sec_per_km IS NULL) OR (target_pace_sec_per_km > 0))
);

-- 1) el constraint quedó con 'sec'
SELECT pg_get_constraintdef(oid) LIKE '%''sec''::text%' AS tiene_sec
  FROM pg_constraint WHERE conname = 'workout_blocks_poly_check';

-- 2) PRUEBA POSITIVA con un bloque TEMPORAL del alumno E2E (obligatoria, R35 / DECISIONS-2 DATA-1).
--    Se crea DENTRO de la misma transacción, se prueba y muere con el ROLLBACK: en LIVE solo persiste
--    la migración, la prueba positiva NO deja filas. Nunca se toca un plan de un coach real.
WITH plan_e2e AS (
  -- Plan del alumno E2E sembrado por scripts/seed-e2e-personas.mjs:365-374 (§6.5). Si devuelve 0
  -- filas, el dry-run FALLA acá y se corre `pnpm seed:e2e-personas` antes de seguir.
  -- (`workout_plans` y su `created_at`: supabase/migrations/00000000000001_baseline.sql:1545.)
  SELECT wp.id
    FROM public.workout_plans wp
    JOIN public.clients c ON c.id = wp.client_id
   WHERE c.email = '<alumno E2E del seed>'
   ORDER BY wp.created_at DESC
   LIMIT 1
), nuevo AS (
  INSERT INTO public.workout_blocks (plan_id, exercise_id, order_index, sets, reps)
  SELECT p.id, (SELECT id FROM public.exercises LIMIT 1), 9999, 3, '8-12' FROM plan_e2e p
  RETURNING id
)
UPDATE public.workout_blocks b
   SET reps_unit = 'sec', duration_sec = 30, reps = '30s'
  FROM nuevo n
 WHERE b.id = n.id
RETURNING b.id, b.reps_unit, b.duration_sec, b.reps;
-- Criterio: 1 fila devuelta con reps_unit='sec'. Sin M1 este UPDATE devuelve 23514 check_violation:
-- ESA es la prueba de que el CHECK ampliado es lo que habilita D3.

-- 3) prueba negativa (el CHECK sigue cerrado para lo demás): debe fallar con 23514.
--    Se corre en un dry-run APARTE, porque el error aborta la transacción.
--    UPDATE public.workout_blocks SET reps_unit = 'segundos' WHERE id = '<el de arriba>';

ROLLBACK;
```

Criterio de salida: `tiene_sec = true`, la prueba positiva devuelve **1 fila** con `reps_unit = 'sec'`
y cero errores inesperados. El `ROLLBACK` deja la base exactamente como estaba: el bloque temporal
desaparece y el CHECK original vuelve (el `DROP` también se revierte).

### 1.5 Rollback de M1

Archivo **nuevo** `supabase/migrations/<ts>_revert_workout_blocks_reps_unit_sec.sql` (forward-only; no
se borra ni se edita el archivo ya aplicado):

```sql
UPDATE public.workout_blocks SET reps_unit = NULL WHERE reps_unit = 'sec';
ALTER TABLE public.workout_blocks DROP CONSTRAINT IF EXISTS workout_blocks_poly_check;
ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_poly_check CHECK (
  -- … cuerpo de §1.1 (sin 'sec') …
);
```

Efecto: los bloques en modo tiempo pierden el modo (vuelven a ser fuerza clásica) pero conservan
`duration_sec`, `reps` (`"30s"`), carga, RIR y todos sus `workout_logs`. **No es la salida preferida**
si ya hay planes en producción: preferir revertir el código y dejar el CHECK ampliado.

---

## 2. Migración 2 · `<ts2>_get_client_exercise_prs_reps_filter.sql`

### 2.1 El caso preexistente que corrige (con números de LIVE)

`get_client_exercise_prs` filtra **solo** por `weight_kg > 0` y proyecta
`COALESCE(wl.reps_done, 0) AS reps_at_max`. Sus tres hermanas (`get_client_strength_series`,
`get_client_weekly_prs`, `get_client_daily_tonnage`) sí exigen reps. Consecuencia: **cualquier** log
con peso y sin reps entra a la lista de récords del ejercicio como «N kg × 0 reps». Con fuerza por
tiempo (`reps_done = NULL` por contrato, §3.3) eso se volvería sistemático: una plancha con disco de
20 kg sería «PR de 20 kg × 0 reps».

Y **ya está pasando hoy**, sin este tren:

```sql
-- (a) filas con peso y sin reps utilizables
SELECT count(*) AS filas, count(DISTINCT client_id) AS alumnos
  FROM public.workout_logs
 WHERE weight_kg IS NOT NULL AND weight_kg > 0
   AND (reps_done IS NULL OR reps_done <= 0);
-- LIVE 2026-09-10 ⇒ 617 filas, 25 alumnos

-- (b) pares (alumno, ejercicio) cuyo "récord" de hoy es una de esas filas
WITH top AS (
  SELECT DISTINCT ON (wl.client_id, COALESCE(wb.exercise_id, wl.exercise_id))
         wl.client_id, COALESCE(wb.exercise_id, wl.exercise_id) AS ex, wl.weight_kg, wl.reps_done
    FROM public.workout_logs wl
    LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
   WHERE wl.weight_kg IS NOT NULL AND wl.weight_kg > 0
     AND COALESCE(wb.exercise_id, wl.exercise_id) IS NOT NULL
   ORDER BY wl.client_id, COALESCE(wb.exercise_id, wl.exercise_id),
            wl.weight_kg DESC, wl.logged_at DESC, wl.id DESC
)
SELECT count(*) AS pares_totales,
       count(*) FILTER (WHERE reps_done IS NULL OR reps_done <= 0) AS pares_con_pr_falso,
       count(DISTINCT client_id) FILTER (WHERE reps_done IS NULL OR reps_done <= 0) AS alumnos
  FROM top;
-- LIVE 2026-09-10 ⇒ 2.102 pares totales · 72 con PR falso · 17 alumnos
```

**Qué cambia visiblemente tras el fix** (medido, §9 T7): de esos 72 pares, **48 desaparecen** de la
lista de récords porque ese alumno no tiene ninguna serie válida (con reps) de ese ejercicio; los 24
restantes pasan a mostrar su mejor serie con reps, y en 12 pares el peso mostrado **baja**. Es una
corrección, no una regresión, pero **hay que avisarlo**.

**Cómo se avisa (R35 / DECISIONS-2 DATA-3): una línea en el aviso GENERAL a coaches del cierre
(`news_items`), sin mensajes individuales.** Los 17 alumnos afectados están repartidos entre coaches
que ni saben que hoy ven «× 0 reps»; escribirle a cada uno cuesta más de lo que aclara. M2 se aplica
en **W0** igual (es aditiva y corrige un bug preexistente): el aviso sale en W6 con el resto del
tren, no antes. Redacción sugerida para esa línea: «Los récords de un ejercicio ahora solo cuentan
series con repeticiones: si veías un récord con “× 0 reps”, ahora muestra tu mejor serie real».

Cierra A4 también en la ficha del coach: sin este fix, «sin PR en modo tiempo» sería cierto en el motor
(`pr-detect.ts:48-57` exige `reps_done > 0`) y falso en la RPC.

### 2.2 Cuerpo VIGENTE de la función (LIVE, `pg_get_functiondef`)

```sql
SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'get_client_exercise_prs';
```

Resultado (2026-09-10), copiado íntegro:

```sql
CREATE OR REPLACE FUNCTION public.get_client_exercise_prs(p_client_id uuid)
 RETURNS TABLE(exercise_id uuid, name text, muscle_group text, max_weight_kg numeric, reps_at_max integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (COALESCE(wb.exercise_id, wl.exercise_id))
    COALESCE(wb.exercise_id, wl.exercise_id) AS exercise_id,
    COALESCE(e.name, 'Ejercicio')            AS name,
    COALESCE(e.muscle_group, '—')            AS muscle_group,
    wl.weight_kg                             AS max_weight_kg,
    COALESCE(wl.reps_done, 0)                AS reps_at_max
  FROM public.workout_logs wl
  LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
  LEFT JOIN public.exercises  e  ON e.id  = COALESCE(wb.exercise_id, wl.exercise_id)
  WHERE wl.client_id = p_client_id
    AND wl.weight_kg IS NOT NULL
    AND wl.weight_kg > 0
    AND COALESCE(wb.exercise_id, wl.exercise_id) IS NOT NULL
  ORDER BY COALESCE(wb.exercise_id, wl.exercise_id), wl.weight_kg DESC, wl.logged_at DESC, wl.id DESC;
END;
$function$
```

ACL vigente (`p.proacl`): `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` —
**`anon` no tiene EXECUTE** y así debe quedar. `CREATE OR REPLACE` preserva la ACL; los `REVOKE`/`GRANT`
de la migración son cinturón, no cambio.

### 2.3 Migración completa (copiable)

```sql
-- Cuenta atras en pantalla (specs/cuenta-atras-en-pantalla, R4 / A4): get_client_exercise_prs deja de
-- tratar una serie SIN repeticiones como record del ejercicio. Cuerpo copiado VERBATIM de LIVE con
-- pg_get_functiondef(oid) el 2026-09-10; el UNICO cambio es la linea marcada CAMBIO 1.
-- Motivo: con FUERZA POR TIEMPO (reps_unit='sec') el log lleva reps_done NULL y actual_hold_sec, y sin
-- este filtro un wall sit de 20 kg aparece como "20 kg x 0 reps". Ademas corrige un caso PREEXISTENTE:
-- 617 filas (25 alumnos) con peso y sin reps; 72 pares (alumno, ejercicio) encabezados hoy por una de
-- ellas (48 de esos pares no tienen ninguna serie valida del ejercicio y dejan de listarse).
-- Alinea la funcion con sus tres hermanas: get_client_strength_series, get_client_weekly_prs y
-- get_client_daily_tonnage ya exigen reps > 0.
-- Rollback documentado: re-aplicar en un archivo NUEVO el cuerpo previo (sin la linea CAMBIO 1),
-- disponible en DATA-TESTING.md 2.2 de esta spec. No toca filas ni ACL.

CREATE OR REPLACE FUNCTION public.get_client_exercise_prs(p_client_id uuid)
 RETURNS TABLE(exercise_id uuid, name text, muscle_group text, max_weight_kg numeric, reps_at_max integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (COALESCE(wb.exercise_id, wl.exercise_id))
    COALESCE(wb.exercise_id, wl.exercise_id) AS exercise_id,
    COALESCE(e.name, 'Ejercicio')            AS name,
    COALESCE(e.muscle_group, '—')            AS muscle_group,
    wl.weight_kg                             AS max_weight_kg,
    COALESCE(wl.reps_done, 0)                AS reps_at_max
  FROM public.workout_logs wl
  LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
  LEFT JOIN public.exercises  e  ON e.id  = COALESCE(wb.exercise_id, wl.exercise_id)
  WHERE wl.client_id = p_client_id
    AND wl.weight_kg IS NOT NULL
    AND wl.weight_kg > 0
    -- CAMBIO 1: una serie sin repeticiones no es un record (fuerza por tiempo escribe reps_done NULL).
    AND wl.reps_done IS NOT NULL
    AND wl.reps_done > 0
    AND COALESCE(wb.exercise_id, wl.exercise_id) IS NOT NULL
  ORDER BY COALESCE(wb.exercise_id, wl.exercise_id), wl.weight_kg DESC, wl.logged_at DESC, wl.id DESC;
END;
$function$;

-- ACL: CREATE OR REPLACE la preserva; se re-afirma para dejarla explicita en el archivo.
REVOKE ALL ON FUNCTION public.get_client_exercise_prs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_exercise_prs(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_exercise_prs(uuid) IS
  'Record de peso por ejercicio del alumno. Solo considera series con reps_done > 0: las series por TIEMPO (reps_unit=sec, actual_hold_sec) no son record de peso (A4 de specs/cuenta-atras-en-pantalla).';
```

### 2.4 Dry-run, verificación y rollback

```sql
BEGIN;
-- … CREATE OR REPLACE de §2.3 …
-- Comparación contra el snapshot del paso 0, con un client_id de PRUEBA (persona E2E), nunca uno real:
SELECT count(*) AS filas, count(*) FILTER (WHERE reps_at_max <= 0) AS con_cero
  FROM public.get_client_exercise_prs('<client_id de prueba>');
ROLLBACK;
```

Criterio de salida: `con_cero = 0` y `filas > 0`. Rollback en producción: archivo nuevo con el cuerpo
de §2.2 verbatim (sin CAMBIO 1) + los mismos `REVOKE`/`GRANT`. No toca filas.

### 2.5 Fix de cliente hermano (C1) — `api/pr-card`

`apps/web/src/app/api/pr-card/route.tsx:77-87` arma la curva de la tarjeta de PR con
`.select('weight_kg, logged_at') … .not('weight_kg','is',null)` — **sin filtro de reps**, con el cliente
admin. Es el mismo agujero fuera de la RPC. Cambio de una línea (W4):

```ts
.not('weight_kg', 'is', null)
.gt('reps_done', 0)      // ← una serie por TIEMPO no entra a la curva de PR (A4)
```

Sin él, el peso de un hold de fuerza entraría en la tarjeta compartible y el fix SQL quedaría a medias.

---

## 3. Contrato TS/Zod copiable

Orden de aplicación dentro de W0/W1: **schemas → plan-builder → motor puro → consumidores**.

### 3.1 `packages/schemas/workout.ts` (3 diffs)

**(a) `REPS_UNIT_VALUES` (`:64`)** — el doc `:58-63` se declara «superset EXACTO del CHECK
`workout_blocks_poly_check`»: si M1 amplía el CHECK y esto no, Zod rechaza lo que la DB acepta.

```ts
/**
 * Unidades del conteo prescrito (`workout_blocks.reps_unit`). 'jumps' (saltos) y 'floors' (pisos)
 * entran en la Fase C de cardio (specs/cardio-ejes-y-fixes, RF8). 'sec' entra con FUERZA POR TIEMPO
 * (specs/cuenta-atras-en-pantalla, D3): el bloque sigue siendo `strength` y `duration_sec` lleva el
 * objetivo del hold. Superset EXACTO del CHECK `workout_blocks_poly_check` ampliado por las
 * migraciones 20260725221804 y <ts1>_workout_blocks_reps_unit_sec — sin esto Zod rechazaría un
 * bloque que la DB sí acepta.
 * OJO: `LOAD_UNIT_VALUES` (:56) también tiene 'sec' y NO es lo mismo — ahí es unidad de CARGA.
 */
export const REPS_UNIT_VALUES = ['reps', 'passes', 'breaths', 'jumps', 'floors', 'sec'] as const
```

**(b) `WorkoutLogSetSchema.metadata` (`:301-320`)** — Zod v4 **estripa** las claves no declaradas; el
propio archivo lo documenta en `:293-296` («sin ellas el skip se persistía como `metadata: {}`»). Sin
este diff, `hold_source` muere en `workout-log.actions.ts:96` (`safeParse`) y la métrica de adopción
del reloj (§8) sería siempre `null` en web y llena en RN (que escribe directo a PostgREST,
`apps/mobile/lib/workout-session.ts:974`).

```ts
            left_reps: z.coerce.number().int().min(0).max(9999).nullable().optional(),
            right_reps: z.coerce.number().int().min(0).max(9999).nullable().optional(),
            // ── Origen del hold (specs/cuenta-atras-en-pantalla, A3/R19) ──
            // 'timer'  = el reloj llegó a 0 solo y el auto-envío guardó (V2).
            // 'manual' = «Listo» antes de 0 (A2), tipeo en la fila/keypad, o edición del valor guardado.
            // Ausente  = log ANTERIOR a este tren ⇒ desconocido, NUNCA se lee como 'manual'.
            // Va declarada acá porque Zod v4 estripa lo no declarado (mismo motivo que skipped/skip_reason).
            hold_source: z.enum(['timer', 'manual']).nullable().optional(),
            skipped: z.boolean().nullable().optional(),
            skip_reason: z.string().trim().max(40).nullable().optional(),
```

**(c) `WorkoutBlockSchema.superRefine` (`:163-175`)** — hoy solo valida cardio. R11 fija 5–600 s como
validación **dura** (UI + Zod). El schema no conoce el tipo efectivo, pero sí `reps_unit`, así que la
regla es expresable sin tocar cardio ni movilidad:

```ts
}).superRefine((block, ctx) => {
    if (block.exercise_type_override === 'cardio') {
        if (!isCardioBlockComplete(block)) {
            ctx.addIssue({ code: 'custom', message: 'Un bloque cardio necesita duración, distancia o intervalos', path: ['duration_sec'] })
        }
    }
    // FUERZA POR TIEMPO (D3/R11): el modo se declara con reps_unit='sec' y exige un objetivo real.
    // Rango 5..600 s = el del mockup aprobado; fuera de ahí el bloque no se guarda (validación dura).
    // No afecta a movilidad/roller/cardio: ellos NUNCA escriben reps_unit='sec'.
    if (block.reps_unit === 'sec') {
        const d = block.duration_sec
        if (d == null || d < 5 || d > 600) {
            ctx.addIssue({ code: 'custom', message: 'Una serie por tiempo va entre 5 y 600 segundos', path: ['duration_sec'] })
        }
    }
})
```

Sin cambio: `reps` (`:128`, `min(1)` — el espejo legacy sigue siendo obligatorio), `duration_sec`
(`:156`, ya acepta 0..86400), `reps_done` (`:265`, ya opcional), `actual_hold_sec` (`:279`).

### 3.2 `packages/plan-builder/` — tipos y limpieza por modo

**`types.ts:22`:**

```ts
export type RepsUnit = 'reps' | 'passes' | 'breaths' | 'jumps' | 'floors' | 'sec'
```

**`block-type-fields.ts`** — `POLYMORPHIC_BLOCK_FIELDS:29-40` ya incluye `duration_sec`, `reps_value` y
`reps_unit`, así que **cambiar de tipo ya limpia el modo tiempo solo**; y `SHARED_BLOCK_FIELDS:48-55`
garantiza que `sets`, `rest_time`, `side_mode`, `superset_group`, `notes` e `instructions` sobrevivan
(D3). El hueco es el toggle **dentro** de fuerza: `stripFieldsForType:110-114` corta con
`if (currentType === newType) return block`. Export nuevo, hermano:

```ts
/**
 * Toggle «Reps | Segundos» DENTRO de fuerza (D3). `stripFieldsForType` no cubre este caso porque el
 * tipo no cambia (:112). Regla R32 del archivo (:13-17): SIEMPRE `null` explícito, nunca `undefined`
 * — el serializador RN solo pisa una columna si el campo está DEFINIDO.
 * NO toca sets / rest_time / warmup_rest_time / target_weight_kg / rir / tempo / side_mode /
 * superset_group / section (D3: el modo tiempo conserva toda la prescripción de fuerza).
 */
export function stripFieldsForStrengthMode(
  block: BuilderBlock,
  mode: 'reps' | 'sec',
  durationSec?: number | null,
): BuilderBlock
// mode === 'sec'  ⇒ { duration_sec: n, reps_unit: 'sec',
//                     progression_mode: block.progression_mode === 'double' ? 'weekly_linear' : block.progression_mode }
// mode === 'reps' ⇒ { duration_sec: null, reps_unit: null }
```

**`reps_value` NO se escribe como espejo** (R3): r3 §9 gap 4 declara que no verificó consumidores y
`git grep reps_value` (25 hits) son builders/mappers/serializadores sin agregación aritmética. Sin
evidencia, no se escribe. El único espejo obligatorio es `reps` (NOT NULL de hecho,
`packages/schemas/workout.ts:128`) = `compactDuration(duration_sec) + sideSuffix(side_mode)` ⇒ `"30s"`,
`"30s/lado"`, `"1m30s"`.

### 3.3 `set-log-payload.ts` — `buildStrengthTimePayload` (firma canónica)

```ts
/**
 * Payload de una serie de FUERZA POR TIEMPO (D3/R2). Hermano de `buildStrengthPayload` (:250-281),
 * que NO se toca: está congelado por 30+ asserts de paridad byte-idéntica
 * (`set-log-payload.strength-side.test.ts`, `set-log-payload.per-side.test.ts`,
 * `executor-mapping.parity.test.ts:290-330`).
 *
 * Por qué no `buildTypedPayload` (:174-210): fuerza `weightKg: null` (:191) y `rir: null` (:199) —
 * borraría el disco de la plancha y el esfuerzo. Es la misma razón de R18 en `keypad-flow.ts:61-68`.
 *
 * Contrato de columnas (R2):
 *   weight_kg           = KG del tile (null = peso corporal)
 *   reps_done           = null SIEMPRE (nunca 0: `0` contaría como serie de 0 reps en 4 RPC)
 *   actual_hold_sec     = segundos sostenidos; en `per_side` (y SOLO ahí, `holdSidesFor` §3.3.a)
 *                         = SUMA izq + der. `alternating` captura UN lado, como movilidad hoy.
 *   actual_duration_sec = null (es el eje de cardio/roller: usarlo metería el hold en
 *                         `totalCardioDurationSec`, session-summary.ts:251)
 *   metadata            = { left_sec?, right_sec?, hold_source? } — la key SOLO aparece si hay lados
 *                         o `holdSource` (misma convención byte-idéntica de :279)
 */
export function buildStrengthTimePayload(
  values: Record<string, string>,        // keys: weight, actual_hold_sec | hold_left_sec + hold_right_sec, rpe, rir, note
  blockId: string,
  setNumber: number,
  ctx?: { sideMode?: string | null; holdSource?: HoldSource | null },
): OptimisticLogPayload
```

La lectura de los segundos reusa la **misma** lógica que movilidad per_side
(`set-log-payload.ts:121-129`): dos lados ⇒ `hold_left_sec` + `hold_right_sec` → `{left_sec, right_sec}`
y suma; un lado ⇒ `int(values.actual_hold_sec)`. Las keys del keypad son las mismas de movilidad
(`typed-keypad.ts:101-105`) para que el motor las lea con una sola rama. Tile de unidad: **«SEG»**.

#### 3.3.a Cuántos lados captura un hold: **`holdSidesFor(sideMode)`**, una sola regla (H7)

Hoy `alternating` se captura **distinto según el eje**, y eso es un choque real si el SDD no lo fija:

| Eje | Qué hace `alternating` hoy | Evidencia |
|---|---|---|
| **Hold de movilidad** | **un solo lado** (`['single']`, caja única `actual_hold_sec`) | `apps/mobile/components/alumno/workout/v3/typed-screen-model.ts:146-148` (`mobilitySides`: dos lados **solo** si `per_side`); `packages/workout-engine/typed-keypad.ts:100-105` (la rama de dos cajas es `if (sideMode === 'per_side')`); `set-log-payload.ts:121` (`if (sideMode === 'per_side')`) |
| **Reps de fuerza** | **dos lados** (Izq/Der) | `set-log-payload.ts:261` (`sideMode === 'per_side' \|\| sideMode === 'alternating'`); web `LogSetForm.tsx:357` (`perSideReps`) |

**Regla única del tren, resuelta por el jefe en R34 (nombre canónico `holdSidesFor`, manda sobre
cualquier lectura suelta de un mapa):** para holds (movilidad **y** fuerza por tiempo) `per_side` ⇒
`['left','right']`; `alternating` y `null` (y `bilateral`) ⇒ `['single']`. `alternating` captura **un
lado**, una caja, `actual_hold_sec` directo, **sin** `left_sec`/`right_sec` en `metadata`. Es
exactamente lo que hace movilidad hoy (0 diff para ella) y es lo que dice OUTLINE R2 («suma L+R en
`per_side`», nada de `alternating`). **Fuerza clásica no cambia**: en el eje de **reps**,
`alternating` sigue capturando dos lados como hoy (`buildStrengthPayload` está congelado, T5).

Para que la regla no viva copiada en tres lugares, se expresa **una vez** en el motor y la consumen
todos:

```ts
// packages/workout-engine/set-log-payload.ts (exportado por el barrel, §3.8)
/**
 * Lados que captura un HOLD (movilidad y fuerza por tiempo) — R34, nombre canónico del tren.
 * `per_side` ⇒ ['left','right'] (dos cajas y desglose en `metadata`);
 * `alternating` / `bilateral` / null ⇒ ['single'] (una sola caja `actual_hold_sec`).
 * H7: `alternating` NO es por lado para el eje TIEMPO, aunque SÍ lo sea para el eje reps de fuerza
 * (`set-log-payload.ts:260`, `LogSetForm.tsx:357`) — ver la tabla de arriba.
 * Fuente única: `typedLogValues`, `keypadStepsForTarget`, `use-hold-module`, `HoldModuleV3`
 * (RN y web) y `mobilitySides` la consumen; nadie compara `sideMode` a mano.
 */
export function holdSidesFor(sideMode: string | null | undefined): ('single' | 'left' | 'right')[] {
  return sideMode === 'per_side' ? ['left', 'right'] : ['single']
}
```

El retorno es un **array de lados** (no un enum de conteo): las UIs iteran los lados para pintar las
cajas y el hook de módulo lo usa como secuencia (`left` → `right`), así que devolver la lista evita
que cada consumidor la reconstruya.

Consumidores obligatorios (si alguno queda comparando a mano, el drift vuelve): `typedLogValues`
(`set-log-payload.ts:121`) · `buildStrengthTimePayload` (nuevo) · `typedKeypadFields`/`keypadStepsForTarget`
(`typed-keypad.ts:100`, W1.7) · `use-hold-module` (W3.2) · `mobilitySides`
(`typed-screen-model.ts:146-148`, que pasa a delegar y queda byte-idéntica) · la rama de movilidad de
`LogSetForm` (`:1912-1930`, W4).

**Pruebas obligatorias (R34):** test unitario del helper en **W1** (`W1.T2` casos a) y **assert de
paridad web ↔ RN** con `alternating` — la columna `alternating` de §5.4 y el archivo
`packages/workout-engine/superset-holds.parity.test.ts` (`W1.T16`). Es el par que impide la asimetría
de hoy (RN pediría una caja y la web dos sobre la misma serie, §9 T17).

#### 3.3.b `hold_source` en **movilidad y roller** también: `buildTypedPayload` tiene que poder escribirlo (F1)

Sin este punto, **ningún wave escribe `hold_source` en movilidad** y CA-28 sería falso, CA-84 y la
consulta de adopción de §8.2 ciegas justo para el caso canónico (los 32 holds de movilidad de Movens,
STATS). Verificado en el código:

- `typedLogValues` define `metadata` **solo** en la rama `per_side` de movilidad
  (`set-log-payload.ts:120-128`); bilateral no la define nunca (`:129`).
- `TypedPayloadContext` (`:145-152`) conoce **únicamente** `hrMetadata`; `buildLogMetadata`
  (`:165-170`) mezcla **solo** `hr` sobre los lados, y `buildTypedPayload` lo llama en `:187`.
- RN escribe `metadata` **solo si viene en el payload** (`apps/mobile/lib/workout-session.ts:974`:
  `if (payload.metadata != null) logData.metadata = payload.metadata`).
- La web, en la rama de movilidad, escribe `metadata` **solo si hay lados** y la **borra** si no
  (`LogSetForm.tsx:1928-1929`: `else formData.delete('metadata')`); el camino bilateral ni siquiera
  entra a ese `if (perSide)` (`:1912`).

Diff mínimo, en tres waves:

1. **W1 (motor).** `TypedPayloadContext` gana `holdSource?: HoldSource | null` (hermano de
   `hrMetadata`), y `buildLogMetadata` lo mezcla **igual que `hr`**:

   ```ts
   export interface TypedPayloadContext extends TypedKeypadContext {
     hrMetadata?: HrMetadataV1 | null
     /**
      * Quién cerró el hold (specs/cuenta-atras-en-pantalla, R19). Se persiste en `mobility` y en
      * `roller`; **cardio no** (su eje es `actual_duration_sec`, no un hold, y CA-14 lo congela).
      * En `roller` es SIEMPRE `'manual'`: R12 lo deja fuera del tren, así que no tiene reloj y su
      * duración/pasadas se escriben a mano — pero la métrica de §8.2 tiene que ser **una sola**
      * (DECISIONS-2 DATA-2), no «holds con marca y holds sin marca según el tipo».
      * SIN esta key el payload es byte-idéntico al previo (misma garantía que `hrMetadata`).
      */
     holdSource?: HoldSource | null
   }

   function buildLogMetadata(
     side: WorkoutLogSideMetadata | null | undefined,
     hr: HrMetadataV1 | null,
     holdSource: HoldSource | null,      // ← nuevo, mismo patrón que `hr`
   ): WorkoutLogMetadata | null | undefined {
     if (hr == null && holdSource == null) return side
     return { ...(side ?? {}), ...(hr != null ? { hr } : {}), ...(holdSource != null ? { hold_source: holdSource } : {}) }
   }
   ```

   En `buildTypedPayload` (`:187`): `buildLogMetadata(v.metadata, mode === 'cardio' ? contextHrMetadata(ctx) : null, mode === 'cardio' ? null : contextHoldSource(ctx))`.
   Efecto: **movilidad bilateral con `holdSource` gana `metadata: { hold_source }`** (hoy no gana la
   key), `per_side` gana la tercera clave junto a los lados y **roller** gana `{ hold_source:
   'manual' }` — un solo escritor del jsonb, T3 respetada.
2. **W3 (RN).** `use-hold-module` pasa el contexto como **objeto** `{ sideMode, holdSource }` (no el
   3.er argumento `string` histórico) al llamar `buildTypedPayload` en el commit de movilidad; el
   camino manual (tipeo en el keypad) pasa `holdSource: 'manual'`. **Roller** (`RollerScreenV3.tsx`)
   no gana reloj (R12): su commit pasa `holdSource: 'manual'` fijo, sin ninguna otra rama.
3. **W4 (web).** La rama de movilidad de `LogSetForm` (`:1912-1930`) deja de estar condicionada a
   `perSide` para la escritura de `metadata`: arma `{...lados, hold_source}` con `typedLogValues` +
   el `source` de `holdPrefill` y hace **un solo** `formData.set('metadata', …)`; el `delete` de
   `:1929` queda solo para el caso «sin lados **y** sin `hold_source`». `collectMetadata` (`:1933`)
   amplía su tipo de retorno a `{ left_sec?, right_sec?, hold_source? }`.

**Test obligatorio (W1.T2 y §6.4):** con `ctx` **sin** `holdSource`, `buildTypedPayload` en los tres
modos devuelve un objeto **byte-idéntico** al de hoy (la key `metadata` no aparece en bilateral) —
es la misma garantía que protege a los 30+ asserts de paridad. Y con `mode: 'roller'` +
`holdSource: 'manual'` ⇒ `metadata: { hold_source: 'manual' }`; con `mode: 'cardio'` + `holdSource`
⇒ la key **no** aparece (cardio no se toca, CA-14).

`HoldSource` vive en `session-logs.reconcile.ts` (junto a `WorkoutLogSideMetadata:13-24`), **no** solo
en el schema: RN escribe directo a PostgREST sin pasar por Zod (`workout-session.ts:974`), así que el
tipo TS es la única barrera de ese lado.

```ts
// packages/workout-engine/session-logs.reconcile.ts
export type HoldSource = 'timer' | 'manual'
export interface WorkoutLogSideMetadata {
  left_sec?: number | null
  right_sec?: number | null
  left_reps?: number | null
  right_reps?: number | null
  /** Quién cerró el hold. Ausente = log anterior al tren (desconocido, NUNCA 'manual'). */
  hold_source?: HoldSource | null
}
```

`session-logs.optimistic.ts:58` y `reconcileSessionLogs:183` ya copian `metadata` íntegro ⇒
`hold_source` viaja por la cola, el optimismo y el reconcile **con 0 diff**.

### 3.4 `hold-autolog.ts` — `decideHoldAutolog` (motor puro, OUTLINE §4 verbatim)

```
// packages/workout-engine/hold-autolog.ts (PURO)
HoldEndReason = 'expired' | 'done-early' | 'paused' | 'restart'
decideHoldAutolog({ reason, elapsedSec, prescribedSec, side: 'single'|'left'|'right', context: 'solo'|'superset',
                    closesRound, expiredWhileAway }) → {   // ← R27: el campo se llama así, no `viaAppState`
  fillSeconds: number|null,           // expired ⇒ prescribedSec; done-early ⇒ min(elapsed, prescribed); paused ⇒ elapsed; restart ⇒ null
  submit: boolean,                    // true si (expired|done-early) y side ∈ {single,right}; false en left, paused, restart, elapsed<=0
  holdSource: 'timer'|'manual'|null,  // expired ⇒ 'timer'; done-early ⇒ 'manual'; resto null
  advanceSide: boolean,               // side==='left' && reason∈{expired,done-early}
  autoStartNextSide: boolean,         // advanceSide && !expiredWhileAway (R6 + R27)
  advance: 'next-member'|'stay',      // superset && submit && !closesRound ⇒ 'next-member' (V4); resto 'stay' (V3, D2)
}
// El motor NUNCA arranca descansos. La UI decide: pref D5 ON ⇒ startRest; OFF ⇒ CTA «Descansar N s» / «Ronda lista · Descansar N s».
```

**`expiredWhileAway` se DERIVA de evidencia, nunca del emisor (R27; regla canónica en `SPEC.md` §6.3).**
El campo `viaAppState` del OUTLINE §4 queda **retirado** del contrato: leer «quién disparó el fin»
miente, porque los dos caminos a `triggerDone` compiten y gana el primero — en RN el tick del
intervalo (`apps/mobile/components/alumno/workout/v3/timing.ts:63-68`) puede correr antes que el
listener de `AppState` (`:73-79`, mismo `triggerDone` de disparo único `:50-56`), y en web el
`setInterval` de `useExecCountdown.ts:71-83` no se congela en pestaña oculta, solo se *throttlea*
(el `visibilitychange` de `:89-99` llega después). Regla, evaluada **dentro** de `triggerDone` con el
fin absoluto que ya existe (RN `timing.ts:59-60`, `endRef`; web `useExecCountdown.ts:73`, `endTimeRef`):

```
expiredWhileAway :=
     (Date.now() - endAtMs) > 1500                  // el fin quedó atrás más de un tick largo
  || AppState.currentState !== 'active'             // RN
  || document.visibilityState !== 'visible'         // web
```

**`prime(seconds)` en los dos hooks (R27, aditivo).** Hoy `restart()` **siempre arranca**: RN
`timing.ts:88-96` hace `setStarted(true); setRunning(true)`, y la web documenta lo mismo
(`useExecCountdown.ts:30-32`, «Reinicia a `seconds` y arranca»). Con eso no hay forma de dejar el
lado derecho *armado y quieto*, que es justo lo que pide R6 cuando `expiredWhileAway = true`
(«Iniciar lado derecho»). `prime(seconds)` deja el reloj en `idle` con el objetivo cargado y **sin**
arrancar (`started = false`, `running = false`, `remaining = seconds`, `firedRef = false`);
`restart` **no cambia** de comportamiento para no tocar a sus llamadores actuales
(`MobilityStepV3.tsx:89`, `CardioStepV3.tsx:444`). Los hooks exponen además `endAtMs` para que
`triggerDone` pueda calcular la regla de arriba.

Reglas fijas que acompañan al motor (OUTLINE §4): idempotencia por
`(client_id, block_id, set_number, día-Santiago)` — índice único **verificado en LIVE**:

```
CREATE UNIQUE INDEX workout_logs_one_set_per_day
  ON public.workout_logs USING btree (client_id, block_id, set_number, eva_santiago_day(logged_at))
```

más `savedRef` por `block:set:side` en la pantalla (s2 §2.3); el avance de miembro se dispara tras
aplicar el optimismo **síncrono** (`workout-session.ts:923-926`), nunca tras el `await` de red;
`per_side` = **una sola fila** por serie (`actual_hold_sec = L+R`, lados en `metadata`); `hold_source`
viaja **siempre** en el mismo objeto que los lados (el UPDATE reemplaza el jsonb entero,
`workout-log.actions.ts:150-156`); **cardio no se toca**.

`decideHoldAutolog` **reusa** el acumulador de `cardio-autolog.ts:84-116`
(`createCardioElapsed`/`start`/`pause`/`read`/`reset`), que es tipo-agnóstico y cuenta por reloj de
pared: **no se duplica** (r3 §4.10). El tope `min(elapsed, prescribedSec)` es el mismo de
`cardio-autolog.ts:64-68`.

### 3.5 `workout-exercise-type.ts` — predicado y formatos

```ts
export const STRENGTH_TIME_REPS_UNIT = 'sec' as const

/**
 * Fuente ÚNICA del modo «fuerza por tiempo» (R3). Nadie compara `reps_unit === 'sec'` a mano.
 * El AND es obligatorio: en LIVE hay 2 bloques strength con `duration_sec` (600 y 120) y
 * `reps_unit NULL` (residuo de un cambio de tipo). Con un OR, esos 2 alumnos verían un reloj
 * de 10 min y 2 min en un ejercicio de fuerza. Test que congela el caso: §6.1 (H8).
 */
export function isStrengthTimeBlock(
  block: TypedBlockFields,
  exercise?: { exercise_type?: string | null } | null,
): boolean {
  return effectiveExerciseType(block, exercise) === 'strength'
    && block.reps_unit === STRENGTH_TIME_REPS_UNIT
    && (block.duration_sec ?? 0) > 0
}

/** Objetivo del header: "3 × 30s" / "3 × 30s por lado". `formatTypedObjective:141` no tiene rama strength. */
export function formatStrengthTimeObjective(block: TypedBlockFields): string
```

Además, la rama strength de `legacyRepsSummaryFor` (`:184-189`) necesita **una línea antes** del
`if (block.reps?.trim())` de `:185`: si el bloque está en modo tiempo, manda el objetivo por tiempo y
no el texto viejo del coach (sin esto, un bloque que pasó de Reps a Segundos sigue diciendo «8-12» en
toda la app). `typedBlockSummary:197-217` **no se toca**: con `reps = "30s"` la rama `:202` ya produce
`"3×30s"`.

**Colapsar la copia web:** `apps/web/src/lib/workout-exercise-type.ts:80-89` y `:133-152` reimplementan
`hasTypedPrescription` y `typedBlockSummary` línea por línea. El mismo archivo ya resolvió este drift
re-exportando `legacyRepsSummaryFor` del motor (`:126`). Se re-exportan las cuatro
(`hasTypedPrescription`, `typedBlockSummary`, `isStrengthTimeBlock`, `formatStrengthTimeObjective`) o
el drift está garantizado.

`logged-set-summary.ts`: **no tocar** `if (kind === 'strength') return null` (`:154`, es el interruptor
que deja a cada superficie elegir su render de fuerza, doc `:167-171`). Export nuevo hermano de
`formatStrengthSetLine:176-182`:

```ts
/** "10 kg × 30 s" · "10 kg × 30 s por lado" · "10 kg × Izq. 30 s · Der. 25 s" · "30 s" · null. */
export function formatStrengthTimeSetLine(log: LoggedSetLike): string | null
```

Convención tipográfica única (R11): `30s` (sin espacio) **solo** en chips ≤ 20 chars vía
`compactDuration:98-109`; `30 s` (con espacio) en líneas largas y resúmenes. Resumen de prescripción:
`3 × 30 s · 10 kg`.

### 3.6 Preferencia D5 — `readAutoRestPref` / `resolveAutoRestDefault` (R1, pura)

Claves (per-alumno, storage local con el `clientId` **en la clave**, sin tabla ni RLS nueva):
`eva:exec-autorest-v1:<clientId>` y `eva:exec-autorest-seen-v1:<clientId>`, valores `'1'`/`'0'`
(carril `exec-settings`, `apps/mobile/.../v3/exec-settings.ts:55-58` y web `v3/exec-settings.ts:34-46`).
La clave vieja `omni_autotimer` (`String(boolean)`, RN `timers/rest-timer-preferences.ts:37,94`; web
`rest-timer-preferences.ts:12` + `WorkoutExecutionClient.tsx:1222-1227`) **solo se lee** para migrar.

```ts
/**
 * Estrategia del default, UNA sola constante en `auto-rest-pref.ts` (RN y web), R25.
 * D5 dice literalmente «Por defecto APAGADA»; R1 fija ON para quien ya tiene historial. La
 * divergencia está declarada en el SPEC (CA-70b) con su pregunta Q1 al owner, y se aísla acá: si el
 * owner responde «OFF global», el cambio es ESTA línea, no código ni QA (los pasos 3 y 4 colapsan
 * en OFF). La variante 'off' entra como FILA DEL TEST de cohortes (W1.T4), nunca como rama muerta.
 */
export const AUTOREST_DEFAULT_STRATEGY: 'cohort' | 'off' = 'cohort'

/**
 * PURA y testeable: decide el valor inicial de la preferencia «Pasar solo al descanso» (D5/R1/R25).
 * Prioridad:
 *   1. clave nueva presente        ⇒ su valor
 *   2. `omni_autotimer` presente   ⇒ migración de lectura (`raw !== 'false'`)
 *   3. sin clave y CON historial   ⇒ true  (es lo que vive hoy la base: cero regresión)
 *   4. sin clave y SIN historial   ⇒ false (primer entreno: D5 literal, y sale el modal)
 * Con `strategy === 'off'` los pasos 3 y 4 colapsan en **false** (1 y 2 no cambian: una preferencia
 * ya elegida por el alumno manda sobre cualquier default).
 * `storageAvailable === false` (modo privado / AsyncStorage roto) ⇒ fail-safe: devuelve el valor de
 * cohorte y `showModal:false` (un modal repetido es hostigamiento, §9 T8).
 *
 * OJO con `hasHistory` — ver §3.6.a: NO es «tiene historial en este plan», es
 * `!resolveShowAutoRestModal(...)`. Con la definición ingenua (las 3 señales del bundle) un veterano
 * con mesociclo nuevo caería en la cohorte 4 y quedaría OFF **sin haber decidido nada**: exactamente
 * la regresión que R1/§9 T9 mandan evitar.
 */
export function resolveAutoRestDefault(input: {
  storedNew: string | null
  storedLegacy: string | null
  hasHistory: boolean
  storageAvailable: boolean
  strategy: 'cohort' | 'off'          // ← R25: llega desde AUTOREST_DEFAULT_STRATEGY, no se lee dentro
}): { enabled: boolean; source: 'stored' | 'legacy' | 'cohort-history' | 'cohort-first' | 'strategy-off' }

/** Lectura efectiva desde la caché de la plataforma (envoltura NO pura, síncrona — R36). */
export function readAutoRestPref(input: { clientId: string; hasHistory: boolean }): boolean
export function writeAutoRestPref(input: { clientId: string; enabled: boolean }): void
/** Hidratación única desde el storage, al montar el ejecutor con `clientId` (R36). */
export function hydrateAutoRestPref(input: { clientId: string; hasHistory: boolean }): Promise<void>
```

**R36 · `readAutoRestPref` es SÍNCRONA, con caché hidratada una vez.** La decisión de descanso corre
**antes** del `await` de red y así tiene que seguir: `ExecutorV3.tsx:748-754` documenta explícitamente
«Decisión de descanso — SÍNCRONA, ANTES del await de red (QA: flash de la próxima serie)». Un
`readAutoRestPref` que devolviera una promesa metería un `await` justo ahí y traería de vuelta el bug
de los frames con la próxima serie a la vista. La disciplina es la **misma** que ya usa
`apps/mobile/components/alumno/workout/timers/rest-timer-preferences.ts`: un objeto `cache` en memoria
(`:40-54`) con `hydrated` (`:55`), hidratación al montar y escritura **optimista** (se pisa la caché y
después se persiste), más los `listeners` que ya sincronizan la tuerca (`:57-58`). Reglas del tren:

- **Una hidratación por sesión de ejecutor**, disparada al montar con el `clientId` ya resuelto.
  Antes de hidratar la caché vale el default de cohorte, igual que hoy vale `autoTimer: true`.
- **Escritura optimista**: `writeAutoRestPref` actualiza la caché y emite a los suscriptores en el
  mismo tick; la persistencia (AsyncStorage / `localStorage`) va después y si falla no revierte la UI.
- **Web: la verdad vive en `WorkoutExecutionClient`**, no en `LogSetForm`. El orquestador mantiene el
  estado y lo baja como prop **`autoTimerEnabled`** a `LogSetForm` (que es donde hoy se consulta la
  preferencia, `:662` y `:2034`). Sin esto habría una lectura de storage por fila montada y dos
  fuentes de verdad en la misma pantalla.

**Los «4 puntos» de R1, corregidos con el código (tabla canónica, espejo de `SPEC.md` §11.1).** No son
cuatro lecturas equivalentes: `grep -rn isRestAutoTimerEnabled apps/web/src` ⇒ **0 resultados**, en la
web **no** existe ese lector. Los puntos **reales** son **3** (2 en RN + el estado web):

| Plataforma | Puntos **reales** de lectura | Qué se hace en W5 |
|---|---|---|
| **RN** | **2**: `ExecutorV3.tsx:762` (superserie) y `:822` (bloque suelto), vía `isRestAutoTimerEnabled()` (importado en `:86`) | Se reemplazan por `readAutoRestPref({ clientId, hasHistory })` |
| **Web** | **1**: el estado `const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)` + su lectura de `omni_autotimer` en `WorkoutExecutionClient.tsx:1222-1227`, que baja como **prop** `autoTimerEnabled` (declarada en `LogSetForm.tsx:144`, default `true` en `:330` y `:1667`) | Ese estado pasa a `resolveAutoRestDefault` + `clientId`; la prop y su cableado **no cambian de nombre** |
| **Web · consumidores de la prop** | `LogSetForm.tsx:662` — **fila de FUERZA** (`StrengthLogSetForm`, abre en `:316`), dentro de `buildRest()` — y `:2034` — **fila TIPADA** (`TypedLogSetRow`, abre en `:1660`) | **No** son puntos de preferencia: **consumen la prop `autoTimerEnabled`, no leen storage**. Solo cambia la **semántica de `cancelRest`** (CA-80). `LogSetForm` **no** recibe ni necesita `clientId` |

> ⚠ Las etiquetas «fila tipada» / «fila de fuerza» estaban **invertidas** en el borrador: `:662` es
> **fuerza** y `:2034` es **tipada**. La corrección vale para los cuatro archivos del SDD.

La preferencia gobierna **solo** el arranque del cronómetro de descanso, en esos 3 puntos reales.
**Nunca** gobierna el avance de paso ni el avance de miembro (V4). Cambio de comportamiento declarado
(R1): con la pref OFF **ya no se cancela** un descanso que el alumno arrancó a mano — hoy
`LogSetForm.tsx:662` (fuerza) y `:2034-2036` (tipada) hacen `cancelRest()` («auto-skip»), y con OFF
por cohorte eso mataría descansos legítimos (CA-80).

#### 3.6.a De dónde sale `hasHistory`: **`hasHistory := !showModal`** (F5)

Las 3 señales de R14 (`previousHistory`, `exerciseMaxes`, `sessionLogs`) **no son historial del
alumno**: son historial **de los ejercicios de ESTE plan**, y filtrado. Verificado en el código:

- `previousHistory` se arma con `.in('exercise_id', exerciseIds)` — los ejercicios del plan abierto —
  y `.lt('logged_at', windowStartUtc)`
  (`apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/workout-execution.queries.ts:255-260`).
- `exerciseMaxes` suma dos filtros más: `.not('weight_kg','is',null)` y el mismo
  `.in('exercise_id', exerciseIds)` (`:286-297`) ⇒ un alumno que solo hizo movilidad y cardio tiene
  `exerciseMaxes` vacío **aunque lleve un año entrenando**.
- `sessionLogs` es la sesión de HOY.

Consecuencias si `hasHistory` se define con esas 3 señales, tal cual:

| Caso real | Señales | Default ingenuo | Por qué está mal |
|---|---|---|---|
| Veterano al que el coach le arma un **mesociclo nuevo** (ejercicios que nunca hizo) | las 3 vacías | **OFF** | Es la regresión de §9 **T9**: hoy vive con descanso automático y de golpe deja de arrancar |
| Veterano de **solo movilidad/cardio** (sin `weight_kg`) | `exerciseMaxes` vacío | **OFF** | Mismo caso, y es justo la cohorte del reloj |
| Alumno **demo** / `mode ≠ 'normal'` / `stepIndex > 0` / storage caído | el modal **no** se muestra | **OFF sin decisión** | Queda apagado para siempre sin que nadie haya elegido nada |

**Regla del tren (cierra F5), sin query nueva ni señal nueva:** las dos señales se **separan** y
`hasHistory` pasa a ser la negación de la decisión del modal.

```ts
// El único lugar donde se resuelve la cohorte, en las dos plataformas (W5):
const showModal = resolveShowAutoRestModal({ ...bundle, seen, storageAvailable })   // §3.7, sin cambios
const { enabled } = resolveAutoRestDefault({
  storedNew, storedLegacy,
  hasHistory: !showModal,   // ← F5: si NO se muestra el modal, la pref queda ON
  storageAvailable,
})
```

Leído en castellano: **la pref solo nace en OFF cuando el alumno va a ver el modal y decidir**. En
cualquier otro caso — veterano, plan nuevo, demo, `stepIndex > 0`, modo `repeat`/`past-date`/`recover`,
storage inaccesible — nace **ON**, que es lo que la base vive hoy (RN
`timers/rest-timer-preferences.ts:54`, web `WorkoutExecutionClient.tsx:1222`). Cero regresión, y
ningún alumno queda con el descanso apagado sin haberlo elegido. `esPrimerEntreno` (§3.7) **no
cambia**: sigue con las 3 señales del bundle + las exclusiones, y su falso positivo declarado (un
veterano con plan 100 % nuevo ve el modal **una vez**) sigue costando un modal, ya no una regresión de
comportamiento.

**Por qué no se compra una señal «historial de verdad»:** existe una no acotada al plan —
`weekStatusDays`, que la web ya baja en el mismo `Promise.all` de `page.tsx:62-68` vía
`getExecutorWeekStatusDays` — pero es de la **semana en curso** y devuelve `null` sin programa activo o
en modo ciclo (`_data/week-status.queries.ts:22-39`), así que un veterano que no entrenó esta semana
volvería a parecer novato: **no sirve como prueba de historial**. La regla `hasHistory := !showModal`
resuelve el mismo problema con 0 queries y 0 riesgo. **Ratificado por el jefe** (DECISIONS-2, lista de
riesgos obligatorios, **F5**): se implementa así, con su limitación declarada — un veterano con
mesociclo 100 % nuevo puede ver el modal **una vez**, y eso cuesta un modal, no una regresión de
comportamiento. El nombre canónico `readAutoRestPref({clientId, hasHistory})` de OUTLINE §10 **no
cambia** — cambia solo quién alimenta ese booleano.

### 3.7 Resolver del primer entreno (R14, puro)

```ts
/**
 * PURA: ¿corresponde mostrar el modal de D5? Las 4 señales viajan en el bundle que el ejecutor ya
 * cargó (web `page.tsx:81` ← `_data/workout-execution.queries.ts:245-262,284-297`; RN
 * `lib/workout-session.ts:257,1203`) ⇒ 0 queries, offline-safe.
 * Falso positivo aceptado y declarado: un alumno veterano con un plan 100 % de ejercicios nuevos lo
 * vería una vez. No se compra una query extra por eso. OJO: eso vale para MOSTRAR el modal; NO vale
 * para el default de la pref — ahí manda `hasHistory := !showModal` (§3.6.a, F5), o ese veterano
 * quedaría con el descanso apagado sin haber decidido nada.
 */
export function resolveShowAutoRestModal(input: {
  seen: boolean                 // marca `eva:exec-autorest-seen-v1:<clientId>`
  previousHistoryCount: number  // Object.keys(previousHistory).length
  exerciseMaxesCount: number    // Object.keys(exerciseMaxes).length
  sessionLogsCount: number
  isDemo: boolean               // `clients.is_demo` — hay que sumarlo al select (§4, C3)
  mode: 'normal' | 'past-date' | 'repeat' | 'recover'
  stepIndex: number             // el modal sale en el PRIMER ejercicio
  storageAvailable: boolean
}): boolean
// true ⇔ !seen && previousHistoryCount === 0 && exerciseMaxesCount === 0 && sessionLogsCount === 0
//        && !isDemo && mode === 'normal' && stepIndex === 0 && storageAvailable
```

La marca «visto» se escribe **al responder** (o al cerrar sin responder ⇒ marca + OFF), nunca al
mostrarse — a diferencia de `wheel-hint` (`apps/mobile/.../v3/wheel-hint.ts:17`, web `v3/WheelHint.tsx:8-40`),
que es informativo.

**Cuándo y dónde se muestra (R32), tres precisiones que cierran H5'/H6/SPEC-3:**

1. **`rest_time` NO entra al resolver.** La preferencia es **global** del alumno, no del bloque: el
   modal sale en el primer ejercicio **aunque ese bloque no tenga descanso configurado**
   (DECISIONS-2 SPEC-3). A7 habla del **comportamiento** («si el bloque no tiene descanso, no hay
   nada que arrancar»), no de cuándo preguntar. Por eso la firma de arriba **no** tiene
   `restTimeSec` ni nada equivalente: agregarlo sería una condición que el jefe ya descartó.
2. **Después del Despegue, no encima.** El modal se muestra en el **primer ejercicio** de la sesión,
   **después** de que el overlay del Despegue/morph se retira y la pantalla ya es interactiva (RN
   `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:312-317` y `:363-370`; web el equivalente
   del mismo morph). Montarlo antes lo deja debajo del overlay o lo hace competir con la animación
   de entrada. `stepIndex === 0` es la condición de **cuál** ejercicio; el retiro del overlay es la
   condición de **cuándo**.
3. **`clientId` nulo en web ⇒ clave legacy y SIN modal.** `page.tsx` contempla `rootUser === null`
   (`apps/web/src/app/c/[coach_slug]/workout/[planId]/page.tsx:61,68`: `getClientRootUser()` puede
   devolver `null` y el guard de redirección mira `data.user`, no `rootUser`). Sin `clientId` no hay
   con qué namespacear la clave: la preferencia cae a la **clave legacy por dispositivo**
   (`omni_autotimer`, el carril de hoy) y el modal **no se muestra** — preguntar y no poder guardar
   la respuesta por alumno es peor que no preguntar. **R32 literal:** en ese caso la pref se **lee y se
escribe** sobre `omni_autotimer` (el carril device-scoped de hoy, `WorkoutExecutionClient.tsx:1222-1227`),
**sin clave nueva** y **sin modal** — así un OFF que el alumno ya eligió en ese dispositivo se respeta
en lugar de quedar pisado por el default ON.

**`is_demo` se lee en el fetch RAÍZ del alumno**, no en una query nueva: web
`apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts:58-64` (`getStudentScopeRow`, el select
de la fila de `clients` que acompaña a `getClientRootUser`; `getClientRootUser:33` devuelve solo
`{id, email}` del JWT y **no** toca `clients`), RN `apps/mobile/lib/client.ts:17-18` (`RICH`/`MIN`, que
hoy no lo piden). ⚠ **No** sirve el `from('clients')` del bundle del ejecutor
(`_data/workout-execution.queries.ts:277-282`): está condicionado a `areaIds.length > 0`, así que en
un plan sin áreas devuelve `null` y el flag nunca llegaría. Es **aditivo, 0 queries nuevas**. Si aun
así no llega, el fallback es confiar en el historial (R14).

### 3.8 Barrel

`packages/workout-engine/index.ts`: `export * from './hold-autolog'` junto a `cardio-autolog`.

---

## 4. Consumidores × impacto

**Regla de oro:** un coach que solo usa reps (8 173 de 8 960 bloques en LIVE) tiene **0 diff** en
payload, resumen y toda la fila de abajo. `buildStrengthPayload` no se toca,
`formatLoggedSetLine('strength')` sigue devolviendo `null`, `REPS_UNIT_VALUES` y el CHECK solo amplían.

| Consumidor | Qué lee | Con el contrato de §3 | Diff |
|---|---|---|---|
| `get_client_current_streak` | presencia de logs por día | la racha suma el día igual | **0** |
| `get_client_activity_dates` / `get_client_workout_day_counts` / `get_clients_last_workout_date` | `logged_at`, `count(*)` | igual | **0** |
| `get_coach_workout_sessions_30d` / `get_platform_workout_sessions_30d` / `get_admin_coaches_paginated` | días distintos, agregados | igual | **0** |
| `client_start_workout_program` | escribe programas | n/a | **0** |
| `get_client_daily_tonnage` | `weight_kg > 0` **y** `reps_eff > 0` | `reps_done NULL` ⇒ `NULL > 0` es NULL ⇒ fila descartada: **el tonelaje no se infla** | **0** |
| `get_client_muscle_volume` | `(weight*reps) > 0` | descartada | **0** |
| `get_client_strength_series` | `reps_done IS NOT NULL AND > 0` | descartada | **0** |
| `get_client_weekly_prs` | `reps_done ∈ (0,30]` | descartada | **0** |
| **`get_client_exercise_prs`** | **solo `weight_kg > 0`** | hoy «20 kg × 0 reps» como récord | **M2** (§2) |
| **`api/pr-card/route.tsx:77-87`** | **solo `weight_kg`** | el peso del hold entra a la curva | **C1**, 1 línea |
| `deriveDayCompletion` + `countLoggedSetsByBlock` | **filas**, dedup `blockId#set_number` | la serie cuenta, el día cierra | **0** |
| `cycle-completions` / `cycle-cursor` | delega en lo anterior | igual | **0** |
| `superset-rounds` (`isRoundComplete`, `findNextIncompleteInRounds`) | `(block_id, set_number)` | **A / V4 / D2 sin diff de motor**; `extraLoggedBlockId` (`:48-62`) es exactamente lo que D2 necesita | **0** |
| `detectPR` / `historicalBest` | `weight_kg > 0` **y** `reps_done > 0` (`pr-detect.ts:48-57`) | nunca celebra, no contamina el histórico ⇒ **A4 gratis** | **0** |
| `reconcileSessionLogs` / `buildOptimisticSessionLog` | `metadata` opaco | `hold_source` viaja | **0** |
| `buildRepeatSeedMap` (`repeat-seed.ts:102`) | siembra `metadata` completo | heredaría `hold_source` de ayer | **1 línea**: estripar `hold_source` (la fuente del hold de HOY se decide hoy) |
| **`summarizeSessionByKind`** rama strength (`session-summary.ts:201-235`) | `r = sides ? L+R : (reps_done ?? 0)` ⇒ `0` | volumen 0 ✔, `maxWeight` sube ✔, **mapa muscular apagado** ⚠ | **R16: ~8 líneas** |
| **`progression.ts:142-149`** (`doubleProgression:187-228`) | `parseRepsTop("30s") = 30` + `reps_done NULL` ⇒ `repsArr = []` ⇒ **`holding` para siempre** | guard D4/H9 | **~3 líneas** |
| `profileTrainingAnalytics.ts:73,183,251` | `r <= 0 continue` | descartada | **0** |
| `workout-log.actions.ts` | Zod + upsert por día | `hold_source` pasa con §3.1(b) | **0** de código |
| `workout-session.ts` (RN) | PostgREST directo | `reps_done: null` pisa (deseado, `:952`); `actual_hold_sec` `:968`; `metadata` `:974` | **0** |
| `offline-cache.ts` (RN) | `PendingLog` con `actual_hold_sec` (`:42`) y `metadata` (`:51`) | hereda `hold_source` | **0** |
| **`workout-offline-queue.ts` (web)** | `formDataFromItem` ya manda `actual_hold_sec` (`:146`) y `metadata` (`:154`) | el módulo está bien; **el que no los pasa es el call site de fuerza** (`LogSetForm.tsx:854`) | **§5.3** |
| RLS de `workout_logs` (6 policies) | solo `client_id` | ninguna mira columnas de contenido | **0** |
| Índice `workout_logs_one_set_per_day` | `(client, block, set, día)` | **idempotencia del auto-guardado** | **0** |

### 4.1 Mapa muscular con hold de fuerza (R16 — entra)

`session-summary.ts:201-235`: hoy un hold de fuerza aporta `addVol = w × 0 = 0`, así que **no enciende
ninguna zona** del mapa. R16 decide que **sí** debe encenderla (una plancha con disco trabaja core, y
es coherente con movilidad, que ya usa el proxy `MOBILITY_SET_WORK = 20` en `:131` y `:195`). Diff:

- `SummaryBlock:35-45` gana `reps_unit?: string | null` (hoy no lo declara; sin él el resumen no
  puede detectar el modo).
- En la rama strength, si `isStrengthTimeBlock(block, exercise)`: **no** aportar a `strengthVol`
  (`:233`, es una barra en **kg** y el hold no son kg) pero **sí** a `muscleWork` (`:234`) con
  `holdSec ?? blockLogs.length * MOBILITY_SET_WORK`.

Test obligatorio: §6.1 (`session-summary.test.ts`), con el assert de que un bloque strength **clásico**
da resultado byte-idéntico.

### 4.2 Guard de progresión (D4 / H9)

`progression.ts:113-150`: `computeEffectiveTarget` ya devuelve no-op si `progression_type !== 'weight'`
(`:135`), así que **«+ Segundos» es copy del builder, no motor** — igual que «+ Reps» hoy (comentario
`:134`). Lo que **sí** hay que arreglar es `'double'`: con `reps = "30s"`, `parseRepsTop:42-48` devuelve
`30` (no cae al fallback) y `reps_done NULL` deja `repsArr = []` ⇒ `completed = false` ⇒ retorna
`holding` con el peso de la última sesión: el alumno vería «manteniendo peso hasta completar 30 reps»
**para siempre**.

```ts
// ProgressionBlockInput:50-59 gana `reps_unit?: string | null` y `duration_sec?: number | null`.
switch (mode) {
    case 'weekly_linear':
        return weeklyLinear(base, value, ctx, mode)
    case 'double':
        // D4/H9: en modo tiempo la doble progresión está apagada — `reps_done` es NULL y
        // `parseRepsTop("30s")` lee 30 "reps" que no existen ⇒ quedaría en `holding` para siempre.
        return isStrengthTime ? weeklyLinear(base, value, ctx, 'weekly_linear') : doubleProgression(block, base, value, ctx, mode)
    default:
        return noop
}
```

Además, el builder baja `progression_mode: 'double'` → `'weekly_linear'` al activar Segundos
(§3.2, `stripFieldsForStrengthMode`): el guard es la segunda red para los bloques que ya estuvieran en
`double` cuando se hace el toggle desde RN o desde una plantilla.

### 4.3 Lo que hay que sumar a un select existente (C3)

`is_demo` para la exclusión del modal D5 (R14/**R32**): RN `apps/mobile/lib/client.ts:17-18`
(`RICH`/`MIN`) y web `apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts:58-64`
(`getStudentScopeRow`) — el **fetch raíz** del alumno en cada plataforma, no el bundle del ejecutor
(su `from('clients')` está condicionado a `areaIds.length > 0`,
`_data/workout-execution.queries.ts:277-282`). **Aditivo, 0 queries nuevas.** Sin él, el coach que
entra por «Vive tu app» (`apps/mobile/lib/vive-tu-app.ts:8-16`) como su alumno demo vería el modal.

### 4.3.a W4.9 — Verificación (sin tocar) de las 12 RPC restantes con `reps_done NULL`

**Ejecutada el 2026-09-10 contra LIVE por MCP** (solo lectura: `pg_get_functiondef` sobre `pg_proc` +
evaluación de los predicados con `NULL`; **cero escrituras**). Cierra W4.9: ninguna de las 12 necesita
cambio de código, y las 2 que sí cambiaban ya se movieron en W0 (M2) y W4.8 (C1).

Semántica de Postgres verificada en la misma corrida —es de donde sale el «0 diff» de toda la tabla—:

```
SELECT (NULL::int > 0) IS NOT TRUE, (COALESCE(NULL::int,0) > 0), 10 * COALESCE(NULL::int,0);
⇒  true (la fila se descarta) · false (se descarta) · 0 (el hold no infla el tonelaje)
```

| # | RPC (LIVE) | ¿Mira `reps_done`? | Filtro real verificado | Diff con `reps_done NULL` |
|---|---|---|---|---|
| 1 | `get_client_daily_tonnage` | sí | `WHERE e.reps_eff > 0` (`reps_eff` cae a `reps_done` sin `metadata` válida) — `20260903212700` | **0**: `NULL > 0` es NULL ⇒ fila descartada; el tonelaje no se infla |
| 2 | `get_client_muscle_volume` | sí | `WHERE (weight × COALESCE(reps_eff, 0)) > 0` — `20260903212800:65-75` | **0**: `0 > 0` es falso ⇒ descartada |
| 3 | `get_client_strength_series` | sí | `AND wl.reps_done IS NOT NULL AND wl.reps_done > 0` — `20260701140000:197-198` | **0**: descartada explícitamente |
| 4 | `get_client_weekly_prs` | sí | `AND l.reps_done IS NOT NULL AND l.reps_done > 0 AND l.reps_done <= 30` — `20260701140000:278` | **0**: descartada explícitamente |
| 5 | `get_client_current_streak` | **no** | días distintos con ≥ 1 log (`logdays`/`anylog`, `20260903212441:157-165`) | **0**: la racha suma el día igual |
| 6 | `get_client_activity_dates` | **no** | `SELECT DISTINCT … logged_at::date` — `20260612052000:24-26` | **0** |
| 7 | `get_client_workout_day_counts` | **no** | `count(*)` por día — `20260612051000:20-22` | **0** |
| 8 | `get_clients_last_workout_date` | **no** | `max(logged_at)` por alumno — `20260616165712:83` | **0** |
| 9 | `get_coach_workout_sessions_30d` | **no** | `SELECT DISTINCT` sobre `workout_logs` — baseline `:314-317` | **0** |
| 10 | `get_platform_workout_sessions_30d` | **no** | `count(DISTINCT client_id)` — baseline `:613-615` | **0** |
| 11 | `get_admin_coaches_paginated` | **no** | `LEFT JOIN workout_logs` por `logged_at` (30 d) — `20260826042748:60-62` | **0** |
| 12 | `client_start_workout_program` | **no** | escribe `workout_programs.start_date`; no lee logs | **0** |

Las dos que **sí** cambiaban, para cerrar el mapa (no son parte de las 12):

| RPC / cliente | Antes | Ahora | Dónde |
|---|---|---|---|
| `get_client_exercise_prs` | solo `weight_kg > 0` ⇒ récord «20 kg × 0 reps» | `reps_done IS NOT NULL AND reps_done > 0` — **confirmado en LIVE 10-09** | **M2**, W0.2 (`20260910205101`) |
| `apps/web/src/app/api/pr-card/route.tsx` | solo `.not('weight_kg','is',null)` | `+ .gt('reps_done', 0)` | **C1**, W4.8 (+ `route.test.ts`) |

---

## 5. Paridad web ↔ RN del payload (R15)

### 5.1 Dos caminos, un resultado

| | RN | Web |
|---|---|---|
| Quién arma el payload | el **motor**: `buildStrengthTimePayload` / `buildTypedPayload` | el **form**: `normalizeFormData` + `collectValues` sobre el `FormData` |
| Quién envía | `logSet` (`workout-session.ts:905+`) directo a PostgREST | `logSetAction` (server action) con Zod (`workout-log.actions.ts:96`) |
| Cómo dispara el reloj | `onCommit(payload, source)` del módulo de hold | `holdPrefill.submit` ⇒ `formRef.current?.requestSubmit()` |
| Precedente vivo | `CardioScreenV3.tsx:340-388` + `cardio-autolog.ts` | `LogSetForm.tsx:1818-1831` (`cardioAutolog`, con `requestSubmit`) |

Los dos caminos son correctos **por plataforma**; lo que el SDD debe garantizar es que el payload
resultante sea **el mismo**, y probarlo (§5.4).

### 5.2 Las 3 ramas de `LogSetForm.tsx` que hay que conocer (leídas completas, `:795-925` y `:1900-2060`)

| Rama | Línea | Qué hace hoy | Por qué importa |
|---|---|---|---|
| `if (perSideReps) { … }` | `:820-846` | Llama `buildStrengthPayload` con `reps_left`/`reps_right`, borra `reps_right` del FormData, y **si hay lados** hace `formData.set('metadata', JSON.stringify(sideMeta))` (`:838`); **si no hay lados** hace `formData.delete('metadata')` (`:840`) | Ese `delete` es el que borraría un `metadata` que el módulo de hold hubiera puesto. En fuerza por tiempo **per_side** la metadata la debe armar la misma rama (lados + `hold_source`), nunca dos escritores compitiendo por la key |
| **Guard de serie vacía** | **`:848`** | `if (w == null && r == null) return` — «cinturón contra un submit programático» (comentario `:842-847`) | **Bloquea el auto-guardado de fuerza por tiempo**: con `reps_done` null y solo segundos, el `requestSubmit()` del reloj se traga la serie en silencio. Es el cambio más crítico de W4 |
| **Encolado** | **`:854-878`** | `enqueueWorkoutLog({ blockId, setNumber, weightKg, repsDone, rpe, rir, note, metadata: sideMeta, … })` — **sin `actualHoldSec`** | El módulo de cola sí sabe mandarlo (`workout-offline-queue.ts:146` `actual_hold_sec`, `:154` `metadata`): el hueco está en el **call site** de fuerza. Sin el fix, una serie por tiempo guardada en modo avión sube **sin los segundos** |
| `key` del form | `:1098` y `:1422` | `` `log-${existingLog.weight_kg}-${existingLog.reps_done}` `` | Editar un hold guardado no re-monta el form (peso y reps no cambian) ⇒ la fila queda con el valor viejo. La fila **tipada** ya resuelve esto incluyendo los ejes (`:2161`) |
| `holdPrefill` | `:265` (tipo), `:1800-1811` (efecto) | vuelca `holdSec`/`leftSec`/`rightSec` en los inputs uncontrolled al cambiar `nonce`. **No tiene `submit`** | Es la mitad del mecanismo: falta el gemelo de `cardioAutolog.submit` |
| `cardioAutolog` | `:273` (tipo), `:1818-1831` (efecto) | escribe el valor y `if (cardioAutolog?.submit) formRef.current?.requestSubmit()` | **El molde exacto** a copiar para holds |
| Guard de la fila **tipada** | `:1979-1990` | `if (actualDurationSec == null && actualDistanceM == null && actualHoldSec == null && actualAvgHr == null && repsDone == null) return` | Movilidad ya pasa por acá con `actualHoldSec`: la fila tipada **no** necesita cambio de guard |

### 5.3 Qué cambia en web (W4)

1. **Guard de fuerza** (`:848`): `if (w == null && r == null && hold == null) return`, leyendo `hold` de
   `actual_hold_sec`/`hold_left_sec`+`hold_right_sec` del propio FormData (la verdad del DOM, como el
   resto del guard).
2. **`holdPrefill` gana `submit` y `source`**: `{ holdSec?, leftSec?, rightSec?, submit: boolean, source: 'timer'|'manual', nonce }`,
   con el mismo efecto de `cardioAutolog` (`:1818-1831`): escribir → `requestSubmit()`.
3. **Fuerza por tiempo `per_side`: rama PROPIA, no un parche sobre la de reps (R37, tarea de código
   de W4 — no «documentar»).** En `StrengthLogSetForm`, si `isStrengthTimeBlock` la rama
   `perSideReps` (`:357`, `:820-846`) **no** se ejecuta como hoy:
   - **no** llama `buildStrengthPayload` (es la función congelada del eje reps, T5, y devolvería
     `left_reps`/`right_reps` que acá no existen);
   - **no** ejecuta `formData.delete('metadata')` (`:840`) — ese `delete` es justamente el que
     borraría el `metadata` del hold;
   - lee `hold_left_sec` / `hold_right_sec` del FormData, arma **un solo** objeto
     `{ left_sec, right_sec, hold_source }` y hace **un único** `formData.set('metadata', …)`
     (nunca `hold_source` solo: el UPDATE reemplaza el jsonb entero,
     `workout-log.actions.ts:150-156`, T3);
   - **elimina `reps_done` del FormData** (`formData.delete('reps_done')`): por contrato R2 una serie
     por tiempo lleva `reps_done = NULL`, nunca `0`; mandar `0` la metería en 4 RPC como serie de
     cero reps.

   Con `sideMode` no `per_side` (bilateral o `alternating`, `holdSidesFor` §3.3.a) la rama ni se
   entra: un solo `actual_hold_sec` y `metadata: { hold_source }`. **Test de las tres claves**:
   `W4.T2` con una serie de fuerza `per_side` por tiempo ⇒ el jsonb queda con `left_sec`, `right_sec`
   y `hold_source` **juntas**, y sin la key `metadata` la columna no se toca.
4. **Encolado** (`:854`): sumar `actualHoldSec` y mantener `metadata` con `hold_source`.
5. **`key` del form** (`:1098`/`:1422`): incluir el eje tiempo, espejo de `:2161`.
6. **`clientId`** llega desde `page.tsx:75-94` (`clientId={rootUser.id}`) para namespacear la pref D5.

### 5.4 El test de paridad (caso canónico)

Dos archivos, un mismo contrato:

- **Ampliar** `packages/workout-engine/executor-mapping.parity.test.ts` (332 líneas, ya tiene el
  bloque de `buildStrengthPayload` en `:290-330`) con un bloque nuevo para el modo tiempo.
- **Crear** `packages/workout-engine/superset-holds.parity.test.ts` (`W1.T16`, TASKS W1.13): el
  contrato completo del caso canónico «Dia B» — `decideHoldAutolog` + `isRoundComplete` +
  `buildStrengthTimePayload` — con el mismo resultado esperado que produce el camino web, bilateral,
  `per_side` y `alternating` (el **assert de paridad de `holdSidesFor`** que pide R34).

Los dos comparan el **objeto del motor** (RN) contra el **objeto que la web manda a `logSetAction`**
para el mismo caso.

Caso canónico: «plancha frontal mantenida» convertida a fuerza por tiempo, `3 × 30 s · 10 kg`,
serie 2, RIR 2.

| Campo | Bilateral | `per_side` (izq 30 · der 28) | **`alternating`** (H7) |
|---|---|---|---|
| `blockId` / `setNumber` | `blk-plancha` / `2` | idem | idem |
| `weightKg` | `10` | `10` (mismo peso para los dos lados) | `10` |
| `repsDone` | **`null`** | **`null`** | **`null`** |
| `actualHoldSec` | `30` | **`58`** (suma L+R) | **`30`** (un solo lado, `holdSidesFor` §3.3.a) |
| `actualDurationSec` | `null` (no viaja la key) | `null` | `null` |
| `rpe` | `null` | `null` | `null` |
| `rir` | `2` | `2` | `2` |
| `metadata` | `{ hold_source: 'timer' }` | `{ left_sec: 30, right_sec: 28, hold_source: 'timer' }` | `{ hold_source: 'timer' }` — **sin** `left_sec`/`right_sec` |

Asserts obligatorios:

- Igualdad **profunda** entre el objeto del motor y el objeto web (mismas keys, mismo orden de
  presencia: si el motor no define `metadata`, la web tampoco la manda).
- Coma es-CL: `"10,5"` ⇒ `10.5` en las dos plataformas (`num`, `set-log-payload.ts:28-32`).
- Sin `holdSource`, el payload **no gana** la key `metadata` (convención byte-idéntica de `:279`).
- El mismo test corre el caso **manual** (`hold_source: 'manual'`) y verifica que solo cambia esa clave.
- **`alternating` (H7):** las dos plataformas capturan **un** lado y producen el objeto de la tercera
  columna. Es el assert que impide la asimetría de hoy (RN pediría una caja y la web dos, §3.3.a).
- **Movilidad (F1):** el mismo par de asserts para `buildTypedPayload('mobility', …, {sideMode, holdSource})`
  vs la web — bilateral con `holdSource` ⇒ `metadata: { hold_source }` en las dos; **sin** `holdSource`
  ⇒ ninguna de las dos manda la key.

---

## 6. Plan de pruebas

### 6.0 Cómo se corre esta suite

El runner **no** usa filtros de workspace pnpm. `vitest.config.ts:81-121` declara cuatro *projects*
(globs en `:55-56`):

| Project | `environment` | `include` | Notas |
|---|---|---|---|
| `web-node` | node | `apps/web/src/**/*.test.ts`, `tests/**/*.test.ts`, `packages/**/*.test.ts`, `scripts/**/*.test.ts` | excluye `tests/mobile/**` (`vitest.config.ts:59`) |
| `web-dom` | jsdom | los mismos globs en `.test.tsx` | idem |
| `mobile-node` | node | `tests/mobile/**/*.test.ts` | `testTimeout: 15_000` (`vitest.config.ts:64`) |
| `mobile-dom` | jsdom | `tests/mobile/**/*.test.tsx` | idem |

- Todo `packages/workout-engine/*.test.ts` y `packages/schemas/*.test.ts` corre en **`web-node`**
  (glob `packages/**`), aunque el paquete tenga su propio `package.json`. `pnpm --filter @eva/workout-engine test`
  **no** es un gate real; el aislamiento se hace por ruta (`pnpm exec vitest run <archivo>`) o por
  project (`--project mobile-node`).
- Un test que monte módulos de `apps/mobile` con `vi.doMock` + `import()` dinámico **debe** vivir en
  `tests/mobile/` o se cae por timeout (5 s vs 15 s). El patrón vivo (`tests/mobile/executor-v3-superset.test.ts:1-14`)
  ni siquiera mockea Reanimated/Expo: importa el **modelo puro** (`superset-screen-model`) sin React.
  Preferir esa vía siempre que se pueda.
- Playwright queda fuera por construcción (el patrón de vitest es `*.test.*`; los specs son `*.spec.ts`).
- Comandos: `pnpm exec vitest run <archivo>` · `pnpm test:changed` (= `vitest run --changed origin/master`,
  `package.json:17`) · `pnpm test:e2e` · `pnpm qa:prod:suave` (`package.json:18-20`).

### 6.1 Unit del motor (W1) — bloquea a W2/W3/W4

**Crear (5 archivos):**

- [ ] W1.T1 `packages/workout-engine/hold-autolog.test.ts` (Opus) — la **tabla completa** de
  `decideHoldAutolog` (§3.4), un caso por fila:

  | # | Entrada | Salida esperada | Regla |
  |---|---|---|---|
  | 1 | `expired`, solo, `single`, 30/30 | `{fillSeconds:30, submit:true, holdSource:'timer', advance:'stay'}` | V2 + V3 |
  | 2 | `expired`, superset, `single`, `closesRound:false` | `advance:'next-member'` | **V4** |
  | 3 | `expired`, superset, `single`, `closesRound:true` | `advance:'stay'` | **D2** |
  | 4 | `expired`, cualquiera, `left` | `{submit:false, advanceSide:true, autoStartNextSide:true}` | per_side: una fila por serie |
  | 5 | `expired`, `left`, **`expiredWhileAway:true`** | `{advanceSide:true, autoStartNextSide:false}` | **R6/R27** — el lado 2 NO arranca solo |
  | 6 | `expired`, `single`, `expiredWhileAway:true`, elapsed real 300 s sobre un hold de 30 | `fillSeconds:30` (el **objetivo**, nunca el reloj de pared) | R6 + s2 §2.4 |
  | 7 | `done-early`, elapsed 18 de 30 | `{fillSeconds:18, submit:true, holdSource:'manual'}` | **A2/R22** |
  | 8 | `done-early`, elapsed 0 | `{submit:false}` | R22: con 0 s no envía |
  | 9 | `paused` | `{fillSeconds:elapsed, submit:false, advance:'stay'}` | A1 |
  | 10 | `restart` | `{fillSeconds:null, submit:false}` | limpia sin enviar |
  | 11 | `done-early`, `left` | `{submit:false, advanceSide:true}` | R22: guarda el lado y pasa al derecho |
  | 12 | cualquiera con `elapsedSec <= 0` | `{submit:false}` | jamás una serie de 0 |

  **Casos R27 obligatorios en el mismo archivo — `expiredWhileAway` derivado de EVIDENCIA, con reloj
  falso (`vi.useFakeTimers()` + `vi.setSystemTime`), probando los DOS caminos de disparo:**
  (a) **tick primero**: se adelanta el reloj más allá de `endAtMs` y el tick del intervalo llama
  `triggerDone` **antes** del evento (RN `AppState` / web `visibilitychange`);
  (b) **evento primero**: llega el evento y él llama `triggerDone` antes de que corra el tick.
  **Los dos casos exigen el MISMO resultado**: `expiredWhileAway === true`,
  `autoStartNextSide === false`, `fillSeconds === prescribedSec`. Sin este par de asserts vuelve el
  bug de leer la señal del emisor (§9 T2). Tercer caso de control: fin **en foreground**, con
  `Date.now() - endAtMs` por debajo del umbral de 1500 ms y app activa ⇒ `expiredWhileAway === false`
  y `autoStartNextSide === true`.
  (Los dos caminos se simulan sobre el hook, así que este bloque vive donde el hook se puede montar:
  el par RN va en `W3.T3` y el par web en `W4.T4`; en el archivo puro se prueban las **entradas**
  `expiredWhileAway: true|false` de la tabla, casos 5 y 6.)

- [ ] W1.T2 `packages/workout-engine/set-log-payload.strength-time.test.ts` (Opus) —
  `buildStrengthTimePayload`: bilateral ⇒ `{weightKg:10, repsDone:null, actualHoldSec:30, metadata:{hold_source:'timer'}}`;
  per_side ⇒ `actualHoldSec = L+R` y `metadata` con **3 claves**; sin `holdSource` ⇒ el payload **no
  gana** la key `metadata`; peso con coma es-CL; `note` vacío ⇒ `null`; **`actualDurationSec` nunca
  aparece**.
  **Casos H7/F1 obligatorios en el mismo archivo:**
  (a) **`sideMode:'alternating'`** ⇒ **un** lado: `actualHoldSec` = la caja única y `metadata`
  **sin** `left_sec`/`right_sec` (§3.3.a). **`holdSidesFor` (R34), las tres filas**:
  `holdSidesFor('per_side')` ⇒ `['left','right']`; `holdSidesFor('alternating')` ⇒ `['single']`;
  `holdSidesFor(null)` ⇒ `['single']` (y `'bilateral'` idem). Assert extra: la fuerza clásica **no**
  cambia — `buildStrengthPayload` con `alternating` sigue devolviendo `left_reps`/`right_reps`
  byte-idéntico (`set-log-payload.ts:260`).
  (b) **`buildTypedPayload('mobility', …)`** con `{sideMode:'bilateral', holdSource:'timer'}` ⇒
  `metadata: { hold_source: 'timer' }`; con `per_side` ⇒ las **3** claves; **sin `holdSource`** ⇒ en
  los tres modos (`cardio`/`mobility`/`roller`) el objeto es **byte-idéntico** al de hoy y bilateral
  **no gana** la key `metadata` (§3.3.b). Sin este último assert, F1 vuelve por la ventana.
  (c) **Roller (DECISIONS-2 DATA-2):** `buildTypedPayload('roller', …, { holdSource: 'manual' })` ⇒
  `metadata: { hold_source: 'manual' }` (siempre `'manual'`: R12 lo deja sin reloj);
  `buildTypedPayload('cardio', …, { holdSource: 'timer' })` ⇒ **sin** la key `hold_source`
  (cardio no se toca, CA-14).
- [ ] W1.T3 `packages/workout-engine/superset-rounds.test.ts` (Opus) — **NO EXISTE HOY** (verificado:
  `ls packages/workout-engine` solo tiene `superset-rounds.ts`; la única cobertura de `isRoundComplete`
  vive en `tests/mobile/executor-v3-superset.test.ts`). V4 y D2 se apoyan enteros en este módulo:
  `buildRoundOrder` intercalado A1→B1→A2→B2 saltando miembros sin serie; `isRoundComplete` con y sin
  `extraLoggedBlockId` (`:48-62`); **doble registro del mismo `(block,set)` ⇒ mismo veredicto**
  (idempotencia); `findNextIncompleteInRounds` envolviendo; `firstIncompleteInRounds`.
  Con el caso canónico «Dia B»: tras el hold del miembro de movilidad ⇒ `false` (falta el press
  pallof) ⇒ `advance:'next-member'`; tras el segundo ⇒ `true` ⇒ `advance:'stay'` (**D2**).
- [ ] W1.T4 `packages/workout-engine/auto-rest-pref.test.ts` (Opus) — `resolveAutoRestDefault` (§3.6),
  las 4 cohortes + `storageAvailable:false`; y `resolveShowAutoRestModal` (§3.7): las 8 entradas, con
  un caso por exclusión (`isDemo`, `mode !== 'normal'`, `stepIndex > 0`, `seen`, historial no vacío).
  **Puras**: sin React, sin storage real.
  **Casos F5 obligatorios (§3.6.a), el default sale de `hasHistory := !showModal`:**
  (a) **veterano con mesociclo nuevo** — las 3 señales del bundle vacías **pero** `seen:true` ⇒
  `showModal:false` ⇒ **`enabled: true`** (no `false`): congela la no-regresión de §9 T9;
  (b) `isDemo:true` con las 3 señales vacías ⇒ `showModal:false` ⇒ **`enabled: true`**;
  (c) `mode:'repeat'` y `stepIndex:2`, ídem ⇒ **`enabled: true`**;
  (d) `storageAvailable:false` ⇒ `showModal:false` ⇒ **`enabled: true`** y **sin** modal (T8);
  (e) primer entreno de verdad (3 señales vacías, `seen:false`, `mode:'normal'`, `stepIndex:0`,
  `!isDemo`, storage OK) ⇒ `showModal:true` ⇒ **`enabled: false`** — la **única** cohorte que nace OFF.
  **Caso R25 obligatorio — la variante `'off'` es una FILA del test, no una rama muerta:** las mismas
  entradas de (a)–(e) con `strategy: 'off'` ⇒ **`enabled: false`** en las cohortes 3 y 4
  (`source: 'strategy-off'`), y **sin cambio** en 1 y 2 (una preferencia ya elegida por el alumno
  manda sobre el default). Con eso, si el owner responde Q1 = «OFF global», el tren cambia **una
  línea** (`AUTOREST_DEFAULT_STRATEGY`) y el test ya lo cubría.
  **Caso R32:** el resolver **no** recibe ni mira `rest_time` — un primer ejercicio **sin descanso
  configurado** con las demás señales de (e) sigue dando `showModal: true` (la preferencia es global,
  DECISIONS-2 SPEC-3).

- [ ] W1.T16 `packages/workout-engine/superset-holds.parity.test.ts` (Opus, **NUEVO** — TASKS W1.13):
  paridad del **contrato completo** con el caso canónico «Dia B» — `decideHoldAutolog` +
  `isRoundComplete` + `buildStrengthTimePayload` encadenados — contra el objeto que produce el camino
  web (`logSetAction`), en las **tres** variantes de lado: bilateral, `per_side` y **`alternating`**
  (el assert de paridad de `holdSidesFor` que exige **R34**). Formato de los 30 asserts existentes de
  `executor-mapping.parity.test.ts:290-330`.

**Ampliar (11 archivos):**

- [ ] W1.T5 `packages/schemas/workout.test.ts` (Opus) — `reps_unit:'sec'` **acepta**;
  `metadata.hold_source:'timer'|'manual'` **sobrevive al parse** (anti-H3: hoy se estriparía);
  `hold_source:'otro'` rechaza; `reps_unit:'sec'` con `duration_sec: 3` y con `700` **rechaza**
  (superRefine 5–600); con `30` acepta; un bloque strength clásico (sin `reps_unit`) valida
  **byte-idéntico**; un bloque **cardio** con `duration_sec: 3` sigue aceptando (la regla nueva no lo
  toca).
- [ ] W1.T6 `packages/workout-engine/workout-exercise-type.test.ts` — `isStrengthTimeBlock` true con
  `{reps_unit:'sec', duration_sec:30}`; **false con `{duration_sec:600, reps_unit:null}`** ← congela
  **H8** (los 2 bloques reales de LIVE); false si el tipo efectivo no es strength;
  `legacyRepsSummaryFor` en modo tiempo ⇒ `"30s"` / `"30s/lado"`; **de un strength clásico sigue
  devolviendo el texto del coach**; `formatStrengthTimeObjective` ⇒ `"3 × 30s"` / `"3 × 30s por lado"`.
  **Caso R29 obligatorio — predicado único de MONTAJE del módulo:** el `HoldModuleV3` se monta si
  `(duration_sec ?? 0) > 0` en movilidad **o** `isStrengthTimeBlock` en fuerza. Filas del test:
  movilidad con `duration_sec: 30` ⇒ **monta**; movilidad **sin `duration_sec`** (`null` o `0`) ⇒
  **NO monta** — es el caso de los 94 bloques de movilidad sin duración que hay en LIVE, que
  conservan **tal cual** su fila manual de hoy; fuerza con `reps_unit:'sec'` + `duration_sec:30` ⇒
  monta; fuerza clásica ⇒ no monta. El predicado se exporta del motor y lo consumen las dos UIs
  (nadie compara `duration_sec` a mano, misma disciplina que `holdSidesFor`).
- [ ] W1.T7 `packages/workout-engine/keypad-flow.test.ts` — `keypadStepsForTarget({strengthTimeMode:true})`
  ⇒ `[weight, actual_hold_sec]` en modo entero; con `sideMode:'per_side'` ⇒
  `[weight, hold_left_sec, hold_right_sec]`; **con `sideMode:'alternating'` ⇒ `[weight, actual_hold_sec]`**
  (H7, §3.3.a: para el eje tiempo `alternating` es un solo lado — y `typedKeypadFields('mobility','alternating')`
  sigue devolviendo **una** caja, byte-idéntico a hoy, `typed-keypad.ts:100-105`);
  `typedTargetFor` de un strength-time sigue devolviendo **`null`** (R18: la fuerza nunca entra al
  carril tipado).
- [ ] W1.T8 `packages/workout-engine/logged-set-summary.test.ts` — `formatStrengthTimeSetLine` en sus
  5 formas (per_side simétrico, asimétrico, bilateral, sin peso, sin hold ⇒ `null`); y
  **`formatLoggedSetLine('strength', …)` sigue devolviendo `null`** con y sin `actual_hold_sec`
  (anti-regresión del interruptor `:154`).
- [ ] W1.T9 `packages/workout-engine/session-summary.test.ts` — con un bloque strength-time:
  `totalVolume === 0`, `strengthMuscleVolume` **sin** la fila del grupo, `muscleWork` **con** el aporte
  del hold (R16); un bloque strength clásico da resultado **byte-idéntico**.
- [ ] W1.T10 `packages/workout-engine/day-completion.test.ts` + `day-completion.fixtures.ts` — fixture
  con un log `{reps_done:null, actual_hold_sec:30}` ⇒ **cuenta como serie**, el día cierra en `done`;
  con `metadata.hold_source` presente el conteo no cambia (`countLoggedSetsByBlock:193-208` cuenta
  filas, no reps).
- [ ] W1.T11 `packages/workout-engine/pr-detect.test.ts` — `{weight_kg:10, reps_done:null}` ⇒
  `isPR:false, kind:null` **y** no altera `prevBest` estando en el histórico (**congela A4**).
- [ ] W1.T12 `packages/workout-engine/repeat-seed.test.ts` — fila con
  `metadata:{left_sec:30, right_sec:28, hold_source:'timer'}` ⇒ la semilla trae los **lados** y **no**
  `hold_source`.
- [ ] W1.T13 `packages/workout-engine/session-logs.reconcile.test.ts` + `session-logs.optimistic.test.ts`
  — un ítem de cola con `hold_source` sobrevive el merge y llega al `ReconciledSessionLog`; el
  optimista lo preserva.
- [ ] W1.T14 `packages/workout-engine/cycle-completions.test.ts` — un día cerrado **solo** con holds de
  fuerza por tiempo entra a `completions`.
- [ ] W1.T15 `packages/plan-builder/block-type-fields.test.ts` — `stripFieldsForStrengthMode('sec')`
  siembra `duration_sec` + `reps_unit` y baja `double`→`weekly_linear`; `('reps')` los pone en **`null`
  explícito** (no `undefined`, regla R32); **no toca** `SHARED_BLOCK_FIELDS`;
  `stripFieldsForType(strength→mobility)` sobre un bloque en modo tiempo **limpia `reps_unit`**.

### 6.2 Web (Vitest, W2/W4/W5)

- [ ] W2.T1 `apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.test.tsx` (Opus) —
  el segmented «Reps | Segundos» dentro de Fuerza: nace en **Reps**; al pasar a **Segundos** aparece
  «Segundos por serie *» y **siguen ahí** Peso, RIR, Tempo, Descanso y Lado (D3); `3` y `700` no
  dejan guardar (superRefine 5–600, R11) y `30` sí; volver a **Reps** limpia `duration_sec` y
  `reps_unit` a **`null` explícito**; con Segundos activo la **doble progresión** no se ofrece (D4).
- [ ] W2.T2 `tests/mobile/plan-builder-type-change.test.ts` y
  `tests/mobile/plan-builder-strip-roundtrip.test.ts` (AMPLIAR, Opus) — round-trip
  reps→sec→reps sin residuos y **Fuerza·Segundos → Movilidad** limpiando `reps_unit`
  (`stripFieldsForType` sobre `POLYMORPHIC_BLOCK_FIELDS`), con `SHARED_BLOCK_FIELDS` intacto.
- [ ] W2.T3 `tests/mobile/plan-builder-serialize.test.ts` (AMPLIAR, Opus) — el bloque guardado en
  modo tiempo trae el espejo legacy `reps: '30s'` / `'30s/lado'` (`workout_blocks.reps` es NOT NULL y
  Zod exige `min(1)`, `packages/schemas/workout.ts:128`), y `duration_sec` + `reps_unit` viajan sin
  tocar el mapper.
- [ ] W2.T4 Plantillas (Opus, **sin cambio de código**, solo test) — una plantilla con un bloque en
  modo tiempo se aplica y se sincroniza conservando `duration_sec` + `reps_unit`. ⚠ Sin `'sec'` en
  el enum (W0), re-validar esa plantilla **rompe el plan entero**, no solo ese bloque.
- [ ] W4.T1 `apps/web/src/lib/workout/progression.test.ts` (Opus) — **H9**: bloque
  `{reps:'30s', reps_unit:'sec', duration_sec:30, progression_mode:'double', progression_type:'weight'}`
  con última sesión de `repsDone:[null,null,null]` ⇒ **no** devuelve `holding`, cae a `weekly_linear`;
  un bloque de reps con `'double'` sigue **byte-idéntico**.
- [ ] W4.T2 `apps/web/src/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions.test.ts` (Opus)
  — FormData con `metadata` `{"hold_source":"timer"}` ⇒ llega a la fila; con lados + `hold_source` ⇒
  el jsonb queda con **las tres claves**; **sin** la key `metadata` ⇒ la columna **no se toca**
  (anti-regresión W2.3, `workout-log.actions.ts:150-156`); un `metadata` con JSON inválido se ignora
  sin romper el guardado (`:57-65`).
- [ ] W4.T3 `apps/web/src/lib/workout-offline-queue.test.ts` (Opus) — un ítem de **fuerza** con
  `actualHoldSec` + `metadata.hold_source` produce un `FormData` con `actual_hold_sec` y `metadata`
  (`workout-offline-queue.ts:146,154`); el ítem de fuerza clásico sigue **byte-idéntico**.
- [ ] W4.T4 `.../v3/useExecCountdown.test.ts` (AMPLIAR, Opus) — el hook gana `started` (hoy solo expone
  `timeLeft/isActive/done/frac/toggle/restart`, `useExecCountdown.ts:21-32`), **`endAtMs`** y
  **`expiredWhileAway`** en el `onDone` (**R27**; el nombre `viaAppState` queda retirado del
  contrato). Los dos llamadores actuales (`MobilityStepV3.tsx:89`, `CardioStepV3.tsx:444`) siguen
  compilando. Casos obligatorios, con reloj falso:
  (a) **tick primero** — se adelanta el reloj más allá de `endAtMs` con la pestaña oculta y el
  `setInterval` *throttleado* (`:71-83`) llama `triggerDone` antes del evento;
  (b) **`visibilitychange` primero** (`:89-99`);
  **los dos exigen el mismo `expiredWhileAway: true`**; (c) fin en foreground con `document.visibilityState === 'visible'`
  y menos de 1500 ms de atraso ⇒ `expiredWhileAway: false`; (d) `restart` limpia la señal;
  (e) **`prime(seconds)` (R27)** deja el reloj en `idle` — `started === false`, `isActive === false`,
  `timeLeft === seconds` — y **no** dispara `onDone` por más que avance el reloj falso; recién
  `toggle()` lo arranca. Sin `prime`, «Iniciar lado derecho» no existe (hoy `restart` siempre
  arranca, `:30-32`).
- [ ] W4.T5 `LogSetForm` — guard, auto-envío e **invariante de montaje (R26)** **[UI · Fable]** con
  test (Opus): en `web-dom`, montar la fila de fuerza por tiempo con el `HoldModuleV3` en `running` y
  verificar que
  (a) **el `<form>` del `LogSetForm` SIGUE en el DOM** — R8 («corriendo ⇒ solo el módulo») se
  implementa **ocultando** con `hidden` + `inert`, **nunca** con condicional de render: un `<form>`
  desmontado no puede recibir `requestSubmit()` y el auto-guardado se perdería en silencio;
  (b) disparar `holdPrefill.submit` produce **exactamente un** `logSetAction` (un solo submit, ni
  cero por desmontaje ni dos por re-montaje);
  (c) el guard `:848` **ya no** traga la serie (`w == null && r == null && hold == null`);
  (d) el ítem encolado trae `actualHoldSec`.
  Assert espejo del mismo invariante en RN (`W3.T2`): la fila se oculta con `display: 'none'`, no se
  desmonta.
- [ ] W4.T6 `MobilityStepV3` (B) — con `started`, antes de arrancar el CTA grande dice «Iniciar hold» y
  el secundario «Listo»; corriendo, «Pausar» secundario y «Listo este lado/Listo» juicy.
- [ ] W4.T7 `.../session-logs.snapshot.test.ts` (AMPLIAR) — el guardado automático no rompe el snapshot
  ni el resumen de sesión.
- [ ] W4.T8 `SupersetStepV3` — V4: tras el guardado del miembro de movilidad la tarjeta activa pasa
  sola al siguiente miembro; en el último de la ronda **no** arranca el descanso (D2) y aparece
  «Ronda lista · Descansar 90 s».
  **Casos R28 obligatorios — `pendingRoundRest` lleva el contexto COMPLETO de la ronda:**
  (a) el estado se arma **en el commit**, con la forma `{ groupId, round, totalRounds, seconds,
  label, roundContext }`, donde `roundContext` es el **mismo `RestRoundContext`** que hoy construye
  `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx:770-790`
  (`{ roundNumber, totalRounds, next: { name, prescription, exercise, tag } | null }`);
  (b) se guarda **antes** del reset de `restRoundContextRef` (`:696` lo pone en `null` en **cada**
  commit): si se calculara al tocar el CTA, `roundContext` llegaría `null` y el interstitial perdería
  banner «Ronda N lista», dots y próxima ronda;
  (c) al tocar «Ronda lista · Descansar N s» se **repone** `restRoundContextRef.current =
  pendingRoundRest.roundContext` y recién ahí se llama `startRest` — en RN la **misma** llamada de
  `:796-802` (`{ autoStart, label, setIndex: round, setTotal: totalRounds, countKind: 'ronda' }`);
  (d) **web: NO existe `countKind`.** `startRest` solo acepta `{ label, warmup }`
  (`WorkoutTimerProvider.tsx:17-21`, firma en `:33`), así que el rótulo «Ronda N de M» viaja **dentro
  de `label`**. El test web afirma que se llama `startRest(String(seconds), { label })` y que **no**
  se pasa ninguna key inexistente.
- [ ] W5.T2 `.../v3/auto-rest-pref` web — claves `eva:exec-autorest-v1:<clientId>` / `-seen-`,
  codificación `'1'`/`'0'`, migración de lectura desde `omni_autotimer` (`'true'`/`'false'`), evento
  `exec-settings-changed` para sincronizar la tuerca.
- [ ] W5.T5 (web) — la mitad web de la **matriz 2×4 + toggle + CA-80**: misma tabla y mismos asserts,
  descritos una sola vez en §6.3 para que RN y web no diverjan. Referenciado por TASKS **W3.16**,
  **W4.17** y **W5.3**.
- [ ] W6.T1 **(condicional, NO se aplica en este tren)** `apps/web/src/lib/email/transactional-templates.test.ts:282-286`
  — el guard del copy de Android (A6, TASKS W6.19). Hoy **fija el string literal** «…o desde la app en
  iOS. No necesita instalar nada.» carácter por carácter contra
  `transactional-templates.ts:269-270` (`STUDENT_ACCESS_NO_INSTALL_LABEL`), así que ese test
  **rompe CI** si alguien cambia el copy en un solo lado. Cuando Google apruebe producción, el copy
  («iOS» → «iOS **y Android**»), su espejo RN
  (`apps/mobile/components/coach/InviteStudent.tsx:214`) y **este test** se mueven en el **mismo
  commit**; hasta entonces el test queda **verde tal como está** y este tren **no lo toca**. Está
  listado acá solo para que nadie lo lea como un rojo del tren.

### 6.3 Mobile (`tests/mobile/`, W3/W5)

- [ ] W3.T1 `tests/mobile/executor-v3-superset.test.ts` (AMPLIAR, Opus) — con el modelo puro
  `superset-screen-model`: un miembro tipado con reloj **no** cambia `activeRound` ni
  `nextMemberIdInRound`; tras el commit del hold, el siguiente miembro es el esperado (V4); en el
  último, `pendingRoundRest` queda armado y **no** hay `startRest` (D2).
- [ ] W3.T2 `tests/mobile/executor-v3-hold-module.test.ts` (NUEVO, Opus) — el modelo puro del módulo
  (`use-hold-module` sin React donde se pueda): estados
  `idle → running → paused ⇄ running → sideDone(left) → running(right) → done(saved)`; `savedRef` por
  `block:set:side` impide el doble envío; `restart` vuelve a `idle` **sin borrar lo guardado**;
  **`prime(seconds)` deja `idle` armado sin arrancar** (R27) y es lo que usa el lado derecho cuando
  `expiredWhileAway`. **Invariante R26 (espejo RN del web):** con el módulo en `running`, la fila de
  captura del miembro activo se oculta con **`display: 'none'`** y **no se desmonta** — el test
  afirma que el nodo sigue existiendo en el árbol; si se desmontara, el commit del reloj perdería su
  destino igual que en web.
- [ ] W3.T3 `tests/mobile/executor-v3-typed-screens.test.ts` (AMPLIAR) — arranque manual del primer
  lado (A1/R21) y auto-arranque del lado 2 **solo** en foreground (R6). **Casos R27 con reloj falso,
  sobre `useCountdown` (`apps/mobile/components/alumno/workout/v3/timing.ts`):**
  (a) **tick primero** — el `setInterval` (`:59-71`) llama `triggerDone` antes que el listener de
  `AppState`; (b) **`AppState 'active'` primero** (`:73-79`); **los dos exigen el mismo
  `expiredWhileAway: true`** y el lado derecho **`prime`ado**, no arrancado; (c) fin en foreground
  con app activa y menos de 1500 ms de atraso ⇒ `expiredWhileAway: false` y el lado 2 arranca solo,
  como hoy (`MobilityScreenV3.tsx:141`).
- [ ] W3.T4 `tests/mobile/offline-queue.test.ts` (AMPLIAR) — un `PendingLog` de fuerza por tiempo
  (`reps_done:null`, `actual_hold_sec`, `metadata.hold_source`) sobrevive encolado y drain
  (`offline-cache.ts:25-51`).
- [ ] W3.T5 `tests/mobile/hold-notification.test.ts` (NUEVO, Opus) — el aviso del SO «Terminó tu
  hold» (**R31**), con las **4 reglas del fix QA-10** copiadas de su gemelo
  `apps/mobile/components/alumno/workout/timers/cardio-notification.ts:15-21`:
  (a) **id estable** `eva-hold-end` con `data.type = 'hold-end'` propios ⇒ re-agendar **reemplaza**,
  nunca apila, y no barre las del descanso;
  (b) **cola serializada** de schedule/cancel/dismiss/sweep ⇒ una carrera `cancel` + `schedule` deja
  **una sola** programada (la fuente demostrada de las huérfanas apiladas en MIUI);
  (c) **dismiss de las ya ENTREGADAS** del tipo hold al cerrar;
  (d) **sweep al arrancar** de cualquier programada huérfana del tipo hold.
  Más: **solo se programa con permiso YA concedido** (nunca promptea, `getRestNotifPermission`); se
  **cancela** en los últimos ~2 s y al volver a foreground (patrón `useRestTimerEngine.ts:270`,
  `:312-313`) para que el handler global (`apps/mobile/lib/push.ts:86-95`) no muestre la
  notificación con la app abierta; cambiar de lado **cancela y reprograma**.
- [ ] W5.T3 `tests/mobile/exec-autorest-pref.test.ts` (NUEVO) — espejo RN de W5.T2 + **paridad de
  claves y codificación web ↔ RN** (mismas claves, mismos `'1'`/`'0'`), precedente
  `packages/feature-prefs/feature-prefs.test.ts`.
- [ ] W5.T4 `tests/mobile/exec-settings-autorest.test.ts` — la fila de la tuerca queda **una sola**
  («Pasar solo al descanso»), conserva `testID="setting-autotimer"` y ya no pinta `danger` en OFF.

- [ ] W5.T5 **Matriz 2×4 «quién llama `startRest`» + toggle extremo a extremo + CA-80** (NUEVO, Opus)
  — cierra **R24** y **CA-80**, que TASKS W3.16 / W4.17 / W5.3 exigen y hasta ahora no tenían sección
  acá. Corre en **las dos** plataformas sobre el mismo modelo puro: RN
  `tests/mobile/exec-autorest-matrix.test.ts` y web `.../v3/auto-rest-matrix.test.tsx` (`web-dom`),
  con el **mismo** cuadro de casos (assert de paridad: mismo veredicto por celda).

  **(a) Matriz 2×4** — `pref ∈ {ON, OFF}` × `contexto ∈ {pantalla sola, superserie NO último,
  superserie ÚLTIMO de la ronda, bloque SIN `rest_time`}`. Cada celda afirma **quién** llama
  `startRest` (§11.2 del SPEC):

  | Contexto | Pref **OFF** | Pref **ON** |
  |---|---|---|
  | Pantalla sola (fuerza clásica, movilidad, fuerza por tiempo) | **nadie** automático: se pinta el par «Descansar N s» / «Siguiente serie» y `startRest` sale **solo del CTA** (R24) | el **orquestador**: RN `ExecutorV3.tsx:830`, web vía la prop `autoTimerEnabled` (`LogSetForm.tsx:662` fuerza / `:2034` tipada) |
  | Superserie, miembro **NO** último | **nadie** (y **sin** CTA de descanso: no hay descanso entre miembros) | **nadie** — idéntico: V4 manda y la pref no aplica |
  | Superserie, **ÚLTIMO** de la ronda | **nadie** automático: `pendingRoundRest` armado (R28) y CTA «Ronda lista · Descansar N s» | el **orquestador**: RN `ExecutorV3.tsx:796` |
  | Bloque **sin `rest_time`** (o `rest_time` = 0) | **nadie**, y **no** se pinta ningún CTA de descanso (no hay nada que arrancar, A7) | **nadie** — idéntico |

  **(b) Extremo a extremo del toggle** — con la fila «Pasar solo al descanso» de la tuerca
  (`ExecSettingsSheet`): partir en ON, cerrar una serie ⇒ `startRest` automático; **apagar el toggle
  sin recargar** y cerrar la serie siguiente ⇒ **no** hay `startRest` automático y **sí** aparece el
  par de CTAs; volver a encender ⇒ vuelve el automático. El cambio pega en la **serie siguiente**,
  nunca sobre un descanso ya corriendo (escritura optimista, R36).

  **(c) CA-80 · con la pref OFF, cerrar la serie NO llama `cancelRest`.** Arrancar un descanso **a
  mano** (CTA «Descansar N s»), y **mientras corre** cerrar otra serie con la pref en OFF: el
  cronómetro **sigue vivo**, `cancelRest` **no** se llama. Es el cambio de comportamiento declarado
  respecto de hoy (`LogSetForm.tsx:662` y `:2034-2036` hacen `cancelRest()` en la rama OFF; RN
  `ExecutorV3.tsx:762` y `:822`), el que va en el aviso a coaches (§10, D17).

### 6.4 Parity existentes que deben seguir verdes (gate de no-regresión)

> **Correspondencia con `TASKS.md`:** todo archivo `.test.*` citado en TASKS tiene su sección acá
> (§6.1–§6.3). Al revés, esta capa lista además los archivos de la tabla de abajo — que **nadie
> edita**, solo tienen que seguir verdes — y los referencia por **ID de test** (`W1.T4`, `W3.T5`, …),
> que es la clave que TASKS usa para apuntar acá. Si aparece un archivo nuevo en TASKS sin sección
> en §6, es drift y bloquea.

| Archivo | Qué protege |
|---|---|
| `packages/workout-engine/executor-mapping.parity.test.ts` (332 líneas, `:290-330`) | `buildStrengthPayload` byte-idéntico + el bloque nuevo de §5.4 |
| `packages/workout-engine/set-log-payload.strength-side.test.ts` (165) | fuerza por lado intacta |
| `packages/workout-engine/set-log-payload.per-side.test.ts` (107) | movilidad per_side intacta |
| `packages/workout-engine/set-log-payload.cardio.test.ts` | **cardio no se toca** |
| `packages/workout-engine/cardio-autolog.test.ts` | el acumulador reusado no cambió de contrato |
| `packages/workout-engine/day-completion.parity.test.ts` | cierre de día web ↔ RN |
| `tests/mobile/keypad-flow.test.ts`, `tests/mobile/offline-queue-side-reps.test.ts` | teclado y cola por lado |
| `packages/workout-engine/typed-keypad.test.ts` | `TypedKeypadMode` **sin** miembro nuevo (R18) |

### 6.5 Playwright — el caso canónico (W6)

Spec: **ampliar** `tests/workout-flow.spec.ts` (existe) con un escenario nuevo; **no** crear un spec
suelto (el gate `qa:prod:suave` corre por project, `package.json:19`).

Seed: `scripts/seed-e2e-personas.mjs` (`pnpm seed:e2e-personas`, doble gate `E2E_SEED_CONFIRM` +
`--allow-remote`). Hoy **no hay** persona con superserie mixta ni con fuerza por tiempo
(`docs/testing/E2E_PERSONAS.md` solo tiene personas de separación de flujos). Tarea de W6: **extender
el seed** con un plan «Dia B (E2E)» que replique el caso canónico de Movens **con datos sintéticos**
(nunca copiar el plan real de un coach):

- superserie B = miembro movilidad `3 × 30 s/lado` `per_side` + miembro fuerza `3 × 8-12` `per_side`,
  descanso de grupo 90 s;
- bloque suelto de fuerza por tiempo: `3 × 30 s · 10 kg`, `reps_unit='sec'`.

Escenario (1 navegador, regla del owner):

1. Abrir el ejecutor del alumno E2E → superserie B. **El video se ve** y el módulo de reloj está
   **debajo** (V1).
2. Tocar «Iniciar hold» (A1) → el anillo corre. Esperar a 0 con reloj falso de Playwright.
3. La serie aparece **guardada sin tocar nada** (V2) y la tarjeta activa pasa **sola** al press pallof
   (V4).
4. Cerrar la ronda con el miembro de fuerza ⇒ aparece «Ronda lista · Descansar 90 s» y **el descanso no
   arranca solo** (D2) con la pref OFF.
5. Bloque de fuerza por tiempo: tile KG con 10, «Iniciar serie», a 0 ⇒ guardado con «10 kg × 30 s» y
   CTAs «Descansar 90 s» / «Siguiente serie» (V3).
6. Assert de DB **de solo lectura** sobre el alumno E2E: la fila tiene `reps_done IS NULL`,
   `actual_hold_sec = 30`, `metadata->>'hold_source' = 'timer'`.

**Reglas del jefe para este escenario (DECISIONS-2 PLAN-1):** el seed es **sintético** (extensión de
`seed:e2e-personas`, alumno E2E, **nunca** datos de Movens ni de ningún coach real) y el assert final
es de **DB en solo lectura** — el spec no escribe SQL. Es el **mismo** plan y el mismo alumno que usa
la prueba positiva del CHECK en §1.4. Y es el **primer recorte** si el presupuesto no cierra (**R38**,
orden de recorte: notificación del SO → mapa muscular → este Playwright): si se recorta, queda con la
causa anotada en TASKS, no se borra del SDD.

### 6.6 Baseline de CI rojo **preexistente** (para no declarar verde lo que ya estaba rojo)

| Job / archivo | Estado ANTES del tren | Estado esperado DESPUÉS | Por qué |
|---|---|---|---|
| `nutrition-smoke` (CI) | **rojo** | **rojo** (igual) | El job corre sin `NEXT_PUBLIC_SUPABASE_*`; no lo toca este tren |
| `apps/web/src/app/coach/clients/[clientId]/profile-analytics/overview.test.ts` | **rojo de noche** | igual | Depende de la hora del día; pone `unit` de CI en rojo en la ventana nocturna |
| `pnpm docs:check` | verde | **verde** | Enlaces relativos rotos = falla; esta spec solo enlaza a sus 3 hermanos |
| `pnpm typecheck` (web) | verde | verde | |
| `pnpm --filter @eva/mobile exec tsc --noEmit` | verde | verde | |
| `pnpm lint` (2 pasadas) | verde | verde | |
| `qa:prod:suave` | 9/9 | 9/9 | Se corre **después** del deploy |

Regla: si en el cierre aparece un rojo que **no** está en esta tabla, es del tren y bloquea.

### 6.7 Gates por wave

| Wave | Gate obligatorio |
|---|---|
| W0 | dry-run tx-rollback de M1 (con la **prueba positiva** de §1.4) y de M2 → **aplicar las dos en LIVE** (R35) → `pg_get_constraintdef`/`pg_get_functiondef` verificados + `get_advisors` sin advisor nuevo + `pnpm exec vitest run packages/schemas/workout.test.ts packages/plan-builder/block-type-fields.test.ts` |
| W1 | `pnpm exec vitest run packages/workout-engine` (incluye los **5** archivos nuevos de §6.1) |
| W2 | `pnpm typecheck` + `pnpm test:changed` |
| W3 | `pnpm --filter @eva/mobile exec tsc --noEmit` + `expo export --platform android` + `pnpm exec vitest run --project mobile-node` |
| W4 | `pnpm typecheck` + `pnpm test:changed` |
| W5 | los de W3 y W4 (toca las dos plataformas) |
| W6 | `pnpm lint` + `pnpm docs:check` + Playwright §6.5 + `qa:prod:suave` tras el deploy |

---

## 7. QA del owner (W6) — checklist por plataforma

> **Este checklist es el CANÓNICO del tren** (45 puntos: 18 + 15 + 12, más §7.4). `TASKS.md` **no**
> mantiene una segunda lista: apunta acá con el conteo real. Los puntos que el SPEC declara
> obligatorios viven **solo** en esta sección: **CA-96 keep-awake** (§7.1 p17), **CA-97 / R29
> movilidad sin `duration_sec`** (§7.1 p18) y **R31 notificación del SO** (§7.1 p16, §7.2 p14).
> Cualquier «≥ N puntos» de `PLAN.md` se lee contra estos números.

Cuentas: las de `docs/testing/E2E_PERSONAS.md` y las cuentas de prueba del owner. **Los datos de Movens
son de solo lectura**: mirar la ficha, nunca registrar series en sus alumnos. Para escribir, un alumno
de prueba con el plan sintético del seed (§6.5).

**Criterio transversal «los que solo usan reps no notaron nada»:** en cada plataforma se repite el
mismo recorrido con un alumno de control **sin ningún bloque por tiempo**. Cualquier diferencia visible
(chip, resumen, descanso, copy) es **bloqueante del tren**.

### 7.1 RN iOS device (app 1.1.2 **con la OTA aplicada**) — 18 puntos

| # | Qué hacer | Resultado esperado |
|---|---|---|
| 1 | Confirmar que la OTA entró (grupo de update, runtime `1.1.2`) | La app abre con el bundle nuevo |
| 2 | Superserie con miembro de movilidad: abrir la tarjeta activa | **El video se ve completo**; el reloj (anillo ~80 px) está **debajo**, no lo tapa ni lo colapsa (V1) |
| 3 | No tocar nada durante 10 s | **El reloj no arranca solo** (A1/R21); el CTA dice «Iniciar hold» |
| 4 | Tocar «Iniciar hold» y dejar llegar a 0 | Al llegar a 0 **la serie se guarda sola**, sin tocar nada (V2); háptica al cerrar (R18) |
| 5 | Seguir mirando la tarjeta | Pasa **sola** al siguiente miembro de la ronda (V4) y aparece «¡Sigue sin detenerte!» sin gesto (R23) |
| 6 | Cerrar la ronda (último miembro) con la pref **OFF** | **El descanso NO arranca solo**; aparece «Ronda lista · Descansar 90 s» y el interstitial sale recién al tocar (D2) |
| 7 | Hold `per_side`: arrancar el izquierdo y dejarlo llegar a 0 **en primer plano** | Guarda el izquierdo y **el derecho arranca solo** (comportamiento de hoy) |
| 8 | Hold `per_side`: arrancar el izquierdo y **bloquear la pantalla** 3 min; volver | Al volver, el izquierdo quedó guardado con **30 s (el objetivo)**, nunca 180; el derecho queda en «Iniciar lado derecho», **NO arranca solo** (R6) |
| 9 | Tocar «Listo» a los ~15 s de un hold de 30 | Guarda **15 s** (A2/R22) y sigue el mismo flujo; en per_side guarda el lado y pasa al derecho |
| 10 | Tocar la tarjeta de un hold ya guardado (per_side) | Abre a editar **con los dos lados** (izq/der) y al confirmar **no borra el desglose** (R7) |
| 11 | Fuerza por tiempo (`3 × 30 s · 10 kg`) en pantalla sola | Anillo ~130 px bajo el media, tiles **KG** y **SEG**; a 0 guarda «10 kg × 30 s» y muestra «Descansar 90 s» / «Siguiente serie» (V3) |
| 12 | **Modo avión**: hacer una serie por tiempo, salir del avión | La serie sube con `actual_hold_sec` **y** el desglose; el chip pasa de pendiente a guardado |
| 13 | Primer entreno de un alumno **nuevo** de prueba | Sale el modal «¿Pasamos solo al descanso?» **una sola vez**, en el primer ejercicio; responder lo persiste; volver a entrar **no** lo muestra otra vez |
| 14 | Tuerca (⚙) del entreno | Hay **una sola** fila «Pasar solo al descanso» (no dos toggles); moverla cambia el comportamiento en la serie siguiente |
| 15 | **R24 · Alumno nuevo, FUERZA CLÁSICA (reps), pref OFF**: aplastar una serie de un bloque con `rest_time > 0` | **Hay cómo descansar**: aparece el par «Descansar N s» (juicy) / «Siguiente serie» (secundario). Sin este punto, la pref OFF por defecto dejaría al alumno nuevo **sin ningún botón de descanso** — hoy V3 no tiene uno manual (RN solo tiene los dos `startRest` automáticos de `ExecutorV3.tsx:796` —ronda de superserie— y `:830` —bloque suelto—). Repetir en movilidad y en fuerza por tiempo |
| 16 | **R31 · Aviso del SO**: con el permiso de notificaciones **ya concedido**, arrancar un hold de 60 s y mandar la app a segundo plano | Llega **una sola** notificación «Terminó tu hold» al vencer; al volver, la serie está guardada. Con el permiso **denegado**: no llega nada y **no** aparece ningún prompt (nunca se promptea). Con la app **abierta**: no hay notificación, solo háptica — nada de doble beep |
| 17 | **R31 · Keep-awake**: apagar «Mantener pantalla encendida» en la tuerca (`ExecutorV3.tsx:229-241`) y arrancar un hold de 30 s **sin tocar el teléfono** | La pantalla puede dormirse: es un comportamiento **declarado, no un bug** (§12 del SPEC). Al volver, el reloj se reconstruye por `endAtMs` y **la serie quedó guardada con el objetivo**; el lado derecho queda en «Iniciar lado derecho», no arranca solo (R6/R27) |
| 18 | **R29 · Movilidad SIN `duration_sec`** (uno de los 94 bloques de LIVE), en superserie y en pantalla sola | **No aparece ningún módulo de reloj**: queda la fila manual de hoy, tal cual. «Listo» desde `idle` siembra el objetivo, como siempre (CA-90) |

### 7.2 PWA móvil (Chrome Android + Safari iOS, sesión de alumno) — 15 puntos

| # | Qué hacer | Resultado esperado |
|---|---|---|
| 1 | Movilidad en pantalla sola, antes de arrancar | El botón grande dice **«Iniciar hold»** (ya no «Listo»); «Listo» queda como secundario (B) |
| 2 | Tocar «Iniciar hold» | El anillo de 214 px corre; el CTA pasa a «Pausar» secundario + «Listo este lado» juicy — **paridad con RN** |
| 3 | Dejar llegar a 0 | **Guarda solo** (V2) y **no** pasa al descanso ni al siguiente ejercicio (V3) |
| 4 | Superserie con miembro de movilidad | Reloj bajo el video (V1), avance solo al siguiente miembro (V4) |
| 5 | Último miembro de la ronda, pref OFF | «Ronda lista · Descansar 90 s»; el descanso arranca al toque (D2) y el interstitial conserva **banner «Ronda N lista», dots y próxima ronda** (R28: el contexto se guardó en el commit, no al tocar) |
| 6 | Fuerza por tiempo con 10 kg | El tile de peso se conserva; a 0 guarda y la fila muestra «10 kg × 30 s» |
| 7 | **Cambiar de pestaña** a mitad de un hold y volver a los 2 min | Al volver, la serie ya está guardada con el objetivo (no con el tiempo real fuera) |
| 8 | Fila de captura mientras el reloj corre | En pantalla sola la fila **sigue visible** (deshabilitada, no oculta); en superserie, corriendo se ve **solo el módulo** (R8) |
| 9 | Sin arrancar el reloj, escribir el hold a mano en la fila y confirmar | Se guarda igual — **el camino manual de hoy sigue existiendo** (es el que usan 29 de 32 holds de Movens) |
| 10 | Modo avión: serie por tiempo → volver a red | Sube con segundos y metadata |
| 11 | Modal D5 en un alumno nuevo | Sale una vez, en el primer ejercicio; el pie dice que se cambia en la tuerca |
| 12 | Alumno de **control** sin bloques por tiempo | Ejecutor idéntico a antes del deploy: descanso, chips y resúmenes sin cambios |
| 13 | **R24 · Alumno nuevo, fuerza clásica, pref OFF**: aplastar una serie con `rest_time > 0` | **Hay cómo descansar**: «Descansar N s» / «Siguiente serie». Hoy el único botón manual de la web vive en la barra legacy (`ManualTimerButton`, montado en `WorkoutExecutionClient.tsx:2995-2998`, dentro del `!execV3Active` de `:2994`), así que sin este punto la pref OFF deja al alumno sin salida |
| 14 | **R31 · PWA en iOS con la pestaña en segundo plano** | **No llega ningún aviso** — está en «Qué NO se promete» del SPEC. Al volver, la serie está guardada con el objetivo. En Chrome Android, con permiso concedido, llega la notificación |
| 15 | **R33 · CSS**: abrir un bloque de **cardio** con cronómetro, y después una **movilidad sola** | El anillo de cardio se ve **idéntico** a antes del deploy (`.exec-v3-holdwrap`/`.exec-v3-holdnum` no se tocaron) y la movilidad sola conserva sus **214 px** ya migrada al módulo nuevo (`.exec-v3-holdmod` con `--exec-hold-size`) |

### 7.3 Web desktop (Chrome, sesión de coach) — 12 puntos

| # | Qué hacer | Resultado esperado |
|---|---|---|
| 1 | Builder → bloque de fuerza | Aparece el grupo **«Prescripción»** con segmented **«Reps \| Segundos»**; nace en **Reps** |
| 2 | Cambiar a **Segundos** | Aparece «Segundos por serie *» (placeholder «Ej. 30», hint «el alumno ve la cuenta atrás»); **Peso, RIR, Tempo, Descanso y Lado siguen ahí** (D3) |
| 3 | Escribir `3` segundos y guardar | **No deja guardar**: «Una serie por tiempo va entre 5 y 600 segundos» (R11, validación dura) |
| 4 | Escribir `700` | Mismo rechazo |
| 5 | Escribir `30` y guardar | Guarda; la lista del día muestra el chip **«Por tiempo»** y el resumen `3 × 30 s · 10 kg` |
| 6 | Volver a **Reps** | Los campos de tiempo se limpian y vuelve el campo de repeticiones; nada más se pierde |
| 7 | Progresión en modo Segundos | Ofrece **«+ Peso»** y **«+ Segundos»**; la **doble progresión** no está disponible |
| 8 | Cambiar el bloque de fuerza-tiempo a **Movilidad** y volver a **Fuerza** | El modo tiempo se limpió; el bloque vuelve a Reps sin residuos |
| 9 | Ficha del alumno → pestaña de entrenamiento, con una serie por tiempo registrada | Se lee `10 kg × 30 s` (o `… por lado`), **nunca** «10 kg × 0 reps» |
| 10 | Ficha → récords del ejercicio | **Ningún récord con «× 0 reps»**; ojo: hay 72 pares que hoy lo muestran y tras M2 cambian o desaparecen (§2.1) — verificar 2 de ellos y confirmar que es lo esperado |
| 11 | Resumen de sesión del alumno | El hold de fuerza **no** infla el tonelaje (volumen 0) pero **sí** enciende su zona en el mapa muscular (R16) |
| 12 | Coach de **control** que solo usa reps | Builder, ficha, resúmenes y récords **idénticos** a antes del deploy |

### 7.4 Casos de Movens (solo lectura, con el coach avisado)

- Sus 32 bloques de movilidad (21 en superserie) ahora muestran el reloj dentro de la superserie: abrir
  **la ficha**, no el ejecutor de un alumno real.
- Sus 4 bloques de roller **no** cambian: siguen sin cuenta atrás (R12, fuera de alcance declarado).
- «Plancha frontal mantenida» sigue siendo **cardio** hasta que él la convierta: el tren **no migra
  nada solo**. El aviso debe decir cómo convertirla (Fuerza → Segundos).
- 6 de sus 9 alumnos **no** tienen token nativo (web/PWA o Android): el QA de §7.2 pesa más que el de
  §7.1 para este coach.
- Flota mixta: los devices sin la OTA siguen viendo la fila de fuerza clásica con `reps = "30s"`
  (§0.2). Decirlo en el aviso.

---

## 8. Observabilidad (R19)

### 8.1 Eventos PostHog (4, snake_case)

RN usa el wrapper `captureAppEvent(event, props)` (`apps/mobile/lib/analytics.ts:136-139`: no lanza, no
bloquea, sin `identify()`); web usa `ph?.capture(event, props)` directo (patrón vivo
`LogSetForm.tsx:895` con `set_logged_per_side`). Verificado con Grep: **no hay ningún evento `hold_*`
hoy** ⇒ sin colisión de nombres.

| Evento | Cuándo | Props |
|---|---|---|
| `hold_timer_started` | al tocar «Iniciar hold» / «Iniciar serie» (A1) | `{ block_id, exercise_type, context: 'solo'\|'superset', side_mode }` |
| `hold_timer_completed` | al llegar a 0 y guardarse solo (V2) | `{ block_id, exercise_type, context, hold_source, closes_round, via_app_state }` |
| `hold_early_finished` | al tocar «Listo» antes de 0 (A2) | `{ block_id, exercise_type, context, elapsed_sec, prescribed_sec }` |
| `rest_autostart_pref_set` | al fijar el toggle D5 | `{ source: 'first_modal'\|'settings_sheet', enabled }` |

`hold_auto_saved` **se elimina** (era redundante con `hold_timer_completed`). **Sin PII**: nunca nombre
ni correo del alumno.

⚠ **La propiedad se sigue llamando `via_app_state`** — es el nombre canónico de R19 y renombrarla
partiría la serie en PostHog — pero **su valor es el `expiredWhileAway` de R27**, no «lo disparó el
listener de AppState». Es la única sobrevivencia del nombre viejo, y es deliberada
(`SPEC.md` CA-08d).

### 8.2 Adopción a 72 h — la consulta de verdad

`metadata` **no tiene índice** (`pg_indexes` sobre `workout_logs`: 7 índices, ninguno sobre el jsonb),
así que la consulta va **acotada por fecha** y se corre a mano, no en un dashboard:

```sql
-- ¿Se usa el reloj? (correr 72 h después del deploy; <deploy> = timestamptz del deploy)
SELECT COALESCE(metadata->>'hold_source', 'sin_marca') AS origen,
       count(*)                                        AS series,
       count(DISTINCT client_id)                       AS alumnos
  FROM public.workout_logs
 WHERE logged_at >= '<deploy>'::timestamptz
   AND actual_hold_sec IS NOT NULL
 GROUP BY 1
 ORDER BY 2 DESC;
```

Lectura: `timer` = el reloj cerró la serie; `manual` = «Listo» antes de 0, tipeo o edición;
`sin_marca` = cliente **sin la OTA** o log anterior al tren (nunca se lee como «manual», §3.1(b)).

> **Precondición dura (F1):** esta consulta **solo dice la verdad si §3.3.b está implementado**. La
> mayoría de los holds de hoy son de **movilidad** (los 32 del caso canónico de Movens, STATS) y
> **bilaterales**; sin `holdSource` en `TypedPayloadContext` + `buildLogMetadata`, `buildTypedPayload`
> nunca define `metadata` en bilateral (`set-log-payload.ts:129`) y RN no escribe la columna
> (`workout-session.ts:974` solo escribe si el payload la trae) ⇒ **todo saldría `sin_marca`** y la
> métrica de adopción, CA-28 y CA-84 quedarían ciegas justo donde más se usa el reloj. Si a las 72 h
> `sin_marca` domina, lo primero que se revisa es §3.3.b, no la OTA (§8.4, segunda señal).

Complemento para fuerza por tiempo:

```sql
SELECT count(*) AS series_fuerza_por_tiempo, count(DISTINCT wl.client_id) AS alumnos
  FROM public.workout_logs wl
  JOIN public.workout_blocks wb ON wb.id = wl.block_id
 WHERE wl.logged_at >= '<deploy>'::timestamptz
   AND wb.reps_unit = 'sec'
   AND wl.actual_hold_sec IS NOT NULL;
```

### 8.3 Sentry

- **RN**: `Sentry.captureException(err, { tags: { area: 'hold-autolog' }, extra: { blockId, exerciseType, context } })`
  — patrón vivo en `apps/mobile/components/alumno/workout/v3/session-morph.tsx:311`
  (`tags: { area: 'exec-v3-despegue' }`).
- **Web**: mismo tag, con `import * as Sentry from '@sentry/nextjs'` — patrón vivo en el propio árbol
  del ejecutor: `apps/web/src/app/c/[coach_slug]/dashboard/_components/launch/WorkoutLaunchMorph.tsx:8,208`
  (cierra el gap 3 de r5).
- Se instrumenta **solo el camino de auto-envío** (el `catch` del commit disparado por el reloj), en
  las dos plataformas. El camino manual ya tiene su chip de reintento.

### 8.4 Umbral de alarma

> **> 2 % de auto-envíos con error en 72 h** ⇒ se apaga el auto-guardado (la pantalla vuelve a
> sembrar la caja sin enviar) y se investiga.

Numerador: eventos Sentry con `tags.area = 'hold-autolog'`. Denominador: `hold_timer_completed` de
PostHog. Segunda señal, independiente: si `sin_marca` no baja en 72 h para clientes con la OTA, la
metadata no está viajando (revisar **§3.3.b**, §3.1(b) y §5.3 — en ese orden: §3.3.b es el que cubre
movilidad, que es la mayoría de los holds).

---

## 9. Threat model y regresiones

| # | Amenaza | Por qué es real (evidencia) | Mitigación | Test que la fija |
|---|---|---|---|---|
| **T1** | **Doble guardado de la misma serie** (el reloj expira y el alumno toca «Listo» casi a la vez; o la pantalla se remonta) | `firedRef` (`timing.ts:50-52`) solo protege dentro de la vida del hook; no cubre remontaje ni cambio de serie | 4 capas: `savedRef` por `block:set:side` en la pantalla (s2 §2.3) · dedup optimista por `block:set` (`workout-session.ts:919`) · **índice único** `workout_logs_one_set_per_day` (§3.4) · rescate de `23505` en la action web (`workout-log.actions.ts:217-240`). En el peor caso es un UPDATE con el mismo valor, no una serie fantasma | W1.T1 (caso 12) + W1.T3 (doble registro ⇒ mismo veredicto) + W3.T2 |
| **T2** | **Hold falso guardado en background**: el lado izquierdo vence con la pantalla bloqueada, al volver el derecho arranca solo y se guarda un tiempo que nadie hizo | Verificado: `MobilityScreenV3.tsx:119-141` — `triggerDone` dispara `finishSide` **y** `countdown.restart`. Hoy es inocuo (solo llena una caja); **con V2 escribe datos basura** | R6 + **R27**: `expiredWhileAway` **derivado de la evidencia** (`(Date.now() - endAtMs) > 1500` ‖ app no activa), evaluado dentro de `triggerDone` — **nunca** leído del emisor, porque el tick (`timing.ts:59-71`) puede ganarle al listener de `AppState` (`:73-79`) y en web el `setInterval` solo se *throttlea* (`useExecCountdown.ts:71-83`, `visibilitychange` en `:89-99`). Si venció en background: se guarda **el objetivo** (`prescribedSec`, nunca el reloj de pared) y el lado 2 queda **`prime`ado** («Iniciar lado derecho»), no arranca solo. Copy honesto en el SPEC | W1.T1 (casos 5 y 6) + W3.T3 y W4.T4 (**los dos caminos de disparo con reloj falso, mismo resultado**) + QA §7.1 punto 8 |
| **T3** | **`metadata` pisado**: el guardado del 2º lado manda `hold_source` **solo** y borra `left_sec`/`right_sec` | `workout-log.actions.ts:150-156` documenta que si la key `metadata` viaja, **REEMPLAZA el jsonb entero**; ya borró los lados una vez (deuda W2.3). Además `LogSetForm.tsx:840` tiene un `formData.delete('metadata')` en la rama de fuerza | Regla dura: `hold_source` viaja **siempre** en el mismo objeto que los lados; un solo escritor de la key por submit (§5.3) | W4.T2 (las 3 claves juntas; sin key ⇒ columna intacta) |
| **T4** | **Cliente viejo contra DB nueva** (ventana entre deploy y OTA, y flota que nunca actualiza) | `runtimeVersion.policy = appVersion` ⇒ la OTA solo alcanza binarios 1.1.2; población 7 d: 1.1.1 sigue viva (STATS) | La app vieja **nunca escribe `'sec'`** (su Zod no lo tiene) ⇒ no puede corromper nada; leyendo un bloque en modo tiempo ve fuerza clásica con `reps = "30s"`: degradación honesta. Orden M1 → deploy → OTA (§0.2) | QA §7.4 (flota mixta) + el aviso a Movens |
| **T5** | **Regresión en coaches que solo usan reps** (8 173 bloques): payload distinto, resumen distinto, descanso distinto | Cualquier toque a `buildStrengthPayload` o a `formatLoggedSetLine` los alcanza a todos | `buildStrengthPayload` **congelado** (función nueva, no sobrecarga); `formatLoggedSetLine('strength') === null` intacto; `REPS_UNIT_VALUES` y el CHECK **solo amplían**; el predicado exige `reps_unit === 'sec'` (H8) | §6.4 completo + W1.T6 + W1.T8 + QA punto 12 de cada plataforma |
| **T6** | **Alumno demo / coach en «Vive tu app» ve el modal D5** y lo responde por su alumno | `apps/mobile/lib/vive-tu-app.ts:8-16` da magic link al coach como su alumno demo; `is_demo` **no llega** al ejecutor (`apps/mobile/lib/client.ts:17-18`) | Sumar `is_demo` al select existente (aditivo) + `resolveShowAutoRestModal` lo excluye; fallback: el historial sembrado del demo ya lo excluye | W1.T4 (caso `isDemo`) |
| **T7** | **El coach ve «desaparecer» récords** tras M2 | Medido: 72 pares (17 alumnos) hoy encabezados por una fila sin reps; **48 dejan de listarse** y 12 bajan de peso (§2.1) | Es una corrección, pero se **anuncia** en el aviso del tren y se verifica en QA §7.3 punto 10 con 2 casos concretos | Snapshot del paso 0 del protocolo LIVE, guardado en el PR |
| **T8** | **Modal repetido = hostigamiento** (storage inaccesible: modo privado, AsyncStorage roto) | Precedente: `WheelHint.tsx:31-34` acepta repetir el hint porque es informativo; un modal con decisión **no** | Fail-safe: si el storage no está disponible, **no** se muestra el modal y se usa el valor de cohorte (§3.6) | W1.T4 (`storageAvailable:false`) |
| **T9** | **Flip masivo de la preferencia**: poner D5 en OFF global apaga el descanso automático a **toda** la base (hoy el default es ON sin clave) | RN `timers/rest-timer-preferences.ts:54` (`autoTimer: true`); web `WorkoutExecutionClient.tsx:1222` (`useState(true)`, solo `'false'` apaga) Default **por cohorte** (R1): con historial ⇒ ON (lo que viven hoy); primer entreno ⇒ OFF + modal. Clave **nueva** por alumno, la vieja solo se lee. **Y `hasHistory := !showModal` (§3.6.a, F5)**: las señales del bundle están acotadas a los ejercicios del plan (`workout-execution.queries.ts:255-260`, `:286-297`), así que un veterano con mesociclo nuevo — o un demo, o `stepIndex > 0` — quedaría OFF sin decidir nada; con la regla, OFF nace **solo** cuando el modal se muestra | W1.T4 (las 4 cohortes + los 5 casos F5) + W5.T3 (paridad de claves) |
| **T10** | **Edición del hold per_side borra el desglose** — y con V2 la edición pasa a ser el camino normal | Verificado: `ExecutorV3.tsx:556-562` pasa el contexto **deliberadamente sin `sideMode`** («confirmar borraría el hold guardado»), y la siembra escribe un solo eje (`:585-586`) | R7 entra al tren: `openSet` pasa `sideMode` y siembra `hold_left_sec`/`hold_right_sec` desde `metadata`; toda edición manual reescribe `hold_source: 'manual'` (si no, la métrica de §8 miente) | QA §7.1 punto 10 + W1.T7 |
| **T11** | **Serie por tiempo perdida en offline** (modo avión, se guarda sin los segundos) | `LogSetForm.tsx:854` encola fuerza **sin** `actualHoldSec`; el módulo de cola sí sabe mandarlo (`workout-offline-queue.ts:146`) | §5.3 punto 4 | W4.T3 + QA §7.1 punto 12 y §7.2 punto 10 |
| **T12** | **`hold_source` estripado en web** ⇒ la telemetría dice «RN sí, web no» y se lee como «la web no usa el reloj» | Zod v4 estripa lo no declarado (`packages/schemas/workout.ts:293-296`); RN escribe directo a PostgREST sin Zod (`workout-session.ts:974`) | §3.1(b) + el chequeo de §8.4 (si `sin_marca` no baja, la metadata no viaja) | W1.T5 |
| **T16** | **`hold_source` nunca escrito en MOVILIDAD** (que es la mayoría de los holds) ⇒ CA-28 falso, CA-84 y §8.2 ciegas, y el umbral de §8.4 no se puede calcular | Verificado: `buildTypedPayload` define `metadata` **solo** en la rama `per_side` (`set-log-payload.ts:120-128`), su `TypedPayloadContext` solo conoce `hrMetadata` (`:145-152`), RN escribe `metadata` solo si viene (`workout-session.ts:974`) y la web la **borra** sin lados (`LogSetForm.tsx:1929`) sin pasar por ahí en bilateral (`:1912`) | **§3.3.b**: `holdSource` en `TypedPayloadContext` + `buildLogMetadata` (W1), contexto-objeto en `use-hold-module` (W3), un solo `formData.set('metadata')` en la rama de movilidad web (W4) | W1.T2 caso (b) + §5.4 assert de movilidad + §8.2 (precondición) |
| **T17** | **Asimetría de lados en `alternating`**: RN pide **una** caja de hold y la web **dos** ⇒ el mismo bloque produce payloads distintos por plataforma y el desglose se inventa | Verificado: movilidad trata `alternating` como un lado (`typed-screen-model.ts:146-148`, `typed-keypad.ts:100`, `set-log-payload.ts:121`); el eje de **reps** de fuerza lo trata como dos (`set-log-payload.ts:261`, `LogSetForm.tsx:357`) | **§3.3.a / R34**: regla única «solo `per_side` captura dos lados» expresada como `holdSidesFor(sideMode)` en el motor (`per_side ⇒ ['left','right']`; `alternating`/`null` ⇒ `['single']`) y consumida por keypad, payload, `use-hold-module` y las dos UIs; fuerza clásica intacta | W1.T2 caso (a) + W1.T7 + **W1.T16 (assert de paridad web ↔ RN)** + §5.4 columna `alternating` |
| **T13** | **Progresión congelada** en un bloque por tiempo con `progression_mode='double'` | `parseRepsTop("30s") = 30` + `reps_done NULL` ⇒ `holding` para siempre (`progression.ts:187-228`) | Guard §4.2 + el builder baja `double` → `weekly_linear` al activar Segundos | W4.T1 |
| **T14** | **Hold perdido si el SO mata el proceso** (`holdAnchor` está fuera de alcance, R13) y **retorno después de medianoche** | s2 §2.5: sin ancla persistida, un kill en background pierde el hold en curso | **Se declara**, no se promete: el SPEC dice «si la app se cierra a mitad del hold, lo reinicias». **Auditoría del caso medianoche (R13):** ninguna RPC lee `logged_at` intra-día — las tres que bucketean por día usan el día **Santiago** (`get_client_current_streak` ⇒ `min(public.eva_santiago_day(wl.logged_at))`; `get_client_activity_dates` y `get_client_workout_day_counts` ⇒ `timezone('America/Santiago', wl.logged_at)::date`), igual que el índice único (`eva_santiago_day(logged_at)`) y que la ventana de upsert de RN (`workout-session.ts:985-1000`). `day-completion.ts` **no mira `logged_at`** (cuenta filas por `blockId#set_number`, `:193-208`) ⇒ el cierre del día en la sesión no se ve afectado. Consecuencia real y **aceptada**: si el alumno vuelve pasada la medianoche, esa serie suma al día siguiente en racha y calendario, y **no** choca con el índice único (es otra clave) | — (declarado en el SPEC; auditoría en esta fila) |
| **T15** | **Storage privado del alumno**: la preferencia D5 no viaja web ↔ RN | Decisión R1: sin tabla ni RLS nueva (`client_feature_prefs` no admite escritura del alumno, `20260618200000_feature_prefs.sql:102-115`) | Se declara al owner: el modal sale **una vez por superficie** (una en la app, una en la web) | QA §7.1 punto 13 + §7.2 punto 11 |

| **T18** | **El alumno nuevo se queda SIN forma de descansar** (R24): con la pref OFF por defecto en el primer entreno y sin CTA manual, el descanso simplemente no existe para él | Verificado: en V3 no hay botón manual de descanso — RN solo tiene los dos `startRest` automáticos (`ExecutorV3.tsx:796` y `:830`; `:762` y `:822` son las **lecturas de la preferencia**, no las llamadas) y el `ManualTimerButton` web se monta solo en la barra legacy (`WorkoutExecutionClient.tsx:2995-2998`, dentro del `!execV3Active` de `:2994`) | **R24**: tras cerrar cualquier serie (tocada o por reloj) con pref OFF y `rest_time > 0` se pinta el par «Descansar N s» (juicy, llama al **mismo** `startRest` de hoy) / «Siguiente serie» (secundario), en fuerza clásica, movilidad, fuerza por tiempo y último miembro de la ronda | QA §7.1 punto 15 + §7.2 punto 13 |
| **T19** | **El `<form>` desmontado se traga el auto-guardado**: si R8 («corriendo ⇒ solo el módulo») se implementa con condicional de render, `requestSubmit()` no tiene destino y la serie se pierde **en silencio** | El auto-envío web depende de `formRef.current?.requestSubmit()` — el molde vivo de cardio (`LogSetForm.tsx:1818-1831`) exige el form montado | **R26**: la fila del miembro activo **nunca se desmonta** mientras el `HoldModuleV3` esté montado; se oculta con `hidden` + `inert` (web) y `display: 'none'` (RN) | W4.T5 (a) y (b): form en el DOM + **exactamente un** `logSetAction` · W3.T2 (espejo RN) |
| **T20** | **D2 pierde el contexto de la ronda**: el interstitial sale sin banner «Ronda N lista», sin dots y sin próxima ronda | `ExecutorV3.tsx:696` resetea `restRoundContextRef` en **cada** commit y el contexto solo se arma dentro de la rama que hoy llama `startRest` (`:770-790`), con `members`/`projected`/`effByBlock` que solo existen ahí. Con D2 el descanso arranca **después** ⇒ llegaría `null` | **R28**: `pendingRoundRest` se construye **en el commit** con el `RestRoundContext` completo y **antes** del reset de `:696`; el CTA repone `restRoundContextRef.current` y recién ahí llama `startRest`. Web: sin `countKind` — el rótulo viaja en `label` (`WorkoutTimerProvider.tsx:17-21,33`) | W4.T8 casos (a)–(d) + QA §7.2 punto 5 |
| **T21** | **Módulo de reloj montado sin objetivo**: un bloque de movilidad sin `duration_sec` mostraría un anillo de 0 s que se autoguarda solo | 94 bloques de movilidad en LIVE no tienen `duration_sec` | **R29**: predicado único de montaje — `(duration_sec ?? 0) > 0` (movilidad) **o** `isStrengthTimeBlock` (fuerza). Sin duración, la fila manual de hoy queda **tal cual**; «Listo» desde `idle` sigue sembrando el objetivo (CA-90) | W1.T6 (caso R29) + QA §7.1 punto 18 |

**Superficie que NO se toca (y por eso se dice):** RLS de `workout_logs` (6 policies, ninguna mira
columnas de contenido) · índices (ninguno nuevo; filtrar por `hold_source` a escala **no está
soportado**, §8.2) · cardio (regla del brief) · roller con reloj (R12) · Live Activity del hold
(exige build nativa) · `service_role` (jamás expuesto) · **el CSS del anillo de cardio (R33)**.

**R33 · CSS: clase nueva, cardio intacto.** `.exec-v3-holdwrap` y `.exec-v3-holdnum`
(`apps/web/src/app/globals.css:5417`, `:5449`) **las usa `CardioStepV3`** (`:518`, `:538`, `:689`,
`:711`, `:722`) y **no se tocan**: cualquier cambio de tamaño ahí le movería el anillo al cronómetro
de cardio, que este tren congela (CA-14). El módulo nuevo estrena **`.exec-v3-holdmod`** con la
variable **`--exec-hold-size`** (80 en superserie / 130 en fuerza por tiempo / 214 en movilidad sola)
y sus propios selectores. Movilidad sola **migra** al módulo nuevo en W4 **sin cambiar sus 214 px**.
Punto de QA (§7.2 y §7.3): abrir un bloque de **cardio** con cronómetro y confirmar que el anillo se
ve **idéntico** a antes del deploy; y comparar la movilidad sola contra una captura previa (mismos
214 px).

---

## 10. Checklist de salida de esta capa
> **IDs propios de esta capa (D1…D17).** No son los de `TASKS.md`: acá numeraban distinto y chocaban (W0.1, W4.7, W6.8, W6.10, W6.11, W6.12 significaban otra cosa en TASKS). La wave va **entre paréntesis** para que la correspondencia sea explícita sin robarle la numeración a TASKS.


- [ ] D1 (W0) Snapshot del paso 0 guardado en el PR (conteo de `reps_unit` + los 72 pares de §2.1). (Opus)
- [ ] D2 (W0) Dry-run tx-rollback de M1 (**con la prueba positiva del bloque temporal del alumno E2E**,
  §1.4) y de M2, con la salida pegada en TASKS. (Opus)
- [ ] D3 (W0) M1 y M2 aplicadas en LIVE **en W0** (R35), verificadas con `pg_get_constraintdef` y
  `pg_get_functiondef`. El deploy y la OTA son W6: **W0 migra → W6 deploya → W6 OTA**. (Opus)
- [ ] D4 (W0) `get_advisors` sin advisor nuevo. (Opus)
- [ ] D5 (W0) Contrato Zod/TS de §3.1–3.2 en el código, con sus tests verdes. (Opus)
- [ ] D6 (W1) Los **5** archivos de test nuevos creados y verdes (§6.1, incluido
  `superset-holds.parity.test.ts`). (Opus)
- [ ] D7 (W1) `holdSource` en `TypedPayloadContext` + `buildLogMetadata` (§3.3.b, **movilidad y
  roller**; roller siempre `'manual'`) **y** `holdSidesFor` (R34) consumido por payload, keypad y
  `mobilitySides` (§3.3.a), con el assert de payload byte-idéntico sin `holdSource` (W1.T2 casos
  a/b/c) y el assert de paridad de `alternating` (W1.T16). Sin esto, §8.2 mide `sin_marca` para toda
  movilidad. (Opus)
- [ ] D8 (W1) El contrato del motor usa **`expiredWhileAway`** (R27), no `viaAppState`; los dos caminos
  de disparo (tick y evento) dan el mismo resultado con reloj falso (W1.T1 casos 5–6, W3.T3, W4.T4) y
  los hooks exponen **`prime(seconds)`** + `endAtMs`. (Opus)
- [ ] D9 (W1) El predicado de montaje del módulo (**R29**) está en el motor y tiene su fila de test:
  movilidad sin `duration_sec` ⇒ **no monta** (W1.T6). (Opus)
- [ ] D10 (W5) El default de la pref se calcula con `hasHistory: !showModal` (§3.6.a) en **las dos**
  plataformas, con los 5 casos de W1.T4 verdes, la estrategia aislada en
  **`AUTOREST_DEFAULT_STRATEGY`** (R25, con su fila `'off'` en el test) y la lectura **síncrona con
  caché hidratada una vez** (R36; en web la verdad vive en `WorkoutExecutionClient` y baja como prop
  `autoTimerEnabled`). (Opus)
- [ ] D11 (W5) El modal D5 se muestra tras retirarse el overlay del Despegue, en el primer ejercicio,
  **sin** condición de `rest_time`; con `clientId` nulo en web cae a la clave legacy y **no** se
  muestra; `is_demo` llega desde el fetch raíz del alumno (R32). (Opus)
- [ ] D12 (W4) `pr-card` filtrado y `LogSetForm` con guard + `holdPrefill.submit` + encolado (§5.3),
  **rama propia de fuerza por tiempo `per_side`** (R37: sin `buildStrengthPayload`, sin
  `formData.delete('metadata')`, un solo `set('metadata')` con las tres claves, `reps_done` fuera del
  FormData) y el **invariante de montaje del form** (R26). (Opus)
- [ ] D13 (W6) Playwright del caso canónico verde con el seed extendido (§6.5). (Opus)
- [ ] D14 (W6) QA del owner completo en las 3 plataformas (§7), con el punto de control «solo reps» verde. (owner)
- [ ] D15 (W6) Consulta de adopción de §8.2 corrida a las 72 h y anotada; umbral de §8.4 no superado. (Opus)
- [ ] D16 (W6) `docs/status/CURRENT.md` y `docs/status/MOBILE_PARITY.md` actualizados; `pnpm docs:check` verde. (Opus)
- [ ] D17 (W6) **Aviso GENERAL a coaches** (`news_items`) con **dos líneas obligatorias, sin mensajes
  individuales** (R35 / DECISIONS-2 DATA-3 y PLAN-3): (a) los récords de un ejercicio ahora solo
  cuentan series con repeticiones (M2, §2.1: 72 pares cambian o dejan de listarse); (b) con «Pasar
  solo al descanso» apagada **ya no se cancela** un descanso que el alumno arrancó a mano (R1). Más
  la línea de flota mixta de §7.4 (devices sin la OTA ven la fila de fuerza clásica con
  `reps = "30s"`). (owner)

