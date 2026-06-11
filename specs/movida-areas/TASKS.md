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
- [x] Baseline UNIT del núcleo compartido: `apps/web/src/lib/workout-block-grouping.test.ts` (9 asserts:
      effectiveWorkoutSection 3 clásicos + fallbacks NULL/''/desconocido + WORKOUT_SECTION_ORDER +
      contratos de groupContiguousSupersetRuns). Corre local sin Supabase.
- [x] Mapa exhaustivo de call sites del union duro: `CALLSITES.md` (scout 2026-06-10).
- [x] Baseline del reducer (`usePlanBuilder` SET_BLOCK_SECTION/TOGGLE_SUPERSET con fixtures):
      `hooks/usePlanBuilder.test.ts` — 8 asserts del comportamiento clasico escritos y verificados
      en verde CONTRA el reducer viejo antes del refactor F2 (+8 asserts de areas post-refactor).
- [ ] Snapshot E2E del render (builder + ejecución) — junto al gate E2E autorizado del plan.

## F1 — Datos en el builder (commit d71e4c7)
- [x] `_data/builder.queries.ts` + `_data/template-builder.queries.ts`: cargan áreas disponibles vía
      `workout-areas.service` → `workout.repository.findAvailableSectionTemplates` (scope por workspace
      activo: team ⇒ system+team; standalone ⇒ system+propias; enterprise ⇒ solo system v1).
- [x] `BuilderBlock.section_template_id?: string | null`; mapeado en `mapDbBlockToBuilderBlock`,
      `createDefaultBlock`, `TemplatePickerDialog` y select de `loadTemplateForBuilderAction`.
- [x] `areas` como prop al builder (ambos entry points) hasta `usePlanBuilder` (sin cambiar UI).

## F2 — Reducer por área (commit ce4a5ed)
- [x] `lib/workout-areas.ts`: helpers puros (`effectiveAreaId/Key`, `legacyBucketFor`, `orderedAreaIds`).
- [x] Acción `SET_BLOCK_AREA(uid, areaId)`: reagrupa por `sort_order` con fallback legacy y barrido
      anti-pérdida; `SET_BLOCK_SECTION` delega (sincroniza section + section_template_id);
      `TOGGLE_SUPERSET` exige misma área efectiva. Save persiste `section_template_id`.
- [x] Verificar 3 clásicos byte-identical: baseline del reducer en verde sin cambios.

## F3 — UI builder dinámica
- [x] `DayColumn`: `AreaDropZone` + headers desde áreas (`area-ui.ts`: VMs con orden `sort_order`,
      clásicos con clases EXACTAS de antes, paleta por índice para el resto). Empty state lista
      todas las áreas disponibles; drop de ejercicio nuevo sobre una zona lo crea EN esa área
      (un solo paso de undo). Superserie exige misma área efectiva.
- [x] `ExerciseBlock`: badge + selector de área dinámico (Popover "Mover a área", targets 44px
      mobile), popup de ayuda genérico (sin CAL/PRI/ENF hardcodeado).
- [x] Review adversarial (workflow 4 dimensiones + verificación por hallazgo): CRÍTICO real
      encontrado y corregido — Zod 4 `.uuid()` estricto RFC 9562 rechazaba los UUIDs seed
      `0000a5ec-*` (versión 0) → el save de TODO plan habría fallado al enviar
      `section_template_id`. Fix: `z.guid()` solo en ese campo + contrato
      `packages/schemas/workout.test.ts` (8 asserts). Byte-identical 3 clásicos: baselines verdes.

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
