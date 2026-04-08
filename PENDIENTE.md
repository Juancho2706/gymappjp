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
- [x] Modo ciclo personalizado (N días, `program_structure_type` + `cycle_length`, columnas "Día X")

### Phase 3 — Features Avanzados
- [x] Supersets / agrupación de ejercicios (badge SS·X, toggle superset)
- [x] Undo/redo stack (Ctrl+Z / Ctrl+Shift+Z, últimas 20 acciones)
- [x] Balance muscular en tiempo real (`MuscleBalancePanel` con radar chart dinámico)
- [x] Progresión automática por bloque (+kg/semana o +rep/sesión)
- [x] Semanas A/B alternas (dos builders independientes, DB `week_variant` + `ab_mode`)
- [x] Export/print del programa (`PrintProgramDialog`, preview + window.print())
- [x] **Fases dentro del programa** — `program_phases` (JSONB) en `workout_programs`; editor en `ProgramConfigHeader`; timeline `ProgramPhasesBar` bajo el header; V1 = solo metadata visual
- [x] **Secciones por día** — `section` (`warmup` | `main` | `cooldown`) en `workout_blocks`; agrupación y zonas droppable en `DayColumn`; botones W/P/E en `ExerciseBlock`; `SET_BLOCK_SECTION` en `usePlanBuilder`
- [x] **Template overrides** — `is_override` en bloques, `source_template_id` en programas; asignación masiva y carga de plantilla en cliente vinculan la plantilla; badges Base/Modif.; `syncProgramFromTemplateAction` + botón "Sync plantilla" (respeta overrides)

**Migración aplicada en Supabase** (2026-04-07): `supabase/migrations/20260407120000_program_phases_sections_template_overrides.sql` — columnas `program_phases`, `source_template_id`, `section`, `is_override`.

---

## PENDIENTE ⏳

### Phase 3 — Evolución (V2 / nice-to-have)
- [ ] **Fases con ejercicios propios**: que cada fase del macrociclo pueda tener un set de ejercicios distinto (hoy las fases son solo referencia visual)
- [ ] **Sync más inteligente** (opcional): alinear bloques por `exercise_id` además de por posición, si hace falta en casos reales

### Mejoras técnicas

#### Performance
- [ ] Virtualización del catálogo con `@tanstack/react-virtual` (actualmente renderiza todos los ~800 ejercicios)
- [ ] `React.memo` en `DayColumn` y `ExerciseBlock` para evitar re-renders en cascada
- [ ] `useCallback` / `useMemo` en handlers del builder

#### Seguridad / robustez
- [ ] Error Boundary alrededor del board (un error en un día no rompa todo)
- [ ] Guardado atómico: actualmente hace DELETE + INSERT — usar RPC de Supabase para garantizar atomicidad

#### Mobile adicional
- [ ] Feedback visual durante los 300ms de delay del TouchSensor (ring/glow en el card)
- [ ] Scroll suave en iOS Safari (`-webkit-overflow-scrolling: touch` donde aplica)

#### Accesibilidad
- [ ] Focus trap en sheets y dialogs
- [ ] ARIA labels en drag handles y botones icono

### Deuda técnica

| Item | Prioridad | Archivo |
|------|-----------|---------|
| Eliminar `any` en `activeData` del DnD | Media | `WeeklyPlanBuilder.tsx` |
| Tipar correctamente el payload de `DragOverEvent` | Baja | `WeeklyPlanBuilder.tsx` |
| `getInitialDays` se llama 3 veces en render inicial (A, B, default) | Baja | `WeeklyPlanBuilder.tsx` |
| `MUSCLE_GROUPS` en `constants.ts` no coincide con grupos reales del DB | Alta | `src/lib/constants.ts` |

---

### UX pendiente (del plan maestro, sin implementar aún)
- [ ] Hover tooltip con GIF a la derecha en catálogo (actualmente hay modal al hacer click)
- [ ] Hover tooltip con GIF al pasar sobre card del día (desktop)
- [ ] Favoritos del coach (toggle star, localStorage o Supabase)
- [ ] Filtro por equipo (`equipment`) en el catálogo
- [ ] Notas por día (texto libre, distinto del título del día)
- [ ] Sheet de edición en 2 pasos (Quick: sets/reps/peso ↔ Avanzado: tempo/RIR/descanso/notas)
- [ ] Sugerencias de nombre de día (Push, Pull, Piernas, Full Body…)
- [ ] Layout tablet mejorado (3-4 columnas visibles, catálogo colapsable)

---

_Última actualización: 2026-04-07 — Phase 3 completa (fases, secciones, overrides, modo ciclo). Migración SQL ejecutada en Supabase._
