# 3. Lienzo: dias, bloques, ejercicios, series, drag-and-drop y areas

El lienzo es el tablero central del builder. Se construye dentro de un `DndContext` de `@dnd-kit/core` y renderiza una columna por dia (`DayColumn`); dentro de cada columna van las tarjetas de ejercicio (`ExerciseBlock`) agrupadas por area. Todo el estado del dia vive en el reducer `builderReducer` (hook `usePlanBuilder`), y el catalogo lateral (`DraggableExerciseCatalog`) provee los ejercicios que se arrastran o se tocan para agregar. El motor (reducer + hook + tipos) es **identico** para los dos modos del builder (`client-plan` y `template`); la unica diferencia funcional la marcan los props `client` y `clientId` (presencia de alumno habilita historial, override de plantilla, etc.).

---

## 3.1 Estructura del lienzo

El lienzo arranca con un esqueleto de dias que depende de `programStructureType`:

- **Semanal** (`weekly`, default): 7 dias fijos tomados de `DAYS_OF_WEEK` (`usePlanBuilder.ts`) — Lunes (id 1) a Domingo (id 7). El `id` del dia se persiste como `day_of_week`.
- **Ciclo N dias** (`cycle`): N dias genericos "Dia 1..N" segun `cycleLength` (`getInitialDays`/`reshapeDays`). El cambio de estructura o de largo de ciclo dispara `reshapeDays`, que reconstruye el esqueleto **preservando** titulo, bloques y `is_rest` por `id` de dia coincidente y **reanexa al ultimo dia** los bloques de dias que dejan de existir (nunca se pierde trabajo). Esto se aplica a ambas variantes A y B vía `dispatchWithHistory({ type: 'SET_DAYS' })`.

Cada dia es un `DayState` (`types.ts`): `id`, `name`, `title`, `blocks[]`, `is_rest?`, `week_variant?`. En **modo A/B** existen dos builders independientes (`builderA`, `builderB`) con su propio estado y su propio historial; el toggle "A/B" alterna `isABMode` y los chips "Semana A / Semana B" alternan `activeVariant`. Al guardar, los dias de A y B se etiquetan con `week_variant` 'A' o 'B'. El sistema alterna A→B cada semana automaticamente en ejecucion (texto informativo en la barra).

### DayColumn — acciones por dia

`DayColumn` (memoizado con `React.memo`) muestra el encabezado del dia y la lista de bloques. Acciones que ofrece:

- **Renombrar dia (titulo).** Input de texto (`onUpdateTitle` → `UPDATE_DAY_TITLE`), max 100 chars, ej. "EMPUJE". El `name` del dia (Lunes / Dia 1) NO es editable; lo es solo el `title` libre. En modo ciclo el label se muestra como `Día {id}`.
- **Marcar/desmarcar descanso.** Boton luna/sol (`onToggleRest` → `TOGGLE_REST_DAY`, invierte `is_rest`). Un dia de descanso oculta su contenido y muestra un estado vacio "DIA DE DESCANSO" con boton "Añadir ejercicios" que vuelve a marcarlo activo. Los dias de descanso no se persisten como plan (al guardar solo se mapean dias con `blocks.length > 0`).
- **Copiar dia a otros dias.** Popover "Copiar a otro día" (icono copiar, solo si el dia no es descanso y tiene bloques). Lista checkboxes con todos los demas dias; al confirmar "Copiar Bloques" llama `onCopyDay(sourceId, targetIds[])` → `COPY_DAY`. La accion **clona** los bloques del dia origen (nuevo `uid` `clone-...` y `dayId` del destino) y los **anexa** a los bloques existentes de cada destino (no los reemplaza). Toast "Día copiado a N día(s)".
- **Busqueda rapida dentro del dia (solo desktop).** Input "BUSCAR EJERCICIO..." que filtra el catalogo con `filterExercises(exercises, search, 'Todos')` y muestra hasta 5 resultados; al hacer click agrega el ejercicio a ese dia (`onAddExercise`).
- **Contadores del dia.** Badge "N UNITS" (cantidad de bloques), chips "Ej." (numero de ejercicios) y "Series" (suma de `sets` de todos los bloques), y puntos de color por grupo muscular unico presente (`getMuscleColor`).
- **Zona de agregado/soltado.** El cuerpo del dia es un `droppable` (`day-{dayId}`). Si el dia esta vacio se renderizan las zonas punteadas de cada area como destinos de drop, mas el texto guia ("Arrastra un ejercicio o usa la búsqueda" en desktop; en movil indica usar el menu inferior / lupa).

### ExerciseBlock — acciones por bloque/ejercicio

Cada `ExerciseBlock` (memoizado) es un `sortable` (`useSortable`, id = `block.uid`, data `{ type:'block', block, dayId }`). Acciones:

- **Reordenar (handle de arrastre).** El icono `GripVertical` es el asa; arrastrar reordena dentro del dia o transfiere a otro dia (ver 3.2).
- **Eliminar.** Boton "X" → `onRemove(dayId, uid)` → `REMOVE_BLOCK`.
- **Editar (abrir sheet).** Click sobre el cuerpo del bloque → `onEdit(block)` → abre `BlockEditSheet` (seccion 3.4).
- **Edicion rapida inline (quick edit).** Doble click sobre el chip "sets × reps" entra en modo edicion: stepper de series (1–20) y campo de reps; Enter / boton "OK" guarda (`onUpdate` con `{ sets, reps }`), Escape cancela. Solo disponible en bloques de fuerza con chip legacy (no en chip tipado).
- **Cambiar de area.** Popover con flecha (`ChevronDown`) "Mover a área": lista todas las areas disponibles (VMs) con su badge/color; al elegir una distinta llama `onSetArea(areaId)` → `SET_BLOCK_AREA`. Incluye enlace "Gestionar áreas" a `/coach/settings/areas`.
- **Agrupar/desagrupar superserie.** Conector entre bloques (ver 3.5). El badge "SS·{letra}" del bloque tambien permite quitarlo del grupo (`onToggleSuperset`).
- **Override de plantilla (Base/Modif.).** Solo cuando el plan esta vinculado a una plantilla (`templateLinked` = alumno con `sourceTemplateId`): boton "Base" / "Modif." (`onToggleOverride` → `TOGGLE_OVERRIDE`, invierte `is_override`). Un bloque marcado "Modif." NO se sobrescribe al sincronizar con la plantilla base.
- **Indicadores visibles (read-only).** Badge de area (shortLabel), chip de prescripcion (sets×reps legacy o resumen tipado via `typedBlockSummary`), descanso (`⏱ rest_time`), badge de superserie, badge de progresion automatica (`↑{valor}kg/r`), y badge de grupo muscular. Si falta sets/reps en fuerza muestra chip "INCOMPLETO" (clickeable para quick edit). El thumbnail sale de `exerciseThumbnailUrl(block)` (gif > imagen > thumbnail de YouTube).
- **Ayuda contextual.** Boton `CircleHelp` con popover que explica areas y superserie (texto distinto en `narrowLayout`/movil, sin mencionar arrastrar a zonas).

---

## 3.2 DraggableExerciseCatalog y drag-and-drop

### Libreria y mecanica

Todo el DnD usa **`@dnd-kit`** (`@dnd-kit/core` + `@dnd-kit/sortable`). Sensores configurados (`useSensors`): `MouseSensor` (activa tras 5px de movimiento), `TouchSensor` (delay 300ms, tolerancia 8px — evita arrastres accidentales al scrollear) y `KeyboardSensor` (con `sortableKeyboardCoordinates`). Deteccion de colision: `closestCenter`.

Hay **dos tipos de cosas arrastrables**:

1. **Ejercicio nuevo del catalogo** (`useDraggable`, id `catalog-{exerciseId}`, data `{ type:'new-exercise', exercise }`). Cada tarjeta del catalogo es draggable.
2. **Bloque existente** del lienzo (`useSortable`, data `{ type:'block', block, dayId }`).

Y **dos tipos de destinos** (`useDroppable`):

- **Dia** (`day-{dayId}`, data `{ type:'day', dayId }`) — el cuerpo de la columna.
- **Area** (`area-{dayId}-{areaId}`, data `{ type:'area', dayId, areaId }`) — la zona punteada de cada area (`AreaDropZone`).

### Que ocurre al soltar (`handleDragEnd` / `handleDragOver`)

- **Soltar un ejercicio nuevo sobre un dia o area:** crea un bloque con `createDefaultBlock(exercise)` y lo agrega (`handleAddExercise` → `ADD_BLOCK`). Si se solto sobre la zona punteada de un area, el bloque nace en esa area (dispatch extra `SET_BLOCK_AREA` sin entrada de historial, para que un solo undo revierta alta + area). Tambien registra el ejercicio en "usados recientemente" (`trackRecentExercise`, localStorage `builder_recent_exercises`, max 8).
- **Reordenar un bloque dentro del mismo dia:** `MOVE_BLOCK` (usa `arrayMove`).
- **Transferir un bloque a otro dia:** se hace en `handleDragOver` en tiempo real (`TRANSFER_BLOCK`) — saca el bloque del dia origen y lo anexa al destino con su `dayId` actualizado.
- **Soltar un bloque existente sobre la zona de un area del mismo dia:** `SET_BLOCK_AREA` (cambia el area del bloque, con entrada de historial).
- `DragOverlay` muestra una vista previa flotante: para ejercicio nuevo una tarjeta "N + nombre + musculo"; para bloque existente un `ExerciseBlock` clon (con `overlayAreaVMs`).

### Defaults del bloque nuevo (`createDefaultBlock`)

Segun el tipo efectivo del ejercicio (`effectiveExerciseType`):
- **strength:** `sets:3`, `reps:'8-12'`, `rest_time:'90s'` (default historico exacto).
- **cardio:** `sets:1`, `reps:'10min'`, `duration_sec:600`, sin descanso.
- **mobility:** `sets:3`, `reps:'30s'`, `duration_sec:30`.
- **roller:** `sets:1`, `reps:'10 pasadas'`, `reps_value:10`, `reps_unit:'passes'`.

### Busqueda, filtro y origen de los ejercicios

`DraggableExerciseCatalog` recibe la lista completa `exercises` (rows de la tabla `exercises`, que incluye **ejercicios globales y custom del coach** — el builder no distingue origen en la UI; ambos llegan en el mismo array). Controles:

- **Buscador por nombre** (input).
- **Filtro por musculo** (Select con `MUSCLE_GROUPS` + "Todos"). El filtro puede ser controlado por el padre (chips del sheet movil comparten `catalogMuscleFilter`).
- El filtrado real lo hace `filterExercises(exercises, search, selectedMuscle)`.
- **Usados recientemente:** cuando no hay busqueda ni filtro, se muestra primero la seccion "Usados Recientemente" (de localStorage), luego "Todos los Ejercicios". La lista se virtualiza con `@tanstack/react-virtual`.
- **Vista previa:** en desktop cada item tiene un boton "ojo" que abre un modal (`Dialog`) con el gif/imagen o el video de YouTube embebido (`ExerciseVideo`) — sirve para revisar la tecnica antes de agregar.
- **Agregar:** click en la tarjeta (`onSelect`) o, en el catalogo movil, boton "+" (`onTapAdd`) que agrega al dia activo y muestra toast "{ejercicio} añadido".

El catalogo se presenta como **barra lateral** (desktop siempre abierto, tablet colapsable con boton lupa) y como **sheet inferior arrastrable** en movil (estados: colapsado ~12vh "Añadir ejercicio", compacto ~40vh con buscador + chips de musculo, completo ~80vh con catalogo entero). En "Modo Simple" movil el catalogo se abre como overlay 80vh vía un FAB "+".

---

## 3.3 Areas (`area-ui.ts` y `workout-areas.ts`)

### Que son las areas

Las **areas** son las secciones logicas que organizan un dia de entrenamiento (Calentamiento, Principal, Enfriamiento, y extras como Movilidad, Core/Activacion pilar central, Potencia, Acondicionamiento, o areas custom del coach). En DB son `workout_section_templates`; el bloque las referencia por `section_template_id`. Se mantiene ademas el campo legacy `workout_blocks.section` (CHECK `warmup`/`main`/`cooldown`) como bucket de compatibilidad: `section_template_id` es la fuente preferente y `section` el fallback (patron expand-contract).

Las areas llegan al builder por props (`areas: WorkoutArea[]`, resueltas en RSC). Si no llegan areas, `buildAreaVMs` cae a un **fallback de los 3 clasicos** (`FALLBACK_CLASSIC_AREAS`: Calentamiento/Principal/Enfriamiento) con sus IDs fijos `LEGACY_SECTION_AREA_ID`, garantizando paridad con el builder legacy.

### View-models y resolucion (`buildAreaVMs`, `effectiveAreaKey`)

`buildAreaVMs(areas)` produce `BuilderAreaVM[]` ordenados por `sort_order` (luego nombre):
- Cada VM tiene `id`, `name`, `slug`, `shortLabel` (3 letras: CAL/PRI/ENF para los clasicos, o derivado del nombre sin diacriticos via `areaShortLabel`), `zoneClass`/`badgeClass` (estilo) e `isClassic`.
- Los 3 clasicos system conservan exactamente sus clases (cero regresion visual); las no clasicas reciben una paleta estable por orden de aparicion.

`effectiveAreaKey(block, knownAreaIds)` resuelve a que area pertenece un bloque: usa `section_template_id` si existe y es conocido; si el area fue borrada / es de otro contexto, cae al area system del `section` legacy del bloque (el bloque nunca queda huerfano).

### Como agrupan y reordenan el dia

`DayColumn` agrupa visualmente los bloques por area en orden `sort_order`: recorre los bloques y, cada vez que cambia la clave de area respecto al anterior, inserta el encabezado/zona de drop del area (`AreaDropZone`). Las superseries solo se permiten entre bloques **contiguos de la misma area** (ver 3.5).

La asignacion/reordenamiento de area de un bloque pasa por `SET_BLOCK_AREA` (reducer). Esta accion:
1. Calcula el `section` legacy (`legacyBucketFor`: warmup/cooldown system → su slug; cualquier otra → `main`) y setea `section_template_id = areaId`.
2. **Rompe la superserie completa** del bloque movido (todos los miembros del grupo pierden su `superset_group`).
3. **Reagrupa todo el dia por area** segun `orderedAreaIds(areas)`, colocando el bloque movido al final de su nueva area; un barrido final asegura que ningun bloque se pierda aunque su area sea desconocida.

Hay tambien una accion legacy `SET_BLOCK_SECTION` que delega en `SET_BLOCK_AREA` con el area system equivalente (mantiene `section` y `section_template_id` sincronizados).

---

## 3.4 BlockEditSheet — todo lo editable de un bloque

`BlockEditSheet` es el panel lateral (`Sheet`, lado derecho) que abre al editar un bloque. Recibe `block`, `clientId`, `cardio` y los callbacks `onChange` (edicion en vivo del bloque en draft), `onUpdate` (confirmar — "SINCRONIZAR BLOQUE") y `onClose`. El boton de confirmar se deshabilita si `blockIsValid` es falso (mostrando "DATA INCOMPLETA"); la validez depende del tipo.

### Selector de tipo de ejercicio

Grilla de 4 botones (Fuerza / Cardio / Movilidad / Foam roller, de `EXERCISE_TYPE_LABEL`). Cambia el **override por bloque** (`exercise_type_override`): si se elige el mismo tipo propio del ejercicio se limpia el override (vuelve a null). El tipo efectivo (`effectiveType`) determina que campos se muestran. Aviso "Tipo modificado solo en este bloque" cuando hay override.

### Campos por tipo

**Fuerza (strength):**
- **Series** (`ClampedIntInput` 1–20, obligatorio) y **Repeticiones** (texto libre, max 20 chars, ej. "10-12 o AMRAP" — acepta numero, rango o AMRAP; ambos obligatorios).
- **Peso Objetivo (kg)** (decimal, opcional), **RIR / RPE** (texto, max 10).
- **Tempo** (texto, ej. "3-1-X-1") y **Recuperacion** (texto, ej. "90s o 2min").
- **Ejes adicionales (opcional)** — para movimientos tipo farmer carry: **Distancia** (decimal) con toggle de unidad m/km, **Unidad de carga** (kg/lb, setea `load_type:'weight'`), y **Lado** (`SideModeSelector`: Normal / Por lado / Alternado).
- **Progresion Automatica** (toggle): permite incrementar **+Peso** (default 2.5 kg/sem, redondeo a 0.5) o **+Reps** (default 1 rep/ses). Se persiste como `progression_type` + `progression_value`.

**Cardio:**
- **Duracion (min)** y/o **Distancia** (con unidad m/km) — "duracion O distancia".
- **Pace objetivo (min/km)** (`PaceInput`, formato m:ss), **Series del bloque** (rondas).
- **Zona de FC objetivo** (`HrZoneSelector`): chips "Sin zona" + Z1..Zn (de `HR_ZONES`); si el modulo cardio esta ON y el alumno tiene perfil, muestra el rango de bpm calculado para ese alumno.
- **Intervalos** (`IntervalEditor`): repeticiones (N), trabajo por tiempo o distancia, recuperacion, calentamiento y vuelta a la calma; con el modulo cardio ON se pueden aplicar **plantillas de intervalos** (`INTERVAL_TEMPLATES`, que tambien sugieren zona FC). Boton "Quitar intervalos". Se persiste en `interval_config`.
- **Recuperacion entre series** (texto).

**Movilidad (mobility):** **Hold (seg)** (obligatorio), **Series (holds)** (1–20), **Respiraciones** (opcional, `reps_unit:'breaths'`), **Lado**, **Descanso entre holds**.

**Foam roller:** **Duracion (seg)** o **Pasadas** ("duracion O pasadas", `reps_unit:'passes'`), **Lado**.

**Transversal (todos):** los tipos no-fuerza muestran **Instrucciones para el alumno** (`instructions`, max 2000). Todos muestran **Instrucciones de Protocolo / notas** (`NotesField`, `notes`, max 1000 con contador).

### Historial del alumno (`getExerciseHistoryAction`)

Solo en modo `client-plan` (hay `clientId`) y solo para bloques de **fuerza** (peso×reps). Al abrir el sheet se llama `getExerciseHistoryAction(clientId, exercise_id)` que:
- Verifica autenticacion y que el coach pueda gestionar a ese alumno (scope).
- Busca el ultimo `logged_at` de ese alumno+ejercicio en `workout_logs` (join `workout_blocks!inner(exercise_id)`).
- Trae **todos los sets de esa ultima sesion** (mismo minuto), devolviendo `{ logged_at, weight_kg, reps_done, set_number }[]`.

Con eso el sheet arma un resumen "Ultima vez {fecha}: N × {reps promedio} reps @ {peso promedio} kg" (badge verde), o "Sin historial con este cliente". Sirve al coach para prescribir cargas en base al ultimo rendimiento real del alumno. En modo plantilla (sin alumno) no se consulta historial.

---

## 3.5 Esquemas de series, prescripcion y superseries

### Series y repeticiones

El builder no impone esquemas predefinidos de series (no hay drop-set / pyramid como tipos discretos): la prescripcion es **texto libre** en el campo Repeticiones para fuerza. Esto cubre numero fijo, **rangos** ("8-12"), y **AMRAP** (se escribe literalmente "AMRAP"). Series es un entero 1–20. El campo `reps` (NOT NULL, max 20 chars en DB) **siempre** se puebla: en fuerza con el texto del coach; en tipos no-fuerza se genera un **resumen legacy corto** via `legacyRepsSummaryFor` (ej. "8×400m", "30s/lado", "20min Z2") para que preview/print/historial sigan teniendo algo legible.

### Otros ejes de prescripcion

- **Tempo** (cadencia, ej. "3-1-X-1"), **RIR/RPE** (reps en reserva), **Recuperacion/descanso**, **Peso objetivo**.
- **Progresion automatica** por bloque (+peso kg/sem o +reps rep/ses) — incremento periodico aplicado en ejecucion.
- **Ejes tipados** (cardio/movilidad/roller/farmer carry): duracion, distancia (+unidad), pace, zona de FC, intervalos, pasadas, respiraciones, lado (per_side/alternating).

### Superseries (agrupacion)

La superserie agrupa un bloque con el **siguiente** de la lista, **solo si ambos estan en la misma area efectiva** (`TOGGLE_SUPERSET` lo valida con `effectiveAreaKey`). Comportamiento:
- El boton "Superserie" (conector entre dos bloques) crea un par o amplia un tramo contiguo; reutiliza la letra del grupo del bloque siguiente o asigna una nueva letra libre (A, B, C…).
- Cada ejercicio del grupo conserva sus propias series/reps; el grupo solo indica ejecucion encadenada.
- Desagrupar (boton `Unlink` o click en el badge "SS·{letra}") quita el bloque del grupo; si el grupo queda con un solo miembro, ese tambien se limpia.
- Cambiar el area de un miembro **rompe el grupo completo** automaticamente (ver 3.3).

### Completitud al guardar (`handleSave` / `blockIncomplete`)

Antes de persistir se valida por tipo: fuerza exige `sets ≥ 1` + `reps`; cardio exige duracion > 0, distancia > 0 o intervalos; movilidad exige sets + (duracion o reps); roller exige duracion o reps. Cualquier bloque incompleto bloquea el guardado con un toast. El guardado mapea cada dia con bloques a `{ day_of_week, title, week_variant, blocks[] }` (con `order_index` por posicion) y envia todo via `saveWorkoutProgramAction`.


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [MED] ExerciseBlock — selector de area y boton de ayuda solo aparecen con onSetArea

En 3.1 (ExerciseBlock): aclarar 'El selector de area (flecha) y el boton de ayuda CircleHelp se renderizan juntos y SOLO cuando el padre pasa onSetArea (en el clon del DragOverlay no aparecen).'

