---
status: draft
owner: product-engineering
last_verified: "2026-09-26"
canonical: false
---

# SPEC — Kilos o libras en el ejecutor

> El alumno elige **kg o lb** al anotar cada ejercicio; la app guarda siempre en kilos y le muestra
> todo (objetivo, última vez, sugerencia, récord) en la unidad que eligió. El builder deja de tener dos
> campos que se contradicen.
>
> Origen: pedido de las coaches de **Doblemente Fit** (Silvia y Angela Montefusco, coach
> `doblementefit-20de5n`) por WhatsApp, 26-09: «tener las dos opciones a la hora de ejecutar los
> ejercicios y colocar si el alumno está con kilos o libras». Estado: **borrador** — esperan las
> decisiones D1–D5 (§4) y el mockup (artifact de pedidos 26-09). Plan en [PLAN.md](PLAN.md);
> tareas en [TASKS.md](TASKS.md).

## 1. El problema, con evidencia (LIVE, 26-09)

No es solo una mejora: **hoy hay datos mal guardados**.

- `workout_blocks.load_unit` acepta `kg | lb | sec` (CHECK en
  `supabase/migrations/20260611090002_workout_blocks_polymorphic.sql:39`) y el builder web tiene un
  selector «Unidad de carga» kg/lb (`apps/web/src/app/coach/builder/[clientId]/components/BlockEditSheet.tsx:928-945`),
  **escondido en «Ejes adicionales»** y separado del campo «Peso Objetivo (kg)» (`:821-835`), que escribe
  `target_weight_kg` sin mirar la unidad.
- El ejecutor web y el RN rotulan **siempre «Kg»** (`apps/mobile/components/alumno/workout/SetRow.tsx:866-889`,
  `KeypadHost.tsx:345`, `v3/ExerciseStepV3.tsx:527,551`) y guardan en `workout_logs.weight_kg numeric(6,2)`.
  `load_unit` solo se muestra en la tarjeta «Carga» cuando hay `load_value > 0`
  (`WorkoutExecutionClient.tsx:466-467`, `TypedTargetGrid.tsx:92`), y **ningún bloque tiene `load_value`**.
- En LIVE hay **65 bloques en `lb` de 4 coaches** (doblementefit 36, jesus-coach 24, monkey 4,
  robin-coach 1), contra 3 en `kg` y 9.918 sin unidad. Todos con `load_value` NULL.
- Sus alumnos anotan **libras en el campo de kilos**: ~295 series con números como aducción 190–210,
  curl femoral 130, estocadas 35 por mancuerna. Y 11 bloques `lb` tienen `target_weight_kg` escrito en
  libras (p. ej. 132,5). Récords, tonelaje, volumen muscular y dossier de esos alumnos salen ~2,2× inflados.

## 2. Lo que ya existe y NO se toca

- `weight_kg` lo leen ~140 archivos TS/TSX y 8 funciones de la base: `get_client_exercise_prs`,
  `get_client_weekly_prs`, `get_client_daily_tonnage`, `get_client_muscle_volume`,
  `get_client_strength_series`, `get_client_activity_dates`, `get_client_month_reports`,
  `get_client_report_bounds`. **Regla dura: `weight_kg` sigue siendo kilos, siempre.** La conversión vive
  solo en la entrada y la presentación del ejecutor y del builder.
- `workout_logs.metadata` (jsonb) ya lleva `left_sec/right_sec`, `left_reps/right_reps`, `skipped`,
  `skip_reason`, `hold_source` (`packages/schemas/workout.ts:335-368`). Se **reemplaza entero** en cada
  escritura que lo trae (`workout-log.actions.ts:177`, `apps/mobile/lib/workout-session.ts:1087`).
- Cola offline RN (`enqueueLog`) y borrador web (`workout-draft-store.ts`) guardan pesos en kg.

## 3. Requisitos

**R1 · Selector en el ejecutor (web + RN).** En el teclado/rueda de peso aparece un selector
`kg | lb` por ejercicio. Unidad inicial, en este orden: la del último registro del alumno en ese ejercicio
→ `load_unit` del bloque → `kg`. Cambiarla no borra lo tecleado: lo convierte.

**R2 · Guardado canónico.** Se guarda `weight_kg = round(lb × 0,45359237, 2)` y la unidad tecleada
(D1). Ida y vuelta exacta a 0,1 lb: `numeric(6,2)` deja un error máximo de 0,011 lb.

**R3 · Todo lo que el alumno ve, en su unidad.** Prescripción («4 × 8 · 60 lb»), «Última vez»,
autollenado, sugerencia de progresión (redondeada a 2,5 lb), línea «Serie N · 45 lb × 8», resumen de la
sesión, celebración de récord y rueda (lb: 0–900 en pasos de 2,5; kg sigue 0–400 en 2,5). Chips del
teclado en lb: 1 · 2,5 · 5 · 10.

**R4 · Builder coherente (web + RN).** El selector kg/lb pasa a estar **pegado a «Peso objetivo»**.
Lo que escribe el coach se guarda en kg (`target_weight_kg`) y se muestra en la unidad del bloque
(`load_unit`). Se retira el selector duplicado de «Ejes adicionales».

**R5 · Vistas del coach.** v1: los números pasan a ser correctos en kg (ficha, gráficos, récords,
dossier), y la línea de cada serie agrega «(45 lb)» cuando se tecleó en libras. Una preferencia de unidad
del coach para toda la analítica queda en v2 (D5).

**R6 · Datos viejos.** Nada se corrige a ciegas: ver D4.

**R7 · Sin romper lo offline.** Una serie encolada antes de la OTA llega sin unidad ⇒ se trata como
`kg` (así se tecleó en esa versión). Nunca se convierte dos veces: la conversión ocurre una sola vez, en el
payload (`packages/workout-engine/set-log-payload.ts`), y está cubierta por tests de ida y vuelta.

## 4. Decisiones del owner (pendientes)

- **D1 · Dónde se guarda la unidad tecleada.** (a) **Columna nueva `workout_logs.weight_unit text`,
  nullable, sin CHECK** (tabla caliente: la validación va en Zod, igual que el resto del payload). Es
  aditiva y en LIVE es solo metadata, sin reescribir la tabla. **Recomendada.** (b) Dentro de
  `metadata.weight_unit`, sin cambios en la base. Riesgo: `metadata` se reemplaza entero y cada escritura
  futura tendría que acordarse de repetir la unidad.
- **D2 · Unidad por defecto.** (a) Última usada por ese alumno en ese ejercicio → la del bloque → kg.
  **Recomendada** (una mancuerna en lb y una barra en kg en el mismo gimnasio conviven). (b) Una sola
  preferencia global por alumno.
- **D3 · Builder.** (a) Selector pegado a «Peso objetivo» y guardado en kg. **Recomendada.** (b) Dejarlo
  como está (el error de hoy sigue naciendo ahí).
- **D4 · Series y objetivos viejos (~295 series y 11 objetivos en bloques `lb`).** (a) Preguntar a
  cada uno de los 4 coaches y convertir solo lo confirmado, en una transacción con respaldo y rollback.
  **Recomendada.** (b) Convertir todo lo que cuelga de bloques `lb`. (c) No tocar nada.
- **D5 · Unidad en la analítica del coach.** (a) v1 en kg correctos + «(45 lb)» en la línea de serie;
  preferencia del coach en v2. **Recomendada.** (b) Todo en la unidad del coach desde v1 (triplica el
  alcance: RPC, gráficos, dossier, share).

## 5. Fuera de alcance

Peso corporal y check-ins (en Chile es kg), nutrición, tarjetas para compartir en lb (v2), preferencia
de unidad del coach (v2) y la unidad `sec`.

## 6. Analítica (PostHog, sin PII)

`weight_unit_toggled {from, to, surface: web|rn}` y la propiedad `weight_unit` en `set_logged`, si existe.
Éxito: con el tren en producción, 0 series nuevas con `weight_unit = null` en ejercicios de fuerza y
ninguna serie `lb` con `weight_kg` > 300.

## 7. QA del owner (lista cerrada)

1. Web: el coach elige «lb» junto a «Peso objetivo», escribe 45 y el alumno ve «45 lb».
2. Web: el alumno anota 45 lb; en la ficha del coach sale 20,4 kg «(45 lb)» y el récord es 20,4 kg.
3. RN: lo mismo en el teléfono (1.1.3 y 1.1.2), con el teclado y con la rueda.
4. El selector recuerda la unidad por ejercicio: la sesión siguiente arranca en lb.
5. Cambiar de kg a lb con un número escrito lo convierte (20 kg → 44,1 lb) y no lo duplica.
6. Modo avión en RN: anotar en lb, volver a tener red; la serie llega bien (sin doble conversión).
7. Un alumno que nunca tocó el selector sigue viendo y guardando exactamente como hoy.
8. Superserie y fuerza por lado: la línea «20 kg × 10 / 10» sale en la unidad elegida.
9. Celebración de récord y resumen de sesión en lb.
10. Datos viejos: solo cambian los que confirmó cada coach (D4).

## 8. Referencias

Estudio de este SDD (26-09): consultas en LIVE vía Supabase MCP y memoria
`project_pedidos_sergio_y_libras_20260926`. Hereda la política de «tabla caliente sin CHECK» de
`supabase/migrations/20260611090003_workout_logs_polymorphic_mirror.sql`.
