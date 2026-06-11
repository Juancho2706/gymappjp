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
- [x] Server actions (`/coach/settings/areas/_actions`, patrón Módulos): crear/renombrar/ordenar/
      soft-delete vía `workout-areas.service` → `workout.repository` (cliente user-scoped, RLS `wst_*`
      techo + check `isCurrentUserTeamManager` en team; standalone propio; enterprise/org_managed fuera).
      Zod `WorkoutAreaCreate/Update/DeleteSchema`; slug sin diacríticos; sort custom desde 100.
- [x] UI mínima: `/coach/settings/areas` (lista con badges del builder, system read-only, crear/editar
      inline/eliminar con confirm). Entradas: cards en `/coach/settings` (ambos contextos) + link
      "Gestionar áreas" en el picker del builder.
- [x] Hardening del save (cierre del hallazgo del review F3): `scopedSectionTemplateIdFor` coerce
      de `section_template_id` ajenos — el payload client-controlled solo persiste áreas visibles
      por RLS para ESE usuario (1 SELECT liviano por save); lo demás cae al mapeo legacy.
- [x] Test RLS: ya cubierto por `tests/team/areas-isolation.sql` (T2–T6: system no editable, coach
      propias, team-gestor, miembro read-only, no-miembro sin acceso) — se corre en el gate E2E
      autorizado, NO por tanda (regla 2026-06-10).

## F5 — Ejecución área-driven
- [x] Helper puro `executionAreaGroupsFor()` en `lib/workout-areas.ts` (NO se tocó
      `workout-block-grouping.ts` — baseline F0 intacto): clásicos por la vía legacy exacta
      (títulos/subtítulos/opacity actuales), áreas resueltas por nombre + `sort_order`
      intercalado, ids no resueltos caen a la sección legacy. +5 tests.
- [x] Query ejecución: resuelve nombres de áreas NO clásicas vía admin client acotado a los
      ids del plan del alumno (RLS `wst_select` no deja al alumno ver áreas custom del
      coach/team; data minimization — solo nombres que SU plan referencia; soft-deleted fuera).
- [x] `WorkoutExecutionClient`: agrupa/titula por área con fallback; subtítulos para las 4
      system extra por slug; custom sin subtítulo. Plan viejo idéntico (AC3).
- [ ] Migrar consumidores de `workout-block-grouping` (preview coach `ProgramPreviewDialog`,
      library `ProgramPreviewPanel`, print): quedan con fallback legacy A PROPÓSITO (bloques en
      áreas custom se listan bajo "Principal" en el preview del coach). Follow-up menor post-gate.
- [x] Review adversarial F4+F5 (workflow, 6 confirmados/0 refutados, todos corregidos):
      1. **HIGH** `createRawAdminClient` NO bypasea RLS con sesión en cookies (supabase-js
         prefiere el JWT de la sesión sobre la service key) → el lookup de áreas corría como el
         ALUMNO y las custom nunca resolvían. Fix: `createServiceRoleClient()` (cliente puro sin
         cookies) + **filtro de tenant** (system / coach del plan / team del alumno) — un id
         cross-context jamás se resuelve. ⚠️ GOTCHA REPO-WIDE: auditar otros call sites de
         `createRawAdminClient` que asuman bypass de RLS (follow-up).
      2. **MEDIUM** assign/duplicate copiaban `section_template_id` verbatim → coerción
         `scopedSectionTemplateIdFor` en ambos (sync ya pasa por el save). El filtro de tenant
         de (1) es el backstop en el punto de salida.
      3. **MEDIUM** rename no regeneraba slug (nombre viejo bloqueado + duplicados por rename)
         → `updateWorkoutArea` regenera slug (seguro: bloques referencian por id).
      4. **LOW** slug 'area' degenerado con nombres no latinos → sufijo determinístico.
      5. **LOW** doble-submit por Enter en AreasManager → guardas isPending/min-length.
      ⚠️ Para el gate E2E: probar área CUSTOM en ejecución del alumno (las system dan falso
      verde porque `is_system=true` pasa la RLS igual).

## F6 — CONTRACT (futuro, evaluar)
- [ ] Una vez todo en `section_template_id`: evaluar dropear el CHECK/columna `section` legacy.
