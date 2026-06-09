# TASKS — Áreas custom del builder

Leyenda: `[x]` hecho · `[ ]` pendiente. DoD global: typecheck + build verdes, `tests/team/areas-isolation.sql`
en verde, 3 sections clásicos byte-identical (sin regresión), commit + push por fase.

## Base (ya hecha)
- [x] DB: `workout_section_templates` + 7 system + `workout_blocks.section_template_id` + backfill (migr. 20260609062017).
- [x] Schema Zod: `WorkoutBlockSchema.section_template_id` (uuid nullable opcional).
- [x] Persistencia: `sectionTemplateIdFor()` + `section_template_id` en los 4 inserts de `workout.service.ts`
      (save / duplicate / assign / merge).
- [x] Query ejecución trae `section_template_id`.

## F0 — Baselines anti-regresión
- [ ] Snapshot byte-identical del render del builder (3 sections) para un día de ejemplo.
- [ ] Snapshot de la ejecución del alumno (agrupación/headers) para un plan legacy.

## F1 — Datos en el builder
- [ ] `_data/builder.queries.ts` (o nuevo): cargar áreas disponibles (system + coach + team, `sort_order`).
- [ ] `BuilderBlock.section_template_id?: string | null`; mapear al cargar bloques (DB→BuilderBlock).
- [ ] Pasar `areas` como prop al builder (sin cambiar UI todavía).

## F2 — Reducer por área
- [ ] `usePlanBuilder`: normalización/agrupación por `section_template_id` con fallback `section`→área system.
- [ ] Acción `SET_BLOCK_AREA(uid, areaId)` (deriva `section` bucket legacy: system→slug, custom→`main`).
- [ ] Verificar 3 clásicos byte-identical.

## F3 — UI builder dinámica
- [ ] `DayColumn`: drop zones + headers desde áreas (orden `sort_order`), colores por índice/paleta.
- [ ] `ExerciseBlock`: selector de área dinámico (dropdown), labels/colores del área, popup genérico.
- [ ] Review adversarial (UI núcleo). Byte-identical 3 clásicos.

## F4 — CRUD áreas custom
- [ ] Server actions (user-scoped, RLS `wst_*`): crear/renombrar/ordenar/soft-delete; contexto team vs standalone
      (gestor edita team, standalone propio, system read-only).
- [ ] UI mínima de gestión (lista + crear/editar). 
- [ ] Test RLS: coach edita propias, team-gestor team, miembro no-gestor read-only, system no editable.

## F5 — Ejecución área-driven
- [ ] `lib/workout-block-grouping.ts`: `effectiveArea(block)` + orden dinámico; mantener firma legacy para
      preview/library (fallback) hasta migrarlos.
- [ ] Query ejecución: traer nombre del área (join `workout_section_templates`) o lookup.
- [ ] `WorkoutExecutionClient`: agrupar/titular por área con fallback. Plan viejo idéntico; plan con custom OK.
- [ ] Migrar/revisar consumidores de `workout-block-grouping` (preview coach, library).

## F6 — CONTRACT (futuro, evaluar)
- [ ] Una vez todo en `section_template_id`: evaluar dropear el CHECK/columna `section` legacy.
