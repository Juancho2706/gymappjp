# 6. Pestana Plan (programa)

Esta seccion documenta la pestana **Plan / Programa** de la ficha de alumno del coach (`/coach/clients/[clientId]`, tab `program`). El componente raiz es `ProgramTabB7` (`apps/web/src/app/coach/clients/[clientId]/ProgramTabB7.tsx`), un componente cliente (`'use client'`) que renderiza el programa de entrenamiento activo del alumno: cabecera con metadatos y progreso de semanas, el microciclo por dias con sus ejercicios, y un sheet de detalle por ejercicio. Los utilitarios `profileProgramUtils.ts` y `profileProgramStructureUtils.ts` calculan variante A/B efectiva, filtrado de planes por estructura, grupos musculares y sesiones historicas. `DeletePlanButton.tsx` es un boton de borrado de rutina (definido en esta carpeta, ver nota al final).

---

## 6.1. Como recibe los datos (props)

`ProgramTabB7` no consulta backend directo: recibe todo por props desde `ClientProfileDashboard.tsx` (RSC que ya cargo `getClientProfileData` / compliance). Props:

| Prop | Origen | Que es |
|------|--------|--------|
| `clientId` | `client.id` | ID del alumno (para los enlaces al builder). |
| `activeProgram` | `data.activeProgram` | El programa de entrenamiento activo con sus `workout_plans` (cada uno con `workout_blocks` y, dentro, `exercises`). `null/undefined` si no hay programa. |
| `workoutHistory` | `data.workoutHistory \|\| []` | Historial de planes asignados con `workout_blocks.workout_logs` (para el detalle de ejercicio). |
| `planCurrentWeek` | `compliance.planCurrentWeek ?? 0` | Semana actual del programa (calculada por el compliance del perfil). |
| `planTotalWeeks` | `compliance.planTotalWeeks ?? 1` | Total de semanas del programa. |
| `planDaysRemaining` | `compliance.planDaysRemaining ?? 0` | Dias restantes del programa. |

Campos del `activeProgram` que el componente lee: `name`, `program_structure_type` (`'weekly'` | `'cycle'`), `ab_mode`, `workout_plans`, `program_phases`, `weeks_to_repeat`, `start_date`, `end_date`, `cycle_length`. Cada plan dentro de `workout_plans` aporta: `id`, `title`, `day_of_week`, `week_variant`, `workout_blocks[]`. Cada bloque: `id`, `order_index`, `exercise_id`/`exercises`, `sets`, `reps`, `tempo`, `rir`, `rest_time`, `target_weight_kg`, `notes`. Cada `exercises`: `id`, `name`, `muscle_group`, `gif_url`.

**Estado vacio:** si `activeProgram` es falsy, muestra una `GlassCard` con el mensaje "No hay un programa de entrenamiento activo para este alumno." y un enlace **"Crear o asignar programa"** hacia `/coach/builder/[clientId]`.

---

## 6.2. Estructura del programa: semanal vs ciclico

`structure = activeProgram.program_structure_type || 'weekly'`; `isWeekly = structure === 'weekly'`.

- **Semanal (`weekly`):** se renderiza siempre una grilla fija de 7 dias (Lunes–Domingo, `day_of_week` 1–7), llamando a `renderDayCard` para cada dia. Si un dia no tiene plan, la card dice **"Descanso"**. El titulo de la seccion es **"Microciclo (L–D)"**.
- **Ciclico (`cycle`):** se listan solo los planes que existen (`plansView`), etiquetando cada card como **"Dia N"** (`day_of_week`). Titulo de seccion: **"Dias del programa"**. Si no hay planes (`plansView.length === 0`), muestra el aviso "No hay dias con ejercicios en este programa (revisa variantes de semana en el builder)."

### Variante A/B efectiva (`abMode`)

Si el programa tiene `ab_mode = true`, el microciclo alterna entre dos plantillas: semanas impares → variante **A**, pares → **B** (`weekIndexToVariantLetter`). El componente calcula `activeVariant` con `resolveEffectiveWeekVariant` (de `@/lib/workout/programWeekVariant`):

- `resolveActiveWeekVariantForDisplay` decide la variante "por ciclo": prioriza `planCurrentWeek` del compliance; si no, calcula el indice de semana desde `start_date` con `programWeekIndex1Based`.
- `effectiveWeekVariantFromPlans` corrige el **dead-end de A/B mal armado**: si la variante que toca por ciclo no tiene NINGUN plan cargado y la otra si, cae a la que tiene planes. Asi un programa con `ab_mode=true` pero una sola semana cargada (solo A) no muestra "sin dias" en las semanas "B". Si A/B esta bien armado (ambas variantes presentes), devuelve exactamente la del ciclo (cero cambio de comportamiento).

El badge de cabecera muestra **"Variante {activeVariant} · esta semana"** (con tooltip "Semanas impares del programa → A, pares → B").

---

## 6.3. Cabecera del programa

Primera `GlassCard`. Muestra:

- **`activeProgram.name`** como titulo.
- Badge de estructura: **"Semanal"** o **"Ciclico"**.
- Si `abMode`: badge de variante activa (ver arriba).
- Badge **"{weeksRepeat} sem. ciclo"** donde `weeksRepeat = Math.max(1, weeks_to_repeat || 1)`.
- Si `cycle_length`: badge **"{cycle_length} dias / ciclo"**.
- Si hay fases (`program_phases` parseadas, ver 6.4): renderiza `ProgramPhasesBar` en modo `compact`.

### Progreso de semanas

`hasSchedule = !!(start_date && end_date)`.

- Si **hay** fechas y `planTotalWeeks > 0`: muestra **"Semana {planCurrentWeek} / {planTotalWeeks}"**, los **"{planDaysRemaining} d restantes"** (o "En curso" si `planDaysRemaining <= 0`), y una barra `Progress` con `weekProgressPct = Math.min(100, Math.round((planCurrentWeek / planTotalWeeks) * 100))`.
- Si **no** hay fechas: aviso "Sin fechas inicio/fin en el programa · progreso por semanas no disponible".

### Enlace a editar en el builder

Boton/enlace **"Editar en builder"** (con icono lapiz) hacia `/coach/builder/[clientId]`. Es la unica ruta de edicion ofrecida desde esta pestana. El estado vacio (sin programa) ofrece el mismo destino con el texto "Crear o asignar programa".

---

## 6.4. Utilitarios (`profileProgramUtils.ts`)

- **`mondayBasedDayOfWeek(date)`**: convierte `Date.getDay()` (JS, domingo=0) a convencion ISO (Lunes=1 … Domingo=7). Usado para marcar el dia "Hoy" (`todayDow`).
- **`parseProgramPhases(raw)`**: valida/normaliza `program_phases` (espera array). Devuelve `SharedProgramPhase[]` con `name` (string, default "Fase"), `weeks` (`Math.max(1, weeks || 1)`) y `color` opcional. Filtra las que no tengan nombre. Alimenta a `ProgramPhasesBar`.
- **`resolveNextProgramWorkout(program, now, planCurrentWeekFromCompliance)`**: calcula el **proximo entreno** del microciclo (no usado por `ProgramTabB7` pero parte del modulo, lo consumen otras cards del perfil). Resuelve la variante efectiva (`resolveEffectiveWeekVariant`), filtra planes con bloques que coincidan con la variante, y elige el de menor `day_of_week >= hoy` (o el primero si ya paso toda la semana). Devuelve `{ dayOfWeek, dayName, title, exerciseCount, isToday }` o `null`.

---

## 6.5. Utilitarios de estructura (`profileProgramStructureUtils.ts`)

- **`filterPlansForStructureView(plans, structureType, ctx)`** → `plansView`. Filtra los `workout_plans` por la variante A/B efectiva (`effectiveWeekVariantFromPlans` sobre `ctx.activeVariant` y `ctx.abMode`) usando `workoutPlanMatchesVariant`, y los ordena por `day_of_week`. Si `structureType === 'cycle'` devuelve todos los planes ordenados; si es `weekly` devuelve solo los de `day_of_week` entre 1 y 7. (Regla de variante: sin A/B solo pasan planes con variante A o sin variante, para no mezclar plantillas B sueltas; con A/B solo la variante activa.)
- **`uniqueMuscleGroupsFromBlocks(blocks)`**: junta los `muscle_group` distintos de los `exercises` de los bloques, trimeados y ordenados alfabeticamente. Alimenta el resumen de cada card de dia ("N ej. · Grupo1, Grupo2…", muestra hasta 3 y agrega "…" si hay mas).
- **`collectLogsForExercise(workoutHistory, exerciseId, maxSessions=12)`**: del historial asignado, recolecta hasta 12 sesiones que contengan logs para ese ejercicio. Ordena el historial por `assigned_date` descendente, recorre cada plan y bloque cuyo `exercise_id`/`exercises.id` coincida, y arma sesiones `{ planTitle, assignedDate, rows[] }` donde cada row es `{ set: set_number, kg: weight_kg, reps: reps_done, rpe }` ordenada por `set_number`. (Computado en `ProgramTabB7` con `historySessions`; los datos quedan disponibles aunque la version actual del sheet no los liste explicitamente.)

---

## 6.6. Cards de dia y microciclo

`planByDow`: mapa `day_of_week → plan` (primer plan por dia) construido desde `plansView`.

`renderDayCard(plan, { dow, label })` por cada dia:

- Ordena los `workout_blocks` del plan por `order_index`.
- Calcula `groups` con `uniqueMuscleGroupsFromBlocks`.
- Marca **"Hoy"** si es vista semanal y `dow === todayDow` (resaltado).
- Si no hay plan o no hay bloques: muestra **"Descanso"**.
- Si hay plan: muestra `plan.title` (o "Entrenamiento"), el resumen "**N ej. · grupos**", y un boton **"Ejercicios"** que despliega/colapsa (`togglePlanList` con estado `planOpen` por `key = plan.id` o `rest-{dow}`). Al desplegar, lista cada bloque por `exercises.name`; cada item es un boton que abre el sheet de detalle (`openBlock`).

---

## 6.7. Sheet de detalle de ejercicio

Al pulsar un ejercicio en la lista, `openBlock(block)` guarda el bloque y abre el `Sheet`. El lado del sheet depende del viewport (`useSheetSide`: `'bottom'` en <=767px, `'right'` en desktop). Contenido:

- **Titulo:** `exercises.name` (o "Ejercicio").
- **Grupo muscular:** badge con `exercises.muscle_group` (icono `Target`), si existe.
- **GIF:** si `exercises.gif_url`, muestra la imagen (`<Image unoptimized>`).
- **Prescripcion:** lista con `sets × reps` (icono `Dumbbell`), y condicionalmente `Tempo`, `RIR`, `Descanso` (`rest_time`), y "Obj. peso {target_weight_kg} kg".
- **Notas:** `block.notes` si existe.
- Boton **"Cerrar"**. Al cerrar el sheet (`onOpenChange(false)`) se limpia `sheetBlock`.

`exerciseIdForSheet` se deriva de `sheetBlock.exercise_id ?? sheetBlock.exercises.id` y `historySessions = collectLogsForExercise(workoutHistory, ...)` se recalcula al cambiar de bloque (historico disponible para el sheet).

---

## 6.8. `DeletePlanButton` — confirmacion y borrado

`DeletePlanButton.tsx` (`'use client'`) es un boton de papelera que abre un `AlertDialog` de confirmacion antes de borrar una rutina/plan. Props: `planId`, `clientId`, `planTitle`.

- **Confirmacion:** dialogo titulo **"Eliminar rutina"**, descripcion **"¿Eliminar «{planTitle}»? Esta accion no se puede deshacer."**, con botones **Cancelar** y **Eliminar** (este ultimo muestra "Eliminando..." mientras `isPending` via `useTransition`). Si la accion devuelve error, se muestra en el dialogo.
- **Que ejecuta:** `handleDelete` llama a la server action `deletePlanAction(planId, clientId)` (re-exportada en `apps/web/src/app/coach/builder/[clientId]/_actions/builder.actions.ts`, que delega en `deletePlanService` de `services/workout/workout.service.ts`).

### Backend de `deletePlanAction` (`workout.service.ts`)

1. `createClient()` + `getUser()`; si no hay usuario → "No autenticado.".
2. `getCoachWorkoutScope(supabase, user.id)` para resolver scope (org/team); si falla → error.
3. Si hay `clientId`: valida acceso al alumno con `resolveCoachClientAccess` (propio o del pool de la org/team); si falla → "Alumno no encontrado.".
4. Busca el plan en `workout_plans` (`select id, program_id, workout_programs(org_id)`), filtrado por `client_id` (si hay clientId) o por `coach_id`. Verifica que exista y que el `org_id` del programa coincida con el scope; si no → "Plan no encontrado." (chequeo de aislamiento org-scoped).
5. **Borra** el plan: `DELETE FROM workout_plans WHERE id = planId` (con el mismo filtro `client_id`/`coach_id`).
6. Si hay error de DB → devuelve `error.message`.
7. **Revalida** `/coach/clients/[clientId]` y `/coach/workout-programs`.

**Que borra y que conserva:** borra **solo la fila del `workout_plan`** (el dia/rutina). Por las FK de la DB, al borrar el plan se eliminan sus `workout_blocks` en cascada (la rutina y sus ejercicios prescritos). **No** borra el `workout_program` padre, ni los demas planes/dias del programa, ni el alumno. La accion no es deshacible (texto del dialogo).

> **Nota de integracion:** en el codigo actual, `DeletePlanButton` esta **definido pero no se referencia** desde `ProgramTabB7` ni desde el resto de `apps/web/src` (la unica ruta de gestion del programa que ofrece la pestana Plan es "Editar en builder"). El boton/dialogo y su accion existen y funcionan, pero no estan cableados en esta pestana hoy.


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [MED] El sheet de detalle no incluye SheetDescription ni historial; descripción del header incompleta

En 6.7 cambiar el cierre por: '`historySessions = collectLogsForExercise(...)` se recalcula al cambiar de bloque PERO no se renderiza en ninguna parte del Sheet en la versión actual (cómputo sin uso). El badge de grupo muscular vive dentro de `SheetDescription`.'

