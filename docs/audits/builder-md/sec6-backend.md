# 6. Backend: guardar, copiar, duplicar, asignar y sincronizar

Esta seccion documenta el contrato de backend del builder de fuerza. Las dos rutas del builder
(`/coach/builder/[clientId]` en modo `client-plan` y `/coach/workout-programs/builder` en modo
`template`) comparten exactamente las mismas server actions y funciones de servicio. La unica
diferencia funcional es el campo `clientId` del payload: con `clientId` se trabaja un programa de
alumno, sin `clientId` (null/ausente) se trabaja una plantilla reutilizable.

Capas involucradas (data flow obligatorio de la arquitectura):

- `_actions/builder.actions.ts` (`'use server'`): thin wrappers que re-exportan las acciones del servicio.
- `services/workout/workout.service.ts`: logica de aplicacion (todas las acciones reales).
- `services/workout/workout-areas.service.ts`: CRUD de areas.
- `infrastructure/db/workout.repository.ts`: acceso a `workout_section_templates` y lectores de programa.
- `@eva/schemas` (`packages/schemas/workout.ts`): validacion Zod compartida cliente + servidor.
- `domain/workout/types.ts`: tipos puros (`WorkoutArea`, `IntervalConfig`, enums polimorficos).

> Nota de seguridad transversal: TODAS las mutaciones usan el cliente Supabase user-scoped
> (`createClient()` con cookies). RLS aplica siempre como techo; los filtros explicitos por
> `coach_id` / `client_id` / `org_id` / `team_id` son defensa en profundidad.

---

## 6.1 Resolucion de contexto y acceso (helpers compartidos)

Antes de cualquier escritura, el servicio resuelve el "workspace activo" del usuario, que
determina el aislamiento de contextos (standalone vs team vs enterprise).

### `getCoachWorkoutScope(supabase, userId)`

Llama a `resolvePreferredWorkspace`. Devuelve `CoachWorkoutScope`:

- `coach_standalone` → `{ orgId: null, activeTeamId: null }`
- `coach_team` → `{ orgId: null, activeTeamId: teamId }`
- `enterprise_coach` → `{ orgId, activeTeamId: null }`
- workspace invalido → `{ ok: false, error: 'Workspace invalido para gestionar entrenamientos.' }`

### `applyOrgScope(query, orgId)`

Helper que acota cualquier query: si hay `orgId` agrega `.eq('org_id', orgId)`; si no, agrega
`.is('org_id', null)`. Se usa en casi todas las queries de programas/planes/clientes.

### `resolveCoachClientAccess(db, coachId, clientId, orgId, activeTeamId)`

Decide si el usuario puede gestionar a un alumno SEGUN EL CONTEXTO ACTIVO (sin cruce):

- **Team activo:** el alumno debe pertenecer a ESE pool (`team_id = activeTeamId` y `org_id IS NULL`)
  y ademas `currentUserHasTeamAccessToClient` debe dar `true`. Devuelve `{ ok, viaTeam: true }`.
  No filtra por `coach_id` (pool colaborativo: cualquier miembro del team gestiona).
- **Enterprise:** el alumno debe ser `coach_id = coachId` + `org_id = orgId`.
- **Standalone:** el alumno debe ser `coach_id = coachId`, `org_id IS NULL` y `team_id IS NULL`.

`assertCoachCanManageWorkoutClient(...)` envuelve lo anterior y lanza `Error('Alumno no encontrado.')`
si no hay acceso.

### `deactivateActiveProgramsForClient(db, clientId, orgId)`

`UPDATE workout_programs SET is_active = false WHERE client_id = ? AND is_active = true`
(acotado por `applyOrgScope`). **No borra nada**: solo desactiva el/los programa(s) activo(s) previos
del alumno. El historial (`workout_logs`) del programa anterior queda intacto.

### Resolucion de areas (anti-forja / coercion)

- `resolveAllowedAreaIds(db)`: trae los `id` de `workout_section_templates` visibles para el usuario
  (RLS-scoped, `deleted_at IS NULL`) y los devuelve como `Set`.
- `scopedSectionTemplateIdFor(section, explicit, allowedIds)`: si el `section_template_id` que viene
  en el payload NO esta en el `Set` de areas visibles, se descarta (coercion) y se cae al mapeo legacy
  por `section`. Esto evita persistir referencias a areas de otro coach/team (stale o forjadas), ya
  que `workout_blocks.section_template_id` es un FK que ninguna policy valida por tenencia.
- `sectionTemplateIdFor(section, existing)`: si hay un `section_template_id` explicito lo conserva;
  si no, mapea la `section` legacy al area system fija:
  - `warmup` → `0000a5ec-0000-0000-0000-000000000001`
  - `main` → `0000a5ec-0000-0000-0000-000000000010`
  - `cooldown` → `0000a5ec-0000-0000-0000-000000000020`

### `polymorphicBlockColumns(block)`

Extrae las 16 columnas polimorficas de un bloque (acepta tanto payload Zod como fila cruda de DB,
nombres 1:1): `is_unilateral`, `side_mode`, `reps_value`, `reps_unit`, `load_type`, `load_value`,
`load_unit`, `distance_value`, `distance_unit`, `duration_sec`, `target_pace_sec_per_km`, `hr_zone`,
`instructions`, `exercise_type_override`, `interval_config` (jsonb), `extra_targets` (jsonb). Cada una
default `null`. Un bloque legacy (solo sets/reps/peso) produce todas estas en `null` (byte-identico
al comportamiento previo a la migracion polimorfica).

---

## 6.2 `saveWorkoutProgramAction(payload, saveOptions?)` → `saveWorkoutProgramService`

Persiste un programa completo (cabecera + dias/planes + bloques). Es la unica ruta de guardado del
builder; tanto crear como editar, plantilla o programa de alumno, pasan por aqui. Devuelve
`ProgramState`: `{ programId }` en exito, `{ error }`, o `{ conflict: { editedBy, at } }`.

### Validacion (Zod)

1. `WorkoutProgramSchema.safeParse(payload)`. Si falla, devuelve el primer mensaje de issue. Si el
   mensaje contiene `NaN`/`Invalid input`, lo reemplaza por un texto friendly:
   `'Hay un valor numerico invalido (revisa peso objetivo en kg, progresion automatica y series).'`

El esquema valida (resumen relevante):

- Cabecera: `programName` (2–100), `weeksToRepeat` (1–52, preprocesado), `duration_type`
  (`weeks`/`async`/`calendar_days`), `duration_days` (1–365 o null), `program_structure_type`
  (`weekly`/`cycle`), `cycle_length` (1–28), `start_date_flexible` (bool), `program_notes` (≤2000),
  `ab_mode` (bool), `program_phases` (≤24 fases, cada una `{name ≤80, weeks 1–52, color ≤32}`),
  `source_template_id` (uuid o null), `days` (≥1).
- Cada dia (`WorkoutDaySchema`): `day_of_week` (1–28, preprocesado), `title` (≤100),
  `week_variant` (`A`/`B`, default `A`), `blocks` (≥1, mensaje `'Agrega al menos un ejercicio'`).
- Cada bloque (`WorkoutBlockSchema`): `exercise_id` (`z.guid()`, NO `z.uuid()` — los seeds de
  cardio/mobility/roller usan UUIDs deterministas que no cumplen RFC 9562), `sets` (1–20,
  preprocesado con fallback 3), `reps` (string 1–20 obligatoria), `target_weight_kg`, `tempo`,
  `rir`, `rest_time`, `notes` (≤1000), `superset_group` (≤10), `progression_type` (`weight`/`reps`),
  `progression_value` (0–1000), `section` (`warmup`/`main`/`cooldown`), `section_template_id`
  (`z.guid()` nullable) y los 16 campos polimorficos (todos opcionales/nullable → retrocompat total).
- `superRefine`: si `exercise_type_override === 'cardio'`, el bloque debe traer al menos
  `duration_sec` > 0, `distance_value` > 0 o `interval_config` (si no, error
  `'Un bloque cardio necesita duracion, distancia o intervalos'`).

### Normalizacion previa

- `phasesForDb`: mapea `program_phases` a `{name, weeks, color}` con color por defecto `'#6366F1'`.
- `sourceTplId`: solo se conserva si hay `clientId` (las plantillas nunca llevan `source_template_id`).
- `startDateToUse`:
  - Plantilla (`clientId` null) → siempre `null` (las plantillas no tienen fecha de inicio).
  - Programa de alumno sin `startDate` y con `programId` → conserva la `start_date` existente del
    programa o `hoy`.
  - Programa de alumno nuevo sin `startDate` → `hoy`.
- `endDate`: si hay `startDateToUse`, se calcula `start + (weeksToRepeat * 7) - 1` dias.

### Autorizacion

- Requiere usuario autenticado (`{ error: 'No autenticado.' }`).
- Resuelve scope (`getCoachWorkoutScope`).
- Si hay `clientId`, valida acceso con `resolveCoachClientAccess` (`'Alumno no encontrado.'` si falla).
- Carga `allowedAreaIds` para coercion de `section_template_id`.

### Rama A — programa existente (`programId` presente)

1. Relee el programa actual (`client_id`), acotado por `client_id` si es de alumno o por
   `coach_id` si es plantilla, + `applyOrgScope`. Si no existe → `'Programa no encontrado.'`
   (nota: para alumnos del pool, el acceso se acota por `client_id`, no por creador — cualquier
   miembro del pool puede editar).
2. **Rename de programa asignado PERMITIDO (2026-07-15):** el guard legacy que devolvia
   `'No se puede cambiar el nombre de un programa ya asignado a un alumno.'` se elimino — databa
   de cuando plantilla↔programa se ligaban por nombre; hoy el vinculo es `source_template_id`,
   el sync (6.6) conserva el nombre propio del programa y no hay unicidad de nombre para
   programas de alumno.
3. **Unicidad de nombre de plantilla:** si es plantilla, valida que no exista otra plantilla del
   coach con el mismo `name` (`client_id IS NULL`, `neq id`) → `'Ya tienes una plantilla guardada
   con el nombre "X".'`
4. **Chequeo de conflicto optimista (E — awareness):** si `saveOptions.expectedUpdatedAt` esta
   definido y `!force`, relee `updated_at, last_edited_by_coach_id`. Si el `updated_at` actual difiere
   del esperado, NO guarda nada y devuelve `{ conflict: { editedBy, at } }` (resuelve el nombre del
   coach editor desde `coaches.full_name`/`brand_name` si fue otro usuario). El coach decide recargar
   o reintentar con `force`. Es no destructivo.
5. **UPDATE de la cabecera** (`workout_programs`): escribe `name, weeks_to_repeat, start_date,
   end_date, duration_type, duration_days, program_structure_type, cycle_length (null si no es cycle),
   start_date_flexible, program_notes, ab_mode, program_phases, source_template_id,
   last_edited_by_coach_id = user.id, updated_at = now()`. Acotado por `client_id`/`coach_id` + org.
6. **DELETE de planes antiguos:** `DELETE FROM workout_plans WHERE program_id = finalProgramId`.
   Esto dispara CASCADE: borra todos los `workout_blocks` de esos planes y, a su vez, todos los
   `workout_logs` referenciados a esos bloques (ver 6.10). Es decir, **editar y reguardar un programa
   de alumno con historial recrea los planes/bloques y los logs ligados a los bloques anteriores se
   pierden por cascade**. (La sincronizacion desde plantilla — 6.6 — pasa por esta misma ruta.)

### Rama B — programa nuevo (`programId` ausente)

1. Si hay `clientId`, primero `deactivateActiveProgramsForClient` (desactiva el activo previo SIN
   borrar). Si falla → `'No se pudo desactivar el programa activo actual del alumno.'`
2. Si es plantilla, valida unicidad de nombre (igual que arriba).
3. **INSERT de la cabecera** con `client_id` (o null), `coach_id = user.id`, `org_id = scope.orgId`,
   y el resto de campos. `last_edited_by_coach_id = user.id`. Devuelve el `id` generado.

### Re-insercion de planes y bloques (ambas ramas)

Por cada `day` del payload:

1. **INSERT en `workout_plans`** con `client_id` (o null), `coach_id = user.id`, `program_id`,
   `day_of_week`, `title` (o `"<programName> - Dia N"`), `group_name = 'Programa de Entrenamiento'`,
   `assigned_date = startDateToUse`, `week_variant` (default `'A'`).
2. **INSERT en bloque de `workout_blocks`** (un solo insert con array) por cada bloque del dia:
   `plan_id`, `exercise_id`, `order_index = index` (recalculado por posicion en el array, normaliza
   el orden), `sets`, `reps`, `target_weight_kg`, `tempo`, `rir`, `rest_time`, `notes`,
   `superset_group`, `progression_type`, `progression_value`, `section` (coercionada a
   `warmup`/`main`/`cooldown`, default `main`), `section_template_id` (via
   `scopedSectionTemplateIdFor` con coercion de areas), `is_override`, mas las 16 columnas
   polimorficas via `polymorphicBlockColumns`.

### Revalidacion y retorno

- Si hay `clientId`: `revalidatePath('/coach/clients/<clientId>')`.
- Siempre: `revalidatePath('/coach/workout-programs')` y `revalidatePath('/c', 'layout')` (refresca
  la app del alumno).
- Retorna `{ programId: finalProgramId }`. Cualquier excepcion se atrapa y se devuelve
  `{ error: <mensaje> }`.

---

## 6.3 `deleteWorkoutProgramAction(programId, clientId)` → `deleteWorkoutProgramService`

Borra un programa completo.

- Requiere autenticacion + scope.
- Si hay `clientId`, valida acceso (`'Alumno no encontrado.'`).
- `DELETE FROM workout_programs WHERE id = programId` acotado por `client_id` (alumno) o `coach_id`
  (plantilla) + `applyOrgScope`.
- **Efecto cascade:** borra los `workout_plans` del programa → sus `workout_blocks` → sus
  `workout_logs`. Para un programa de alumno esto elimina tambien el historial ligado a esos bloques.
- Revalida `/coach/clients/<clientId>` (si aplica), `/coach/workout-programs`, `/c` (layout).
- Retorna `{}` o `{ error }`.

---

## 6.4 `deletePlanAction(planId, clientId)` → `deletePlanService`

Borra un plan individual (un dia), util para limpieza manual.

- Requiere autenticacion + scope + acceso al alumno si hay `clientId`.
- Relee el plan (`id, program_id, workout_programs(org_id)`) acotado por `client_id`/`coach_id`.
  Verifica que el `org_id` del programa padre coincida con el scope; si no, `'Plan no encontrado.'`
- `DELETE FROM workout_plans WHERE id = planId` acotado por `client_id`/`coach_id`.
- **Efecto cascade:** borra los `workout_blocks` de ese plan → sus `workout_logs`.
- Revalida `/coach/clients/<clientId>` (si aplica) y `/coach/workout-programs`. (No revalida `/c`.)
- Retorna `{}` o `{ error }`.

---

## 6.5 `duplicateWorkoutProgramAction(programId, newName)` → `duplicateWorkoutProgramService`

Duplica un programa existente (sea plantilla o programa de alumno) como **nueva plantilla**.

### Que valida

- `duplicateProgramNameSchema`: nombre trim, 2–100 caracteres. Mensaje `'El nombre del programa es
  requerido'` si <2.
- Unicidad: no puede existir otra plantilla del coach (`client_id IS NULL`) con `name = newName`
  → `'Ya tienes una plantilla guardada con el nombre "X".'`

### Que copia EXACTAMENTE

1. Lee el original con `select('*, client:clients(full_name), workout_plans(*, workout_blocks(*)))'`,
   acotado por `id`, `coach_id = user.id`, `applyOrgScope`. Si no existe → `'Programa no encontrado.'`
   (Nota: el original se acota por `coach_id` del usuario — no por pool; el duplicado manual es
   coach-scoped.)
2. **INSERT del nuevo programa como plantilla:** `client_id: null` SIEMPRE (la copia manual es
   plantilla aunque el origen fuera de alumno), `coach_id = user.id`, `org_id = scope.orgId`,
   `name = newName`, `start_date: null`, `end_date: null`, `source_template_id: null`,
   `last_edited_by_coach_id = user.id`. Copia tal cual: `weeks_to_repeat`, `duration_type`,
   `duration_days`, `program_structure_type`, `cycle_length`, `start_date_flexible`, `program_notes`,
   `ab_mode`, `program_phases`.
3. **Copia de cada plan:** INSERT con `client_id: null`, `assigned_date: null`, conservando
   `day_of_week`, `title`, `group_name`, `week_variant`.
4. **Copia de cada bloque:** conserva `exercise_id`, `order_index` (el original, NO recalculado),
   `sets`, `reps`, `target_weight_kg`, `tempo`, `rir`, `rest_time`, `notes`, `superset_group`,
   `progression_type`, `progression_value`, `section`, `section_template_id` (con coercion de areas),
   mas las 16 columnas polimorficas. **Fuerza `is_override: false`** en todos los bloques copiados.

### Que NO copia

- No copia `workout_logs` (el historial del alumno no se duplica; la copia es una plantilla limpia).
- No conserva `client_id` ni la fecha de inicio.
- No conserva `source_template_id` (la copia no queda vinculada a ninguna plantilla origen).
- No conserva el flag `is_override` de los bloques (lo resetea a `false`).

### Retorno

- Revalida `/coach/workout-programs`.
- Reselecciona la fila con `LIBRARY_PROGRAM_LIST_SELECT` para devolver un snapshot de lista
  (`program: ProgramListModel`) que la UI inserta en la libreria sin recargar. Si ese select falla,
  devuelve solo `{ programId }` (warning en consola).

---

## 6.6 `assignProgramToClientsAction(templateId, clientIds, options?)` → `assignProgramToClientsService`

Clona una **plantilla** y la asigna a uno o varios alumnos (asignacion masiva). Devuelve
`AssignProgramResult`: `{ success, assignedCount, failedClients[] }` o `{ error }`.

### Opciones (`AssignProgramOptions`)

`options` puede ser un string (retrocompat: se interpreta como `startDate`) o un objeto:

- `startDate` (default `hoy`).
- `durationWeeks` (override de semanas; se clampa 1–52, si no se pasa usa `template.weeks_to_repeat`).
- `selectedDays` (array de `day_of_week`, filtrados al rango 1–28): si se especifica, solo se copian
  los planes de la plantilla cuyos dias esten en el set.
- `startDateFlexible` (override del flag de la plantilla al crear el programa del alumno).

### Flujo

1. Requiere autenticacion + scope. Si `clientIds` vacio → `'Selecciona al menos un alumno.'`
2. Carga `allowedAreaIds` (coercion de areas).
3. **Lee la plantilla** (`select('*, workout_plans(*, workout_blocks(*)))'`) acotada por
   `id = templateId`, `coach_id = user.id`, `client_id IS NULL`, `applyOrgScope`. Si no →
   `'Plantilla no encontrada.'`
4. **Valida los alumnos destino segun contexto activo:** consulta `clients` con `in('id', clientIds)`:
   - Team activo → `team_id = activeTeamId` y `org_id IS NULL`.
   - Enterprise → `coach_id = user.id` + `applyOrgScope`.
   - Standalone → `coach_id = user.id`, `org_id IS NULL`, `team_id IS NULL`.
   Los IDs que no aparezcan en el resultado se acumulan en `failedClients` con razon
   `'El alumno no pertenece a este coach.'`. Si ninguno valida → `'Ningun alumno seleccionado es
   valido para este coach.'`
5. **Filtra los planes de la plantilla** por `selectedDays` (si hay). Validaciones:
   - Plantilla sin planes → `'Esta plantilla no tiene dias de entrenamiento para copiar.'`
   - Filtro de dias sin coincidencias → `'Los dias seleccionados no coinciden con ningun dia de esta
     plantilla...'`
6. Calcula `weeksToRepeat` (clamp 1–52), `endDate` (`start + weeks*7 - 1`), `startDateFlexible`
   efectivo, y lee `brand_name`/`slug` del coach para el email.

### Por cada alumno valido (iteracion con try/catch individual)

1. **Desactiva los programas activos previos** del alumno (`deactivateActiveProgramsForClient`) —
   sin borrar historial. Si falla → ese alumno cae en `failedClients`, el resto continua.
2. **INSERT del nuevo programa del alumno:** `client_id = clientId`, `coach_id = user.id`,
   `org_id = scope.orgId`, `name = template.name`, `weeks_to_repeat`, `start_date = dateToUse`,
   `end_date`, copia de `duration_type/duration_days/program_structure_type/cycle_length/
   program_notes/ab_mode/program_phases`, `start_date_flexible` (efectivo), y crucialmente
   **`source_template_id = templateId`** (esto vincula el programa del alumno a la plantilla para
   futuras sincronizaciones — ver 6.6). `last_edited_by_coach_id = user.id`.
3. **Copia de cada plan filtrado** con `client_id = clientId`, `assigned_date = dateToUse`,
   conservando `day_of_week`, `title`, `group_name`, `week_variant`.
4. **Copia de cada bloque** conservando `order_index` original, todos los campos de prescripcion,
   `section`, `section_template_id` (coercion), polimorficos, y `is_override: false` forzado.
5. **Email transaccional:** si el alumno tiene `email`, envia `buildProgramAssignedEmail`
   (`sendTransactionalEmail`) con marca, nombre del alumno, nombre del programa, fecha y URL de
   dashboard. Un fallo de email NO aborta la asignacion (solo loguea).
6. `revalidatePath('/coach/clients/<clientId>')`.

### Cierre

- `revalidatePath('/coach/workout-programs')` y `revalidatePath('/c', 'layout')`.
- Si `assignedCount === 0` → `{ error: 'No se pudo asignar el programa a ningun alumno.',
  failedClients }`.
- Si no → `{ success: true, assignedCount, failedClients }` (exito parcial posible: algunos
  asignados + algunos fallidos).

### Que NO copia / efecto sobre el plan anterior

- No copia `workout_logs` del alumno.
- No borra el programa anterior del alumno: solo lo **desactiva** (`is_active = false`), preservando
  su estructura y su historial.

---

## 6.7 `syncProgramFromTemplateAction(programId)` → `syncProgramFromTemplateService`

Re-sincroniza un programa **de alumno** desde su plantilla origen (`source_template_id`). Es la
operacion mas delicada respecto a perdida de datos. Devuelve `ProgramState`.

### Precondiciones

- Autenticacion + scope.
- Lee el programa (`select('*, workout_plans(*, workout_blocks(*)))'`) acotado por `id`,
  `coach_id = user.id`, `applyOrgScope`. Si no → `'Programa no encontrado.'`
- Debe tener `client_id` → si no, `'Solo programas de cliente pueden sincronizarse con una plantilla.'`
- Debe tener `source_template_id` → si no, `'Este programa no tiene plantilla base vinculada.'`
- Lee la plantilla origen (acotada por `coach_id`, `client_id IS NULL`, org). Si no →
  `'La plantilla base no existe o ya no esta disponible.'`

### Reconciliacion (preservacion de overrides del alumno)

Por cada plan del programa del alumno (ordenados por `sortWorkoutPlans`: por `day_of_week`, luego
`week_variant`), busca el plan correspondiente en la plantilla emparejando por **`day_of_week` +
`week_variant`**. Luego fusiona bloques con `mergeBlocksForSync(clientBlocks, templateBlocks)`:

- Ambas listas se ordenan por `order_index`. Se itera hasta el `max(len)`.
- Para cada posicion `j`:
  - Si el bloque del cliente tiene `is_override === true` → se conserva el bloque del cliente (el
    coach lo personalizo manualmente; la plantilla NO lo pisa).
  - Si no, y existe bloque de plantilla → se toma el de la plantilla (`is_override: false`).
  - Si no hay plantilla pero hay bloque del cliente → se conserva el del cliente (overflow del alumno).

Es decir, la sincronizacion es por **posicion (`order_index`)**, no por identidad de ejercicio.
Cada bloque resultante pasa por `mapDbBlockToWorkoutInput`, que re-mapea TODOS los campos incluyendo
los 16 polimorficos (necesario: sin esto el reguardado borraria la prescripcion tipada — regresion
silenciosa).

Dias sin bloques resultantes se omiten. Si no queda ningun dia → `'No hay dias con ejercicios para
sincronizar.'`

`program_phases` se sanea de forma defensiva (parsea jsonb o string, clampa `weeks` 1–52, color ≤32,
nombre ≤80) antes de reconstruir el payload.

### Persistencia

El servicio **no escribe directamente**: construye un `WorkoutProgramInput` completo con el
`programId` del alumno, `clientId`, nombre/duracion/estructura/fechas del programa actual,
`source_template_id` y los `mergedDays`, y delega en `saveWorkoutProgramAction`.

> Consecuencia de data-safety: como pasa por `saveWorkoutProgramAction` rama A, el sync **borra los
> planes del programa y los re-inserta** (`DELETE FROM workout_plans ... → CASCADE`). Por tanto los
> `workout_logs` ligados a los bloques previos se pierden por cascade aun cuando el contenido de los
> bloques override se preserve en la estructura. La preservacion de `is_override` protege la
> prescripcion del coach, no el historial de ejecucion del alumno.

---

## 6.8 Acciones de lectura (datos que alimentan el builder)

### `getExerciseHistoryAction(clientId, exerciseId)`

Devuelve la sesion mas reciente registrada de un ejercicio para un alumno (para mostrar "ultima vez"
en el builder).

- Valida acceso con `assertCoachCanManageWorkoutClient`; si falla devuelve `{ data: [] }` (no error).
- Busca el `logged_at` mas reciente en `workout_logs` joineando `workout_blocks!inner(exercise_id)`
  filtrando por `client_id` + `exercise_id`.
- Trae todos los sets de esa misma sesion (mismo `logged_at` redondeado al minuto, entre `:00` y
  `:59`), ordenados por `set_number`.
- Retorna `{ data: [{ logged_at, weight_kg, reps_done, set_number }] }`. Sin logs → `{ data: [] }`.

### `getTemplatesForBuilderAction()`

Lista ligera de plantillas del coach (`client_id IS NULL`, `is_active = true`), ordenadas por
`updated_at` desc, con conteo de planes. Acotado por `coach_id` + `applyOrgScope`. Retorna
`{ data: [{ id, name, weeks_to_repeat, duration_type, plan_count }] }`. Alimenta el selector
"cargar plantilla".

### `loadTemplateForBuilderAction(templateId)`

Carga una plantilla COMPLETA para volcarla al builder. Select explicito de cabecera +
`workout_plans(day_of_week, title, week_variant, workout_blocks(... todos los campos de prescripcion
y polimorficos ..., exercises(name, muscle_group, gif_url, video_url, thumbnail_url, exercise_type)))`.
Acotado por `coach_id`, `client_id IS NULL`, org. Si no existe → `'Plantilla no encontrada.'`

### `getCoachClientsAction()`

Picker de alumnos para asignacion masiva, scopeado por workspace activo (3 vias, sin cruce):

- Team activo → `team_id = activeTeamId`, `org_id IS NULL`.
- Enterprise → `coach_id = user.id` + `applyOrgScope`.
- Standalone → `coach_id = user.id`, `org_id IS NULL`, `team_id IS NULL`.

Ordenado por `full_name`. Retorna `{ data: [{ id, full_name, avatar_url: null }] }`
(el `avatar_url` se devuelve siempre `null`).

---

## 6.9 `workout-areas.service` — CRUD de areas y su relacion con los bloques

Las "areas" son filas de `workout_section_templates`: 7 system (solo-lectura, `is_system = true`),
mas custom de coach (`coach_id`) o de team (`team_id`). Modelo expand-contract sobre
`workout_blocks`: `section_template_id` (FK al area) es la fuente preferente; `workout_blocks.section`
(CHECK `warmup`/`main`/`cooldown`) queda como bucket legacy de compatibilidad.

### Servicio (`workout-areas.service.ts`)

- `listAvailableWorkoutAreas(db, scope)`: via `findAvailableSectionTemplates`. Filtra por
  `deleted_at IS NULL` y:
  - team → `is_system = true` OR `team_id = teamId`.
  - standalone → `is_system = true` OR (`coach_id = coachId` AND `team_id IS NULL`).
  - sin scope → solo `is_system = true`.
  Ordena por `sort_order`, luego `name`. RLS `wst_select` es el techo.
- `createWorkoutArea(db, scope, { name })`: calcula `slug` (`slugifyAreaName`: NFD sin diacriticos,
  kebab-case, fallback hash si no quedan caracteres latinos) y `sort_order` (`nextCustomSortOrder`:
  `max(100, maxExisting + 10)`, para que las custom queden detras de las system). `coach_id`/`team_id`
  segun scope (team gana). `is_system = false`. Colision de slug por scope (indices parciales
  `*_slug_uidx`) → `'Ya existe un area con ese nombre en este contexto.'`
- `updateWorkoutArea(db, id, { name?, sort_order? })`: renombrar y/o reordenar. Renombrar
  **regenera el slug** (los bloques referencian por `id`, asi que es seguro). El update solo aplica a
  `is_system = false` y `deleted_at IS NULL` (defensa extra ante RLS). Sin cambios → `'Nada que
  actualizar.'`
- `deleteWorkoutArea(db, id)`: **soft-delete** (`deleted_at = now()`), solo `is_system = false`. Los
  bloques que la referencian conservan el `id` (FK intacta); el builder/ejecucion caen al bucket
  legacy via `effectiveAreaKey` (no se pierde ningun dato del plan).

### Acciones (`coach/settings/areas/_actions/areas.actions.ts`)

`createAreaAction` / `updateAreaAction` / `deleteAreaAction`: validan con
`WorkoutAreaCreateSchema` / `WorkoutAreaUpdateSchema` / `WorkoutAreaDeleteSchema` (nombre 2–40),
resuelven el contexto editable con `resolveEditableAreaScope`:

- `org_managed` / `enterprise_coach` → bloqueado (`'No disponible en cuentas gestionadas por una
  organizacion.'`).
- `coach_team` → solo owner/co-gestor (`isCurrentUserTeamManager`), si no
  `'Solo el owner o co-gestor del equipo puede gestionar las areas.'`
- standalone → el propio coach.

Tras exito revalidan `/coach/settings/areas`.

### Relacion con los bloques (en save/duplicate/assign/sync)

Cada bloque persiste `section` (legacy) **y** `section_template_id`. Al guardar/copiar, el servicio
usa `scopedSectionTemplateIdFor`: si el `section_template_id` del payload no esta entre las areas
visibles del usuario (`resolveAllowedAreaIds`), lo descarta y mapea por `section` al area system
correspondiente. Helpers de resolucion (`lib/workout-areas.ts`): `effectiveAreaId` /
`effectiveAreaKey` (area efectiva con fallback legacy), `executionAreaGroupsFor` (agrupacion de
ejecucion del alumno con fallback a secciones legacy).

---

## 6.10 Modelo de tablas, relaciones y RPC

### Jerarquia

```
workout_programs (cabecera)
  └─ workout_plans (un dia: day_of_week + week_variant)
       └─ workout_blocks (un ejercicio prescrito: sets/reps/peso + polimorfico)
            └─ workout_logs (ejecucion real del alumno por set)
```

### Columnas clave

- `workout_programs`: `coach_id`, `client_id` (null = plantilla), `org_id`, `name`,
  `weeks_to_repeat`, `start_date`, `end_date`, `duration_type` (`weeks`/`calendar_days`/`async`),
  `duration_days`, `program_structure_type` (`weekly`/`cycle`), `cycle_length`, `ab_mode`,
  `start_date_flexible`, `program_notes`, `program_phases` (jsonb `[{name,weeks,color}]`),
  `is_active`, `source_template_id` (plantilla de origen, para sync), `last_edited_by_coach_id`,
  `created_by_coach_id`, `updated_at` (trigger `set_updated_at` + usado para conflicto optimista).
- `workout_plans`: `program_id`, `coach_id`, `client_id`, `day_of_week` (CHECK 1–7 en baseline;
  el schema de app preprocesa hasta 28), `week_variant` (CHECK `A`/`B`), `title`, `group_name`,
  `assigned_date`.
- `workout_blocks`: `plan_id`, `exercise_id`, `order_index`, `sets`, `reps`, `target_weight_kg`,
  `tempo`, `rir`, `rest_time`, `notes`, `superset_group`, `progression_type` (CHECK `weight`/`reps`),
  `progression_value`, `section` (CHECK `warmup`/`main`/`cooldown`), `section_template_id`,
  `is_override` (si true, el bloque se salta al sincronizar desde plantilla), + 16 columnas
  polimorficas (`is_unilateral`, `side_mode`, `reps_value`, `reps_unit`, `load_type`, `load_value`,
  `load_unit`, `distance_value`, `distance_unit`, `duration_sec`, `target_pace_sec_per_km`, `hr_zone`,
  `instructions`, `exercise_type_override`, `interval_config` jsonb, `extra_targets` jsonb).
- `workout_logs`: `client_id`, `block_id`, `set_number`, `weight_kg`, `reps_done`, `rpe`, `rir`,
  `logged_at`, snapshots `exercise_name_at_log`, `plan_name_at_log`, `target_reps_at_log`,
  `target_weight_at_log` (historizan datos al momento del log).

### Foreign keys y ON DELETE (data-safety)

| FK | Referencia | ON DELETE |
|---|---|---|
| `workout_plans.program_id` | `workout_programs.id` | CASCADE |
| `workout_plans.client_id` | `clients.id` | CASCADE |
| `workout_plans.coach_id` | `coaches.id` | CASCADE |
| `workout_blocks.plan_id` | `workout_plans.id` | CASCADE |
| `workout_blocks.exercise_id` | `exercises.id` | RESTRICT |
| `workout_logs.block_id` | `workout_blocks.id` | CASCADE |
| `workout_logs.client_id` | `clients.id` | CASCADE |
| `workout_programs.client_id` | `clients.id` | CASCADE |
| `workout_programs.coach_id` | `coaches.id` | CASCADE |
| `workout_programs.source_template_id` | `workout_programs.id` | SET NULL |

Implicaciones:

- Borrar un programa cascada a planes → bloques → logs.
- `exercise_id` es RESTRICT: no se puede borrar un ejercicio aun referenciado por un bloque.
- `source_template_id` es SET NULL: borrar una plantilla NO borra los programas asignados desde
  ella; solo les pone `source_template_id = NULL` (pierden la posibilidad de re-sincronizar, pero
  conservan estructura e historial).

### Repository (`workout.repository.ts`)

Lectores tipados de bajo nivel: `findWorkoutProgramById`, `findWorkoutPlansByProgram`,
`findWorkoutBlocksByPlan`, `findWorkoutLogsByClient`, `upsertWorkoutProgram` (upsert generico,
no usado por el path principal del builder, que escribe via INSERT/UPDATE directos), y el CRUD de
`workout_section_templates` (`findAvailableSectionTemplates`, `insertSectionTemplate`,
`updateSectionTemplate`, `softDeleteSectionTemplate`).

### RPC

El builder de fuerza **no invoca RPCs** para guardar/copiar/asignar/sincronizar: toda la
persistencia es via queries directas (INSERT/UPDATE/DELETE) sobre las tablas, con RLS como techo.
(Existen RPC de analitica/agregacion en el baseline que consumen estas tablas — rachas, ultima
sesion, etc. — pero no forman parte del flujo de guardado del builder.)

---

## 6.11 Invariantes de seguridad de datos

1. **Aislamiento de contexto (3 vias):** standalone, team y enterprise nunca se cruzan. Cada
   mutacion resuelve el workspace activo y acota por `coach_id` / `team_id` / `org_id` segun
   corresponda. Los alumnos de pool solo se gestionan estando en el contexto de ese team.
2. **RLS como techo + filtros explicitos como defensa en profundidad:** todas las queries usan el
   cliente user-scoped; los `.eq`/`applyOrgScope` son adicionales a las policies.
3. **Coercion de `section_template_id`:** un area de otro contexto (stale o forjada en el payload)
   se descarta y cae al area system legacy; nunca se persiste una referencia ajena.
4. **No borrar historial en asignacion/desactivacion:** asignar o crear un programa nuevo solo
   **desactiva** (`is_active = false`) el programa previo del alumno; nunca lo borra. Su estructura y
   sus `workout_logs` quedan intactos.
5. **Preservacion de overrides en sync:** los bloques `is_override = true` del alumno nunca son
   pisados por la plantilla.
6. **Soft-delete de areas:** borrar un area no rompe los bloques que la referencian (FK intacta,
   fallback legacy); cero perdida de datos del plan.
7. **Conflicto optimista no destructivo:** el guardado con `expectedUpdatedAt` detecta ediciones
   concurrentes (pool) y devuelve `conflict` sin escribir, en vez de pisar el trabajo de otro coach.
8. **Idempotencia / normalizacion:** el `order_index` se recalcula por posicion al guardar (save);
   `cycle_length` se anula si la estructura no es `cycle`; las fases se sanean; los numericos pasan
   por preprocesadores Zod con clamps.
9. **Limitacion conocida de data-loss (no es invariante garantizada):** la edicion/reguardado de un
   programa de alumno (incluida la sincronizacion desde plantilla) borra y re-inserta los planes, lo
   que por CASCADE elimina los `workout_logs` ligados a los bloques anteriores (esos logs cuelgan de
   `block_id`, no del programa). Quien rediseñe el builder debe ser consciente de que el guardado
   actual NO preserva el historial de ejecucion ligado a bloques al reconstruir un programa de alumno
   ya ejercitado; un fix robusto requeriria reconciliar bloques por identidad estable en vez de
   delete+reinsert.


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [MED] Fallback hardcodeado de la URL de dashboard en el email de asignacion (assignProgramToClientsService)

En 6.6 (paso 5, Email transaccional) agregar: 'La URL del dashboard se arma con `NEXT_PUBLIC_APP_URL || NEXT_PUBLIC_SITE_URL` + `/c/<coachSlug>/dashboard`. Si ninguna de las dos env vars esta definida, cae a un placeholder hardcodeado `https://app.tu-dominio.com/...` (link invalido) — dependencia operacional a vigilar.'

