# Plan de Mejoras — GymApp JP (Antigravity)

Registro de lo que falta del mega plan de rediseño del `WeeklyPlanBuilder` y funcionalidades del coach.

---

## COMPLETADO ✅

### Phase 1 — Quick Wins
- [x] GIF thumbnails en cards del día y catálogo
- [x] Color coding por grupo muscular (borde izquierdo del card)
- [x] Stats inline en cards (sets×reps + rest_time sin abrir sheet)
- [x] Sección "Recientes" en catálogo
- [x] Autosave en localStorage (borrador con restore banner)
- [x] Copiar día (con selección de días destino)
- [x] Contador de volumen por día (ejercicios, series, grupos musculares)
- [x] Duración en semanas, días exactos o sin fecha límite (`duration_type`)
- [x] Date picker de inicio prominente + botón "Sin fecha de inicio"
- [x] Notas globales del programa (`program_notes`)

### Phase 2 — UX Media
- [x] Refactor: WeeklyPlanBuilder dividido en componentes separados (`DayColumn`, `ExerciseBlock`, `BlockEditSheet`, `ProgramConfigHeader`)
- [x] `useReducer` para el estado de días/bloques (`usePlanBuilder` hook)
- [x] Quick edit inline de sets/reps (doble click en el card)
- [x] Días de descanso marcados visualmente (toggle en columna)
- [x] Historial del cliente en el sheet de edición (último peso usado)
- [x] Template library en el builder (`TemplatePickerDialog`)
- [x] Asignación masiva de plantilla a múltiples clientes (`AssignToClientsDialog`)
- [x] Preview del programa antes de asignar (`ProgramPreviewDialog`)
- [x] Mobile: swipe con animación carousel entre días
- [x] Mobile: tab bar con conteo de ejercicios por día
- [x] Mobile: bottom sheet en 3 estados (colapsado/compacto/completo)
- [x] Mobile: tap-to-add en catálogo (sin necesidad de drag)

### Phase 3 — Features Avanzados
- [x] Supersets / agrupación de ejercicios (badge SS·X, toggle superset)
- [x] Undo/redo stack (Ctrl+Z / Ctrl+Shift+Z, últimas 20 acciones)
- [x] Balance muscular en tiempo real (`MuscleBalancePanel` con radar chart dinámico)
- [x] Progresión automática por bloque (+kg/semana o +rep/sesión)
- [x] Semanas A/B alternas (dos builders independientes, DB `week_variant` + `ab_mode`)
- [x] Export/print del programa (`PrintProgramDialog`, preview + window.print())

---

## PENDIENTE ⏳

### Phase 2 — UX Media (Restante)

#### Modo ciclo personalizado (no ligado a Lun-Dom)
**Qué es**: Ciclos de N días que se repiten independientemente del día de la semana.
Ej: Push/Pull/Legs × 2 = ciclo de 6 días. El cliente los hace consecutivamente.

**Requiere**:
- DB: nuevo campo `cycle_length` en `workout_programs`
- DB: campo `program_structure_type` (`weekly` | `cycle`) en `workout_programs`
- UI: toggle en `ProgramConfigHeader` para elegir modo
- UI: en modo ciclo, las columnas se llaman "Día 1", "Día 2"... en vez de Lun/Mar...
- Generación de schedule en el dashboard del cliente debe respetar el ciclo

**Complejidad**: Alta — requiere migration DB + cambios en la vista del cliente

---

### Phase 3 — Features Avanzados (Restante)

#### 1. Fases dentro de un programa (Volumen → Fuerza → Peaking)
**Qué es**: Bloques de tiempo con nombre y duración dentro del programa.
Ej: "Semanas 1-4: Adaptación / Semanas 5-8: Hipertrofia / Semanas 9-12: Fuerza"

**Requiere**:
- DB: campo `program_phases` en `workout_programs` (JSON array: `[{name, weeks, color}]`)
- UI: sección en `ProgramConfigHeader` para añadir/editar/reordenar fases
- UI: mini-timeline visual en el header del builder mostrando las fases
- V1: solo metadata visual (no cambia ejercicios por fase)
- V2 futura: cada fase podría tener su propio set de ejercicios

**Archivos a tocar**:
- `src/app/coach/builder/[clientId]/components/ProgramConfigHeader.tsx`
- `src/app/coach/builder/[clientId]/actions.ts` (schema Zod + save)
- `src/lib/database.types.ts`
- Migration Supabase: ADD COLUMN `program_phases` JSONB a `workout_programs`

**Complejidad**: Media

---

#### 2. Secciones dentro de días (Calentamiento / Principal / Enfriamiento)
**Qué es**: Cada día puede tener subsecciones para organizar ejercicios.
Ej: 10 min calentamiento → 45 min bloque principal → 10 min enfriamiento

**Requiere**:
- DB: nuevo campo `section` (`warmup` | `main` | `cooldown`) en `workout_blocks`
- Types: `BuilderBlock.section` opcional
- UI: en `DayColumn`, agrupar bloques por sección con headers
- UI: drag & drop entre secciones (mismo día, diferente sección)
- UI: botón para cambiar la sección de un bloque

**Archivos a tocar**:
- `src/app/coach/builder/[clientId]/types.ts`
- `src/app/coach/builder/[clientId]/components/DayColumn.tsx`
- `src/app/coach/builder/[clientId]/actions.ts`
- Migration Supabase: ADD COLUMN `section` a `workout_blocks`

**Complejidad**: Alta — afecta DnD + rendering de columnas

---

#### 3. Ajustes por cliente sobre template base (Template Overrides)
**Qué es**: Al asignar un template a un cliente, el coach puede modificar ejercicios
específicos para ese cliente sin afectar el template base. Los ejercicios "sobreescritos"
no se actualizan cuando el template base cambia.

**Requiere**:
- DB: campo `is_override` en `workout_blocks` (boolean)
- DB: campo `source_template_id` en `workout_programs` (FK a otro programa)
- UI: en `ExerciseBlock`, badge azul "Modificado" para bloques con `is_override = true`
- UI: al sincronizar con template, respetar los bloques con `is_override`
- Lógica: acción de "sincronizar desde template" que solo actualiza no-override

**Archivos a tocar**:
- `src/app/coach/builder/[clientId]/types.ts`
- `src/app/coach/builder/[clientId]/components/ExerciseBlock.tsx`
- `src/app/coach/builder/[clientId]/actions.ts`
- `src/lib/database.types.ts`
- Migration Supabase: ADD COLUMNS a `workout_blocks` y `workout_programs`

**Complejidad**: Alta — requiere nueva lógica de negocio + UI de diferenciación

---

## MEJORAS TÉCNICAS PENDIENTES

### Performance
- [ ] Virtualización del catálogo con `@tanstack/react-virtual` (actualmente renderiza todos los ~800 ejercicios)
- [ ] `React.memo` en `DayColumn` y `ExerciseBlock` para evitar re-renders en cascada
- [ ] `useCallback` / `useMemo` en handlers del builder

### Seguridad / Robustez
- [ ] Error Boundary alrededor del board (un error en un día no rompa todo)
- [ ] Guardado atómico: actualmente hace DELETE + INSERT — usar RPC de Supabase para garantizar atomicidad

### Mobile adicional
- [ ] Feedback visual durante los 300ms de delay del TouchSensor (ring/glow en el card)
- [ ] Scroll suave en iOS Safari (`-webkit-overflow-scrolling: touch` donde aplica)

### Accesibilidad
- [ ] Focus trap en sheets y dialogs
- [ ] ARIA labels en drag handles y botones icono

---

## DEUDA TÉCNICA

| Item | Prioridad | Archivo |
|------|-----------|---------|
| Eliminar `any` en `activeData` del DnD | Media | `WeeklyPlanBuilder.tsx` |
| Tipar correctamente el payload de `DragOverEvent` | Baja | `WeeklyPlanBuilder.tsx` |
| `getInitialDays` se llama 3 veces en render inicial (A, B, default) | Baja | `WeeklyPlanBuilder.tsx` |
| `MUSCLE_GROUPS` en `constants.ts` no coincide con grupos reales del DB | Alta | `src/lib/constants.ts` |

---

_Última actualización: 2026-04-07_
