# Plan Maestro: Sincronizar Builder → Vista del Alumno + Biblioteca de Programas

## Contexto

El builder del coach fue completamente rediseñado (Phases 2 & 3) con características ricas: secciones de ejercicio (warmup/main/cooldown), fases de programa (macrociclos), modo ciclo (1-28 días), modo A/B, grupos de superserie, tracking de progresión, y overrides. **Todo esto ya se guarda en la base de datos.** Sin embargo, la vista del alumno (`workout/[planId]`) y la biblioteca de programas del coach (`workout-programs`) no leen ni muestran estos nuevos campos. El objetivo es sincronizar completamente la experiencia.

**Zero migraciones de BD requeridas** — todos los campos ya existen en el schema.

---

## Sección A: Vista de Ejecución del Alumno

### A1 — Expandir query en `page.tsx` *(Small — desbloquea todo lo demás)*

**Archivo:** `src/app/c/[coach_slug]/workout/[planId]/page.tsx`

1. En el select de `workout_blocks` agregar: `section, superset_group, progression_type, progression_value, is_override`
2. Agregar `week_variant` al select de `workout_plans`
3. Después de obtener el plan, hacer query paralela a `workout_programs`:
   ```typescript
   const { data: program } = await supabase
     .from('workout_programs')
     .select('id, name, program_phases, program_structure_type, cycle_length, ab_mode, start_date, weeks_to_repeat')
     .eq('id', rawPlan.program_id)
     .single()
   ```
4. Pasar `program` como prop a `WorkoutExecutionClient`

### A2 — Actualizar interfaces TypeScript *(Small)*

**Archivos:** `page.tsx` y `WorkoutExecutionClient.tsx`

Agregar a `BlockType`:
```typescript
section: 'warmup' | 'main' | 'cooldown' | null
superset_group: string | null
progression_type: 'weight' | 'reps' | null
progression_value: number | null
is_override: boolean
```

Agregar `week_variant: 'A' | 'B' | null` a `PlanType`.

Agregar nueva interfaz `ProgramType` y como prop en `WorkoutExecutionClient`.

### A3 — Headers de sección entre ejercicios *(Small)*

**Archivo:** `WorkoutExecutionClient.tsx`

Cuando `section` cambia entre el bloque anterior y el actual (o es el primer bloque), renderizar un banner de sección antes del card:
- **Calentamiento**: ámbar/naranja + icono Flame
- **Principal**: color primario + icono Dumbbell  
- **Enfriamiento**: teal/sky + icono Wind

Usar `AnimatePresence` con fade-in de 600ms (igual que el intro overlay existente). No cambia la lógica de navegación.

### A4 — Supersets agrupados *(Medium — cambio más grande)*

**Archivo:** `WorkoutExecutionClient.tsx`

1. Crear helper `groupBlocksIntoUnits(blocks)` que agrupa bloques consecutivos con el mismo `superset_group` en una unidad de navegación
2. Reemplazar `currentIndex` por `currentUnitIndex` basado en unidades
3. Para unidades de superset: renderizar dos cards apiladas verticalmente con etiquetas "A1" / "A2", línea conectora izquierda, cada una con su propio `LogSetForm`
4. La barra de progreso se basa en unidades (no bloques individuales)
5. El timer usa el `rest_time` del primer bloque del superset

### A5 — Chip de progresión objetivo *(Small)*

**Archivo:** `WorkoutExecutionClient.tsx`

En el grid de detalles del ejercicio, agregar nuevo chip cuando `progression_type` y `progression_value` existan:
- Texto: `"↑ +2.5 kg próxima sesión"` o `"↑ +1 rep próxima sesión"`
- Colores: indigo (`bg-indigo-500/10 border-indigo-500/20 text-indigo-600`)

También hacer el `rir` siempre visible cuando existe (actualmente está atado a la condición de `tempo`).

### A6 — Indicador de fases del programa *(Medium)*

**Acción previa:** Mover `ProgramPhasesBar.tsx` de `src/app/coach/builder/[clientId]/components/` a `src/components/shared/ProgramPhasesBar.tsx`. Actualizar imports en `WeeklyPlanBuilder.tsx`.

**Archivo:** `WorkoutExecutionClient.tsx`

1. Agregar helper `getCurrentPhase(phases, startDate)` que calcula fase actual y semana dentro de la fase
2. Debajo de la barra de progreso existente, agregar barra de fases (4px, segmentos coloreados, sin labels)
3. Texto: `"Fase: Fuerza · Semana 3 de 6"` — solo si `program.program_phases?.length > 0`

### A7 — Contexto de ciclo y variante A/B *(Small)*

**Archivo:** `WorkoutExecutionClient.tsx`

En el header fijo, debajo del título del plan, agregar línea de subtítulo:
- Si `program_structure_type === 'cycle'`: `"Día {plan.day_of_week} de {program.cycle_length}"`
- Si `ab_mode === true`: badge `"Variante A"` o `"Variante B"` según `plan.week_variant`

### A8 — Pantalla de resumen al finalizar *(Medium)*

**Nuevo archivo:** `src/app/c/[coach_slug]/workout/[planId]/WorkoutSummaryOverlay.tsx`

Props: `{ logs, blocks, previousHistory, planTitle, onDone }`

Reemplaza el overlay actual de auto-redirect (3s timeout — anti-pattern UX).

Contenido:
- Checkmark grande + confetti (confetti ya existe, mantenerlo)
- 3 chips de stats: Sets completados / Reps totales / Volumen total kg
- PR detection: si max weight > `previousHistory` → `"Records personales: Peso muerto"`
- Botón "Volver al inicio" (manual, sin auto-redirect)

### A9 — Mejora del historial previo *(Small)*

**Archivo:** `WorkoutExecutionClient.tsx`

En el bloque de `previousHistory` ya renderizado:
- Mostrar peso máximo de la sesión anterior como dato principal
- Si `target_weight_kg` existe y el historial previo lo supera: badge `"Superaste el objetivo"`

---

## Sección B: Biblioteca de Programas del Coach

### B1 — Agregar nuevos campos a la interfaz *(Small)*

**Archivo:** `src/app/coach/workout-programs/WorkoutProgramsClient.tsx`

Extender interfaz `Program`:
```typescript
program_phases: ProgramPhase[] | null
program_structure_type: 'weekly' | 'cycle' | null
cycle_length: number | null
ab_mode: boolean | null
duration_type: 'weeks' | 'async' | 'calendar_days' | null
source_template_id: string | null
```
(El query en `page.tsx` ya usa `select('*')` así que ya llegan los datos — solo falta la interfaz)

### B2 — Barra de fases en cards de programa *(Small)*

**Archivo:** `WorkoutProgramsClient.tsx`

En el `ProgramCard`, entre `CardHeader` y `CardContent`, agregar barra de fases compacta (6px altura, segmentos coloreados sin labels) usando el componente `ProgramPhasesBar` compartido. Solo renderizar si `program.program_phases?.length > 0`.

### B3 — Badges de estructura y modo *(Small)*

**Archivo:** `WorkoutProgramsClient.tsx`

En la fila de badges existente (actualmente muestra semanas + cliente/plantilla):
- Badge `"Ciclo {N}d"` si `program_structure_type === 'cycle'`
- Badge `"A/B"` si `ab_mode === true`
- Badge `"Asíncrono"` si `duration_type === 'async'`

### B4 — Nuevos filtros *(Small)*

**Archivo:** `WorkoutProgramsClient.tsx`

Agregar dos `Select` junto a la barra de búsqueda existente:
1. Tipo de estructura: "Todos / Semanal / Ciclo"
2. Tiene fases: "Todos / Con fases / Sin fases"

Dos `useState` adicionales (`filterStructure`, `filterHasPhases`) + condiciones en el `filtered` ya existente.

### B5 — UI para sincronizar desde plantilla *(Medium)*

**Archivo:** `WorkoutProgramsClient.tsx`

Para programas asignados con `source_template_id !== null`:
1. Agregar botón "Sincronizar desde plantilla" en las acciones del card
2. Mostrar `AlertDialog` de confirmación explicando el comportamiento de overrides
3. Llamar `syncProgramFromTemplateAction` en `startTransition`
4. Toast de éxito/error con `sonner`

La acción `syncProgramFromTemplateAction` ya existe en `src/app/coach/builder/[clientId]/actions.ts`.

---

## Orden de Implementación Recomendado

| Fase | Items | Esfuerzo |
|------|-------|----------|
| **1 — Fundamento de datos** | A1, A2 | ~1h |
| **2 — Wins rápidos alumno** | A5, A7, A3, A9 | ~2h |
| **3 — Features medianas alumno** | A6, A8, A4 | ~4h |
| **4 — Biblioteca coach** | B1, B2, B3, B4, B5 | ~3h |

---

## Archivos Críticos

| Archivo | Sección |
|---------|---------|
| `src/app/c/[coach_slug]/workout/[planId]/page.tsx` | A1 |
| `src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` | A2–A9 |
| `src/app/c/[coach_slug]/workout/[planId]/WorkoutSummaryOverlay.tsx` | A8 (nuevo) |
| `src/app/coach/builder/[clientId]/components/ProgramPhasesBar.tsx` | Mover a shared |
| `src/components/shared/ProgramPhasesBar.tsx` | A6, B2 (destino) |
| `src/app/coach/workout-programs/WorkoutProgramsClient.tsx` | B1–B5 |
| `src/app/coach/workout-programs/page.tsx` | B1 (si se necesita ajustar query) |
| `src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx` | Actualizar import ProgramPhasesBar |
| `src/app/coach/builder/[clientId]/actions.ts` | B5 (ya existe la action) |

---

## Verificación

1. **Alumno - secciones**: Crear plan con ejercicios en warmup/main/cooldown en el builder → ejecutar como alumno → verificar que aparecen headers de sección entre grupos
2. **Alumno - supersets**: Crear plan con superset_group en builder → verificar cards apilados A1/A2 en ejecución
3. **Alumno - ciclo**: Asignar programa tipo ciclo → verificar "Día X de N" en header
4. **Alumno - fases**: Crear programa con fases → verificar barra de fases + label de fase actual
5. **Alumno - resumen**: Completar workout → verificar pantalla de resumen con stats y sin auto-redirect
6. **Biblioteca**: Abrir `/coach/workout-programs` → verificar badges de ciclo/AB, barra de fases en cards
7. **Sync**: Abrir programa asignado con source_template → verificar botón sync + dialog de confirmación
