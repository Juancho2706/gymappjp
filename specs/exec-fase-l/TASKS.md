# TASKS — Fase L: ejecución de entrenamiento del alumno

**Feature:** `exec-fase-l`
**Status:** COMPLETADO 2026-07-04
**Owner:** TBD
**Last updated:** 2026-07-04
**Spec:** `specs/exec-fase-l/SPEC.md`
**Plan:** `specs/exec-fase-l/PLAN.md`

> Orden = menor a mayor riesgo: **extracción → teclado → stepper → sustitución** (única con migración).
> Gate por tanda: `pnpm typecheck` + `pnpm lint` + Vitest de lo tocado. Playwright/E2E + SQL/migración contra PROD SOLO con OK explícito del CEO.

---

## FASE 1 — Extracción `SingleExerciseCard` (prerequisito duro, menor riesgo)

- [x] **T1 — Extraer `SingleExerciseCard.tsx` con paridad 1:1** (M-L)
  - Scope: mover el inline `WorkoutExecutionClient.tsx:1440-1699` (motion.div + header tipo/músculo + dots de progreso + línea de prescripción + chip de sobrecarga + "Última vez"/prefill + disclosure "Detalles" + listado de `LogSetForm` por serie) a `SingleExerciseCard.tsx` con props explícitas: `block`, `exercise`, `effType`, `suggestedWeightKg`, `eff`, `overloadLabel/Detail`, `previousHistory`, `sessionLogs`/`blockLogs`, `openDetails`+`toggleDetails`, `fillByBlock`+`setFillByBlock`, `reopenSignal`, `autoTimerEnabled`, `justCompleted`, `focus`, refs (`registerBlockRef`), handlers `onLogged`/`onResult`/`openTechnique`. La lista renderiza `<SingleExerciseCard/>`. "Mover sin cambiar": mismo JSX, mismos valores derivados.
  - Verification: typecheck + lint verdes; la lista clásica se ve y se comporta idéntica (paridad visual/comportamental verificada). `CollapsedExerciseBar`/`SupersetGroupCard` sin cambios. (AC-A1)

---

## FASE 2 — Teclado numérico custom (v1: solo fuerza)

- [x] **T2 — `useCoarsePointer.ts` + test** (S)
  - Scope: hook en `lib/client/` con `matchMedia('(pointer: coarse)')` leído post-montaje (nunca en initializer) + listener de cambios.
  - Verification: Vitest con mock de `matchMedia`; typecheck verde. (AC-B4, hidratación)

- [x] **T3 — `WorkoutKeypadProvider.tsx`** (M)
  - Scope: contexto análogo a `WorkoutTimerProvider`; una instancia por sesión, portal a `document.body`; expone `openKeypad(cfg)`/`closeKeypad()` con `cfg = { fieldRefs:{weight?,reps?}, initialField, target, allowDecimalByField }`; gestiona campo activo (`weight|reps`), lectura/escritura de `ref.value` + dispatch de `input` sintético, mirror de display, háptica (`triggerHaptic`), publica `--keypad-h`. Envolver el árbol de exec junto a `WorkoutTimerProvider` (`WorkoutExecutionClient.tsx:1204`).
  - Verification: typecheck + lint; el provider monta/desmonta sin errores; `--keypad-h` refleja la altura real.

- [x] **T4 — `NumericKeypadSheet.tsx`** (L)
  - Scope: panel presentacional fijo inferior. Header de objetivo SIEMPRE visible (reimprime `Objetivo: {sets}×{reps} · {suggestedWeightKg} kg` + `Última vez`). Display grande (mono, `tabular-nums`, `text-3xl`) con label de campo activo + switch `Kg | Reps`. Chips `-2.5 / +2.5 / +5` (solo peso). Grid 3×4 (`1..9`, `,` condicional por `allowDecimal`, `0`, `⌫`), botones ≥48px con `active:scale` + háptica. Barra de acción `Siguiente` (weight→reps) / `Listo` (único submit, `form.requestSubmit()`). Estilo: `rounded-t-sheet`, `bg-[var(--ink-950)]`, `pb-safe`, `springsSheet` + `useReducedMotion`, dark.
  - Verification: typecheck + lint; render en dark; reduced-motion desactiva animación; coma decimal condicional; a11y (`role="group"`, `aria-label` por botón). (AC-B1, B2, B5)

- [x] **T5 — Integrar keypad en `StrengthLogSetForm`** (M)
  - Scope: en `LogSetForm.tsx`, `const coarse = useCoarsePointer()`; cuando `coarse`: inputs `weight_kg`/`reps_done` con `inputMode="none"` + `onFocus={() => openKeypad({...})}` con `focus({preventScroll:true})`; fallback `readOnly` si iOS filtra (viaja en FormData). Cuando `!coarse`: input EXACTO como hoy (inputMode decimal/numeric, onKeyDown Enter-no-cierra `:547-552`/`:568-573` intactos). Props nuevas opcionales `targetSets`/`targetReps` desde el render de `WorkoutExecutionClient` (`:1649-1667`). Sincronizar prefill "= última vez" (`:296-301`) con el mirror del keypad.
  - Verification: typecheck + lint; desktop sin regresión (Enter-no-cierra + Tab); pipeline `handleSubmit`/`enqueue`/`formAction` sin tocar. (AC-B3, B4, B6)

- [x] **T6 — Ajuste de layout del keypad** (S)
  - Scope: ocultar la barra "Finalizar" (z-40) cuando el keypad está abierto; `padding-bottom` dinámico (`--keypad-h`) en el contenedor de scroll + `smoothScrollIntoViewIfNeeded` para traer la fila activa por encima del keypad. Definir z-order (keypad z-50).
  - Verification: typecheck + lint; sin dos barras apiladas; fila activa visible al abrir. (AC-B6)

- [x] **T7 — QA cross-device del keypad** (M) — *gate CEO*
  - Scope: iOS Safari real (supresión teclado + fallback readOnly), Android Chrome, desktop. Verificar objetivo visible, incrementos, coma decimal es-CL, autofill, offline write-through, RestTimer tras submit, VoiceOver/TalkBack, Tab/tecla física en desktop.
  - Verification: checklist manual; SOLO con OK del CEO. (AC-B7)

---

## FASE 3 — Modo stepper opt-in

- [x] **T8 — Helper puro `lib/workout-stepper.ts` + tests** (S-M)
  - Scope: `buildStepModel(sectioned) -> Step[]` (aplana en orden de render; cada `Step` = un grupo = bloque suelto `{kind:'single'}` o superserie contigua `{kind:'superset'}`; superserie = 1 paso). Navegación pura: `firstIncompleteStepIndex(steps, sessionLogs)`, `stepIndexOfBlock(steps, blockId)`, `isStepComplete(step, sessionLogs)` (reusa `isBlockComplete`/`groupContiguousSupersetRuns`/`executionAreaGroupsFor`). Test `workout-stepper.test.ts` (orden, superserie=1 paso, primer incompleto, salto por bloque), estilo `muscle-map.test.ts`.
  - Verification: Vitest verde; typecheck. (AC-A3)

- [x] **T9 — `StepperExecution.tsx` (pager)** (L)
  - Scope: pager que renderiza SOLO el paso actual (opcional peek atenuado). `kind==='single'`→`<SingleExerciseCard/>`; `kind==='superset'`→`<SupersetGroupCard/>` (mismo `supersetInfo`). Swipe con `drag="x"`, `dragSnapToOrigin`, `dragElastic 0.12`, `dragConstraints {left:0,right:0}`, `onDragEnd` + `PanInfo`, umbrales `SWIPE_OFFSET=60`/`SWIPE_VELOCITY=400` (copiar de `DayNavigator`). `useReducedMotion()` → crossfade. `AnimatePresence` direccional (`easings.dirSlide`). `touch-action: pan-y`. Botones prev/next SIEMPRE visibles + rail de progreso navegable (tap salta a cualquier paso, permite reabrir serie). Eyebrow de sección (`sectionTitle`, `muted` para warmup/cooldown).
  - Verification: typecheck + lint; superserie = 1 paso; prev/next + swipe + rail funcionan; scroll vertical del paso no se traba; reduced-motion → crossfade. (AC-A3, A7)

- [x] **T10 — Persistencia del toggle stepper** (S)
  - Scope: `export const STEPPER_MODE_KEY = 'omni_stepper'` en `rest-timer-preferences.ts` (junto a `OMNIAUTOTIMER_KEY`). En `WorkoutExecutionClient`: estado `stepperEnabled` (default `false`), effect de lectura post-montaje desde `localStorage` (hidratación-safe, patrón `:928-930`), `toggleStepper` que persiste (mirror de `toggleAutoTimer` `:1066-1070`).
  - Verification: typecheck; sin mismatch de hidratación; default OFF. (AC-A2)

- [x] **T11 — UI del toggle + render condicional** (S-M)
  - Scope: control segmentado "Lista / Paso a paso" en el header de la exec (opcional también en `WorkoutTimerSettingsPanel` con props `stepperEnabled`+`onToggleStepper`). `stepperEnabled ? <StepperExecution/> : <lista actual/>`; ambos consumen los MISMOS `sectioned`/`supersetInfo`/`sessionLogs`/`handleLogged`/`handleResult`/`openTechnique`/`fillByBlock`/`reopenSignal`/`expandedDone`/`justCompleted`. Header de progreso, cronómetro, `useScreenWakeLock`, barra "Finalizar" y `WorkoutTimerProvider` quedan FUERA del pager.
  - Verification: typecheck + lint; alternar modos no pierde estado ni desmonta el RestTimer. (AC-A2, A5)

- [x] **T12 — Ramificar el auto-avance** (S-M)
  - Scope: en modo stepper, `scrollToNextIncomplete` → `setCurrentStepIndex(stepIndexOfBlock(steps, nextIncomplete.id))` en vez de `scrollIntoView`. Dentro de una superserie NO avanza de paso (la guía interleaved "seguí con B1" + `nextCue` siguen operando). Auto-avance suave con delay + opción de quedarse; nunca perder una serie a medio tipear.
  - Verification: typecheck; auto-avance funciona en bloque suelto; superserie no salta de paso. (AC-A4)

- [x] **T13 — A11y + reduced-motion + hardening del stepper** (S-M)
  - Scope: `role`/`aria-roledescription`/`aria-label` "Ejercicio X de Y"; `aria-live="polite"` en cambio de paso; prev/next focusables (flechas opcional); crossfade en reduced-motion; z-index/padding (`pb-32`) para no chocar con la barra fija "Finalizar".
  - Verification: typecheck + lint; navegación por teclado; anuncio de cambio de paso. (AC-A7)

- [x] **T14 — QA offline del stepper** (S) — *gate CEO*
  - Scope: red inestable — verificar que ningún log se pierde al auto-avanzar tras submitear (write-through encola antes de la red; `handleFinish` flushea; no desmontar el paso recién submiteado hasta `onResult`).
  - Verification: checklist manual; SOLO con OK del CEO. (AC-A6)

---

## FASE 4 — Sustitución de máquina ocupada (única con migración)

- [x] **T15 — Migración aditiva `workout_logs`** (S) — *aplicar en gate CEO*
  - Scope: `supabase/migrations/<ts>_workout_logs_substitution_columns.sql` — `substituted_exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL`, `substituted_exercise_name text`, `substitution_reason text` (SIN CHECK), índice parcial `WHERE substituted_exercise_id IS NOT NULL`. Comentario documentando: `workout_logs` es GRANT de tabla → SIN GRANT extra; SIN CHECK v1; NO tocar `exercise_id`/trigger/RPCs. Aditiva, idempotente (`IF NOT EXISTS`), forward-only. Regenerar `database.types.ts`.
  - Verification: `pnpm typecheck` tras regenerar types. Migración + advisors + snapshot `_bak_workout_logs_<fecha>` SOLO con OK del CEO. (AC-C1, C7)

- [x] **T16 — `exercise-substitution.ts` (ranking puro) + tests** (M)
  - Scope: `services/workout/exercise-substitution.ts` → `rankSubstitutes(current, candidates, opts)` PURO (sin Next/Supabase). Const única fuente-de-verdad: `SUBSTITUTION_REASON = 'machine_busy'`, `EQUIPMENT_TIERS` + mapa de normalización (`Corporal|Peso libre → body weight`, lowercase/trim). Score entero determinista: si equipment actual es "machine" (`leverage|smith|sled|*machine*`) penalizar ese equipment y bonificar peso libre > cable > body weight > otras máquinas; si no es máquina, bonificar mismo equipment. Jaccard de `secondary_muscles` (casi no-op, futuro-proof). Tiebreak estable: system-scope → `name` asc. Top 5. Test `exercise-substitution.test.ts`.
  - Verification: Vitest (máquina ocupada des-prioriza su equipment, orden estable/idéntico, top-5, scope, exclusión del actual, normalización de equipment sucio); typecheck. (AC-C2)

- [x] **T17 — `_data/substitution.queries.ts`** (M)
  - Scope: `React.cache`; dado `blockId`, resuelve el ejercicio del bloque (RLS del alumno), arma candidate set same-muscle (`muscle_group` = actual, `exercise_type` = actual, `deleted_at IS NULL`, `id <> actual`, scope vía `resolveCatalogScope`), devuelve filas crudas (`EXERCISE_LIST_COLUMNS` + `equipment`). NO rankea (eso es capa pura).
  - Verification: typecheck; SELECT de columnas específicas (no `SELECT *`); no cruza a Supabase directo saltando repository/scope.

- [x] **T18 — `_actions/substitution.actions.ts`** (S-M)
  - Scope: `getExerciseSubstitutionsAction(blockId)` server action, lazy (al tocar el botón). Zod `z.object({ blockId: z.guid() })`; ownership por RLS; llama query + `rankSubstitutes`; retorna 3-5. Archivo `'use server'` solo async functions exportadas (const `SUBSTITUTION_REASON`/tipos viven fuera, en el service).
  - Verification: typecheck + lint; validación Zod server-side. (AC-C2)

- [x] **T19 — Schema Zod de los 3 campos** (S)
  - Scope: `packages/schemas/workout.ts` `WorkoutLogSetSchema` (+3 opcionales): `substituted_exercise_id z.guid().optional()`, `substituted_exercise_name z.string().max(120).optional()`, `substitution_reason z.string().optional()`. `z.guid()` (no `z.uuid()`) por el gotcha de seeds no-RFC.
  - Verification: Vitest (acepta con y sin los campos; legacy sigue válido); typecheck. (AC-C4)

- [x] **T20 — `logSetAction` persiste los 3 campos** (S)
  - Scope: `_actions/workout-log.actions.ts` — leer los 3 del FormData + agregar a `payloadValues` (INSERT `:101-107` y UPDATE `:90-94`). NO mandar `exercise_id` del sustituto (decisión firme; el trigger/RPCs quedan intactos).
  - Verification: typecheck; INSERT y UPDATE incluyen los campos; `exercise_id` no se sobreescribe. (AC-C4, C7)

- [x] **T21 — Offline queue: 3 campos opcionales** (S)
  - Scope: `lib/workout-offline-queue.ts` — `WorkoutOfflineLog` + `workoutLogToFormData` con los 3 campos opcionales; items legacy ya encolados siguen parseando (retrocompat).
  - Verification: typecheck; test/parse de item legacy sin los campos. (AC-C4, riesgo offline legacy)

- [x] **T22 — `SubstituteExerciseSheet.tsx`** (L)
  - Scope: `_components/SubstituteExerciseSheet.tsx` (`'use client'`) — bottom-sheet (reusa `components/ui/sheet.tsx`, `side="bottom"`), `max-h-[85dvh]` scroll interno, `role="dialog"` + focus-trap (Radix), `useReducedMotion`, cerrar con Esc/backdrop. Tarjetas rankeadas: nombre, badge de equipment, gif mini, botón "Usar este". Estados loading/empty/error. Target táctil ≥44px.
  - Verification: typecheck + lint; dark; viewport `dvh` (nunca `h-screen`); a11y del sheet. (AC-C2, C3)

- [x] **T23 — Wiring en `WorkoutExecutionClient`** (M)
  - Scope: estado `substitutionByBlock: Record<blockId, {id,name,gif_url,video_url,muscle_group,equipment}>`; botón disparador "Máquina ocupada / Cambiar" en la card (junto a Técnica `:1484-1493`); al confirmar override de `getExercise`/nombre/gif/modal técnica al sustituto + badge "Sustituido · máquina ocupada"; deshacer mientras no haya sets logueados; rehidratación desde logs de HOY; thread de los 3 campos a `LogSetForm`; **guard anti-PR-falso** (suprimir "Última vez" + no disparar `PRShareCardModal` en bloque sustituido). Solo permitir sustituir ANTES del primer set logueado del bloque.
  - Verification: typecheck + lint; el plan/DB del bloque no se toca; deshacer funciona; guard activo. (AC-C3, C5)

- [x] **T24 — Thread de campos en `LogSetForm`** (S)
  - Scope: cuando hay sustitución activa en el bloque, agregar `substituted_exercise_id` + `substituted_exercise_name` + `substitution_reason='machine_busy'` al `FormData` del submit.
  - Verification: typecheck; los campos viajan solo cuando hay sustitución. (AC-C4)

- [x] **T25 — Rehidratación en `workout-execution.queries.ts`** (S)
  - Scope: SELECT de logs de HOY (~`:167`) + las 3 columnas nuevas para reconstruir `substitutionByBlock` tras reload.
  - Verification: typecheck; SELECT de columnas específicas; el estado se reconstruye tras recargar. (AC-C4)

- [x] **T26 — Ficha del coach (read)** (S-M)
  - Scope: `services/client/client-detail.service.ts` `getClientWorkoutForDate` (~`:896`) — agregar `substituted_exercise_id`, `substituted_exercise_name`, `substitution_reason` al SELECT + tipo del consumidor. `TrainingTabB4Panels.tsx` — badge "Hizo X — sustituyó Y (máquina ocupada)" por serie/ejercicio (patrón del badge `note` `:713-732`). El `substituted_exercise_name` es snapshot → sin JOIN.
  - Verification: typecheck + lint; el coach ve el badge; dark. (AC-C6)

- [x] **T27 — QA/E2E del flujo de sustitución** (M) — *gate CEO*
  - Scope: swap in-place → loguear → reload (persiste) → ficha del coach muestra el badge → offline flush conserva la sustitución. Advisors sin críticos tras la migración.
  - Verification: E2E Playwright + verificación manual; SOLO con OK del CEO. (AC-C1, C4, C6)

---

## Universal Definition of Done

- [x] `pnpm typecheck` verde
- [x] `pnpm lint` sin nuevos errores
- [x] Vitest para lógica pura tocada (`workout-stepper`, `exercise-substitution`, `useCoarsePointer`, schema)
- [x] Sin llamadas Supabase directas de feature-data en `_data/` (pasa por query→service/scope)
- [x] Server actions validan con Zod (`getExerciseSubstitutionsAction`)
- [x] Mutaciones llaman `revalidatePath()` donde aplique (persistencia reusa `logSetAction` existente)
- [x] Mobile viewport usa `dvh`, no `vh`/`h-screen`
- [x] UI fija en bordes usa safe-area (`pb-safe`/`pt-safe`)
- [x] Dark mode verificado (la exec es dark siempre)
- [x] Migración C: aditiva, idempotente (`IF NOT EXISTS`), forward-only, con snapshot `_bak` previo; SIN GRANT extra (GRANT de tabla) documentado en el comentario
- [x] Docs actualizadas (`docs/architecture/FLOWS_AND_COMPONENTS.md`; `PROJECT_STRUCTURE.md` si aplica)

## Notas

- Mantener los cambios acotados; A y B son 100% presentación (cero DB), C es la única con migración.
- Preferir componentes route-local (`workout/[planId]/`); `useCoarsePointer` a `lib/client/` por reuso multi-domain.
- Preservar comportamiento existente salvo lo que el SPEC cambia explícitamente. El motor de logging/offline/progresión NO se toca.
- Gates de PROD (migración, advisors, E2E, QA cross-device/offline) SOLO con OK explícito del CEO.
