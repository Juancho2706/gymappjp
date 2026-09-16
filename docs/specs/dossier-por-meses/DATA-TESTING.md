---
status: active
owner: product-engineering
last_verified: "2026-09-15"
canonical: false
---

# DATA-TESTING — Dossier por meses

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md) · [TASKS](TASKS.md).

Contrato ejecutable, SQL de validación, casos de prueba y rollback del tren. **Ninguna salida de esta página se da por buena sin haberla ejecutado**: los bloques que dicen «pegar acá» quedan vacíos hasta que alguien corra el comando y pegue el resultado real.

---

## 1. Contrato jsonb (R10)

`public.get_client_month_reports(p_client_id uuid, p_months date[]) returns jsonb` devuelve:

```json
{
  "months": [
    {
      "month": "2026-07-01",
      "period": { "from": "2026-07-01", "to": "2026-07-31" },
      "training_days": ["2026-07-01", "2026-07-03", "…"],
      "sessions": 24,
      "planned_days": 31,
      "planned_per_week": 7,
      "volume_total": 363927,
      "volume_by_group": [
        { "muscle_group": "Glúteos", "volume": 52533 },
        { "muscle_group": "Espalda", "volume": 41200 }
      ],
      "prs": [
        {
          "exercise_id": "…",
          "name": "Peso muerto",
          "muscle_group": "Espalda",
          "max_weight_kg": 350,
          "reps_at_max": 15,
          "achieved_at": "2026-07-17",
          "prev_max_kg": 305
        }
      ],
      "program": {
        "id": "…",
        "name": "Hipertrofia Q3",
        "start_date": "2026-06-15",
        "end_date": null,
        "weeks_total": 12,
        "week_from": 2,
        "week_to": 7,
        "days": [{ "title": "Push day", "day_of_week": 1, "block_count": 7 }]
      },
      "plan_names_from_logs": ["Push day", "Pull day"],
      "check_ins": [
        {
          "id": "…",
          "created_at": "2026-07-17T13:04:11.000Z",
          "weight": 64.4,
          "energy_level": 8,
          "notes": "…",
          "front_photo_url": "<path sin firmar>"
        }
      ],
      "weight": { "last_kg": 64.4, "last_at": "2026-07-17T13:04:11.000Z", "prev_kg": 64.5 },
      "nutrition": { "plan_name": "Volumen limpio", "in_range_days": 12, "tracked_days": 20 }
    }
  ]
}
```

### 1.1 Reglas de cada campo

| Campo | Regla |
|---|---|
| `months` | **En el orden pedido** por `p_months`. Un mes sin actividad **igual aparece**, con sus listas vacías. |
| `month` | Primer día del mes, `YYYY-MM-DD`. |
| `period.from` | Primer día del mes (Santiago). |
| `period.to` | Último día del mes; **mes en curso ⇒ hoy** (Santiago), no el fin de mes. |
| `training_days` | Días **locales** (Santiago) distintos con al menos un `workout_logs`. Ascendente. |
| `sessions` | `count(distinct (día_local, COALESCE(plan_name_at_log, wp.title)))`. Informativo; los tiles usan `training_days`. |
| `planned_days` | `round(planned_per_week × días_del_período ÷ 7)`. **`null` sin programa** ⇒ adherencia sin denominador. |
| `planned_per_week` | `count(distinct day_of_week)` de los `workout_plans` del programa con al menos un `workout_blocks`. Con `ab_mode`, **promedio de A y B**, redondeado. `null` sin programa. |
| `volume_total` | Suma de `weight_kg × reps_eff` del mes. |
| `volume_by_group` | Orden `volume desc`, **sin tope en SQL** (el modelo corta a 8). |
| `prs` | Máximo por ejercicio **dentro del mes**, orden `max_weight_kg desc`, **sin tope en SQL** (el modelo corta a 10). |
| `prs[].prev_max_kg` | Máximo del ejercicio **antes** del mes, de todo el historial. `null` = primer récord ⇒ **es nuevo**. |
| `prs[].achieved_at` | Día local del log que fijó el máximo del mes. |
| `program` | El vigente en el período (R7); `null` si no hay. |
| `program.week_from` / `week_to` | Semana del programa en la que caen el inicio y el fin del período. |
| `plan_names_from_logs` | `array_agg(distinct plan_name_at_log)` del mes. Es el fallback del encabezado cuando `program` es `null`. |
| `check_ins` | Orden `created_at` **desc**; los campos `reviewed_at` / `reviewed_by` **no** viajan (son del coach, no del alumno). |
| `check_ins[].front_photo_url` | **Path sin firmar** del bucket `checkins`. Firmarlo es de la capa de aplicación. |
| `weight` | Último check-in con peso **hasta `period.to`** (puede ser de un mes anterior) + el inmediatamente anterior. `null` si el alumno nunca registró peso. |
| `nutrition` | `null` si no hubo plan V2 publicado vigente en el período. |

**Tipos en el cliente**: PostgREST serializa `numeric` como **string**, así que el package tipa todos los numéricos del jsonb como `JsonNumber = number | string` (`packages/client-dossier/src/types.ts:198`) y el modelo los normaliza. Un test que espere `64.4` y reciba `"64.4"` está mal escrito, no roto.

### 1.2 Bordes de los chips (R11)

`public.get_client_report_bounds(p_client_id uuid) returns jsonb`:

```json
{ "first_month": "2026-06-01", "current_month": "2026-09-01" }
```

`first_month = date_trunc('month', least(clients.created_at, clients.subscription_start_date, min(workout_logs.logged_at), min(check_ins.created_at)))` en Santiago. Se usa `least(...)` y no solo `created_at` porque un alumno migrado puede tener logs anteriores a su fila de `clients`.

---

## 2. Fuentes verificadas de cada predicado (R6)

Copiar, no reinventar. Si alguno diverge, el volumen del mes contradice el volumen de 30 días de la misma ficha.

| Concepto | Definición | Archivo |
|---|---|---|
| Récords | `weight_kg IS NOT NULL AND weight_kg > 0 AND reps_done IS NOT NULL AND reps_done > 0 AND COALESCE(wb.exercise_id, wl.exercise_id) IS NOT NULL` | `supabase/migrations/20260910205101_get_client_exercise_prs_reps_filter.sql:39-44` |
| `reps_eff` | `left_reps` y `right_reps` `~ '^[0-9]{1,4}$'` en **los dos** ⇒ suma; si no, `reps_done` | `supabase/migrations/20260903212800_muscle_volume_side_metadata.sql:56-60` |
| Filtro de volumen | `COALESCE(weight_kg,0) * COALESCE(reps_eff,0) > 0` | `20260903212800:67-75` |
| Grupo muscular | `COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro')` | `20260903212800:53` |
| JOIN de ejercicio | `LEFT JOIN public.exercises e ON e.id = COALESCE(wb.exercise_id, wl.exercise_id)` | `20260903212800:63-64` |
| Guard IDOR | propio / `clients.coach_id = auth.uid()` / `current_user_pool_client_ids()` | `20260903212800:39-43` |
| ACL + verificación | `REVOKE … FROM PUBLIC, anon, service_role` + `GRANT … TO authenticated, service_role` + `DO $verify$` | `20260903212800:84-106` |
| 42501 | `raise exception '…' using errcode = '42501'` | `supabase/migrations/20260714190500_nutrition_v2_security_rpc.sql:449` |
| TZ hardcodeada | `timezone('America/Santiago', …)` sin parámetro | `supabase/migrations/20260612051000_rpc_client_workout_day_counts.sql:20,23` |
| Consumo de nutrición | `private.nutrition_v2_intake_totals(client, día)` (`language sql stable`, solo lectura) | `supabase/migrations/20260728120000_nutrition_v2_macros_basis.sql:221` |
| «En rango» | `ratio = consumidas ÷ meta`, en rango cuando `ratio ∈ [0,9 ; 1,1]` | `apps/web/src/app/coach/nutrition-v2/[clientId]/_lib/week-nav.ts:97-107` |

---

## 3. Validación en LIVE con transacción y ROLLBACK (R12)

**Antes de `apply_migration`, sin saltear pasos.** Elegir un alumno real con historial de varios meses de un **coach de prueba**; **nunca** una cuenta «jamás tocar» ni un alumno de un coach pagador.

### 3.1 Datos de la corrida

| Dato | Valor |
|---|---|
| `client_id` de prueba | _(pegar acá)_ |
| `coach_id` dueño | _(pegar acá)_ |
| `coach_id` ajeno (para la denegación) | _(pegar acá)_ |
| Fecha y hora de la corrida | _(pegar acá)_ |

### 3.2 Script

```sql
BEGIN;

-- 1) Crear las dos funciones DENTRO de la transacción (pegar el cuerpo de
--    supabase/migrations/20260915230000_client_month_reports.sql tal cual).
\i supabase/migrations/20260915230000_client_month_reports.sql

-- 2) Ponerse en la piel del coach DUEÑO (rol + claims), nunca service_role.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '<coach_id_dueño>', 'role', 'authenticated')::text,
  true
);

-- 3) Forma del jsonb: 3 meses, uno de ellos el mes en curso.
SELECT jsonb_pretty(
  public.get_client_month_reports(
    '<client_id>'::uuid,
    ARRAY['2026-07-01','2026-08-01','2026-09-01']::date[]
  )
);

-- 4) Invariantes del contrato: 3 meses, en el orden pedido, y el mes en curso corta en hoy.
WITH r AS (
  SELECT public.get_client_month_reports(
           '<client_id>'::uuid,
           ARRAY['2026-07-01','2026-08-01','2026-09-01']::date[]
         ) AS j
)
SELECT
  jsonb_array_length(j -> 'months')                                    AS meses,
  j -> 'months' -> 0 ->> 'month'                                       AS primero,
  j -> 'months' -> 2 ->> 'month'                                       AS ultimo,
  j -> 'months' -> 2 -> 'period' ->> 'to'                              AS corte_mes_en_curso,
  (timezone('America/Santiago', now()))::date::text                    AS hoy_santiago
FROM r;

-- 5) Bordes de los chips.
SELECT jsonb_pretty(public.get_client_report_bounds('<client_id>'::uuid));

-- 6) Nutrición SOLO LECTURA: el conteo de snapshots no puede moverse.
SELECT count(*) AS snapshots_antes
  FROM public.nutrition_day_snapshots_v2 WHERE client_id = '<client_id>'::uuid;
SELECT public.get_client_month_reports('<client_id>'::uuid, ARRAY['2026-07-01']::date[]) IS NOT NULL;
SELECT count(*) AS snapshots_despues
  FROM public.nutrition_day_snapshots_v2 WHERE client_id = '<client_id>'::uuid;

-- 7) Denegación: mismo cliente, claims de OTRO coach ⇒ 42501.
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '<coach_id_ajeno>', 'role', 'authenticated')::text,
  true
);
-- Esperado: ERROR  client_month_reports_denied  (SQLSTATE 42501)
SELECT public.get_client_month_reports('<client_id>'::uuid, ARRAY['2026-07-01']::date[]);

-- 8) Tope de meses: 25 ⇒ 22023. (Volver a los claims del coach dueño antes de correrlo.)
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '<coach_id_dueño>', 'role', 'authenticated')::text,
  true
);
-- Esperado: ERROR  ... (SQLSTATE 22023)
SELECT public.get_client_month_reports(
  '<client_id>'::uuid,
  (SELECT array_agg((date '2024-09-01' + (n || ' month')::interval)::date)
     FROM generate_series(0, 24) AS n)
);

ROLLBACK;
```

> Los pasos 7 y 8 **abortan la transacción** en `psql` por diseño (un `raise exception` la deja en estado de error). Correrlos **cada uno en su propia transacción**, o envolverlos en `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`, para que el resto del script siga siendo verificable en una sola pasada.

### 3.3 Salida real

_(pegar acá la salida completa, incluido el `ROLLBACK`)_

### 3.4 Advisors

`get_advisors` (security y performance) **antes** y **después** de aplicar:

_(pegar acá: sin hallazgo nuevo atribuible a este tren)_

---

## 4. EXPLAIN esperado

### 4.1 Comando

Con los claims del coach dueño, dentro de la misma transacción, sobre el cuerpo principal del CTE de logs y **12 meses**:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  (timezone('America/Santiago', wl.logged_at))::date        AS dia_local,
  date_trunc('month', timezone('America/Santiago', wl.logged_at))::date AS mes_local,
  wl.weight_kg, wl.reps_done, wl.metadata, wl.plan_name_at_log,
  COALESCE(wb.exercise_id, wl.exercise_id)                  AS exercise_id
FROM public.workout_logs wl
LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
WHERE wl.client_id = '<client_id>'::uuid
  AND wl.logged_at < (((date '2026-09-01' + interval '1 month')::timestamp) AT TIME ZONE 'America/Santiago');
```

### 4.2 Qué tiene que salir

- **`Index Scan`** (o `Bitmap Heap Scan` con su `Bitmap Index Scan`) usando `idx_workout_logs_client_id_logged_at` (`supabase/migrations/00000000000001_baseline.sql:2079`) o `idx_wl_client_logged_notnull` (`supabase/migrations/20260612050000_workout_logs_perf_indexes.sql:9`), con la condición de rango sobre `logged_at` **en el índice**, no en un `Filter`.
- **Una sola** pasada sobre `workout_logs`: ningún nodo repetido por mes.
- `Seq Scan on workout_logs` ⇒ **la ola aborta**: significa que el filtro dejó de ser sargable (típicamente porque alguien escribió `timezone('America/Santiago', wl.logged_at)::date >= …` en el `WHERE`).
- Referencia de tamaño: un alumno con ~4.000 logs y 12 meses tiene que resolverse con **un** range scan.

### 4.3 Paridad con el volumen de la ficha

Con el mismo alumno, comparar el `volume_total` de un mes contra el mismo cálculo hecho con los predicados de `get_client_muscle_volume` acotados a ese rango. Tienen que **coincidir exactamente**. Si difieren, alguno de los cinco predicados de §2 se copió mal.

_(pegar acá la salida del EXPLAIN y la comparación)_

---

## 5. Casos de prueba

### 5.1 Identidad del dossier «Estado actual» (DM-04) — **el más importante**

- **T-ID-1** `buildClientDossier(input, { generatedAtIso })` devuelve un objeto **byte-idéntico** al de antes del tren para el mismo input (el test existente `apps/web/src/services/client/client-dossier.test.ts` pasa **sin tocarlo**: el re-export de tipos es transparente).
- **T-ID-2** `buildTodayTiles(dossier)` devuelve los seis `{ label, value, sub }` con **exactamente** los strings que hoy arma el PDF en `apps/web/src/lib/pdf/client-dossier-pdf.ts:208-243`: `Peso`, `Adherencia semanal`, `Racha`, `Workouts semana`, `Nutrición semana`, `Check-ins`. Incluye el dead-band de ±0,05 kg de `:198`: un Δ de `+0.03` da `sin cambio`, no `+0.0 kg`.
- **T-ID-3** El stem del archivo de «Estado actual» no cambia: `dossier-<slug>-<YYYY-MM-DD de generación>` (`client-dossier-pdf.ts:662`).

### 5.2 `months.ts` (package)

| # | Caso | Esperado |
|---|---|---|
| T-M-1 | `monthRangeFrom('2026-06-01','2026-09-01')` | `['2026-06','2026-07','2026-08','2026-09']` |
| T-M-2 | `monthRangeFrom('2026-09-01','2026-09-01')` | `['2026-09']` |
| T-M-3 | `monthRangeFrom(null, '2026-09-01')` | `['2026-09']` (no explota con `null`) |
| T-M-4 | `monthPeriod('2026-07','2026-09-15')` | `{ fromIso: '2026-07-01', toIso: '2026-07-31' }` |
| T-M-5 | `monthPeriod('2026-09','2026-09-15')` (**mes en curso**) | `{ fromIso: '2026-09-01', toIso: '2026-09-15' }` |
| T-M-6 | `monthPeriod('2026-02','2026-09-15')` (**bisiesto**) | `toIso: '2026-02-28'` — y `2028-02` ⇒ `2028-02-29` |
| T-M-7 | `formatMonthLabel('2026-09')` | `sept 2026` (tabla literal, sin `Intl`) |
| T-M-8 | `dossierFileStem('José Ñandú', ['2026-07'])` | `dossier-jose-nandu-2026-07` |
| T-M-9 | `dossierFileStem('José Ñandú', ['2026-07','2026-08','2026-09'])` | `dossier-jose-nandu-2026-07_2026-09` |
| T-M-10 | `dossierFileStem('', [])` | `dossier-alumno-…` (nunca un stem vacío) |

### 5.3 `buildClientMonthDossier` (package)

| # | Caso | Esperado |
|---|---|---|
| T-B-1 | **Mes vacío** (`training_days: []`, `prs: []`, `check_ins: []`, `program: null`, `nutrition: null`) | No lanza. Tiles: peso `—`, adherencia `—`, días entrenados `0`, volumen `0 kg`, récords `0`, check-ins `0`. Secciones con sus empty-states. |
| T-B-2 | **Mes en curso** (`period.to` = hoy) | El chip del encabezado dice `sept 2026`; la meta dice `Período 1–15 sept 2026`. |
| T-B-3 | **Sin programa** (`program: null`, `planned_days: null`) | Tile 2 valor `—` sub `sin programa`; tile 3 `12` sin denominador. **Nunca** un denominador de 7 inventado. |
| T-B-4 | **Programa borrado** (`program: null`, `plan_names_from_logs: ['Push day','Pull day']`) | Nombre del programa `Entrenamientos registrados` y días = esos dos nombres, **sin** `block_count`. |
| T-B-5 | **Récord nuevo** (`max_weight_kg: 350`, `prev_max_kg: 305`) | `isNew = true` ⇒ ★ en la fila y suma 1 al tile 5. |
| T-B-6 | **Récord repetido** (`max_weight_kg: 305`, `prev_max_kg: 305`) | `isNew = false` ⇒ sin ★ y **no** suma al tile 5. |
| T-B-7 | **Primer récord** (`prev_max_kg: null`) | `isNew = true`. |
| T-B-8 | **Peso dentro del período** (`last_at` en julio) | Tile 1 valor `64,4 kg`, sub `−0,1 kg`. |
| T-B-9 | **Peso fuera del período** (`last_at` en junio, mes pedido julio) | Tile 1 con el valor de junio y sub `último check-in 28 jun`. |
| T-B-10 | **Sin ningún peso** (`weight: null`) | Tile 1 valor `—`, sub vacío. |
| T-B-11 | **Δ dentro del dead-band** (`last_kg: 64.43`, `prev_kg: 64.40`) | Sub `sin cambio`, no `+0,0 kg`. |
| T-B-12 | **Topes del modelo** (`prs` con 25 entradas, `volume_by_group` con 14) | 10 récords y 8 grupos en el modelo; el jsonb llega completo. |
| T-B-13 | **Numéricos como string** (`"max_weight_kg": "350.0"`) | El modelo los normaliza: el tile imprime `350`, no `"350.0"`. |
| T-B-14 | **Eyebrow** (`index: 2`, `total: 3`) | `Informe mensual del alumno · 2 de 3`. |
| T-B-15 | **`generatedAtIso` único** | Tres llamadas con el mismo `generatedAtIso` ⇒ los tres modelos dicen la misma fecha de generación. |
| T-B-16 | **Programa con `end_date` dentro del período** | Subtítulo `Semanas 2–7 de 12 · finalizó el 18 jul`. |
| T-B-17 | **Fotos** (`photoUrls` sin la entrada de un check-in) | Ese check-in queda con `photoUrl: null` y el informe imprime el placeholder, no rompe. |

### 5.4 Casos del RPC (contra LIVE, dentro de la tx de §3)

| # | Caso | Esperado |
|---|---|---|
| T-R-1 | **Mes vacío**: pedir un mes anterior al primer log del alumno | El mes **aparece** en `months` con listas vacías, `planned_days` según el programa (o `null`), `weight` con el último peso conocido hasta ese corte (o `null`). **Nunca** se omite del array. |
| T-R-2 | **Mes en curso** | `period.to` = `(timezone('America/Santiago', now()))::date`, y `training_days` no incluye ningún día posterior. |
| T-R-3 | **Alumno sin programa** | `program: null`, `planned_days: null`, `planned_per_week: null`, y `plan_names_from_logs` con lo que haya en los logs. |
| T-R-4 | **Programa borrado con `plan_name_at_log`** | Con logs cuyo `block_id` quedó en `null` (FK `ON DELETE SET NULL`, `supabase/migrations/20260630190000_workout_logs_block_id_set_null.sql`), `program` es `null` y `plan_names_from_logs` trae los nombres congelados en `workout_logs.plan_name_at_log`. |
| T-R-5 | **Récord nuevo vs repetido** | Para un ejercicio con máximo 305 en junio y 350 en julio: julio trae `prev_max_kg: 305`. Para uno que igualó su máximo: `max_weight_kg = prev_max_kg` ⇒ el modelo no lo marca nuevo (T-B-6). |
| T-R-6 | **Check-in del peso rápido a medianoche UTC** | Un check-in con `date = '2026-08-01'` y `created_at = '2026-08-01T03:12:00Z'` cae en **agosto** (el eje es `created_at`, R5). Si cayera en julio, alguien volvió a usar `check_ins.date`. |
| T-R-7 | **Denegación** | Con claims de otro coach: `ERROR client_month_reports_denied`, `SQLSTATE 42501`. **Nunca** un jsonb vacío. |
| T-R-8 | **Más de 24 meses** | 25 meses ⇒ `ERROR`, `SQLSTATE 22023`. |
| T-R-9 | **Nutrición solo lectura** | `count(*)` de `nutrition_day_snapshots_v2` idéntico antes y después de llamar al RPC (§3.2 paso 6). |
| T-R-10 | **Nutrición «en rango»** | Para un día con meta 2.000 kcal: consumo 1.900 ⇒ **en rango** (`ratio 0,95`); 1.700 ⇒ **fuera** (`0,85`); 2.250 ⇒ **fuera** (`1,125`). Es el mismo umbral que `resolveCoachDayAdherence` (`apps/web/src/app/coach/nutrition-v2/[clientId]/_lib/week-nav.ts:97-107`) y así quedó escrito en `supabase/migrations/20260915230000_client_month_reports.sql:472-490`. |
| T-R-11 | **Sin plan V2 en el mes** | `nutrition: null` ⇒ el PDF imprime «Sin plan de nutrición vigente.» |
| T-R-12 | **`ab_mode`** | Un programa A/B con 4 días en A y 3 en B ⇒ `planned_per_week = 4` (promedio 3,5 redondeado). |
| T-R-13 | **Orden de `months`** | Pedir `['2026-09-01','2026-07-01']` devuelve septiembre **primero**: el orden es el del array, no cronológico. |

### 5.5 Smoke test de jsPDF (R18)

`apps/web/src/lib/pdf/client-dossier-pdf.smoke.test.ts` — el holder pasa de un valor suelto a `captured: ArrayBuffer[]`.

| # | Caso | Esperado |
|---|---|---|
| T-P-1 | Un `ClientDossierData` suelto (firma vieja) | Sigue funcionando: un `save()`, nombre `dossier-<slug>-<fecha>.pdf`. |
| T-P-2 | **3 informes junto** (`[d1,d2,d3]`, sin `separate`) | **Un** `save()`, nombre `dossier-<slug>-2026-07_2026-09.pdf`, `doc.getNumberOfPages() > 3`. |
| T-P-3 | **3 informes separado** (`{ separate: true }`) | **Un** `save()` de un **zip** `dossier-<slug>-2026-07_2026-09.zip` con **3 entradas**, cada una un PDF. Cero `save()` extra. |
| T-P-4 | Informe con `tiles` provistos | El grid imprime esos seis y **no** recalcula nada. |
| T-P-5 | Dossier sin `tiles` | El generador cae a `buildTodayTiles(dossier)` (DM-20). |

### 5.6 Qué **no** se testea con unitarios

- El HTML de RN (`renderDossierHtml`): no hay runner de `expo-print`. Se valida en **QA de device** (SPEC §17, puntos 19–22).
- El diálogo y el sheet: se validan en QA (SPEC §17, puntos 1–18).
- `tests/dossier-export.spec.ts` (Playwright) se **escribe y no se corre** (R25); corre solo en el gate final autorizado por el owner.

---

## 6. Divergencias aceptadas

- **D-1 (R26) · La ficha web cuenta «workouts esta semana» en UTC.** El fallback parte el ISO con `split('T')[0]`; el informe mensual corta en Santiago. Entre las 21:00 y la medianoche de Chile, un entreno puede contarse en semanas distintas según quién lo mire. **No se toca la ficha en este tren.** Si en QA el coach ve «3 esta semana» en la ficha y el informe de septiembre cuenta ese entreno en otro día, **no es un bug de este tren**.
- **D-2 · `check_ins.date` sigue en medianoche UTC.** El peso rápido escribe `YYYY-MM-DD`; leída como instante, esa columna corre el día hacia atrás en Santiago. Este tren la esquiva usando `created_at` (R5, T-R-6); la columna sigue mintiendo para cualquier otro consumidor.
- **D-3 · El criterio «en rango» no vive en el RPC de historia.** R9 decía copiarlo de `get_nutrition_history_page_v2`; verificado, ese RPC (`supabase/migrations/20260716210000_nutrition_v2_t11_hardening.sql:207-360`) devuelve `targets` y `consumed` y **no clasifica**. La clasificación es TypeScript (`week-nav.ts:97-107`, banda `[0,9 ; 1,1]`) y el RPC mensual la replica en SQL. T-R-10 congela la equivalencia.
- **D-4 · El dossier RN «de hoy» sigue con nutrición V1** (`apps/mobile/lib/coach-client-detail.ts:1157`) hasta que se tome el backlog de R22. El informe mensual **no** lo hereda.

---

## 7. Rollback de la migración

La migración es **aditiva pura**: crea dos funciones nuevas, no toca tablas, filas, índices ni la ACL de objetos existentes. Revertirla es borrar las dos funciones.

```sql
-- Rollback de 20260915230000_client_month_reports.sql
-- Va en un archivo de migración NUEVO (nunca se edita una migración aplicada).
DROP FUNCTION IF EXISTS public.get_client_month_reports(uuid, date[]);
DROP FUNCTION IF EXISTS public.get_client_report_bounds(uuid);
```

**Efecto en los clientes**: el diálogo web y el sheet RN pierden el modo «Por meses» (el RPC devuelve `42883`, función inexistente, que la server action traduce a un error visible en el diálogo). El camino **«Estado actual» sigue intacto**: no pasa por ninguna de las dos funciones.

**No hay datos que revertir**: ninguna fila fue creada, modificada ni borrada por este tren.
