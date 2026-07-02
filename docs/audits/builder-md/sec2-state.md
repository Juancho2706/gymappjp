# 2. Estado, modelo de datos y motor (reducer)

El builder de fuerza se apoya en un hook propio (`usePlanBuilder`) que maneja un `useReducer`, un sistema de historial (deshacer/rehacer) y una serie de callbacks estables. El componente `WeeklyPlanBuilder` instancia ese hook (una vez por variante de semana, A y B) y le suma todo el estado a nivel de programa (nombre, duración, fases, estructura, modo A/B, autosave, etc.). Esta sección describe el estado completo, el modelo polimórfico de bloques, todas las acciones del reducer, cómo se modelan semanas A/B, repetir semanas y fases, el autosave/dirty tracking y cómo `WeeklyPlanBuilder` cablea los hijos.

---

## 2.1 Estructura completa del estado

El estado del builder vive en tres capas:

1. **Estado del día/bloque** — manejado por el reducer (`DayState[]`), una por cada variante A/B.
2. **Estado a nivel programa** — `useState` dentro de `WeeklyPlanBuilder` (nombre, duración, fases, estructura, modo A/B, etc.).
3. **Estado de UI/sesión** — diálogos, tour, modo simple, sheet móvil, dirty tracking, borrador.

### 2.1.1 Programa (nivel raíz, `useState` en `WeeklyPlanBuilder`)

Cada campo se inicializa desde `initialProgram` (la fila de `workout_programs` que llega por RSC) y se persiste al guardar dentro de `WorkoutProgramInput`.

- `programName` (string) — nombre del programa. Obligatorio para guardar.
- `weeksToRepeat` (number, default 4) — semanas a repetir (campo "repetir semanas"; ver 2.6).
- `durationType` (`'weeks' | 'async' | 'calendar_days'`, default `'weeks'`) — cómo se cuenta la duración.
- `durationDays` (number | null) — días de duración cuando aplica.
- `startDateFlexible` (boolean, default `true`) — si la fecha de inicio es libre (sin fecha fija).
- `startDate` (string ISO `YYYY-MM-DD`) — fecha de inicio; default hoy o la de `initialProgram.start_date`.
- `programNotes` (string) — notas del programa.
- `programPhases` (`ProgramPhase[]`) — fases visuales del timeline (ver 2.6). Se parsean desde `initialProgram.program_phases` con `parseProgramPhases` (clamp de `weeks` a 1–52, color hex con default `#6366F1`, nombre máx 80 chars, default `Fase N`).
- `sourceTemplateId` (string | null) — id de la plantilla base de la que nació un plan de alumno (habilita "Sync plantilla"). Solo se persiste cuando hay `client?.id`.
- `programStructureType` (`'weekly' | 'cycle'`, default `'weekly'`) — semanal (7 días Lunes–Domingo) o ciclo de N días (ver 2.5/2.6).
- `cycleLength` (number, default 7) — largo del ciclo cuando `programStructureType === 'cycle'`.

### 2.1.2 Estructura del día (`DayState`, tipo en `types.ts`)

El reducer opera sobre `DayState[]`. Cada día:

- `id` (number) — en modo `weekly`: 1–7 (Lunes a Domingo, según `DAYS_OF_WEEK`). En modo `cycle`: 1…N.
- `name` (string) — nombre del día (`'Lunes'`…`'Domingo'`, o `'Día N'` en ciclo).
- `title` (string) — título editable por el coach (ej. "Empuje", "Tren inferior").
- `blocks` (`BuilderBlock[]`) — los ejercicios del día, en orden de render.
- `is_rest?` (boolean) — marca el día como descanso.
- `week_variant?` (`'A' | 'B'`) — variante; declarado en el tipo aunque la variante real se maneja por la instancia de hook A o B (cada builder es A o B; ver 2.5).

`DAYS_OF_WEEK` define los 7 días fijos: `{ id: 1..7, name: 'Lunes'..'Domingo' }`.

### 2.1.3 Estado de UI/sesión (selección de los más relevantes)

- `isABMode` (boolean) — modo semanas A/B activo (init desde `initialProgram.ab_mode`).
- `activeVariant` (`'A' | 'B'`) — variante visible en el tablero.
- `hasUnsavedChanges` (boolean) — bandera de cambios sin guardar (ver 2.7).
- `showDraftBanner` (boolean) — muestra el banner de borrador recuperable.
- `editingBlock` (`BuilderBlock | null`) — bloque abierto en el `BlockEditSheet`.
- `activeId` / `activeData` (DnD) — bloque/ejercicio arrastrándose para el `DragOverlay`.
- Diálogos: `showTemplatePicker`, `showPreview`, `showAssign`, `showBalance`, `showPrint`, `showConfig`.
- Móvil: `isMobile`, `isSimpleMode`, `activeMobileDayIndex`, `sheetHeight`, `isCatalogOpen`, etc.
- Tour: `tourOpen`, `tourMode` (`'short' | 'full'`), `activeTourStepId`, etc.

---

## 2.2 Modelo de bloque (`BuilderBlock`) — base legacy + ejes polimórficos

El bloque es la unidad central del builder (un ejercicio prescrito dentro de un día). Persiste a `workout_blocks`. Tiene una parte **legacy clásica** (fuerza) y una capa **polimórfica** (specs/movida-entrenamiento), donde todos los campos nuevos son **opcionales** y un bloque legacy queda byte-idéntico al mapeo histórico (todo NULL).

### 2.2.1 Identidad y catálogo (común a todos los tipos)

- `uid` (string) — id local en el builder. Tres formatos: `block-<dbId>` (cargado de DB), `new-<ts>-<rand>` (ejercicio nuevo arrastrado/añadido), `clone-<ts>-<rand>` (copiado desde otro día con COPY_DAY).
- `exercise_id` (string) — FK a `exercises`.
- `exercise_name`, `muscle_group` (string) — denormalizados del catálogo para mostrar.
- `gif_url?`, `video_url?`, `thumbnail_url?` (string) — media del ejercicio (preferente del bloque, fallback al catálogo vía `enrichDaysWithExerciseMedia`).
- `dayId?` (number) — día al que pertenece (se setea al añadir/transferir/clonar).

### 2.2.2 Eje de sección/área

- `section?` (`BuilderSection` = `'warmup' | 'main' | 'cooldown'`) — bucket legacy. Persiste a `workout_blocks.section` (CHECK warmup/main/cooldown). Cualquier valor distinto se normaliza a `'main'`.
- `section_template_id?` (string | null) — id del área (`workout_section_templates.id`). **Fuente preferente** sobre `section` (expand-contract). Las 7 áreas system tienen UUID fijo; las 3 clásicas mapean 1:1 a warmup/main/cooldown (`LEGACY_SECTION_AREA_ID`).
- `is_override?` (boolean) — marca "Modif." a nivel bloque: cuando un plan de alumno está ligado a una plantilla (`sourceTemplateId`), un bloque con `is_override` NO se pisa al sincronizar desde la plantilla.

### 2.2.3 Eje superserie

- `superset_group?` (string | null) — letra de grupo (`A`, `B`, …) que enlaza bloques consecutivos de la misma área efectiva en una superserie. `null` = sin superserie.

### 2.2.4 Eje progresión (autoprogresión)

- `progression_type?` (`'weight' | 'reps' | null`) — tipo de progresión automática.
- `progression_value?` (number | null) — magnitud del incremento.

### 2.2.5 Prescripción clásica (fuerza)

- `sets?` (number) — series.
- `reps?` (string) — repeticiones como texto libre (ej. `"8-12"`, `"AMRAP"`). En fuerza manda este texto del coach.
- `target_weight_kg?` (string) — peso objetivo (string para input; se parsea a número al guardar con `parseOptionalKg`, acepta coma o punto decimal).
- `tempo?` (string) — tempo (ej. `"3-1-1"`).
- `rir?` (string) — RIR/RPE (repeticiones en reserva).
- `rest_time?` (string) — descanso (ej. `"90s"`).
- `notes?` (string) — notas del bloque.

### 2.2.6 Ejes polimórficos (cardio / movilidad / foam-roller / fuerza con ejes extra)

Todos opcionales; tipos en `domain/workout/types.ts`. En filas legacy quedan NULL.

- `exercise_type?` (`ExerciseType | null`) — tipo del catálogo (`exercises.exercise_type`): `'strength' | 'cardio' | 'mobility' | 'roller'`.
- `exercise_type_override?` (`ExerciseType | null`) — override explícito del coach a nivel bloque. **Manda sobre `exercise_type`.** El tipo efectivo se resuelve con `effectiveExerciseType(block, exercise)` = `override ?? exercise_type ?? 'strength'`.
- `side_mode?` (`SideMode | null`) — `'bilateral' | 'per_side' | 'alternating'` (por lado / alternado). Aporta el sufijo "/lado" en resúmenes.
- `reps_value?` (number | null) — valor numérico de repeticiones/pasadas/respiraciones.
- `reps_unit?` (`RepsUnit | null`) — `'reps' | 'passes' | 'breaths'` (pasadas para foam-roller, respiraciones para movilidad).
- `load_type?` (`LoadType | null`) — `'weight' | 'time' | 'bodyweight' | 'none'`.
- `load_value?` (string) — carga como string para input; se parsea al guardar (mismo helper que `target_weight_kg`).
- `load_unit?` (`LoadUnit | null`) — `'kg' | 'lb' | 'sec'`.
- `distance_value?` (string) — distancia como string para input; se parsea al guardar.
- `distance_unit?` (`DistanceUnit | null`) — `'m' | 'km'`.
- `duration_sec?` (number | null) — duración total en segundos (cardio steady, hold de movilidad, etc.).
- `target_pace_sec_per_km?` (number | null) — ritmo objetivo (s/km) para cardio.
- `hr_zone?` (number | null) — zona de frecuencia cardiaca (Z1–Z5).
- `instructions?` (string) — instrucciones de ejecución (campo libre extra).
- `interval_config?` (`IntervalConfig | null`) — configuración de intervalos HIIT (jsonb), con `repeats`, `work` (`duration_sec`/`distance_m` + `target` por `hr_zone`/`pace`/`rpe`) y `recovery` (`duration_sec`/`distance_m` + `mode` `rest`/`jog`/`walk`), más `warmup_sec`/`cooldown_sec` opcionales. La M externa de la serie viene de `block.sets`.

### 2.2.7 Campos tipados por tipo de ejercicio (resumen)

| Tipo | Campos que típicamente usa | Default al crear (`createDefaultBlock`) |
|------|----------------------------|------------------------------------------|
| `strength` (fuerza) | `sets`, `reps` (texto), `target_weight_kg`, `tempo`, `rir`, `rest_time`; opcional `distance_value` (ej. farmer carry) | `sets:3`, `reps:'8-12'`, `rest_time:'90s'` (EXACTO al default histórico, AC3) |
| `cardio` | `duration_sec` o `distance_value`/`distance_unit`, `hr_zone`, `target_pace_sec_per_km`, `interval_config` | `sets:1`, `reps:'10min'`, `duration_sec:600`, `rest_time:''` |
| `mobility` (movilidad) | `duration_sec` (hold) o `reps_value` + `reps_unit` (`reps`/`breaths`), `sets`, `side_mode` | `sets:3`, `reps:'30s'`, `duration_sec:30`, `rest_time:''` |
| `roller` (foam roller) | `reps_value` + `reps_unit:'passes'` (pasadas) o `duration_sec`, `side_mode` | `sets:1`, `reps:'10 pasadas'`, `reps_value:10`, `reps_unit:'passes'`, `rest_time:''` |

El tipo efectivo decide qué formulario/ejes muestra el `BlockEditSheet` y qué validación de completitud aplica al guardar (ver 2.8).

### 2.2.8 Resumen legacy corto (`reps` siempre poblado)

`workout_blocks.reps` es NOT NULL (máx 20 chars). Por eso, al guardar bloques de tipos no-fuerza, `reps` se genera con `legacyRepsSummaryFor(block, type)` (ej. `"8×400m @ Z4"`, `"30s/lado"`, `"10 pasadas"`, `"20min Z2"`), para que preview/print/history sigan mostrando algo sensato sin tocar esos consumidores. En fuerza manda el texto manual del coach. Para chips visibles del builder/preview existe `typedBlockSummary` (devuelve `null` en fuerza sin prescripción tipada → el caller renderiza el clásico `sets × reps`).

---

## 2.3 Modelo de fases (`ProgramPhase`)

```
interface ProgramPhase { name: string; weeks: number; color: string }
```

Las fases son **solo visuales** (timeline / `ProgramPhasesBar`), no afectan el motor de días. Se editan en el panel Configurar (`ProgramConfigHeader`) y se persisten como jsonb en `program_phases`. Sanitización en `parseProgramPhases`: `name` máx 80 (default `Fase N`), `weeks` clamp 1–52, `color` hex con default `#6366F1`.

---

## 2.4 Acciones del reducer (`builderReducer`)

`builderReducer(state: DayState[], action, areas = [])` recibe las áreas para resolver agrupación/orden. El hook lo cierra sobre `areasRef.current` para no recrear el estado cuando cambian las áreas. Acciones (`BuilderAction`):

- **`SET_DAYS`** `{ payload: DayState[] }` — reemplaza el estado completo. La usan: undo/redo, reshape por estructura/ciclo, restaurar borrador, aplicar plantilla, cambiar variante de día base.
- **`ADD_BLOCK`** `{ dayId, block }` — agrega `block` al final de `blocks` del día indicado.
- **`REMOVE_BLOCK`** `{ dayId, uid }` — elimina del día el bloque con ese `uid`.
- **`UPDATE_BLOCK`** `{ block }` — reemplaza por `uid` el bloque en **cualquier** día (recorre todos), con el objeto entrante.
- **`MOVE_BLOCK`** `{ dayId, oldIndex, newIndex }` — reordena bloques dentro del día con `arrayMove` (@dnd-kit). Reordenamiento por drag dentro de la misma columna.
- **`TRANSFER_BLOCK`** `{ activeId, activeDayId, overDayId }` — mueve un bloque de un día a otro: lo quita del día origen y lo agrega al final del día destino con `dayId` actualizado. Se dispara durante `onDragOver` (drag cross-day), con `dispatch` crudo (sin historial).
- **`UPDATE_DAY_TITLE`** `{ dayId, title }` — setea el `title` del día.
- **`TOGGLE_REST_DAY`** `{ dayId }` — invierte `is_rest` del día.
- **`COPY_DAY`** `{ sourceId, targetIds[] }` — clona TODOS los bloques del día origen a cada día destino (append). Cada clon recibe `uid` nuevo (`clone-…`) y el `dayId` del destino. Los bloques existentes del destino se conservan.
- **`SET_BLOCK_SECTION`** `{ dayId, uid, section }` — compat legacy: **delega** en `SET_BLOCK_AREA` con el área system equivalente (`LEGACY_SECTION_AREA_ID[section]`), manteniendo `section` y `section_template_id` sincronizados.
- **`SET_BLOCK_AREA`** `{ dayId, uid, areaId }` — mueve el bloque al área `areaId` (ver 2.4.1).
- **`TOGGLE_OVERRIDE`** `{ uid }` — invierte `is_override` del bloque (en cualquier día). Marca/desmarca "Modif." anti-sobreescritura por sync de plantilla.
- **`TOGGLE_SUPERSET`** `{ dayId, uid }` — enlaza/desenlaza superserie (ver 2.4.2).

Acción default: retorna el estado sin cambios.

### 2.4.1 `SET_BLOCK_AREA` — mover de área y reagrupar el día

1. Resuelve el área destino en `areas`; calcula el `bucket` legacy con `legacyBucketFor(area)` (warmup/main/cooldown system → su slug; cualquier otra → `'main'`). Si el área no se encontró, usa `classicSlugForAreaId(areaId) ?? 'main'`.
2. **Rompe la superserie completa** del bloque movido: si pertenecía a un grupo, todos los miembros de ese grupo quedan `superset_group: null` (igual que el legacy al cambiar de sección).
3. El bloque movido queda: `section: bucket`, `section_template_id: areaId`, `superset_group: null`.
4. **Reagrupa el día por área** en orden `sort_order` (`orderedAreaIds`). La clave de agrupación de cada bloque es `effectiveAreaKey` (área efectiva si es conocida; si está borrada/ajena, cae al área system de su section legacy → nunca queda sin grupo). El bloque movido se inserta en su grupo destino.
5. Reconstruye `blocks` recorriendo las áreas en orden; un **barrido final** agrega cualquier grupo no usado (áreas desconocidas) al final, garantizando que **ningún bloque se pierda**.

### 2.4.2 `TOGGLE_SUPERSET` — enlazar/desenlazar

- Si el bloque YA tiene `superset_group`: lo desenlaza. Si el grupo quedaba con ≤2 miembros, limpia TODO el grupo (no deja superseries de un solo miembro).
- Si NO tiene grupo: intenta enlazarlo con el **bloque siguiente** (`idx+1`). Reglas:
  - El último bloque del día no puede enlazar hacia adelante (no-op).
  - Solo se enlazan bloques de la **misma área efectiva** (`effectiveAreaKey`; en legacy = misma sección). Si difieren, no-op.
  - Reusa el grupo del siguiente si lo tiene; si no, asigna la primera letra A–Z libre del día.

---

## 2.5 Semanas A/B (variantes)

A/B se modela con **dos instancias completas e independientes** del hook:

```
const builderA = usePlanBuilder(initialDaysA, areas)
const builderB = usePlanBuilder(initialDaysB, areas)
const activeBuilder = activeVariant === 'A' ? builderA : builderB
```

- `initialDaysA`/`initialDaysB` se construyen con `getInitialDays('A')`/`getInitialDays('B')`. Esa función filtra `initialProgram.workout_plans` por `week_variant` (en A acepta también planes sin variante: legacy). Cada hook tiene su propio reducer, historial y estado.
- `activeVariant` (`'A' | 'B'`) elige qué builder se renderiza en el tablero; el toggle A/B (`isABMode`) muestra/oculta el selector de variante.
- Al guardar (ver 2.8), si `isABMode`: se mapean ambos builders → `[...mapDays(builderA.days, 'A'), ...mapDays(builderB.days, 'B')]`. Si no, solo `mapDays(days, 'A')`. El selector "A/B" persiste en `ab_mode`.
- El alumno alterna A→B cada semana automáticamente (la app de ejecución selecciona la variante por número de semana; el builder solo modela ambas).

---

## 2.6 Repetir semanas, fases y estructura del programa

- **Repetir semanas** (`weeksToRepeat`): número de semanas que el programa se repite; persiste a `weeks_to_repeat`. No reestructura días.
- **Duración** (`durationType` + `durationDays` + `startDate`/`startDateFlexible`): cómo y cuándo corre el plan; persiste a `duration_type`, `duration_days`, `start_date`, `start_date_flexible`.
- **Fases** (`programPhases`): bloques visuales del timeline (ver 2.3); persiste a `program_phases`.
- **Estructura del programa** (`programStructureType` + `cycleLength`):
  - `weekly` → 7 días fijos (Lunes–Domingo).
  - `cycle` → N días genéricos (`Día 1`…`Día N`).
  - Cambiar estructura o largo de ciclo llama `setProgramStructureType` / `setCycleLength`, que reconstruyen el esqueleto con `reshapeDays(existing, type, length)` para **ambos** builders (A y B) vía `dispatchWithHistory({ type: 'SET_DAYS', … })`. `reshapeDays` preserva `title`/`blocks`/`is_rest` por `id` coincidente; los bloques de días que dejan de existir se **anexan al último día** (nunca se pierde trabajo silenciosamente).

---

## 2.7 Autosave (borrador), dirty tracking y guardado

### 2.7.1 Dirty tracking (`hasUnsavedChanges`)

Un `useEffect` (saltando el primer render con `isFirstRender`) pone `hasUnsavedChanges = true` cuando cambia cualquiera de: `days` (A), `builderB.days`, `programName`, `weeksToRepeat`, `durationType`, `durationDays`, `startDateFlexible`, `startDate`, `programNotes`, `isABMode`, `programPhases`, `sourceTemplateId`. Además, varios handlers de UI (añadir/editar/quitar/copiar/superserie/área/override, drag end) setean la bandera explícitamente. La bandera alimenta el badge "CAMBIOS SIN GUARDAR".

### 2.7.2 Autosave a borrador local (debounce 3s)

No hay autosave a servidor. Hay **autosave a `localStorage`** (borrador): cuando `hasUnsavedChanges` es true, un `setTimeout` de **3000 ms** (debounced, se limpia en cleanup) escribe en la clave `builder_draft_<programId|'new'>` un JSON con: `programName`, `weeksToRepeat`, `durationType`, `durationDays`, `startDateFlexible`, `startDate`, `programNotes`, `isABMode`, `days`, `daysB` (`builderB.days`), `programPhases`, `sourceTemplateId`.

- Al montar, si existe ese borrador se muestra `showDraftBanner`.
- `handleRestoreDraft` repuebla todo el estado (incluyendo `SET_DAYS` para A y B) y muestra "Borrador restaurado".
- `handleDiscardDraft` borra la clave.
- Tras un guardado exitoso a servidor se elimina el borrador.

`isSimpleMode` se persiste aparte en `sessionStorage` (`builder:simpleMode`).

### 2.7.3 Historial (deshacer/rehacer) — no es optimistic, es snapshots

Dentro de `usePlanBuilder`:

- `historyRef` (pasado), `futureRef` (futuro), `daysRef` (snapshot actual), `MAX_HISTORY = 20`.
- `dispatchWithHistory(action)`: empuja el estado actual a `historyRef` (recorta a 20), limpia `futureRef`, activa `canUndo`, despacha. **Esta es la vía de toda acción iniciada por el usuario.**
- `dispatch` (crudo): NO crea entrada de historial. Se usa para el `TRANSFER_BLOCK` del drag-over y para `SET_BLOCK_AREA` cuando un alta acaba de crear el snapshot (así un undo revierte alta + área en un solo paso).
- `undo`/`redo` mueven snapshots entre `historyRef`/`futureRef` y aplican `SET_DAYS`. `canUndo`/`canRedo` controlan los botones. Atajos: Ctrl/Cmd+Z = undo; Ctrl/Cmd+Shift+Z o Ctrl+Y = redo.

### 2.7.4 Guardado a servidor (`handleSave`)

`handleSave(force = false)` corre dentro de `startTransition` (estado `isPending`):

1. **Validaciones previas**: exige `programName` no vacío; exige al menos un ejercicio (en A/B revisa A y B); exige completitud **por tipo** (`blockIncomplete`): fuerza pide `sets>=1` y `reps`; cardio pide duración/distancia/intervalo; movilidad pide `sets>=1` y (duración/`reps_value`/`reps`); roller pide duración/`reps_value`/`reps`. Si falla, muestra toast y aborta.
2. **Mapeo** con `mapDays(dayList, variant)`: filtra días con bloques, ordena por `order_index` (índice), parsea números (`parseOptionalKg` para kg/carga/distancia, coma o punto), genera `reps` (texto del coach en fuerza, `legacyRepsSummaryFor` en otros tipos), y empaqueta todos los ejes polimórficos (solo valores reales; legacy → null). `sets` por defecto 3 en fuerza, 1 en otros tipos si falta.
3. Construye `WorkoutProgramInput` (incluye `programId`, `clientId`, nombre, `weeksToRepeat`, `start_date`, `duration_*`, `program_structure_type`, `cycle_length` solo si ciclo, `start_date_flexible`, `program_notes`, `ab_mode`, `program_phases`, `source_template_id` solo si hay cliente, y `days`).
4. Llama `saveWorkoutProgramAction(input, { expectedUpdatedAt: initialProgram?.updated_at, force })` (server action → `saveWorkoutProgramService`).
5. **Conflicto de edición concurrente** (`result.conflict`): otro coach del pool guardó mientras editabas; toast con acción "Ver lo nuevo" (recargar) y "Guardar igual" (`handleSave(true)`). Nada se pisa sin confirmación.
6. **Error** (`result.error`): toast de error. **Éxito**: toast, borra el borrador local, limpia `hasUnsavedChanges`, y redirige a `/coach/clients/<id>?tab=entrenamiento` (plan de alumno) o a `/coach/templates` (plantilla).

---

## 2.8 Carga inicial (mapeo DB → estado)

- `getInitialDays(variant, structureType?, cyclLen?)` arma `DayState[]` desde `initialProgram.workout_plans`, eligiendo el plan por `day_of_week` + `week_variant` (A acepta planes sin variante).
- Cada `workout_blocks` se convierte con `mapDbBlockToBuilderBlock(b, exerciseById, uid, dayId)`: resuelve nombre/media del ejercicio (FK embebida o catálogo, vía `embeddedExerciseRow` que tolera objeto o array), normaliza `section` (warmup/cooldown o `'main'`), y hace round-trip de todos los campos polimórficos (legacy → todo null/'' → byte-idéntico al mapeo de siempre). `target_weight_kg`/`load_value`/`distance_value` vuelven a string para los inputs.
- `enrichDaysWithExerciseMedia` rellena media faltante del bloque desde el catálogo.

---

## 2.9 Cableado de `WeeklyPlanBuilder` hacia los hijos

`WeeklyPlanBuilder` destructura del `activeBuilder` los valores y callbacks, y los reenvía a los hijos. Callbacks "estables" (envueltos en `useCallback`, para `React.memo` de `DayColumn`) que además setean `hasUnsavedChanges`:

- A cada **`DayColumn`** (una por día visible; carrusel en móvil, fila en desktop) le pasa: `day`, `exercises`, `allDays`, `isCycleMode`, `isDragPending`, `narrowLayout`/`compact`, `areas`, `templateLinked` (= hay cliente con `sourceTemplateId`), y los handlers:
  - `onAddExercise` → `handleAddExercise(dayId, exercise, areaId?)`: crea bloque con `createDefaultBlock`, `addExercise` (con historial), si hay `areaId` lo coloca con `dispatch` crudo `SET_BLOCK_AREA`, registra reciente (`trackRecentExercise`, localStorage máx 8) y marca dirty.
  - `onEditBlock` → `setEditingBlock` (abre `BlockEditSheet`).
  - `onRemoveBlock` → `handleRemoveBlock` (`removeBlock` + dirty).
  - `onUpdateBlock` → `handleUpdateBlock` (`updateBlock` + dirty).
  - `onUpdateTitle` → `handleUpdateTitle` (`updateDayTitle`).
  - `onCopyDay` → `handleCopyDay` (`copyDay` + dirty + toast "Día copiado a N día(s)").
  - `onToggleRest` → `handleToggleRest` (`toggleRestDay` + dirty).
  - `onToggleSuperset` → `handleToggleSuperset` (`toggleSuperset` + dirty).
  - `onSetBlockArea` → `handleSetBlockArea` (`setBlockArea` + dirty).
  - `onToggleBlockOverride` → `handleToggleBlockOverride` (`toggleBlockOverride` + dirty).
- **`BlockEditSheet`**: recibe `block` (= `editingBlock`), `clientId`, `cardio` (contexto del módulo cardio: `enabled` + `zones`), `onUpdate` (= `updateBlock` + dirty + cerrar), `onChange` (= `setEditingBlock`), `onClose`.
- **`DndContext`**: `handleDragStart` (set `activeId`/`activeData`, `isDragPending` 400ms), `handleDragOver` (cross-day → `dispatch` crudo `TRANSFER_BLOCK`), `handleDragEnd` (drop en área → `SET_BLOCK_AREA` con historial; drop de ejercicio nuevo → `handleAddExercise`; reorden intra-día → `MOVE_BLOCK` con historial; siempre limpia y marca dirty). Sensores: Mouse (distancia 5), Touch (delay 300/tolerancia 8), Keyboard.
- **`DraggableExerciseCatalog`**: `exercises`, filtro muscular compartido (`catalogMuscleFilter`) y `onTapAdd` (móvil) → `handleAddExercise`.
- **`ProgramConfigHeader`** (panel Configurar): recibe y setea `programName`, `durationType`, `weeksToRepeat`, `durationDays`, `startDateFlexible`, `startDate`, `programNotes`, `programStructureType`, `cycleLength`, `programPhases` (+ `onClose`).
- **Diálogos**:
  - `TemplatePickerDialog` → `onApply(newDays, name, meta)`: `SET_DAYS` (con media enriquecida), setea nombre/meta/fases y, si hay cliente, fija `sourceTemplateId` (linkea plantilla).
  - `ProgramPreviewDialog`, `MuscleBalancePanel`, `PrintProgramDialog` (recibe `days` de A y `daysB` solo en A/B), `AssignToClientsDialog` (solo plantilla con `initialProgram.id`).
- **`BuilderOnboardingTour`**: tour corto/completo guiado por `data-tour-id`.

`overlayAreaVMs = buildAreaVMs(areas)` se memoiza para el `DragOverlay` del bloque arrastrado.


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [MED] Modo Simple (isSimpleMode) — subsistema completo de UX movil

Agregar subseccion '2.x Modo Simple (movil)': (1) Toggle por FAB Sparkles (boton flotante con badge NUEVO); persiste en sessionStorage 'builder:simpleMode'. (2) Al alternar dispara una transicion visual full-screen (overlay negro con logo + label 'Modo Simple'/'Modo Normal'); el swap real de UI ocurre a ~480ms y el overlay se limpia a ~2400ms (modeTransitionLabel). (3) En modo simple el tablero movil es un carrusel swipeable de dias (swipe izquierda/derecha cambia activeMobileDayIndex; umbral 50px y mas horizontal que vertical), con hints de flecha (showSwipeHint, auto-oculta 2.5s). (4) El catalogo se abre como overlay 80vh sin handle (FAB verde Plus). (5) El tour desactiva el modo simple al abrir y lo restaura al cerrar.

