# Informe: Sustitución automática de "máquina ocupada" en la exec del alumno

Fecha: 2026-07-04 · Rama: `feat/redesign-eva-design-system` · Autor: investigación técnica (subagente)

Objetivo: cuando el alumno está ejecutando su rutina y la máquina/implemento está ocupado, ofrecer
un botón que abra un panel con 3-5 ejercicios equivalentes del **mismo grupo muscular**, permitir
el **swap in-place solo de esa sesión** (el plan NO se toca) y dejar el log **marcado como
sustitución visible para el coach en la ficha**.

---

## Estado actual (archivos:líneas concretos)

### Catálogo de ejercicios (`exercises`) — qué datos de equivalencia existen HOY

Columnas reales (`apps/web/src/lib/database.types.ts:1679-1754`):
`id, name, muscle_group (NOT NULL), secondary_muscles (text[]), equipment, body_part, exercise_type
(NOT NULL: strength|cardio|mobility|roller), difficulty, gender_focus, gif_url, video_url,
thumbnail_url, video_start_time/end_time, instructions (text[]), coach_id/org_id/team_id (scope),
deleted_at, source`.

Población real medida en prod (queries `execute_sql` sobre 847 filas, 846 activas):

| Señal | Cobertura | Utilidad como ranking |
|---|---|---|
| `muscle_group` | 846/846 (100%), 18 valores | **Filtro duro** (el eje del feature) |
| `equipment` | 846/846 (100%), 42 valores | **Eje principal de ranking** (señal fuerte) |
| `exercise_type` | 846/846 (100%) | Filtro (strength↔strength) |
| `secondary_muscles` | **5/846 (~0.6%)** | Inútil hoy (casi vacío) |
| `body_part` | **1/846** | Inútil |
| `difficulty` | **29/846 (~3%)** | Casi inútil |
| `movement_pattern` | **no existe la columna** | — |

`muscle_group` es el catálogo ES de `MUSCLE_GROUPS` (`apps/web/src/lib/constants.ts:9-28`).
Distribución strength por músculo (siempre hay alternativas): Hombros 110, Abdominales 106,
Tríceps 97, Bíceps 96, Glúteos 94, Pectorales 82, Espalda Alta 64, Dorsales 47, Cuádriceps 24,
Isquiotibiales 18 (mínimo). Variedad de equipment por músculo: 5-14 equipos distintos.

`equipment` es **texto libre** (no enum), mayormente inglés y con cola sucia:
`dumbbell 180, body weight 140, cable 130, barbell 104, leverage machine 74, smith machine 38,
band 37, weighted 23, kettlebell 21, ez barbell 21, sled machine 14, …` + contaminantes
legacy: `Corporal ×3, Peso libre ×1, Otro ×1`. Los tres "machine" (leverage/smith/sled = 126 filas)
son justo el escenario "máquina ocupada".

**Qué falta:** no hay patrón de movimiento (push/pull/hinge/squat), `secondary_muscles` y
`body_part` están vacíos, `equipment` no está normalizado. Conclusión: el ranking v1 sólo puede
apoyarse en `muscle_group` (filtro) + `equipment` (orden) + `exercise_type` (filtro). Es
exactamente el modelo de dos criterios de Fitbod ("same target muscle" + "same equipment").

### Cómo la exec renderiza un bloque y si ya existe swap de ejercicio

`apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` (1877 líneas):
- El ejercicio del bloque se resuelve con `getExercise(block)` = `block.exercises[0]`
  (`:980`) — siempre el **prescrito**. No existe ningún swap de ejercicio hoy.
- Card de bloque simple: fila tipo·músculo + botones **Detalles** / **Técnica**
  (`:1459-1495`), luego **nombre** (`:1498`) + dots de series (`:1512-1517`), prescripción
  (`:1524-1537`), "Última vez" con autollenado (`:1539-1559`), y `LogSetForm` por serie
  (`:1649`, `:1679`).
- Superserie: leyenda de miembros con gif/nombre/músculo (`:672-748`) + `LogSetForm` (`:815`).
- Modal de técnica: `openTechnique(exercise)` (`:1071`) abre gif/video (`:1788-1792`) — patrón
  `createPortal` + `framer-motion` (`AnimatePresence`) y un `Dialog` (shadcn) para el panel de
  descanso (`:1726`).
- `handleLogged(payload)` (`:1092`) hace write-through optimista a `sessionLogs` en memoria.
- Tipos locales `ExerciseType`/`BlockType` (`:40-135`) espejan
  `workout-execution.queries.ts:11-58`.

Precedente de swap en el producto: sólo **nutrición** (food swaps: `food_items.swap_options`,
`nutrition_meal_food_swaps`) — no hay equivalente para ejercicios.

Primitivas UI disponibles para el panel: `apps/web/src/components/ui/sheet.tsx` (bottom-sheet
shadcn) y `dialog.tsx`. El exec ya importa `Dialog` (`:19`).

### Modelo de datos del log y su población

`workout_logs` (`database.types.ts:4444-4530`) YA tiene columnas relevantes:
`exercise_id (uuid, snapshot), exercise_name_at_log, metadata (jsonb), note, target_reps_at_log,
target_weight_at_log, plan_name_at_log`.

- `note` (`text`) se agregó en `supabase/migrations/20260702230000_workout_logs_note_column.sql`
  — ADITIVA, sin GRANT extra. Ya viaja del alumno al coach y se pinta en la ficha.
- `metadata (jsonb)` se agregó en `20260611090003_workout_logs_polymorphic_mirror.sql:22`
  (hoy sin uso real en strength).
- **`exercise_id` lo puebla un TRIGGER `BEFORE INSERT`**
  (`20260701140000_workout_logs_exercise_id_snapshot.sql:28-48`): sólo lo setea desde el bloque
  **si `NEW.exercise_id IS NULL`** → un cliente PODRÍA mandar un `exercise_id` propio y el trigger
  lo respeta. **Gotcha crítico:** las 4 RPCs de progreso resuelven el ejercicio con
  `COALESCE(wb.exercise_id, wl.exercise_id)` (el **bloque gana**, líneas `:95, :131-144, :183, :265`)
  → aunque el log guarde otro `exercise_id`, PRs/volumen/series lo atribuyen al ejercicio del
  bloque mientras el bloque exista.
- `exercise_name_at_log` / `target_*_at_log` están **dormidas** (ningún INSERT del app las escribe;
  grep confirma cero writers). Sirven de precedente de patrón "snapshot de nombre".

Grants (`execute_sql` sobre `information_schema.column_privileges`): `workout_logs` tiene
**GRANT de TABLA** para `authenticated` (INSERT/UPDATE/SELECT sobre las 21 columnas, no
column-level). Evidencia decisiva: el `note` se agregó **sin** ninguna sentencia GRANT y el alumno
lo escribe. → **una columna nueva aditiva en `workout_logs` es escribible por el alumno sin GRANT
adicional** (a diferencia de `coaches`/`teams`/`clients` que sí tienen column-grants). El gotcha de
GRANT UPDATE(col) del CLAUDE.md **no aplica** a `workout_logs`.

### Write path del log (todo lo que hay que tocar para persistir la sustitución)

1. `LogSetForm.tsx` (999 líneas) → `FormData` → server action.
2. `_actions/workout-log.actions.ts` `logSetAction` — upsert por `(block_id, set_number, día)`;
   `payloadValues` (`:75-86`), INSERT (`:101-107`), UPDATE (`:90-94`).
3. Validación: `WorkoutLogSetSchema` (`packages/schemas/workout.ts:218-238`).
4. Offline: `apps/web/src/lib/workout-offline-queue.ts` — tipo `WorkoutOfflineLog` (`:3-21`) +
   `workoutLogToFormData` (`:105-120`); flush idempotente last-wins.
5. Rehidratación en la exec: `workout-execution.queries.ts:164-173` (logs de HOY).

### Read path del coach (dónde debe verse la sustitución)

- `services/client/client-detail.service.ts` `getClientWorkoutForDate` (`:882-912`): el SELECT
  (`:896-905`) JOINea `workout_blocks.exercises(name, muscle_group)` — es decir muestra el
  ejercicio **prescrito**, NO lo que el alumno realmente hizo. Aquí hay que traer las columnas
  nuevas.
- `TrainingTabB4Panels.tsx`: agrupa sets por nombre de ejercicio (`:658`) y ya pinta un badge de
  `note` por serie (`:713-732`) — patrón exacto para pintar el badge "sustituyó".

### Scope/querying reutilizable

`c/[coach_slug]/exercises/_data/exercises.queries.ts`: `resolveCatalogScope()` (devuelve
`scopeFilter` = sistema ∪ org|team|coach), `buildExerciseSearchOr()`, `fetchExercisePage()`,
`EXERCISE_LIST_COLUMNS` (`apps/web/src/lib/exercises/exercise-catalog-select.ts`). El agrupador de
sinónimos `muscleGroupToRegion` / `SYNONYM_TO_REGION` vive en
`workout/[planId]/muscle-map.ts:58-120`.

### Patrón espejo de constantes de un CHECK (lección INTAKE_SOURCES)

`services/nutrition-intake.service.ts:16-24`: `INTAKE_SOURCES = [...] as const` es la **fuente
única** que debe coincidir EXACTO con el `CHECK (source IN (...))` de la migración; el Zod y los
tests derivan de ahí (evita drift código/DB). Se aplica si v1 agrega una columna con CHECK
(ej. `substitution_reason`).

---

## Investigación web 2026 (fuentes)

**Fitbod** (dataset ~900 ejercicios, sin depender de AI para el swap): al tocar un botón sugiere
alternativas del mismo músculo con dos criterios — (1) **mismo músculo objetivo primario**,
(2) **mismo equipment** (si requiere varios implementos, primero los que matchean todos; si no hay,
los que matchean uno); ranking por "mScore" (fuerza ganada × efecto en el músculo × popularidad,
0-100). No tenemos mScore → se reemplaza por un tiebreak determinístico.
Fuentes: [Fitbod algorithm](https://fitbod.me/blog/fitbod-algorithm/),
[Fitbod Algorithm Q&A](https://fitbod.zendesk.com/hc/en-us/articles/16254175592215-Fitbod-s-Algorithm-Q-A),
[About Fitbod Exercises](https://fitbod.me/about-fitbod-exercises/).

**Hevy** — patrón UX de referencia: "Replace Exercise" ofrece **4 alternativas** recomendadas + "See
All Exercises"; y explícitamente permite editar/sustituir **sólo para la sesión actual** cuando el
equipo no está disponible ("do an alternative just once"), sin tocar la plantilla.
Fuente: [Hevy Trainer / workout plan generator](https://www.hevyapp.com/features/workout-plan-generator/).

**Ranking determinístico sin AI** (Fitness Volt / Arvo / MusclesWorked / ISSA / PT Direct):
el mejor sustituto matchea **mismo patrón de movimiento + mismo músculo primario**; se rankea por
**muscle overlap** y **weighted Jaccard similarity** sobre atributos (músculos primario/secundario,
patrón push/pull/hinge/squat, compound vs isolation, equipment, laterality, force type). Como EVA no
tiene patrón de movimiento ni secondary poblado, el v1 usa el subconjunto disponible (músculo +
equipment) y deja Jaccard/patrón como mejora futura cuando se enriquezca el catálogo.
Fuentes: [Fitness Volt substitute exercises](https://fitnessvolt.com/substitute-exercises/),
[Arvo exercise substitutes](https://arvo.guru/tools/exercise-substitutes),
[MusclesWorked](https://musclesworked.com/),
[ISSA machine alternatives](https://www.issaonline.com/blog/post/effective-alternatives-to-your-favorite-gym-machines),
[PT Direct movement patterns](https://www.ptdirect.com/training-design/training-fundamentals/the-primary-movement-patterns).

Matiz propio del caso "máquina ocupada": Fitbod prioriza el **mismo** equipment; pero si la máquina
está OCUPADA ese mismo equipment normalmente NO sirve. Por eso el ranking de EVA debe **des-priorizar
el equipment de la máquina ocupada** y subir las alternativas de peso libre/cable/peso corporal del
mismo músculo (el alumno igual ve el badge de equipment y elige el que esté libre).

---

## Diseño propuesto (arquitectura por capas, componentes, datos)

### Decisión de datos (parte d) — RECOMENDACIÓN

**Columnas aditivas dedicadas en `workout_logs`** (no reusar `note`, no jsonb):

```sql
-- migración aditiva, forward-only, idempotente
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS substituted_exercise_id   uuid
    REFERENCES public.exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS substituted_exercise_name text;  -- snapshot durable del nombre
CREATE INDEX IF NOT EXISTS idx_workout_logs_substituted_exercise_id
  ON public.workout_logs (substituted_exercise_id) WHERE substituted_exercise_id IS NOT NULL;
-- SIN GRANT extra: workout_logs tiene GRANT de tabla (ver evidencia arriba). SIN CHECK (v1
-- no tiene reason enum). El alumno escribe estas cols en el mismo payload del set.
```

Fundamento (por qué NO las otras dos opciones):
- **vs reusar `note`:** `note` es texto libre del alumno ("me dolió el hombro"); sobrecargarlo sería
  lossy, no parseable y chocaría con la feature de notas ya viva. Descartado.
- **vs `metadata` jsonb:** opaco (no indexable/queryable sin extracción), el JOIN de la ficha no
  resuelve el sustituto fácil, y rompe el patrón de snapshots escalares ya presente
  (`exercise_name_at_log`, `plan_name_at_log`). Descartado.
- **columnas dedicadas:** queryables, indexables, self-documenting, FK da integridad + permite
  re-resolver gif/video del sustituto, y el `substituted_exercise_name` sobrevive al hard-delete
  del ejercicio (mismo criterio que P1-3). `ON DELETE SET NULL` porque los ejercicios se
  soft-deletean pero el FK debe tolerar borrado duro. Semántica: `substituted_exercise_id != NULL`
  ⇒ "el alumno sustituyó". No hace falta columna `reason` en v1 (único motivo = máquina ocupada); si
  se quisiera extensible, agregar `substitution_reason text` + `CHECK` con const espejo
  (patrón `INTAKE_SOURCES`) — se recomienda **diferir** para no introducir riesgo de drift de CHECK.

**Interacción con `exercise_id` y las RPCs de progreso — decisión clave:**
NO tocar `workout_logs.exercise_id` ni las 4 RPCs. El trigger sigue poblando `exercise_id` desde el
bloque (prescrito). La sustitución vive **sólo** en las columnas dedicadas → el cambio es
**puramente aditivo/visibilidad, con cero blast-radius sobre el motor de progresión/PRs/volumen**
que se acaba de endurecer (P1-3). Como el `muscle_group` del sustituto es idéntico por construcción,
`get_client_muscle_volume` sigue correcto.

Limitación conocida (documentar): un set sustituido queda atribuido al slot del ejercicio prescrito
en `get_client_exercise_prs`/`strength_series`/`weekly_prs`. Si el sustituto es una máquina más
pesada, podría marcar un **PR falso** en el ejercicio prescrito. Mitigación barata v1 (client-side,
sin tocar RPCs): cuando hay sustitución activa en el bloque, **suprimir** el autollenado de "Última
vez" y **no** disparar la `PRShareCardModal` para ese bloque. Fast-follow (opción B, fuera de v1):
cambiar la resolución de las 4 RPCs a `COALESCE(wl.substituted_exercise_id, wb.exercise_id,
wl.exercise_id)` — aditivo y behavior-preserving (0 sustituciones hoy ⇒ salida idéntica), pero
re-abre las funciones de P1-3 y exige su propia pasada de tests.

### Ranking determinístico (parte e) — función pura

Capa `domain`/`services` (sin Next/Supabase), testeable:
`services/workout/exercise-substitution.ts` → `rankSubstitutes(current, candidates, opts)`.

Filtros duros (candidate set, resueltos en la query):
`muscle_group = current.muscle_group` AND `exercise_type = current.exercise_type` AND
`deleted_at IS NULL` AND `id <> current.id` AND en scope del alumno (reusar `scopeFilter` de
`resolveCatalogScope`).

Score (entero, mayor = mejor), 100% determinístico:
1. Normalizar `equipment` (lowercase/trim + mini-mapa espejo `Corporal|Peso libre → body weight`,
   const única fuente de verdad).
2. Si el equipment actual es "machine" (`leverage|smith|sled|*machine*`): **penalizar** candidatos
   con ESE mismo equipment (está ocupado) y **bonificar** peso libre (dumbbell/barbell/ez
   barbell/kettlebell) > cable > body weight > otras máquinas.
3. Si el equipment actual NO es máquina: bonificar **mismo equipment** (criterio Fitbod), luego peso
   libre/cable/bodyweight.
4. `secondary_muscles` overlap (Jaccard) — casi no-op hoy, futuro-proof.
5. Tiebreak estable: system-scope primero (curado) → `name` asc. Garantiza que la MISMA entrada
   siempre produce el MISMO orden (requisito "determinístico" + testabilidad).

Tomar top 5 (mostrar 3-5). Devuelve columnas para render de card + modal técnica
(`EXERCISE_LIST_COLUMNS`: id, name, muscle_group, equipment, gif_url, video_url, thumbnail_url,
video_start_time/end_time; + `instructions` si se quiere Detalles del sustituto).

### Flujo por capas

- **_data** `workout/[planId]/_data/substitution.queries.ts` (`React.cache`): dado `blockId`,
  resuelve el ejercicio del bloque (RLS del alumno), arma el candidate set same-muscle en scope y
  devuelve las filas crudas. NO rankea (eso es capa pura).
- **services** `services/workout/exercise-substitution.ts`: `rankSubstitutes()` puro + `EQUIPMENT_*`
  const espejo + `.test.ts`.
- **_actions** `workout/[planId]/_actions/substitution.actions.ts`: `getExerciseSubstitutionsAction(blockId)`
  server action (lazy, se llama al tocar el botón — evento raro, no prefetch). Valida `blockId` con
  Zod, verifica ownership vía RLS, llama query + rank, retorna 3-5.
- **presentación**: nuevo `_components/SubstituteExerciseSheet.tsx` (`'use client'`) — bottom-sheet
  (reusar `components/ui/sheet.tsx`) con las tarjetas rankeadas (nombre, badge de equipment, gif
  mini, botón "Usar este"). Botón disparador "Máquina ocupada / Cambiar" en la card del bloque
  (junto a **Técnica**, `WorkoutExecutionClient.tsx:1484-1493`).
- **estado en la exec**: `substitutionByBlock: Record<blockId, {id, name, gif_url, video_url,
  muscle_group, equipment}>`. Al confirmar: (1) `getExercise` override → la card, el nombre, el gif y
  el modal de técnica muestran el SUSTITUTO; (2) badge "Sustituido · máquina ocupada"; (3) permitir
  deshacer mientras no haya sets logueados. El plan/DB del bloque NO se toca.
- **persistencia**: al loguear cada serie del bloque con sustitución activa, `LogSetForm` agrega
  `substituted_exercise_id` + `substituted_exercise_name` al `FormData` →
  `WorkoutLogSetSchema` (2 campos opcionales) → `logSetAction` los mete en `payloadValues` (INSERT y
  UPDATE) → sin GRANT extra. Offline: agregar los 2 campos a `WorkoutOfflineLog` +
  `workoutLogToFormData` (opcionales; items legacy siguen parseando). Rehidratación: agregar las 2
  cols al SELECT de logs de HOY (`workout-execution.queries.ts:167`) para reconstruir
  `substitutionByBlock` tras reload.
- **ficha coach (read)**: agregar `substituted_exercise_id, substituted_exercise_name` al SELECT de
  `getClientWorkoutForDate` (`client-detail.service.ts:896`) y pintar en `TrainingTabB4Panels`
  (`:658` y/o `:713`) un badge "Hizo <sustituto> — sustituyó <prescrito> (máquina ocupada)". El
  `substituted_exercise_name` es snapshot ⇒ no requiere JOIN.

### Accesibilidad / mobile viewport
Bottom-sheet con `role="dialog"` + focus-trap (shadcn `sheet.tsx` ya lo trae, Radix), `aria-label`
en cada opción, target táctil ≥44px, `max-h-[85dvh]` con scroll interno (**nunca** `h-screen`
fuera de `md:`), respetar `useReducedMotion` (el exec ya lo usa). Cerrar con Esc + backdrop.

---

## Tareas atómicas estimadas (S/M/L)

**DB**
- **[S]** Migración aditiva `workout_logs` (2 cols + FK ON DELETE SET NULL + índice parcial). Sin
  GRANT, sin CHECK, sin trigger. Regenerar `database.types.ts`.

**Dominio / lógica pura**
- **[M]** `services/workout/exercise-substitution.ts`: `rankSubstitutes()` + const espejo de tiers
  de equipment + normalización + `.test.ts` (casos: máquina ocupada des-prioriza su equipment,
  orden estable, top-5, scope, exclusión del actual).

**Backend (query + action + validación)**
- **[M]** `_data/substitution.queries.ts` (candidate set same-muscle en scope del alumno, RLS) +
  `_actions/substitution.actions.ts` (`getExerciseSubstitutionsAction`, Zod, ownership).
- **[S]** `WorkoutLogSetSchema`: 2 campos opcionales (`substituted_exercise_id` z.guid().optional,
  `substituted_exercise_name` z.string().max(120).optional).
- **[S]** `logSetAction`: leer del `FormData` + agregar a `payloadValues` (INSERT + UPDATE).

**Offline**
- **[S]** `WorkoutOfflineLog` + `workoutLogToFormData`: 2 campos opcionales (retrocompat legacy).

**Frontend exec**
- **[L]** `SubstituteExerciseSheet.tsx` (bottom-sheet con tarjetas rankeadas, gif mini, badge
  equipment, "Usar este", loading/empty/error).
- **[M]** `WorkoutExecutionClient.tsx`: estado `substitutionByBlock`, botón disparador, override de
  `getExercise`/nombre/gif/técnica, badge "Sustituido", deshacer, rehidratación desde logs de HOY,
  thread de los 2 campos en `LogSetForm` → payload, y **guard**: suprimir "Última vez" + PR
  share-card cuando hay sustitución activa.
- **[S]** Ajuste de tipos locales `ExerciseType`/`BlockType` si hace falta exponer `equipment`.

**Ficha coach (read)**
- **[S]** SELECT de `getClientWorkoutForDate` + tipo del consumidor.
- **[M]** `TrainingTabB4Panels.tsx`: badge/render de la sustitución por serie/ejercicio.

**Rehidratación exec**
- **[S]** SELECT de logs de HOY en `workout-execution.queries.ts` + reconstrucción del estado.

**QA / verificación**
- **[M]** Unit (`rankSubstitutes`, schema), y verificación manual del flujo: swap in-place, log,
  reload (persiste), ficha del coach muestra el badge, offline flush conserva la sustitución.

Total aprox: 3×L?? no — 1×L UI + varios M/S. Estimación gruesa: ~1 L, ~5 M, ~7 S.

---

## Riesgos y gotchas

1. **PR falso por atribución al slot prescrito** (RPCs `COALESCE(wb, wl)`): un sustituto-máquina
   pesado puede marcar PR/serie en el ejercicio prescrito. Mitigación v1: guard client-side (no
   autollenar "Última vez", no disparar share-card en bloque sustituido). Solución completa
   (opción B) = re-abrir 4 RPCs de P1-3 → diferir con su propio test.
2. **`equipment` es texto libre sucio** (`Corporal`, `Peso libre`, `Otro`, mezcla ES/EN): el ranking
   debe normalizar; cualquier match exacto de string sin normalizar fallará. Fuente única de verdad
   para el mapa de normalización + tiers.
3. **`secondary_muscles`/`body_part`/`difficulty` vacíos**: no diseñar el ranking sobre ellos (se
   verían huecos). Dejarlos como refinamiento futuro tras enriquecer catálogo.
4. **Trigger `set_workout_log_exercise_id` respeta `exercise_id` no-NULL**: si por error se mandara
   `exercise_id` del sustituto en el insert, cambiaría la semántica del snapshot y el matching de
   "última vez" (`.in('exercise_id', ...)`). Decisión firme: **no** mandar `exercise_id`; sólo las
   columnas dedicadas.
5. **Grants**: correcto porque `workout_logs` es GRANT de tabla; si algún día se migra a
   column-grants (como coaches/teams/clients), habría que agregar el GRANT en la MISMA migración.
   Documentarlo en el comentario de la migración.
6. **Scope RLS del catálogo**: las sugerencias deben salir del set que el alumno puede ver
   (sistema ∪ su coach/team/org). Reusar `resolveCatalogScope`; no exponer ejercicios de otros
   tenants. La RLS de `exercises` es el techo real.
7. **Upsert por (block, set)**: si el alumno ya logueó sets del prescrito y luego sustituye, los sets
   viejos quedan sin marca. Regla v1: permitir sustituir sólo **antes** del primer set del bloque
   (o aplicar la marca hacia adelante). Definir en SPEC.
8. **Paridad mobile** (`apps/mobile/app/alumno/workout/[planId].tsx` también inserta
   `workout_logs`): las columnas son compartidas; v1 puede ser web-first (mobile ignora las cols sin
   romperse) y ofrecer el swap en mobile como fast-follow. Flag explícito en el PLAN.
9. **Offline legacy**: los 2 campos DEBEN ser opcionales en `WorkoutOfflineLog`/FormData/Zod para que
   los items ya encolados en `localStorage` sigan parseando (mismo criterio que `note`/polimórfico).

---

## Preguntas para el CEO

1. **Atribución de PRs/analítica**: ¿v1 con guard barato (no marcar PR en bloque sustituido) y
   dejar la re-atribución correcta (opción B, tocar las 4 RPCs) como fast-follow? Recomendado: sí.
2. **`reason` de sustitución**: ¿sólo "máquina ocupada" v1 (sin columna reason) o quieres desde ya
   otros motivos (equipo roto, lesión, preferencia) con `substitution_reason` + CHECK? Recomendado:
   sólo máquina ocupada v1 (evita riesgo de drift de CHECK).
3. **Mobile**: ¿web-first con mobile como follow-up, o el feature debe salir 1:1 web+mobile? (afecta
   estimación materialmente).
