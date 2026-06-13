# PLAN — Áreas custom del builder

## Estado actual (ya hecho, base sobre la que se construye)

- **DB (prod):** `workout_section_templates` (system + coach + team, RLS `wst_*`, soft-delete), 7 áreas system
  (UUIDs `0000a5ec-*`: warmup/main/cooldown + mobility/core_activation/power/conditioning),
  `workout_blocks.section_template_id` (FK nullable, índice), backfill 4004/4004. CHECK de `section` legacy INTACTO.
- **Pipeline persistencia (código):** `WorkoutBlockSchema.section_template_id` (Zod opcional uuid);
  `saveWorkoutProgramAction`/duplicate/assign/merge persisten `section_template_id` vía
  `sectionTemplateIdFor(section, existing)` (mapea legacy→área system, preserva explícito); query de ejecución
  trae `section_template_id`.

## Arquitectura del cambio

### 1. Modelo de área en el builder (reemplaza el union fijo)
- `BuilderBlock.section_template_id?: string | null` (además del `section` legacy para el bucket del CHECK).
- Cargar **áreas disponibles** en el builder (RSC `_data`): system + `coach_id = me` + `team_id IN mis_teams`,
  `deleted_at IS NULL`, orden `sort_order`. Pasar como prop al builder.
- `usePlanBuilder`: el reducer agrupa/normaliza por `section_template_id` (con fallback a `section`→área system).
  Acción `SET_BLOCK_AREA(blockUid, areaId)` reemplaza `SET_BLOCK_SECTION`. Al guardar, derivar `section` legacy
  bucket desde el área (system warmup/main/cooldown → su slug; custom → `main`).

### 2. UI builder
- `DayColumn`: drop zones + headers generados desde las áreas presentes/disponibles (orden `sort_order`),
  no los 3 `SectionDropZone` hardcodeados. Colores por índice/`sort_order` (paleta).
- `ExerciseBlock`: selector de área = dropdown/lista dinámica de áreas disponibles (reemplaza CAL/PRI/ENF).
  Labels/colores desde el área. Popup de ayuda genérico.

### 3. Gestión de áreas (CRUD mínimo)
- Página/seccion (ej. en `/coach/settings` o dentro del builder): listar áreas (system read-only + custom),
  crear/renombrar/ordenar/soft-delete custom. Server actions user-scoped (RLS `wst_*` es el techo;
  team-gestor edita las del team vía `current_user_managed_team_ids`). Contexto team vs standalone como en Módulos.

### 4. Ejecución alumno (área-driven con fallback)
- `lib/workout-block-grouping.ts`: nueva resolución `effectiveArea(block)` = `section_template_id` → {name, sort_order};
  fallback a `effectiveWorkoutSection(section)`. `WORKOUT_SECTION_ORDER` → orden dinámico por `sort_order` con
  `other` al final. **Mantener** la firma legacy para preview/library hasta migrar todos los consumidores.
- `WorkoutExecutionClient`: agrupar/titular por área resuelta; query ya trae `section_template_id` (falta traer el
  nombre del área: join `workout_section_templates(name, sort_order, slug)` o lookup por id).
- Revisar **otros consumidores** de `workout-block-grouping` (preview del coach, library) — migrar o dejar fallback.

## Fases (slices con verificación por capa)

- **F0** Baselines byte-identical de los 3 sections clásicos (builder render + ejecución alumno) — gate anti-regresión.
- **F1** Cargar áreas disponibles en builder `_data` + thread `section_template_id` en `BuilderBlock` (sin cambiar UI).
- **F2** `usePlanBuilder` agrupa por área (con fallback); acción `SET_BLOCK_AREA`. Verificar 3 clásicos byte-identical.
- **F3** `DayColumn` + `ExerciseBlock` UI dinámica desde áreas. Review. Byte-identical 3 clásicos.
- **F4** CRUD de áreas custom (server actions + UI mínima). RLS tests.
- **F5** Ejecución área-driven + naming (query nombre + grouping). Verificar plan viejo idéntico + plan con área custom.
- **F6** (CONTRACT, futuro) evaluar dropear `section` legacy una vez todo migrado.

## Disciplina

- Expand-contract: NUNCA dropear `section` en este SPEC. `section_template_id` preferente, `section` fallback/bucket.
- Cero-regresión: cada fase valida los 3 sections clásicos byte-identical (matriz QA del builder + ejecución).
- typecheck + build + `tests/team/areas-isolation.sql` verdes por fase. Review adversarial en F3/F5 (UI núcleo).
