# CALLSITES — mapa exacto del union duro 'warmup'|'main'|'cooldown' (scout 2026-06-10)

> Insumo de F1-F5. Generado por exploración exhaustiva; verificar líneas si el archivo cambió.

## Tipo base
- `app/coach/builder/[clientId]/types.ts` L1, L21 — `BuilderSection` union + `BuilderBlock.section`.

## Normalización (3 helpers idénticos duplicados)
- `hooks/usePlanBuilder.ts` L31-33 `normalizedSection()`
- `components/DayColumn.tsx` L19-21 `normSection()`
- `components/ExerciseBlock.tsx` L12-14 `blockSection()`

## Reducer
- `usePlanBuilder.ts` L117-141 `SET_BLOCK_SECTION`: 3 filtros fijos + reconstrucción `[...warmup, ...main, ...cool]`.
- `usePlanBuilder.ts` L176 `TOGGLE_SUPERSET`: exige misma sección.

## UI builder
- `DayColumn.tsx` L23-56 `SectionDropZone` (colores hardcoded por sección); L324-341 headers (ternario CAL/PRI/ENF); L429-445 empty state con 3 zonas fijas.
- `ExerciseBlock.tsx` L16-26 `SECTION_SHORT/FULL` Records; L28-36 `sectionBadgeClass`; L271 botones `(['warmup','main','cooldown'] as const).map`; L281-294 titles.

## Carga/guardado (mapeos DB↔Builder)
- `WeeklyPlanBuilder.tsx` L96-124 `mapDbBlockToBuilderBlock` (ternario); L142-159 `createDefaultBlock` (section:'main'); ~L884 save (ternario + cast).
- `components/TemplatePickerDialog.tsx` L102 (ternario al cargar plantilla).

## Núcleo compartido (ejecución + previews)
- `lib/workout-block-grouping.ts` L6 `WorkoutSectionKey`; L9 `WORKOUT_SECTION_ORDER`; L11-15 `effectiveWorkoutSection`. **Baseline F0: `workout-block-grouping.test.ts` (9 asserts) — NO romper.**
- `app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` L48 tipo; L132-144 `WORKOUT_SECTION_TITLE/SUBTITLE`; L182-190 sectioned memo; L343-345 opacidad warmup/cooldown.
- `app/coach/builder/[clientId]/components/ProgramPreviewDialog.tsx` L14-19 labels; L30-34 agrupación.
- `app/coach/workout-programs/components/ProgramPreviewPanel.tsx` L30-48 `SECTION_META`; L60-78 `librarySectionHeader`; L195-249 render.

## Flujo
DB.section → `mapDbBlockToBuilderBlock` → `BuilderBlock.section` → reducer (`normalizedSection`) → DayColumn/ExerciseBlock → save (ternario) → DB. Ejecución: DB → `effectiveWorkoutSection` → `WORKOUT_SECTION_ORDER` → Title/Subtitle.

## Estrategia del refactor (recordatorio del PLAN)
- Las 7 áreas system tienen UUIDs `0000a5ec-*` (warmup/main/cooldown + mobility/core_activation/power/conditioning) — `sectionTemplateIdFor()` en workout.service ya mapea legacy→system.
- `section_template_id` PREFERENTE, `section` legacy = bucket de compatibilidad (system→su slug, custom→'main').
- Los Records fijos se vuelven lookups por área `{id, name, slug, sort_order}` con paleta por índice; `WORKOUT_SECTION_ORDER` queda como fallback legacy (firma intacta — baseline F0 lo exige).
