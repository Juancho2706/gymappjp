# G07 — Gaps Coach: Builder (programas/planes) + Ejercicios

Dominio: builder de programas/planes (áreas dinámicas, bloques polimórficos, BlockEditSheet, plantillas, reducer compartido) + biblioteca de ejercicios (crear/editar, video, filtros).

Fecha: 2026-07-08. Solo lectura. Fuente de verdad visual+funcional = `apps/web` (rama móvil `md:hidden`). Referencias `archivo:línea` verificadas contra el código.

Archivos clave leídos:
- Web: `apps/web/src/app/coach/builder/[clientId]/hooks/usePlanBuilder.ts` (463 L), `.../types.ts`, `.../components/BlockEditSheet.tsx` (1130 L), `.../components/ExerciseBlock.tsx`, `WeeklyPlanBuilder.tsx` (1774 L), `apps/web/src/app/coach/exercises/_components/ExerciseFormModal.tsx` (340 L) + `ExerciseMediaPicker.tsx` (385 L), `apps/web/src/app/coach/exercises/page.tsx`.
- Mobile: `apps/mobile/lib/plan-builder/{types,reducer,arrayMove,skeleton}.ts`, `apps/mobile/app/coach/program-builder.tsx` (1234 L), `apps/mobile/app/coach/(tabs)/builder.tsx` (1234 L, lista), `apps/mobile/app/coach/(tabs)/ejercicios.tsx` (341 L), `apps/mobile/components/coach/{BlockEditorSheet,BuilderBlockCard,ProgramConfigSheet,ExerciseFormSheet,ExercisePreviewSheet}.tsx`, `apps/mobile/lib/exercises.ts`.

---

## Hallazgo transversal (lo más importante)

**El builder mobile es un fork de una versión ANTIGUA del builder web (pre-áreas-dinámicas, pre-polimórfico).** `apps/mobile/lib/plan-builder/reducer.ts` dice en su cabecera "Ported 1:1 from web", pero es un port de un estado del reducer web ANTERIOR a dos grandes olas de features:
1. **Áreas dinámicas** (`section_template_id` + `workout_section_templates`, acción `SET_BLOCK_AREA`, `@/lib/workout-areas`, `area-ui.ts`).
2. **Bloques polimórficos** (`exercise_type` strength/cardio/mobility/roller + campos typed: `side_mode`, `reps_value/unit`, `load_*`, `distance_*`, `duration_sec`, `target_pace_sec_per_km`, `hr_zone`, `interval_config`, `is_unilateral`, `extra_targets`).

Mobile sigue con el modelo legacy de 3 secciones fijas (`warmup`/`main`/`cooldown`) y bloques SOLO de fuerza. Esto NO es un gap visual; es un gap de MODELO DE DATOS + reducer + persistencia. Es la raíz de casi todos los gaps funcionales de este dominio y condiciona el orden de las olas.

---

## 1. Gaps visuales (pantalla por pantalla)

Nota: la referencia es la rama móvil (`md:hidden`) de la web. Las vistas desktop-only (catálogo lateral 350px, board horizontal de columnas) NO se portan.

### 1.1 Builder — `program-builder.tsx` (patrón B legacy, sin migrar)
- Toda la pantalla está en patrón B (objeto `theme` + `StyleSheet.create`, colores desde `theme.*`, sin clases NativeWind DS). Ver imports: `useTheme` de `context/ThemeContext`, cero `className` en el cuerpo. Necesita re-skin completo a patrón A (tokens `bg-surface-*`, `text-strong/-muted`, `rounded-card/-control/-sheet`, fuentes Archivo/Hanken/JetBrains).
- **Header**: existe (back, título editable, Undo/Redo, Configurar, Guardar, overflow con Plantillas/Preview/Asignar/Balance/Imprimir/Guía) — pero pintado legacy. Falta el badge "cambios sin guardar" y `EditedByBadge` (edición concurrente) con estilo DS.
- **Selector de días**: chips scrollables con `DAY_SHORT` + `Moon`/`Sun` de descanso — existe, legacy. Falta el dot de estado por día (músculos) del web (`DayColumn` header muestra dots de músculos + contador ej/series).
- **DayColumn / agrupación**: mobile agrupa por `SECTION_ORDER = ['warmup','main','cooldown']` con `SECTION_LABEL` hardcodeado (`program-builder.tsx` L41-43). El web agrupa por ÁREAS dinámicas con `AreaDropZone` (header punteado / dot+label+conteo) y colores por área (`buildAreaVMs` en `area-ui.ts`). Gap visual + de modelo.
- **ExerciseBlock/BuilderBlockCard**: `BuilderBlockCard.tsx` (191 L, legacy) muestra el bloque solo como fuerza. Falta: badge de ÁREA con color (`shortLabel`), icono por `exercise_type` (`EXERCISE_TYPE_META`, ver web `ExerciseBlock.tsx` L261-262), chip resumen typed (`typedBlockSummary` para cardio/mobility/roller), chip "Incompleto" en rojo por tipo. Borde izquierdo color músculo existe.
- **FAB catálogo + Guardar pill**: existen (patrón carrusel). Re-skin.

### 1.2 BlockEditSheet — `BlockEditorSheet.tsx` (287 L vs web 1130 L)
- Es un editor **solo-fuerza**, patrón B. Campos: series, reps, peso, RIR, tempo, descanso, progresión (solo `weekly_linear`/`double`), sección (warmup/main/cooldown), superserie, override, mover a día, historial (props `clientId` pero el grep no muestra fetch de historial real — ver §2). Selector de SECCIÓN legacy (`SECTIONS` L38-42), no de ÁREA.
- Falta TODO el selector de tipo de ejercicio (strength/cardio/mobility/roller) y sus campos typed. Ver §2.
- Re-skin visual + reconstrucción funcional (es más "reconstruir" que "re-skinear").

### 1.3 Biblioteca de ejercicios — `ejercicios.tsx` (patrón A, ya migrada visualmente)
- Buen estado: 15 usos de className, tokens DS (`bg-sport-500`, `bg-surface-sunken`, `rounded-control`). Filtros (búsqueda, grupo muscular, personalizados) y grupos colapsables existen. Cerca de paridad visual con la rama móvil web (`ExerciseCatalogClient`).
- Gap menor: web tiene toggle "Con video" (YouTube ID válido); verificar que mobile lo tenga (grep muestra filtros por query+muscle, no "con video"). Falta toggle "Con video".
- `ExercisePreviewSheet.tsx` (192 L, patrón mixto): muestra thumbnail + botón Play que abre el video por `Linking.openURL` (externo). El web reproduce YouTube INLINE con recorte start/end (`ExerciseVideo`). Gap visual+funcional (ver §2.6).
- `ExerciseFormSheet.tsx` (261 L): formulario crear/editar. Re-skin OK-ish; falta selector de tipo + recorte de video (ver §2.5).

### 1.4 Diálogos/sheets de programa
- `ProgramConfigSheet.tsx` (patrón B): SÍ tiene structure (weekly/cycle + cycleLength 1-14), durationType (weeks/async/calendar_days), fases (con nota "solo timeline visual"), y prop `variant` A/B. Paridad funcional razonable; falta re-skin a patrón A.
- `ProgramPhasesBar.tsx`, `ProgramPreviewSheet.tsx`, `TemplatePickerSheet.tsx`, `MuscleBalanceSheet.tsx`, `BuilderOnboardingTour.tsx`, `AssignClientsSheet.tsx`: existen como componentes. Patrón B mayormente → re-skin. No verificados campo a campo (fuera de tiempo); el arquitecto debe confirmar paridad de cada uno.

### 1.5 Lista de programas — `builder.tsx` (tab, 1234 L, patrón B)
- Es la "Biblioteca de programas" (`/coach/workout-programs` en web). Tiene `filterType` (all/templates/assigned), `matchesProgram` (search/status/structure/phases), asignar (con durationWeeks), duplicar. Patrón B → re-skin. Verificar paridad de "tabs-stats accionables" (Todos/Plantillas/En curso con contadores `eva-metric`) y del `ProgramPreviewPanel`/acciones (Sincronizar desde plantilla, Eliminar) que el informe web lista.

---

## 2. Gaps funcionales

### 2.1 Áreas dinámicas (`section_template_id`) — AUSENTE en mobile [raíz]
- Web: cada bloque tiene `section_template_id` (FK a `workout_section_templates`), preferente sobre `section` legacy. El reducer web tiene `SET_BLOCK_AREA` (`usePlanBuilder.ts` L190-244) que resuelve el área con `@/lib/workout-areas` (`effectiveAreaKey`, `orderedAreaIds`, `legacyBucketFor`, `classicSlugForAreaId`, `LEGACY_SECTION_AREA_ID`), reagrupa el día por área en `sort_order`, y rompe la superserie al mover. Áreas custom por workspace; hay ruta `/coach/settings/areas` para gestionarlas.
- Mobile: `types.ts` NO tiene `section_template_id`. El reducer solo tiene `SET_BLOCK_SECTION` (legacy 3 secciones). NO existe `lib/workout-areas`, NO existe `area-ui.ts`/`buildAreaVMs`, NO hay ruta de gestión de áreas (`find apps/mobile/app -iname "*area*"` → 0; grep de `workout_section_templates` en mobile → 0). `getBuilderData` web devuelve `areas: WorkoutArea[]`; mobile no las carga.
- Impacto: mobile no puede leer ni escribir la organización por áreas que la web usa. Un programa creado en web con áreas custom se degrada a 3 secciones en mobile. Drag-to-area imposible.

### 2.2 Bloques polimórficos typed — AUSENTE en mobile [raíz]
- Web `BlockEditSheet.tsx`: selector de tipo con `EXERCISE_TYPE_META`/`effectiveExerciseType` (L14, L481). Campos por tipo:
  - **cardio**: `HR_ZONES` de `@/domain/cardio/zones` (L17, L275), zona de FC (`hr_zone`), intervalos (`INTERVAL_TEMPLATES` de `@/lib/workout-interval`, `interval_config` con work/recovery por duración o distancia), duración, distancia. Gateado por `BuilderCardioContext.enabled` (`types.ts` L12-18).
  - **mobility**: series (holds), `side_mode` (per_side/alternating, L234), duración/reps por lado.
  - **roller**: duración (seg) o pasadas.
  - **strength**: `SeriesStepper` táctil (L193), reps, peso, RIR/RPE, tempo, descanso, **descanso de calentamiento** (`warmup_rest_time`), progresión, historial.
- Mobile `BlockEditorSheet.tsx`: SOLO fuerza. `types.ts` no tiene ninguno de: `exercise_type`, `exercise_type_override`, `side_mode`, `reps_value/reps_unit`, `load_type/load_value/load_unit`, `distance_value/distance_unit`, `duration_sec`, `target_pace_sec_per_km`, `hr_zone`, `instructions`, `interval_config`, `is_unilateral`, `extra_targets`, `warmup_rest_time`, `thumbnail_url`. Grep de estos tokens en el builder mobile → 0.
- Impacto: no se pueden crear ni editar bloques de cardio/movilidad/roller en mobile; y al GUARDAR un programa que los tenga, esos campos se pierden (round-trip destructivo si mobile llegara a persistir). Depende del gating del módulo `cardio` (que tampoco existe en mobile — ver G de entitlements).

### 2.3 Reducer/superseries — DIVERGENCIA de lógica (riesgo de corrupción)
El reducer mobile (`reducer.ts`) es más simple y le faltan las correcciones del web:
- **No sanitiza superseries** en `MOVE_BLOCK`/`TRANSFER_BLOCK`. Web llama `sanitizeDayBlocks`/`sanitizeSupersets` con `effectiveAreaKey` para colapsar huérfanos y re-letrar tramos partidos (`usePlanBuilder.ts` L57-60, L93-102).
- **`TRANSFER_BLOCK`**: mobile mueve el bloque conservando su `superset_group` (L72-85). Web LIMPIA `superset_group: null` al aterrizar (fix H1, L126) para no fusionar un grupo ajeno del destino con la misma letra.
- **`COPY_DAY`**: mobile clona con `superset_group` intacto (L93-108). Web re-letra los grupos copiados a letras libres del destino (L150-172) para no fusionar.
- **`TOGGLE_SUPERSET`**: mobile es la versión vieja (clear-all si ≤2, sin `intent` link/unlink, sin re-letrado de tramos, sin extend). Web tiene extend-tramo, partir-con-re-letrado, `intent` link/unlink (L254-345).
- Mobile tiene `SET_DAY_BLOCKS` (RN-only, para el reorden con draggable-flatlist) que web no tiene, y una función local `clearCrossSectionSupersets` (`program-builder.tsx` L46-59) que suple parcialmente lo que web hace en el reducer.
- Impacto: mismo gesto de coach produce agrupaciones distintas web vs mobile; riesgo de persistir superseries inconsistentes.

### 2.4 Progresión automática — modos incompletos
- Web: `progression_mode` ∈ {`weekly_linear`, `double`, `session_linear`, `adaptive`}.
- Mobile `BlockEditorSheet.tsx` L52: `PROGRESSION_MODE_OPTS` solo `weekly_linear` + `double`. Faltan `session_linear` y `adaptive`.

### 2.5 Crear/editar ejercicio — falta tipo + recorte de video
- Web `ExerciseFormModal.tsx`: campo `exercise_type` (`EXERCISE_TYPE_OPTIONS`, L69, L201-211) y recorte de video mm:ss ↔ segundos (`video_start_time`/`video_end_time`, L98-99, L137-138) vía `ExerciseMediaPicker` (`MediaValue`).
- Mobile `ExerciseFormSheet.tsx`: campos nombre, grupo, equipo, dificultad, secundarios, instrucciones, video_url/gif_url/image_url. NO tiene `exercise_type` ni recorte de video (grep → 0 en `video_start/video_end/exercise_type/trim`). Gap funcional.

### 2.6 Preview de ejercicio — video inline con recorte
- Web `ExerciseVideo` reproduce YouTube inline respetando start/end.
- Mobile `ExercisePreviewSheet.tsx`: thumbnail + `Play` que hace `Linking.openURL(video_url)` (abre app externa, L77) — no reproduce inline ni respeta recorte. Gap.

### 2.7 Gating de creación de ejercicios — EJE DIVERGENTE
- Web `exercises/page.tsx` L26-27: `canCreateExercises` por WORKSPACE — team member = true; enterprise coach (role coach en org) = false.
- Mobile `lib/exercises.ts` L152-153: `canCreateCustomExercises(tier)` por TIER — free = false, resto = true.
- Son ejes distintos: un coach free en un team puede crear en web (team manda) pero NO en mobile (tier free lo bloquea); un enterprise coach de pago puede crear en mobile pero NO en web. Divergencia real de reglas de negocio.

### 2.8 Historial del ejercicio en el editor
- Web `BlockEditSheet` llama `getExerciseHistoryAction` (strength + clientId) y muestra la última sesión.
- Mobile `BlockEditorSheet` recibe `clientId` pero grep no encontró fetch de historial (`getExerciseHistory`/`exercise_history` → 0). Probable gap (verificar el cuerpo completo del sheet; el prop existe pero puede estar sin cablear).

### 2.9 Detección de conflicto de edición concurrente
- Web `handleSave` usa `expectedUpdatedAt` (toast "Ver lo nuevo"/"Guardar igual") para el pool de coaches. Verificar si mobile lo replica (no confirmado; probable gap dado el estado legacy).

### 2.10 Delta post-21-jun (rediseño EVA DS + Fase L + resiliencia)
La auditoría `rn-web-parity-2026-06-21.md` es pre-rediseño. El delta nuevo relevante a este dominio: áreas dinámicas y bloques polimórficos ya estaban antes, pero el re-skin EVA DS del builder web (tokens, `GlowBorderCard`, steppers táctiles 44px, sheets) es nuevo y mobile no lo tiene. La lista `WorkoutProgramsClient` web fue re-skineada; mobile `builder.tsx` sigue legacy.

---

## 3. Costuras (compartir vía packages/ o API) — cita 07-shared-seams.md

- **Reducer del builder (C.6 de 07-shared-seams.md)**: web `usePlanBuilder.ts` NO está en un package; vive co-ubicado en `app/coach/builder/[clientId]/hooks/`. Mobile tiene su PROPIA copia divergente en `lib/plan-builder/reducer.ts`. El `builderReducer` puro (los `case`) es candidato a `packages/@eva/plan-builder` (o similar), separando el reducer puro del hook React. Bloqueo: el reducer web depende de `@/lib/workout-areas` y `@/lib/workout-block-grouping` (`sanitizeSupersets`) y de `@/domain/workout/types` — habría que mover esas utilidades puras también. Alto valor: elimina el drift de superseries de §2.3 de raíz. Esfuerzo real: separar `builderReducer` + `workout-areas` + `workout-block-grouping` a package, luego mobile lo importa y borra su fork.
- **Tipos `BuilderBlock`/`DayState`/áreas/polimórficos**: hoy en `app/coach/builder/[clientId]/types.ts` (web) y `domain/workout/types.ts` + `domain/cardio/types.ts` (`ExerciseType`, `SideMode`, `IntervalConfig`, `HrZoneRange`, etc.). `domain/workout` y `domain/cardio` son puros (07-shared-seams §C.7/C.8) → candidatos a `packages/`. Mobile debe consumirlos en vez de su `lib/plan-builder/types.ts` recortado.
- **Áreas VM (`area-ui.ts`, `buildAreaVMs`)**: lógica pura de colores/labels de área → extraíble; RN reusa para pintar `AreaDropZone`.
- **`workout-exercise-type` (`EXERCISE_TYPE_META`, `effectiveExerciseType`, `typedBlockSummary`, `EXERCISE_TYPE_LABEL`)** y **`workout-interval` (`INTERVAL_TEMPLATES`)** y **`domain/cardio/zones` (`HR_ZONES`)**: puros; compartir para que el chip resumen typed y el editor cardio sean idénticos.
- **Gating de módulo `cardio`**: `BuilderCardioContext` se resuelve server-side (`hasModule`). Mobile NO tiene entitlements (07-shared-seams §C.4 — `@eva/module-catalog`/`@eva/feature-prefs` sin consumir, grep `MODULE_KEYS` en mobile → 0). El builder cardio de mobile NO puede construirse sin resolver primero el gate (mirror `ModuleKey` + fetch `enabled_modules` vía PostgREST + gate server-side en las mutaciones para no abrir agujero). Este dominio DEPENDE del dominio de entitlements.
- **Ejercicios**: `lib/exercises.ts` (mobile) reimplementa filtro/gating; alinear `canCreate*` con la regla workspace de web (posible helper compartido en `@eva/tiers`/`@eva/module-catalog`).

---

## 4. Tareas propuestas (ordenadas, atómicas)

### Ola A — Re-skin visual (no toca modelo de datos; parte de lo existente legacy)
- **A1 [VISUAL] S** — Re-skin `ejercicios.tsx` a paridad fina EVA DS (ya está en patrón A; ajustes de tokens + toggle "Con video"). Sin dependencias.
- **A2 [VISUAL] M** — Re-skin `ExerciseFormSheet.tsx` y `ExercisePreviewSheet.tsx` a patrón A (tokens, tipografía). Dep: A1.
- **A3 [VISUAL] L** — Re-skin `program-builder.tsx` (header, selector de días, board/carrusel, FAB, Guardar) de patrón B a A, MANTENIENDO el modelo legacy actual (3 secciones, solo fuerza). Es transcripción de layout, no cambio funcional. Dep: ninguna (pero coordinar con B-series para no rehacer).
- **A4 [VISUAL] M** — Re-skin `BuilderBlockCard.tsx` + `BlockEditorSheet.tsx` (editor fuerza) a patrón A, con `SeriesStepper` táctil 44px. Dep: A3.
- **A5 [VISUAL] M** — Re-skin sheets de programa: `ProgramConfigSheet`, `ProgramPhasesBar`, `ProgramPreviewSheet`, `TemplatePickerSheet`, `MuscleBalanceSheet`, `AssignClientsSheet`, `BuilderOnboardingTour`. Dep: A3.
- **A6 [VISUAL] M** — Re-skin `builder.tsx` (lista de programas) a EVA DS: tabs-stats accionables, `ProgramRow`, preview panel bottom-sheet, acciones (asignar/duplicar/sync/eliminar). Verificar paridad de acciones faltantes (Sincronizar desde plantilla). Dep: ninguna.

### Ola B — Seam del reducer + paridad de estado (elimina drift, habilita lo demás)
- **B1 [SEAM] L** — Extraer `builderReducer` puro + `workout-areas` + `workout-block-grouping` (`sanitizeSupersets`) + tipos `BuilderBlock/DayState/BuilderSection` a un package `@eva/plan-builder` (mover `domain/workout` y `domain/cardio` a packages primero o co-extraer). Web pasa a importar del package (refactor no-funcional en web). Dep: ninguna; bloquea B2/C-series.
- **B2 [SEAM] M** — Mobile adopta `@eva/plan-builder`: borra `lib/plan-builder/{reducer,types}.ts`, importa el reducer y tipos compartidos. Reconciliar `SET_DAY_BLOCKS` (RN-only) y `clearCrossSectionSupersets` con la lógica del package (probablemente el package ya cubre con sanitize). Dep: B1. Cierra §2.3 y §2.4 (modos de progresión) y da `section_template_id`/polimórficos en el tipo.

### Ola C — Áreas dinámicas + polimórficos (funcional, sobre B)
- **C1 [FUNCIONAL] M** — Cargar `areas: WorkoutArea[]` en el builder mobile (extender `getBuilderData` mobile / query PostgREST a `workout_section_templates` scopeado por workspace). Dep: B2.
- **C2 [FUNCIONAL] L** — Reemplazar la agrupación por 3 secciones (`SECTION_ORDER`) por agrupación por ÁREAS (`AreaDropZone` + `buildAreaVMs`), con selector "Mover a área" y (opcional) pantalla de gestión de áreas o deep-link a web. Dep: C1.
- **C3 [FUNCIONAL] L** — Reconstruir `BlockEditorSheet` como editor polimórfico (selector strength/cardio/mobility/roller + campos typed: HR zones, intervalos, side_mode, distancia/duración, warmup_rest_time). Dep: B2 + gating cardio (dominio entitlements, externo). Persistir todos los campos en el guardado (round-trip completo).
- **C4 [FUNCIONAL] M** — Chip resumen typed en `BuilderBlockCard` (`typedBlockSummary`, icono `EXERCISE_TYPE_META`, "Incompleto" por tipo). Dep: C3.
- **C5 [FUNCIONAL] M** — Validación de guardado por TIPO (`blockIncomplete`), serialización con `effectiveAreaKey` + `sanitizeSupersets`, y detección de conflicto `expectedUpdatedAt`. Dep: C3.

### Ola D — Ejercicios funcional
- **D1 [FUNCIONAL] S** — Añadir `exercise_type` (EXERCISE_TYPE_OPTIONS) al `ExerciseFormSheet`. Dep: B1 (tipos).
- **D2 [FUNCIONAL] M** — Recorte de video (video_start_time/video_end_time, mm:ss) en `ExerciseFormSheet` (equivalente RN de `ExerciseMediaPicker`) y reproducción INLINE con recorte en `ExercisePreviewSheet` (WebView YouTube o player embed). Dep: A2.
- **D3 [FUNCIONAL] S** — Alinear el gate de creación con la regla workspace de web (`canCreateExercises` team/enterprise) en vez del gate por tier. Dep: dominio entitlements (org context ya existe en mobile). 
- **D4 [FUNCIONAL] S** — Cablear historial del ejercicio en el editor de bloque (strength + clientId). Dep: C3 o A4.

---

## 5. Riesgos

- **Round-trip destructivo (crítico)**: si se re-skinea el builder mobile (Ola A) y se deja persistir SIN los campos de área/polimórficos, guardar desde mobile un programa creado en web BORRA `section_template_id` y todos los campos typed. Mitigación: NO habilitar guardado de programas mixtos en mobile hasta cerrar Ola C, o hacer el mapper mobile preservar (passthrough) los campos desconocidos aunque no los edite.
- **Drift del reducer**: mantener el fork mobile (`lib/plan-builder/reducer.ts`) en vez de adoptar el package perpetúa las divergencias de superserie (§2.3). Cada fix web debe replicarse a mano. B1/B2 son la única cura de raíz.
- **Dependencia de entitlements**: el editor cardio (C3) NO debe construirse sin el gate server-side del módulo `cardio` (mobile hoy no tiene entitlements; grep `MODULE_KEYS` → 0). Riesgo de seguridad: coach/alumno sin módulo invocando funcionalidad vía PostgREST directo. Este dominio está bloqueado por el dominio de entitlements.
- **DnD divergente**: web usa `@dnd-kit` (drag-to-area, delay 300ms táctil); mobile usa `react-native-draggable-flatlist` con `SET_DAY_BLOCKS`. La UX de reordenar/mover-de-área no será 1:1; reconciliar sin romper la sanitización de superseries.
- **Extracción a package arrastra dependencias**: `builderReducer` importa `workout-areas`/`workout-block-grouping`/`domain/workout`/`domain/cardio`. Mover a package puede tocar muchos imports en web (53+ archivos usan schemas; menos para estos). Refactor amplio pero mecánico; typecheck web debe pasar tras B1.
- **Gate de ejercicios divergente ya en prod** (§2.7): cambiar el eje (tier→workspace) puede habilitar/deshabilitar la creación a coaches que hoy tienen el comportamiento contrario. Validar con el CEO antes de cambiar la regla.
