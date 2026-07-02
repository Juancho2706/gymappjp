# 1. Vision general y arquitectura

## 1.1 Que es el builder y para que sirve

El **builder de planes de entrenamiento (fuerza)** es la herramienta con la que el coach arma la prescripcion de entrenamiento: define dias, secciones/areas (calentamiento, principal, enfriamiento o areas custom), bloques de ejercicios y sus parametros (series, reps, peso objetivo, tempo, RIR, descanso, notas, superseries, progresion automatica, etc.). El resultado se persiste como un **programa** (`workout_programs`) con sus **dias** (`workout_plans`) y sus **bloques** (`workout_blocks`).

El builder cumple dos propositos segun donde se abra:

- **Armar una PLANTILLA reutilizable** (modo `template`): un programa generico, sin alumno asociado, que luego se asigna a uno o varios alumnos.
- **Armar el PLAN de un alumno concreto** (modo `client-plan`): un programa ligado a un alumno especifico, que el alumno ejecuta en su PWA y cuyo historial de ejecucion vive en `workout_logs`.

Ambos modos comparten **el mismo motor de UI**: el componente cliente **`WeeklyPlanBuilder`** (`apps/web/src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx`). No hay dos builders: hay uno solo, y el contexto (alumno o plantilla) lo determina una sola prop.

## 1.2 Los dos modos y el flag que los diferencia

`WeeklyPlanBuilder` recibe estas props:

- `client?: Partial<Client> | null` — el alumno. **Esta es la prop discriminante.**
- `exercises: Exercise[]` — catalogo de ejercicios asignables.
- `initialProgram?: any` — el programa existente a editar (null al crear desde cero).
- `coachName?: string` — nombre/marca del coach (solo modo alumno, lo pasa la pagina de alumno).
- `lastEditor?: { name; at } | null` — ultimo editor (solo relevante en pool de team).
- `areas?: WorkoutArea[]` — areas/secciones visibles del workspace activo.
- `cardio?: BuilderCardioContext` — contexto del modulo cardio (solo modo alumno).

La distincion **template vs client-plan se decide por la presencia de `client?.id`**:

- **Modo client-plan:** `client` viene poblado (la pagina de alumno lo pasa). Al guardar, el builder envia `clientId: client?.id` al backend, y el programa nace/queda con `client_id` no nulo. Solo en este modo se pasan `coachName`, `lastEditor` y `cardio`, y solo aqui tiene sentido `source_template_id` (`source_template_id: client?.id ? sourceTemplateId : null`).
- **Modo template:** la pagina de plantilla **NO pasa `client`**. Al guardar, `clientId: client?.id || null` resuelve a `null`, y el programa queda como plantilla (`client_id IS NULL`).

En el backend, `saveWorkoutProgramAction` ramifica en todo momento por `if (clientId) { ... } else { ... }`: validaciones de unicidad de nombre, calculo de fecha de inicio/fin, desactivacion del programa activo previo del alumno, etc. son distintas en cada modo.

## 1.3 Como se ENTRA al builder

### 1.3.1 Desde la Biblioteca de Programas (`/coach/workout-programs`)

La pagina RSC `workout-programs/page.tsx`:

1. Resuelve el coach con `getCoach()` (redirige a `/login` si no hay sesion).
2. Resuelve el **workspace activo** con `getPreferredWorkspaceForRender(coach.id)`, derivando `orgId` (enterprise) o `activeTeamId` (team).
3. Llama `getWorkoutProgramsWithClients(coach.id, { orgId, activeTeamId })`, que devuelve `{ programs, clients, areas }`.
4. Renderiza `WorkoutProgramsClientShell`, que envuelve a **`WorkoutProgramsClient`** (`WorkoutProgramsClient.tsx`), el cliente que dibuja la lista, los filtros, los modales y el panel de detalle.

**Que muestra la lista**

- Cada programa es una fila **`ProgramRow`**. La fila muestra: nombre del programa, una insignia de tipo (**Plantilla** si `client_id` es nulo; **Activo**/**Inactivo** si esta asignado a un alumno, segun `is_active`), insignias de estructura (**Fases** si tiene `program_phases`, **A/B** si `ab_mode`, **Asincrono** si `duration_type === 'async'`), una linea de metadatos (dias con trabajo, conteo de bloques, etiqueta de ciclo, semanas, fecha de ultima actividad) y, en programas de alumno, avatar e iniciales + nombre del alumno.
- En desktop hay un **panel de detalle** lateral (`DesktopDetailPanel`) que se abre al hacer clic en una fila y muestra el resumen + el cuerpo de la vista previa (`ProgramPreviewBody`) + una barra de acciones.

**Filtros y controles de la barra** (`LibraryToolbar`, estado en `WorkoutProgramsClient`):

- **Busqueda** (`search`): por nombre de programa o nombre de alumno (logica en `matchesProgramFilters` de `libraryStats.ts`).
- **Tipo** (`filterType`): `all` / `templates` (sin `client_id`) / `assigned` (con `client_id` y `is_active`).
- **Estado** (`filterStatus`): `all` / `active` / `inactive`.
- **Estructura** (`filterStructure`): `all` / `weekly` / `cycle` (`program_structure_type`).
- **Fases** (`filterHasPhases`): `all` / `with` / `without`.
- **Modo de vista** (`viewMode`): `comfortable` / `compact`.

El filtrado es **100% client-side** sobre la lista ya cargada (`programs.filter(matchesProgramFilters)`). Los conteos del header (`templateCount`, `activeAssignedCount`) tambien se derivan en cliente.

**Acciones que lanzan/relacionan con el builder**

Disponibles desde el menu de la fila (`ProgramRow`) y desde el panel de detalle (`DesktopDetailPanel`):

- **Nueva plantilla** — boton del header / empty state: `router.push('/coach/workout-programs/builder')` (abre el builder en modo template, sin `programId`).
- **Editar** — navega a:
  - `/coach/workout-programs/builder?programId=<id>` si es plantilla (`!client_id`), o
  - `/coach/builder/<client_id>?programId=<id>` si es programa de alumno.
- **Asignar** (solo plantillas) — abre el modal de asignacion (`Dialog`) que selecciona alumnos, modo de inicio (Hoy / Fecha especifica / Inicio flexible), duracion en semanas y dias a copiar; ejecuta `assignProgramToClientsAction`. NO abre el builder; clona la plantilla a cada alumno en el servidor.
- **Duplicar** — abre el modal de duplicado (nombre unico, 2–100 chars); ejecuta `duplicateWorkoutProgramAction`. El duplicado siempre nace como **plantilla** (`client_id = null`).
- **Sincronizar** (solo si el programa tiene `source_template_id` y hay handler `onSync`) — `AlertDialog` de confirmacion; ejecuta `syncProgramFromTemplateAction`, que reaplica los cambios de la plantilla vinculada respetando bloques con `is_override`.
- **Vista previa** — abre `ProgramPreviewPanel` (Dialog en desktop, Sheet en movil) con el contenido del programa (dias, secciones, superseries, parametros) en solo-lectura.
- **Eliminar** — `AlertDialog`; ejecuta `deleteWorkoutProgramAction` (borra el programa; CASCADE elimina planes/bloques).

### 1.3.2 Desde la ficha del alumno

El builder de alumno vive en `/coach/builder/[clientId]`. La pagina RSC `builder/[clientId]/page.tsx`:

1. Lee `params.clientId` y `searchParams.programId` (`planId` se ignora explicitamente con `void planId`).
2. Llama `getBuilderData(clientId, programId)` → `{ user, client, exercises, initialProgram, lastEditor, areas, cardio }`.
3. Si no hay `user` redirige a `/login`; si no hay `client` redirige a `/coach/clients`.
4. Resuelve `getCoach()` para pasar `coachName` (marca o nombre).
5. Renderiza `WeeklyPlanBuilder` con `client`, `exercises`, `initialProgram`, `coachName`, `lastEditor`, `areas`, `cardio`.

Sin `programId` se entra a crear un programa nuevo para ese alumno; con `programId` se edita el existente.

## 1.4 Capas de la arquitectura (flujo de datos)

El builder respeta la Clean Architecture del proyecto. Flujo de extremo a extremo:

```
page.tsx (RSC)
   │  resuelve sesion + workspace
   ▼
_data/*.queries.ts            (builder.queries.ts / template-builder.queries.ts / workout-programs.queries.ts)
   │  React.cache; lee Supabase (catalogo, areas, alumno, initialProgram)
   ▼
WeeklyPlanBuilder (cliente, 'use client')
   │  recibe props; mantiene estado de edicion
   ▼
usePlanBuilder (hook de estado por variante A/B)
   │  edita dias/bloques en memoria; arma el payload
   ▼
_actions/builder.actions.ts   ('use server'; thin wrappers)
   │  re-exporta y delega
   ▼
services/workout/workout.service.ts
   │  valida (Zod WorkoutProgramSchema), aplica scope de workspace,
   │  coerce de areas, guardado transaccional, revalidatePath
   ▼
Supabase (PostgREST + RLS)     workout_programs / workout_plans / workout_blocks
```

Notas de capas observadas:

- **`page.tsx` (RSC)** solo orquesta: resuelve coach/sesion y workspace, llama queries, redirige y monta el cliente.
- **`_data/*.queries.ts`** estan envueltas en `cache` (React.cache) para deduplicar. Leen Supabase directamente para **lectura** (catalogo de ejercicios, areas via `listAvailableWorkoutAreas`, alumno, `initialProgram`, contexto cardio). El scope (org/team/standalone) se aplica aqui.
- **`_actions/builder.actions.ts`** es un archivo `'use server'` con **solo async functions** que delegan 1:1 a `workout.service` (re-exporta tipos con `export type ... from`, forma segura segun la regla de server actions del proyecto). Server actions expuestas: `saveWorkoutProgramAction`, `deleteWorkoutProgramAction`, `deletePlanAction`, `duplicateWorkoutProgramAction`, `assignProgramToClientsAction`, `getExerciseHistoryAction`, `getTemplatesForBuilderAction`, `loadTemplateForBuilderAction`, `syncProgramFromTemplateAction`, `getCoachClientsAction`.
- **`services/workout/workout.service.ts`** concentra toda la logica de aplicacion: validacion Zod (`WorkoutProgramSchema`), resolucion de scope (`getCoachWorkoutScope` → `resolvePreferredWorkspace`), control de acceso al alumno (`resolveCoachClientAccess` / `assertCoachCanManageWorkoutClient`), coercion anti-forja de areas (`resolveAllowedAreaIds` + `scopedSectionTemplateIdFor`), mapeo polimorfico de bloques (`polymorphicBlockColumns`), guardado/duplicado/asignacion/sync y `revalidatePath`. Importante: este servicio escribe/lee Supabase con el cliente **user-scoped** (RLS siempre activa como defensa en profundidad); no se observa una capa `infrastructure/db/workout.repository` intermediando estas mutaciones — el acceso a Supabase ocurre en el propio servicio.

## 1.5 Que datos llegan al abrir cada modo

### 1.5.1 Modo client-plan — `getBuilderData(clientId, programId)`

Verifica la sesion localmente (`supabase.auth.getClaims()`, JWT ES256; el proxy ya valido/refresco). Resuelve workspace (`orgId` / `activeTeamId`). Devuelve:

- **`client`**: fila de `clients` con `id, full_name, email`, scopeada por workspace (team ⇒ alumno de ESE pool con `org_id` null; standalone ⇒ `coach_id = user` y `team_id` null; enterprise ⇒ `coach_id` + `org_id`).
- **`exercises`**: catalogo de `exercises` (columnas `EXERCISE_LIST_COLUMNS`) filtrado por `or(...)`: ejercicios **system** (`coach_id`, `org_id`, `team_id` todos null) + los del scope activo (org, team, o propios del coach). Anti-fantasma: en team NO se incluyen ejercicios personales (no serian legibles por el alumno/pares por RLS).
- **`areas`**: `listAvailableWorkoutAreas` segun workspace (system + propias/team; enterprise solo system v1). Son las secciones/areas (`workout_section_templates`) que titulan los bloques.
- **`cardio`** (`BuilderCardioContext`): `{ enabled, zones }`, gated por el contexto del alumno via `getClientZonesForContext`. Enterprise queda `{ enabled: false, zones: null }`. Da los chips de zona para prescripcion cardio.
- **`initialProgram`** (solo si hay `programId`): `workout_programs` con join anidado `workout_plans → workout_blocks → exercises` (nombre, grupo muscular, gif/video/thumbnail, exercise_type). Scopeado (team ⇒ por `client_id`; standalone/enterprise ⇒ por `coach_id` [+ org]).
- **`lastEditor`** (`{ name, at } | null`): solo en team y solo si `last_edited_by_coach_id` fue OTRO coach — alimenta el aviso de "editado por X".

### 1.5.2 Modo template — `getTemplateBuilderData(programId)`

Mismo patron de sesion/scope, pero sin alumno ni cardio. Devuelve:

- **`exercises`**: `or('coach_id.is.null,coach_id.eq.<user>')` — system + propios del coach.
- **`areas`**: `listAvailableWorkoutAreas` segun workspace.
- **`initialProgram`** (solo con `programId`): mismo join `workout_plans → workout_blocks → exercises` (aqui el join de exercises trae solo `name, muscle_group`), filtrado a **plantilla** del coach (`coach_id = user`, scope org/null). No carga `client`, `lastEditor` ni `cardio`.

## 1.6 Modelo de dominio de alto nivel

La jerarquia conceptual (`domain/workout/types.ts` + tipos del builder en `builder/[clientId]/types.ts`):

```
Program (workout_programs)
  ├─ Weeks / variantes A-B (ab_mode) y fases (program_phases)
  └─ Days (workout_plans)        ← day_of_week, title, week_variant
        └─ Blocks (workout_blocks)  ← agrupados por seccion/area y por superset_group
              └─ Exercise + Sets    ← exercise_id, sets, reps, peso, tempo, RIR, descanso, progresion,
                                       y campos polimorficos (load_type, side_mode, interval_config, hr_zone, ...)
```

Tipos clave del dominio:

- **`WorkoutArea`**: una seccion/area (`workout_section_templates`): system (7 fijas), de coach (`coach_id`) o de team (`team_id`). Modelo **expand-contract** sobre `workout_blocks.section`: el area (`section_template_id`) es la fuente preferente y `section` queda como bucket legacy (`warmup`/`main`/`cooldown`/`other`).
- **`ExerciseType`** (`strength` | `cardio` | `mobility` | `roller`) y campos polimorficos (`SideMode`, `LoadType`, `LoadUnit`, `DistanceUnit`, `RepsUnit`, `IntervalConfig`) que extienden el bloque para soportar prescripcion no-fuerza sin romper la data legacy (todo opcional/null en bloques clasicos).
- Tipos de estado del builder (cliente): `BuilderBlock`, `DayState`, `ProgramPhase`.

**Tablas DB involucradas:**

- **`workout_programs`** — el programa. Columnas relevantes: `client_id` (null = plantilla), `coach_id`, `org_id`, `name`, `weeks_to_repeat`, `start_date`/`end_date`, `duration_type`, `duration_days`, `program_structure_type` (`weekly`/`cycle`), `cycle_length`, `start_date_flexible`, `program_notes`, `ab_mode`, `program_phases` (jsonb), `source_template_id`, `is_active`, `last_edited_by_coach_id`, `updated_at`.
- **`workout_plans`** — los dias del programa (`program_id`, `client_id`, `coach_id`, `day_of_week`, `title`, `group_name`, `assigned_date`, `week_variant`). Borrar el programa CASCADE borra los planes.
- **`workout_plan_blocks` / `workout_blocks`** — los bloques de ejercicio de cada dia (`plan_id`, `exercise_id`, `order_index`, `sets`, `reps`, `target_weight_kg`, `tempo`, `rir`, `rest_time`, `notes`, `superset_group`, `progression_type`/`progression_value`, `section`, `section_template_id`, `is_override`, + columnas polimorficas). Borrar el plan CASCADE borra los bloques.
- **`workout_logs`** — el **historial de ejecucion** del alumno (lo que efectivamente entreno: peso, reps_done, set_number, logged_at), ligado al bloque (`workout_blocks`) y al alumno. Relacion clave: el builder define lo prescrito; `workout_logs` guarda lo realizado. Al reemplazar un programa, el historial se **conserva** (desactivacion logica, no borrado). `getExerciseHistoryAction` lee `workout_logs` para mostrar el ultimo registro de un ejercicio al coach.

## 1.7 Guards de acceso (auth, tier, contexto)

- **Auth (pagina):** ambas paginas RSC validan sesion. En las queries se usa `getClaims()` (verificacion local del JWT; el proxy ya valido/refresco). En las server actions del servicio se usa `getUser()` y se devuelve `{ error: 'No autenticado.' }` si no hay usuario.
- **Layout coach (`/coach/layout.tsx`):** `getCoach()` redirige a `/login` si no hay coach. El layout tambien resuelve workspace activo, branding (white-label v2: branding standalone es **Pro+** via `isBrandingAllowed(subscription_tier)`), modulos habilitados (`enabledModules`, con `applyOperatorKillSwitch`) y dominios apagados (feature-prefs). El gate de **tier** relevante al builder en este nivel es de branding/modulos del nav; el modulo `cardio` del builder se gatea por el contexto del alumno (`BuilderCardioContext.enabled`).
- **Contexto / workspace (separacion estricta de 3 vias):** en TODA query y mutacion el scope se resuelve por el **workspace activo** (`resolvePreferredWorkspace` → `getCoachWorkoutScope`):
  - **standalone:** propios NO-pool (`coach_id` + `org_id` null + `team_id` null).
  - **team:** alumnos/programas de ESE pool (`org_id` null + `team_id`, **sin** filtro `coach_id` — pool colaborativo; RLS es el techo).
  - **enterprise:** `coach_id` + `org_id`.
- **Acceso al alumno:** antes de cualquier mutacion ligada a un alumno, el servicio llama `resolveCoachClientAccess` / `assertCoachCanManageWorkoutClient` (team ⇒ alumno del pool + `currentUserHasTeamAccessToClient`; enterprise/standalone ⇒ `coach_id` [+ org] [+ team null]). Si falla, devuelve "Alumno no encontrado.".
- **Anti-forja de areas:** el payload del builder es client-controlled y `workout_blocks` no valida el FK `section_template_id`; el servicio recalcula las areas permitidas (`resolveAllowedAreaIds`) y descarta ids fuera de las areas visibles del usuario (cae al mapeo legacy por `section`).
- **RLS:** todas las tablas tienen RLS coach/client/org-scoped. El servicio usa siempre el cliente user-scoped (defensa en profundidad: scope explicito en la query + RLS en la DB).
- **Conflicto de edicion (awareness, no es bloqueo de acceso):** `saveWorkoutProgramAction` admite `expectedUpdatedAt`; si otro coach del pool guardo desde que el builder cargo, devuelve `conflict` en vez de pisar, salvo `force`.

---


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [MED] Sheet de catalogo movil con 3 estados de altura (gestos) + catalogo lateral tablet colapsable

En sec1 (o sec3-canvas) documentar la entrada de ejercicios por viewport: desktop (lg) = catalogo lateral fijo 350px; tablet (md→lg) = catalogo lateral colapsable via boton Search (isCatalogSidebarOpen); movil = bottom-sheet con 3 snaps por gesto (handleTouchEnd): ~12vh colapsado (etiqueta 'Anadir ejercicio' + conteo del dia), ~40vh compacto (buscador + chips de musculo), ~80vh catalogo completo. El filtro muscular (catalogMuscleFilter) es compartido entre chips del sheet y el Select del catalogo.

