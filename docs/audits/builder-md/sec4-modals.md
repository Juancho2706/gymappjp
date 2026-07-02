# 4. Modales y herramientas

Esta seccion documenta todos los modales, paneles y herramientas auxiliares del builder de fuerza (`WeeklyPlanBuilder`). Todos se montan desde `WeeklyPlanBuilder.tsx` y se controlan con flags de estado local (`useState`): `showTemplatePicker`, `showPreview`, `showAssign`, `showBalance`, `showPrint`, `showConfig`, `tourOpen`. Tres de ellos (`TemplatePickerDialog`, `ProgramPreviewDialog`, `AssignToClientsDialog`) se cargan con `dynamic()` (lazy import) para no inflar el bundle inicial; `PrintProgramDialog`, `ProgramConfigHeader`, `ProgramPhasesBar` y `BuilderOnboardingTour` son import directo.

Los disparadores viven en la barra superior del builder. En desktop son botones con texto; en movil se colapsan en un menu de tres puntos (`DropdownMenu` con `data-tour-id="mobile-more-menu"`) que repite las mismas opciones. Cada boton lleva un `data-tour-id` que el tour usa como ancla de spotlight.

---

## 4.1 TemplatePickerDialog (Biblioteca de Plantillas)

### Como se abre

- Boton **Plantillas** de la barra (`data-tour-id="templates-button"`, icono `LayoutTemplate`), visible en desktop.
- En movil, opcion **Plantillas** del menu de tres puntos.
- Ambos hacen `setShowTemplatePicker(true)`.

### Que recibe

Props desde el builder:

- `open` — el flag `showTemplatePicker`.
- `onClose` — cierra el modal (`setShowTemplatePicker(false)`).
- `hasExistingData` — booleano calculado en el padre como `days.some(d => d.blocks.length > 0)`. Indica si el tablero actual ya tiene ejercicios (para advertir antes de reemplazar).
- `onApply(days, programName, meta)` — callback que aplica la plantilla cargada al estado del builder.

### Que muestra y de donde salen los datos

Al abrirse (efecto sobre `open`) llama a `getTemplatesForBuilderAction()` y carga la lista en estado `templates`. Mientras carga muestra un spinner; si no hay resultados, muestra un estado vacio ("Sin plantillas guardadas" + sugerencia "Guarda un programa sin cliente para crear una plantilla").

Backend de la lista — `getTemplatesForBuilderAction` → `workout.service.ts`:

- Autentica al usuario y resuelve `getCoachWorkoutScope` (standalone / org / team).
- Consulta `workout_programs` filtrando `coach_id = user.id`, `client_id IS NULL` (solo plantillas), `is_active = true`, ordenado por `updated_at` desc. Aplica `applyOrgScope` segun el scope activo.
- Selecciona `id, name, weeks_to_repeat, duration_type` y `workout_plans(count)` (cuenta de dias).
- Retorna por cada plantilla: `id`, `name`, `weeks_to_repeat`, `duration_type`, `plan_count`.

Cada fila de la lista muestra:

- Nombre de la plantilla.
- Etiqueta de duracion calculada por `durationLabel(t)`: si `duration_type === 'calendar_days'` muestra `weeks_to_repeat * 7 días`; si es `'async'` muestra "Ciclo asíncrono"; de lo contrario `N semana(s)`.
- Cantidad de dias: `plan_count` ("N día(s)").
- Un boton **Aplicar** (con `ChevronRight`).

### Que valida (proteccion de sobreescritura)

`handleApply(templateId)`:

- Si `hasExistingData` es `true` y aun no se confirmo para esa plantilla (`confirmId !== templateId`), NO aplica: cambia la fila a modo confirmacion mostrando un aviso "¿Reemplazar?" (icono `AlertTriangle`) con botones **Sí** / **No**. **No** limpia `confirmId`; **Sí** vuelve a llamar `handleApply` ya confirmado.
- Si el tablero esta vacio, aplica directo sin pedir confirmacion.

### Que hace al confirmar y como carga

Con la confirmacion resuelta, marca `applying = templateId` (spinner en el boton) y llama `loadTemplateForBuilderAction(templateId)`.

Backend de la carga — `loadTemplateForBuilderAction`:

- Mismas validaciones de auth y scope.
- Trae el programa completo de `workout_programs` (con `client_id IS NULL`, `coach_id = user.id`, scope aplicado): metadata del programa (`name, weeks_to_repeat, duration_type, duration_days, start_date_flexible, program_notes, program_phases`) anidando `workout_plans` (con `day_of_week, title, week_variant`) y dentro `workout_blocks` con TODAS las columnas, incluido el set polimorfico (`is_unilateral, side_mode, reps_value, reps_unit, load_type, load_value, load_unit, distance_value, distance_unit, duration_sec, target_pace_sec_per_km, hr_zone, instructions, exercise_type_override, interval_config, extra_targets`) y el join `exercises (name, muscle_group, gif_url, video_url, thumbnail_url, exercise_type)`.
- Si falla devuelve `{ error: 'Plantilla no encontrada.' }`.

En el cliente, con la plantilla cargada, el dialog reconstruye los 7 dias (`DAYS_OF_WEEK`): por cada dia busca el `workout_plan` cuya `day_of_week` coincide y cuyo `week_variant` es 'A' (solo carga la variante A; ignora la B al aplicar plantilla). Mapea sus `workout_blocks` ordenados por `order_index` a `BuilderBlock`, generando un `uid` nuevo por bloque (`tpl-<timestamp>-<random>`), resolviendo `exercise_name`/`muscle_group`/media desde el join `exercises`, y normalizando campos (`target_weight_kg` a string, `section` a 'warmup'/'cooldown'/'main', `is_override: false`).

Tambien parsea las fases con `parseTemplatePhases` (acepta array o JSON string; cada fase saneada a `name` ≤80 chars, `weeks` entre 1 y 52, `color` hex valido o `#6366F1` por defecto).

Llama `onApply(days, template.name, meta)` con `meta` = `{ weeks_to_repeat, duration_type (o 'weeks'), duration_days, program_notes, program_phases, appliedTemplateId }`, limpia estados y cierra.

### Que pasa con el contenido actual (efecto de `onApply` en el padre)

En `WeeklyPlanBuilder`, el `onApply`:

- Enriquece los dias con media de ejercicios (`enrichDaysWithExerciseMedia` usando el catalogo `exercises`) y reemplaza TODO el tablero con `dispatchWithHistory({ type: 'SET_DAYS', ... })` — operacion deshacible (undo/redo).
- Setea `programName` solo si estaba vacio (`prev || name`), no pisa un nombre ya escrito.
- Sobreescribe `weeksToRepeat`, `durationType`, `durationDays`, `programNotes`.
- Setea `programPhases` solo si la plantilla traia fases.
- Si se esta editando el plan de un alumno (`client?.id`) guarda `sourceTemplateId = appliedTemplateId` (habilita despues el boton "Sync plantilla"); en modo plantilla pone `sourceTemplateId = null`.
- Marca `hasUnsavedChanges = true` y muestra toast "Plantilla \"<nombre>\" aplicada".

> Aplicar una plantilla NO guarda nada en la base: solo carga el contenido al builder. El coach debe guardar despues.

---

## 4.2 ProgramPreviewDialog (Vista previa del programa)

### Como se abre

- Boton **Preview** de la barra (`data-tour-id="preview-button"`, icono `Eye`).
- En movil, opcion **Vista previa** del menu de tres puntos.
- Ambos hacen `setShowPreview(true)`.

### Que recibe

Es totalmente read-only; no hace llamadas al backend, renderiza desde el estado en memoria. Props:

- `open`, `onClose`.
- `programName`, `days`, `weeksToRepeat`, `durationType`, `durationDays`, `programNotes`.
- `clientName` — `client?.full_name` (solo en modo client-plan).
- `areas` — areas visibles del workspace activo (para resolver nombres de areas custom/extra).

> Importante: el preview recibe `days` (la variante visible actual del tablero), NO ambas variantes A/B. Muestra una sola variante.

### Que renderiza

Calcula en memoria: `activeDays` (dias no-descanso con bloques), `restDays`, `totalExercises`, `totalSets` (suma de `sets`) y `allMuscles` (grupos musculares unicos). Muestra:

- **Cabecera del programa:** nombre (o "Sin nombre"), etiqueta de duracion via `durationLabel()` (calendar_days → "N días corridos"; async → "N días (sin semana fija)"; weeks → "N semana(s)"), conteo de dias activos, badge de descansos si hay, y badge "Para: <cliente>" si hay `clientName`.
- **Stats rapidos:** tres tarjetas (Ejercicios, Series, Días activos).
- **Chips de grupos musculares** coloreados con `getMuscleColor`.
- **Grilla de dias:** por cada dia, si es descanso lo marca "— Descanso"; si tiene bloques muestra nombre del dia + `title` opcional + puntos de color por grupo muscular. Dentro de cada dia agrupa los bloques por seccion/area usando `buildDayPreviewSections`, que reusa `executionAreaGroupsFor` (EL MISMO helper que la ejecucion del alumno — contrato anti-regresion): un programa solo con secciones clasicas produce exactamente Calentamiento → Principal → Enfriamiento; los bloques en areas custom/extra se agrupan bajo el nombre real del area. Dentro de cada seccion, agrupa superseries contiguas con `groupContiguousSupersetRuns` y las rotula "Superserie · grupo X". Cada ejercicio muestra punto de color, nombre y badge `sets×reps` si ambos existen.
- **Notas del programa** al final si `programNotes` tiene contenido.

### Que hace al confirmar

No tiene accion de guardado ni confirmacion: solo se cierra con `onClose`. Es estrictamente una previsualizacion de como vera el alumno el dia (misma logica de agrupacion que la ejecucion real).

---

## 4.3 AssignToClientsDialog (Asignar a Clientes)

### Como se abre

- Boton **Asignar** de la barra (icono `Users`), que solo aparece en **modo plantilla** y con la plantilla ya guardada: la condicion de render es `!client && initialProgram?.id`.
- En movil, opcion **Asignar a clientes** del menu de tres puntos, con la misma condicion.
- Ambos hacen `setShowAssign(true)`.

> Este modal NO existe cuando se edita el plan de un alumno concreto (modo client-plan): asignar es exclusivo de las plantillas reutilizables.

### Que recibe

- `open`, `onClose`.
- `programId` — `initialProgram.id` (la plantilla guardada que se va a copiar).
- `programName`.

### Que muestra

Al abrir resetea selecciones (`selected`, `selectedDays`) y llama `getCoachClientsAction()` para cargar `clients`. Backend: trae los alumnos accesibles del coach segun scope. Mientras carga, spinner; si no hay alumnos, estado vacio "Sin clientes".

Controles:

- **Buscador** por nombre (filtro client-side sobre `full_name`).
- **Lista de alumnos** seleccionables (multi-seleccion con `toggleClient`): avatar o inicial, nombre, check cuando esta seleccionado.
- **Inicio flexible** (checkbox, por defecto activado): "el cliente decide". Si se desmarca, aparece un `Input type="date"` (`startDate`, default hoy).
- **Duración (semanas)** — `Input` numerico `durationWeeks` (default '4', rango sugerido 1–52).
- **Días a asignar** — botones toggle Lun..Dom (ids 1–7) en `selectedDays`; permite asignar solo ciertos dias de la plantilla.
- **Boton de accion** que muestra "Selecciona clientes" si no hay seleccion, o "Asignar a N cliente(s)".

### Que valida

- `handleAssign` no hace nada si `selected.length === 0` (el boton tambien queda deshabilitado sin seleccion o mientras `assigning`).
- La validacion real de propiedad/scope ocurre en el servidor (ver abajo).

### Que hace al confirmar y como guarda

`handleAssign` pone `assigning = true` y llama:

```
assignProgramToClientsAction(programId, selected, {
    startDate: flexibleStart ? undefined : startDate,
    durationWeeks: Math.max(1, Number(durationWeeks) || 4),
    selectedDays: selectedDays.length ? selectedDays : undefined,
    startDateFlexible: flexibleStart,
})
```

Backend — `assignProgramToClientsAction` (`workout.service.ts`):

1. Auth + `getCoachWorkoutScope`. Exige al menos un `clientId`.
2. Carga la plantilla desde `workout_programs` (con sus `workout_plans` y `workout_blocks`) filtrando `id = templateId`, `coach_id = user.id`, `client_id IS NULL`, scope aplicado. Si no existe, error "Plantilla no encontrada.".
3. Valida que los alumnos seleccionados pertenezcan al **workspace activo** (sin cruce de contextos): team → alumnos de ese pool; enterprise → propios de la org; standalone → propios sin team/org. Los que no pertenezcan se acumulan en `failedClients` con razon "El alumno no pertenece a este coach.". Si ninguno es valido, error.
4. Calcula los dias a copiar: si `selectedDays` esta presente, filtra los `workout_plans` de la plantilla por `day_of_week` ∈ seleccion. Errores especificos si la plantilla no tiene dias, o si los dias elegidos no coinciden con ningun dia de la plantilla.
5. Determina `weeksToRepeat` (clamp 1–52 del valor recibido o el de la plantilla), `start_date` (la fecha elegida o hoy) y `end_date` (= start + weeks*7 − 1). `startDateFlexible` toma el valor del modal o el de la plantilla.
6. **Por cada alumno valido:**
   - Desactiva sus programas activos previos sin borrar historial (`deactivateActiveProgramsForClient`). Asi se maneja el caso "el alumno ya tiene programa activo": se desactiva el anterior (no se sobreescribe destructivamente, queda inactivo).
   - Inserta un nuevo registro en `workout_programs` (con `client_id`, `coach_id`, `org_id`, copia de metadata de la plantilla: nombre, duracion, estructura, ciclo, notas, `ab_mode`, `program_phases`, `source_template_id = templateId`, `last_edited_by_coach_id`).
   - Duplica cada `workout_plan` filtrado y sus `workout_blocks`, coercionando areas (`scopedSectionTemplateIdFor` con `resolveAllowedAreaIds`) y preservando las columnas polimorficas (`polymorphicBlockColumns`). `is_override` se resetea a `false`.
   - Incrementa `assignedCount`, envia email transaccional "programa asignado" al alumno (si tiene email) con link a su dashboard, y revalida `/coach/clients/<id>`.
   - Cualquier error de un alumno se captura en `failedClients` y continua con el resto.
7. Revalida `/coach/workout-programs` y `/c` (layout). Si `assignedCount === 0` devuelve error; si no, `{ success, assignedCount, failedClients }`.

En el cliente, segun el resultado:

- `result.error` → toast de error.
- Exito → toast "Programa asignado a N cliente(s)"; si hubo `failedClients`, toast de advertencia adicional ("N asignación(es) fallaron. Revisa permisos o datos."). Limpia seleccion y cierra.

> Aviso de programa activo previo: el sistema NO pide confirmacion en el modal; al asignar desactiva automaticamente el plan activo anterior del alumno conservando su historial.

---

## 4.4 PrintProgramDialog (Vista previa de impresion / PDF)

### Como se abre

- Boton **Imprimir** de la barra (`data-tour-id="print-button"`, icono `Printer`).
- En movil, opcion **Imprimir / PDF** del menu de tres puntos.
- Ambos hacen `setShowPrint(true)`. (No es un `Dialog` de shadcn; es un overlay propio que retorna `null` cuando `!open`.)

### Que recibe

- `open`, `onClose`.
- `programName` (o "Programa"), `clientName` (opcional), `coachName` (opcional).
- `weeksToRepeat`.
- `days` — `builderA.days` (variante A completa).
- `daysB` — `builderB.days` solo si `isABMode`, si no `undefined`.
- `isABMode` — booleano del builder.

### Que muestra / que incluye

Renderiza un documento imprimible en blanco (siempre fondo claro, columna unica) dentro de un contenedor referenciado con `printRef`. Incluye:

- **Cabecera del documento:** titulo (programName), linea de meta construida con `metaLine` = combinacion de `Cliente: <nombre>` (si hay), `N semana(s)`, y "Semanas A/B" si `isABMode`. Badge con `coachName` si se paso.
- **Variantes A/B:** si `isABMode`, antes de los dias inserta un separador "Semana A", renderiza `days`, luego un separador "Semana B" y renderiza `daysB`. Si no esta en A/B, solo renderiza `days` sin encabezados de variante.
- **Por cada dia** (`renderDays`, incluye dias con bloques o de descanso): cabecera con nombre del dia (`DAYS_NAMES[day.id]`), `title` opcional, y resumen "N ejercicio(s) · M series" (o "Descanso"). Si es descanso muestra "Día de Descanso"; si no, lista los bloques con `renderBlock`.
- **Por cada bloque** (`renderBlock`): numero correlativo, barra de color por grupo muscular (`getMuscleColor`), nombre del ejercicio, linea de meta (`metaParts`) que arma con: `sets series × reps reps`, `target_weight_kg kg`, `Descanso: rest_time`, `RIR <rir>` (omitido si vacio o '0'), `Tempo <tempo>`. Etiquetas: `Superset <grupo>` si tiene `superset_group`, y `Progresión: +<valor> kg/sem` o `+<valor> rep/ses` segun `progression_type`. Notas del bloque en italica si existen.

### Que hace al confirmar (imprimir)

Boton **Imprimir / PDF** → `handlePrint()`:

- Abre una ventana nueva (`window.open`), escribe un HTML completo con un bloque de estilos `PRINT_STYLES` (incluye reglas `@media print` y `@page { size: A4 portrait }`) e inyecta el `innerHTML` del `printRef`.
- Tras un pequeño `setTimeout`, llama `printWindow.print()` y cierra la ventana. El "PDF" se obtiene via el dialogo de impresion del navegador (Guardar como PDF).

No guarda nada en la base; es generacion local de un documento imprimible. El boton **X** cierra el overlay (`onClose`).

---

## 4.5 BuilderOnboardingTour (Guia del builder)

### Como se abre

- **Automaticamente** la primera vez: al montar, si en `localStorage` no existe `builder_onboarding_seen_short_v1`, se dispara `openTour('short')`.
- **Manualmente** con el boton de ayuda (`data-tour-id="help-tour-button"`, icono `CircleHelp`), que llama `handleOpenFullTour` → `openTour('full')` y marca `builder_onboarding_seen_help_v1`. Cuando aun no se vio el tour corto, ese boton tiene un pulso animado.
- `openTour` guarda el estado previo de la UI (panel Config, catalogo, alto del sheet, modo simple) en refs para restaurarlo al cerrar.

Existe ademas un **hint** independiente (no es el tour): banner amarillo "Configura la base del programa" que aparece una sola vez (key `builder_config_hint_v1`) tras haber visto el tour corto; se descarta con su X o al abrir Config.

### Que recibe

- `open` (`tourOpen`), `mode` (`'short' | 'full'`).
- `steps` — `shortTourSteps` o `fullTourSteps` segun el modo.
- `onClose(completed)` — `handleCloseTour`.
- `onStepChange(step, index)` — `handleStepChange` (guarda `activeTourStepId`).
- `getFooterHint(step)` — `tourFooterHint` (ej. aclaracion movil para el paso "save-button").
- `deferAutoSkipIfTargetMissing` — `TOUR_CONFIG_INTERNAL_STEP_IDS` (pasos cuyo ancla aparece solo cuando el panel Config esta abierto; no se auto-saltan si el target aun no existe).
- `spotlightRemeasureSignal` — `\`${showConfig}-${sheetHeight}\`` para re-medir el spotlight cuando cambia el layout.

### Que hace / como funciona

- Pinta un overlay oscuro con un **spotlight** (recorte iluminado) sobre el elemento cuyo `data-tour-id` coincide con `step.id`, midiendo su `getBoundingClientRect` con padding. Se re-mide en `resize`/`scroll` y cuando cambia `spotlightRemeasureSignal`. Si el ancla no esta en el DOM usa un rect por defecto.
- Tarjeta con: contador "Guía del builder · N/total", titulo, descripcion, hint de pie opcional, y botones **Saltar** (cierra sin completar), **Atrás** (paso anterior, deshabilitado en el primero) y **Siguiente / Finalizar**.
- Auto-salto: si el ancla de un paso no existe (y no esta en `deferAutoSkipIfTargetMissing`), avanza solo tras ~80 ms (para fluidez en layouts responsive); si era el ultimo, cierra.
- El padre coordina el layout segun el paso activo (`useEffect` sobre `activeTourStepId`): si el paso es interno de Config (`TOUR_CONFIG_INTERNAL_STEP_IDS`) abre el panel Config y en movil colapsa el catalogo; en cualquier otro paso cierra Config; para `exercise-catalog-mobile` abre el catalogo y sube el sheet; para `exercise-sheet-handle` lo baja.

### Pasos del tour

**Tour corto (`shortTourSteps`):** top-config-button ("Empieza en Configurar") → program-structure-toggle ("Elige cómo se repite") → days-board ("Construye cada día") → en movil `exercise-sheet-handle` / en desktop `exercise-catalog` ("Añade ejercicios rápido") → save-button ("Guarda cuando termines").

**Tour completo (`fullTourSteps`):** parte de los pasos cortos y suma: en movil `exercise-catalog-mobile`; `ab-toggle` ("Activa semanas A/B"); en desktop los pasos de barra (templates-button, preview-button, balance-button, print-button) + pasos de Config (config-structure-section, config-duration-section, config-phases-section) + undo/redo (undo-button, redo-button); en movil el paso del menu overflow (`mobile-more-menu`) y los pasos de Config al final.

### Que hace al cerrar

`handleCloseTour(completed)`: cierra el tour, limpia `activeTourStepId`, restaura el estado de UI previo (Config, y en movil catalogo/sheet/modo simple desde los refs). Si el modo era `'short'`, marca `hasSeenShortTour = true` y persiste `builder_onboarding_seen_short_v1` en `localStorage` (no se vuelve a auto-disparar).

---

## 4.6 ProgramConfigHeader (Configurar programa)

### Como se abre

- Boton **Configurar** (engranaje, `data-tour-id="top-config-button"`, color ambar; con pulso permanente mientras esta cerrado) → `setShowConfig(!showConfig)`. No es un modal flotante: es un panel desplegable que se renderiza inline bajo la barra cuando `showConfig` es `true`. Tambien lo abre/cierra el tour para los pasos de Config.
- Se cierra con su propio boton inferior **Ocultar Configuración** (`onClose` → `setShowConfig(false)`).

### Que recibe y que controla

Recibe pares valor/setter del estado del builder. Todos editan directamente el estado en memoria (no guardan en base por si solos; se persisten al **Guardar**). Controles:

- **Nombre del programa** — `Input` (`programName`/`setProgramName`), `maxLength={100}`, contador N/100 (se pone ambar pasados 85).
- **Estructura del Programa** (`data-tour-id="program-structure-toggle"`) — toggle **Semanal** / **Ciclo N-Días** (`programStructureType`/`setProgramStructureType`). En modo ciclo aparece el control **Longitud del ciclo** (`cycleLength`/`setCycleLength`) con botones −/+ (rango 1–14 dias); aclara que el ciclo se repite continuamente y no depende de Lun–Dom.
- **Duración del Programa** (solo en modo semanal, `data-tour-id="config-duration-section"`) — `Select` `durationType`/`setDurationType` con opciones: **Por Semanas** (`weeks`), **Por Días (Sin Calendario)** (`async`), **Por Días Corridos** (`calendar_days`), cada una con su texto de ayuda (`DURATION_META`). Si es `weeks`, muestra **Cantidad de semanas** (`ClampedIntInput`, 1–52). Si es `async` o `calendar_days`, muestra **Total de días** (`OptionalClampedIntInput`, 1–365).
- **Inicio flexible** — checkbox (`startDateFlexible`/`setStartDateFlexible`): "el cliente decide cuándo arranca". Si se desmarca, aparece `Input type="date"` (`startDate`/`setStartDate`).
- **Notas y reglas del programa** — `textarea` (`programNotes`/`setProgramNotes`), `maxLength={2000}`, contador N/2000 (ambar pasados 1800).
- **Fases del programa** (`data-tour-id="config-phases-section"`) — gestor de fases (ver 4.7), con aviso de que las fases solo ordenan el timeline visual y no cambian ejercicios ni cargas.

### Que valida / como guarda

Validacion via los inputs clamp (rangos) y `maxLength`. El panel no tiene accion de guardado propia: los cambios viven en el estado del builder y se persisten cuando el coach pulsa **Guardar** (`saveWorkoutProgramAction`), que escribe estas columnas en `workout_programs` (`name`, `duration_type`, `weeks_to_repeat`, `duration_days`, `program_structure_type`, `cycle_length`, `start_date_flexible`, `start_date`, `program_notes`, `program_phases`).

---

## 4.7 ProgramPhasesBar y el editor de fases

### Que son las fases

Metadata puramente visual del macrociclo (ej. Volumen → Fuerza → etc.). El propio panel lo advierte: las fases **no** cambian ejercicios ni cargas de forma automatica; solo ordenan/colorean el timeline visual del programa. Cada fase es `{ name, weeks, color }` (`ProgramPhase`).

### Editor de fases (dentro de ProgramConfigHeader)

- **Añadir fase** — boton que agrega una fase nueva con `name = "Fase N"`, `weeks = 4` y un color rotado de la paleta `PHASE_COLORS` (6 colores). 
- Por cada fase: selector de **color** (`input type="color"`), `Input` de **nombre** (`maxLength={80}`), `ClampedIntInput` de **semanas** (1–52), botones **subir/bajar** (reordenan con swap; deshabilitados en extremos) y **eliminar** (`Trash2`, filtra la fase).
- Sin fases, muestra texto "Sin fases definidas. Usa \"Añadir fase\" para el timeline.".
- Al cargar una plantilla, las fases entrantes pasan por `parseTemplatePhases` (saneo de nombre/weeks/color).

### ProgramPhasesBar (barra de timeline)

Componente de solo lectura que se renderiza bajo la barra del builder (oculto en movil en modo simple). Recibe `phases` y `weeksToRepeat`. Si no hay fases, no renderiza nada. Dibuja una barra horizontal segmentada donde el ancho de cada segmento es proporcional a `weeks` de la fase sobre el total (`width = (phase.weeks / total) * 100%`), con su color y tooltip "<nombre>: <weeks> sem.". Debajo, una leyenda con punto de color + nombre + "(Ns)" por fase, y a la derecha "Programa: <weeksToRepeat> sem.". Es informativo; no edita ni guarda.


---

## Correcciones y adiciones (revision de completitud)

> Revision adversarial 2: refinamientos verificados contra el codigo. No cambian la arquitectura; precisan detalles para el rediseno.

### [MED] BuilderOnboardingTour — boton 'Atras' oculto en el ultimo paso

Corregir en 4.5: 'Atrás se muestra solo mientras NO es el ultimo paso (en el ultimo paso desaparece, quedando Saltar + Finalizar); ademas esta deshabilitado en el primer paso.'

