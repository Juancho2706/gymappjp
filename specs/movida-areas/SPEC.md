# SPEC — Áreas custom del builder (workout_section_templates)

> Estado: pendiente de implementación (builder UI + ejecución). El **backend** (tabla
> `workout_section_templates`, `workout_blocks.section_template_id`, 7 áreas system, backfill) y el
> **pipeline de persistencia** (schema Zod `section_template_id`, `saveWorkoutProgramAction` mapea legacy→área
> system en los 4 inserts, query de ejecución trae el campo) **ya están en prod / código**. Este SPEC cubre lo
> que falta: el **builder UI dinámico** + la **agrupación/naming por área en la ejecución del alumno**.

## Problema / Por qué

Hoy el builder y la ejecución modelan la sección como un **union duro de 3 valores**
(`'warmup' | 'main' | 'cooldown'`) cableado en: `types.ts` (`BuilderSection`), `usePlanBuilder.ts`
(reducer/normalización), `DayColumn.tsx` (drop zones DnD, headers por sección), `ExerciseBlock.tsx`
(selector CAL/PRI/ENF, colores, popup de ayuda), y en la ejecución `WorkoutExecutionClient.tsx` +
`lib/workout-block-grouping.ts` (`effectiveWorkoutSection`, `WORKOUT_SECTION_ORDER`).

Movida (kines/coaches) necesita más que 3 secciones fijas: **Movilidad, Activación pilar central, Potencia,
Acondicionamiento** (ya seedeadas como áreas system) + **áreas custom** por coach/team. El coach debe poder
armar el día con esas áreas; el alumno debe verlas con su nombre.

## Alcance

- **Builder:** que las drop zones, el selector de área de un bloque, la agrupación y los labels/colores se
  generen desde la **lista de áreas disponibles** (system + propias del coach + del team), no desde el union fijo.
- **Ejecución alumno:** agrupar y titular por **área** (`section_template_id` → nombre/orden del área), con
  **fallback** a la sección legacy cuando `section_template_id` es NULL.
- **Gestión de áreas (mínima v1):** el coach/team-gestor puede crear/renombrar/ordenar áreas custom (CRUD simple).
  Las áreas system son solo-lectura. (RLS `wst_*` ya lo permite.)
- **Expand-contract:** se mantiene `workout_blocks.section` (CHECK warmup/main/cooldown) por compatibilidad; el
  área custom guarda `section_template_id` + un `section` legacy "bucket" (default `main`). El DROP del CHECK/columna
  legacy es una fase CONTRACT futura, fuera de este SPEC.

## Fuera de alcance

- Dropear `section` legacy (fase CONTRACT posterior).
- Colores 100% configurables por área (v1: paleta derivada del `sort_order`/índice).
- Reordenar áreas con DnD (v1: por `sort_order` editable con flechas/número).

## User stories

1. Como coach del pool, quiero **agregar un área "Movilidad"** a un día y arrastrar ejercicios ahí, para
   estructurar el entreno como en mi metodología.
2. Como coach, quiero **crear un área custom** ("Core", "HYROX") visible para mí o mi team, reutilizable entre días.
3. Como alumno, quiero ver los ejercicios **agrupados por el área con su nombre real** (no solo CAL/PRI/ENF).
4. Como coach standalone (sin team) o miembro del pool, las áreas **system** siempre están disponibles; las
   **custom** según propiedad (coach) o pertenencia (team).

## Criterios de aceptación (AC)

- **AC1** El builder muestra una drop zone + header por cada área disponible usada en el día (orden = `sort_order`),
  más un selector para mover un bloque entre áreas (lista dinámica, no 3 botones fijos).
- **AC2** Guardar un bloque persiste `section_template_id` (área elegida) + `section` legacy bucket; recargar el
  builder restaura el área (round-trip) — verificado byte-identical para los 3 system clásicos (cero regresión).
- **AC3** La ejecución del alumno agrupa/titula por área (`section_template_id` → nombre), con fallback a `section`
  legacy si es NULL. Un plan viejo (solo `section`) se ve idéntico a hoy.
- **AC4** Áreas system = solo-lectura; custom CRUD respeta RLS (`wst_*`): coach edita las suyas, team-gestor las del
  team, miembro no-gestor read-only.
- **AC5** `pnpm typecheck` + `pnpm build` verdes; suites `tests/team/areas-isolation.sql` siguen en verde; sin
  regresión en el builder de los 3 sections clásicos (matriz QA byte-identical).

## Riesgo

**ALTO** — toca el núcleo del builder (DnD/reducer) y la ejecución del alumno (compartida con preview/library vía
`lib/workout-block-grouping.ts`). Requiere baselines byte-identical de los 3 sections clásicos antes de empezar y
slices con review por capa.
