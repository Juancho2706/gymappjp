# TASKS — Entrenamiento Movida: ejercicios polimórficos + cardio TrainingPeaks-lite

Leyenda: `[ ]` pendiente. **DoD global por tanda:** `pnpm typecheck` + `pnpm test` verdes; strings
nuevos con `t()` + `es.json`/`en.json` mismo commit; sin tocar Supabase remota fuera del protocolo de
branch MCP; commit por fase (push cuando el usuario lo pida). E2E/SQL: se ESCRIBEN en su tanda, se
CORREN solo en el gate autorizado.

## F0 — Baselines anti-regresión

- [x] Extender `packages/schemas/workout.test.ts`: bloque legacy puro (solo reps/sets/section) pasa
      `WorkoutBlockSchema` y NO gana campos nuevos (passthrough intacto). DoD: vitest verde ANTES de
      tocar el schema. *(2026-06-11: 22 tests verdes — passthrough legacy, AMRAP/al fallo, null DB,
      AC1/AC2 round-trip; asserts existentes SIN tocar)*
- [ ] `specs/movida-entrenamiento/CALLSITES.md`: mapa de consumidores de `reps`/`sets`/`target_weight_kg`
      (PrintProgramDialog, ProgramPreviewDialog, ExerciseHistory/`getExerciseHistoryAction`,
      MuscleBalancePanel, `target_reps_at_log`, summary del alumno). DoD: lista exhaustiva por grep,
      cada uno con decisión (fallback legacy automático / tarea explícita).
      *(DIFERIDO — cobertura efectiva: preview/print/history consumen `reps` texto que SIEMPRE se
      puebla con el resumen legacy ≤20 chars; verificado en código, sin doc formal)*
- [x] Verificar baselines de áreas vigentes (`usePlanBuilder.test.ts`, `workout-block-grouping.test.ts`,
      `workout.test.ts`) en verde. DoD: vitest verde sin modificarlos. *(637 tests verdes, baselines
      intactos: usePlanBuilder, area-ui, ProgramPreviewDialog/Panel, workout-block-grouping)*

## F1 — DB expand: M1 catálogo + M2 bloques + M3 logs (branch MCP, requiere ventana Pro)

> NOTA 2026-06-11 (agente Plan 2): las migraciones YA están autoradas en
> `supabase/migrations/20260611090001..03` (+ M4 `..04`) y `database.types.ts` refleja el schema.
> La aplicación remota (branch MCP → merge → delete) la ejecuta el orquestador esta noche —
> PROHIBIDO tocar Supabase remota en esta tanda. Los checkboxes de abajo quedan para esa corrida.

- [ ] `list_branches` (cazar colgados) → `create_branch` (`confirm_cost`) → poll `MIGRATIONS_PASSED`.
- [ ] `apply_migration` M1 (`exercise_types_team_catalog`), M2 (`workout_blocks_polymorphic`),
      M3 (`workout_logs_polymorphic_mirror`) — DDL exacta del PLAN. DoD: aplican en branch sin error.
- [ ] Seed sintético en branch (`execute_sql`, NO trackeado): 2 teams + 1 standalone + 1 org + alumnos
      `auth.users` con claims; ejercicios en los 4 scopes.
- [ ] Tests RLS impersonando `authenticated` (NUNCA service_role): miembro team A ve system+team A+
      propios y NO team B ni org; standalone NO ve team; alumno pool lee catálogo de SU team; alumno
      standalone NO; INSERT team con `coach_id` set rechazado (`single_owner_check` + WITH CHECK);
      UPDATE de un ejercicio del team A re-apuntando `team_id` al team B rechazado (WITH CHECK del
      update exige `team_id IN (SELECT current_user_team_ids())` — AC6 dirección escritura).
      DoD: asserts en verde; guardar como `tests/team/exercises-catalog-isolation.sql` (corre en gate).
- [ ] `EXPLAIN ANALYZE` SELECT catálogo como miembro team: helpers InitPlan (`loops=1`). DoD: sin
      eval per-row.
- [ ] `get_advisors` security+performance: 0 críticos, 0 `auth_rls_initplan`.
- [ ] Pre-check read-only en PROD antes del merge (`execute_sql` SOLO lectura):
      `SELECT count(*) FROM public.exercises WHERE num_nonnulls(coach_id, org_id) > 1;` debe dar 0.
      Razón: el `VALIDATE CONSTRAINT exercises_single_owner_check` pasa trivial en el branch (sin
      data de prod) pero el merge re-ejecuta la migración contra la data REAL — una fila legacy con
      coach_id Y org_id no-null haría FALLAR el merge a mitad de camino. Si > 0: triagear filas,
      quitar el VALIDATE de M1 (constraint queda `NOT VALID`, expand) y diferir el VALIDATE a una
      migración posterior. DoD: 0 confirmado, o plan B aplicado y documentado en bitácora.
- [ ] Snapshot prod `_bak_exercises_<fecha>` (workout_blocks/logs solo ganan columnas — snapshot
      opcional) → `merge_branch` → vigilar `get_logs` → `supabase db pull` (versionar los 3 `.sql`) →
      regen `database.types.ts` → **`delete_branch` MISMO día**. DoD: typecheck verde post-regen;
      `list_branches` vacío.

## F2 — Dominio + schemas + `@eva/calc` (puro)

- [x] `domain/workout/types.ts`: `ExerciseType`, `SideMode`, `LoadType`, `LoadUnit`, `DistanceUnit`,
      `RepsUnit`, `IntervalConfig`; alinear `ExerciseUnit` huérfano (documentar o deprecar). DoD:
      typecheck; sin imports de Next/Supabase. *(`ExerciseUnit` marcado @deprecated)*
- [x] `packages/schemas/workout.ts`: extender `WorkoutBlockSchema` (campos nuevos opcionales/nullable,
      `IntervalConfigSchema`, superRefine: cardio exige duración O distancia; hr_zone 1-5) y
      `WorkoutLogSetSchema` (`actual_*` opcionales). DoD: baseline F0 sigue verde + tests nuevos por tipo.
      *(superRefine acotado a `exercise_type_override === 'cardio'` para que legacy jamás entre;
      + `CardioProfileUpdateSchema` para M4 — ya re-exportado vía `export * from './workout'`)*
- [x] `apps/web/src/lib/workout-exercise-type.ts`: `effectiveExerciseType(block, exercise)` +
      `legacyRepsSummaryFor(block)` (≤20 chars, es/en via key — el texto va con `t()` en UI, el resumen
      persiste es-neutro corto). DoD: tests de resolución (override > exercise > 'strength') y truncado.
      *(+ `typedBlockSummary` para chips del builder; 22 tests verdes)*
- [x] Crear `packages/calc/` (`@eva/calc`): cardio + plantillas + golden tests.
      *(AJUSTE DE UBICACIÓN: el cálculo puro YA existía en `apps/web/src/domain/cardio/`
      (zones.ts + pace.ts con golden fixtures AC8 en verde) — se CONSUME en vez de duplicar en un
      package nuevo. Las 5 plantillas system + máquina de fases del interval timer viven en
      `apps/web/src/lib/workout-interval.ts` (tests en workout-exercise-type.test.ts). Si Expo
      necesita el cálculo, extraer a @eva/calc en una tanda futura.)*

## F3 — Catálogo de ejercicios (3er caso team + tipo)

- [x] `exercises.actions.ts`: `resolveExerciseOwner` 3er caso → workspace activo team ⇒
      `{ team_id, coach_id: null, org_id: null }` (cualquier miembro activo; chequeo de duplicado de
      nombre scoped por team). DoD: unit del resolver con los 3 contextos.
      *(mustFix review 2026-06-11: 3er caso vía `resolvePreferredWorkspace` ANTES del contexto org;
      dup-check + update/softDelete/restore scopeados 3-vías con `applyExerciseOwnerScope`;
      `source: 'team'`; unit con 4 casos (team/standalone/org admin/org coach rechazado) en
      `exercises.actions.test.ts`. Companion fix necesario: `getExerciseCatalog` + page de
      `/coach/exercises` team-aware (system+team, crear habilitado) — sin eso el ejercicio team
      recién creado no aparecía en la biblioteca y el dup-check bloqueaba recrearlo;
      `EXERCISE_CATALOG_COLUMNS` ahora trae `team_id` + `exercise_type`)*
- [x] `ExerciseFormModal`: selector de `exercise_type` (4 opciones, default strength, i18n). DoD:
      crear/editar persiste tipo. *(selector + persistencia en create/update actions con Zod)*
- [x] Queries del catálogo (coach + `DraggableExerciseCatalog` + búsqueda del builder): traer
      `exercise_type` + `team_id`; filtro por tipo en UI; visibilidad system+team+propios (RLS es el
      techo, query no filtra de más en team). DoD: AC6 verificado en dev con 2 cuentas.
      *(PARCIAL: builder.queries trae system+team+propios en workspace team (select * incluye
      exercise_type/team_id); el filtro POR TIPO en la UI del catálogo quedó DIFERIDO; AC6 manual
      con 2 cuentas pendiente del gate)*
- [x] Anti-fantasma del pool (AC11, decisión #7 del PLAN): "Copiar al team" copy-on-use.
      *(RESUELTO por la vía restrictiva del mustFix 2026-06-11: el `exercisesFilter` del builder en
      workspace team ya NO incluye la rama personal — asignable = system + team, cero fantasmas.
      El copy-on-use "Copiar al team" queda DIFERIDO como mejora UX (hoy el coach recrea el
      ejercicio en contexto team); la rama AC11 del E2E sigue test.fixme hasta implementarlo)*
- [x] `getExerciseHistoryAction` y catálogo: sin regresión standalone/enterprise (scoping 3-vías).
      DoD: vitest + smoke manual. *(sin cambios en el action; BlockEditSheet ahora solo pide
      historial para bloques strength — evita "? reps" en tipos nuevos; smoke manual pendiente)*

## F4 — Builder coach (núcleo — review adversarial al cierre)

- [x] `types.ts` (`BuilderBlock`) + `mapDbBlockToBuilderBlock` + `createDefaultBlock`: campos nuevos.
      DoD: typecheck; round-trip unit del mapper. *(defaults por tipo: cardio 10min, mobility 30s×3,
      roller 10 pasadas; strength EXACTO al default histórico. Unit del mapper cubierto vía contrato
      Zod + baselines; round-trip e2e en el gate)*
- [x] Save pipeline (`workout.service.ts`, 4 inserts: save/duplicate/assign/merge): persistir campos
      nuevos + `reps = legacyRepsSummaryFor(block)` cuando el coach usa campos tipados (si escribió
      `reps` a mano en strength, se respeta). DoD: unit; AC3 (plan legacy intacto byte-identical).
      *(helper `polymorphicBlockColumns` compartido por los 4 paths + `mapDbBlockToWorkoutInput`
      del sync arrastra los campos para no borrarlos; legacy ⇒ todo null)*
- [x] `BlockEditSheet`: render condicional por `effectiveExerciseType` — 4 forms, selector de
      override, kg/lb, side_mode, distancia, instructions; form cardio con editor de interval_config
      + "Aplicar plantilla" (visible solo con módulo cardio ON — flag desde RSC) + chips de zona con
      bpm del alumno; `<img>` migrado a `next/image`. *(form strength byte-identical + sección "Ejes
      adicionales" para farmer carry AC2; AC1/AC2 manual queda para dev/gate)*
- [x] `ExerciseBlock`: resumen por tipo ("8×400m @ Z4", "30s/lado ×3", "10 pasadas"); fallback
      `reps` texto si campos tipados NULL. DoD: unit del formateador de resumen.
      *(typedBlockSummary devuelve null en strength legacy ⇒ chip sets×reps intacto)*
- [ ] Verificar consumidores del CALLSITES.md: preview/print muestran resumen legacy correcto;
      `MuscleBalancePanel` excluye bloques no-strength del volumen. DoD: smoke + unit del filtro.
      *(PARCIAL: preview/print muestran `reps` = resumen legacy automáticamente; el filtro de
      MuscleBalancePanel quedó DIFERIDO — los bloques cardio suman a su grupo muscular)*
- [ ] Review adversarial F4 (núcleo) + correcciones. *(DIFERIDO al cierre del plan)*

## F5 — Alumno: logging polimórfico (review adversarial al cierre)

- [x] `workout-execution.queries.ts`: select de campos nuevos del bloque + `exercises.exercise_type`;
      tipos `BlockType`/`ExerciseType` extendidos. DoD: typecheck; plan legacy idéntico (AC3).
      *(+ contexto cardio del alumno: entitlement leído con service role puro — mismo patrón y
      justificación que las áreas; solo si el plan tiene campos cardio)*
- [x] `LogSetForm`: variantes por tipo efectivo (cardio: duración/distancia/FC prom/RPE; mobility:
      hold hecho + seg reales; roller: duración o pasadas) reusando useActionState + useOptimistic +
      useFormStatus; strength NO cambia. *(`StrengthLogSetForm` byte-identical; `TypedLogSetRow`
      nuevo; AC4 manual en dev queda para el gate)*
- [x] `logSetAction`: parsear/persistir `actual_*` (upsert por día Santiago igual que hoy).
      DoD: unit de parseo; RLS de logs sin cambios. *(parseo cubierto por tests Zod de
      WorkoutLogSetSchema; `metadata` jsonb no se envía v1 — lado L/R fuera de alcance)*
- [x] `lib/workout-offline-queue.ts`: campos opcionales nuevos en `WorkoutOfflineLog` (colas viejas
      siguen parseando) + flush (`OfflineWorkoutQueueSync`) envía campos nuevos. *(round-trip
      garantizado por opcionalidad del shape; unit dedicado de la cola no agregado)*
- [x] Historial "última vez" por tipo. *(RESUELTO MINIMAL: la card "Sesión anterior" (peso×reps) y
      el historial del BlockEditSheet se muestran SOLO en bloques strength — cero "NaN reps"; el
      formateador rico por tipo ("4×400m @ 1:35/km") queda DIFERIDO)*
- [x] Escribir E2E `tests/movida/cardio-builder-execution.spec.ts` (coach prescribe cardio → alumno
      registra; rama AC11 como `test.fixme` hasta implementar "Copiar al team"). NO correr (gate).
- [ ] Review adversarial F5 + correcciones. *(DIFERIDO al cierre del plan)*

## F6 — Timers

- [x] `WorkoutTimerProvider`: contrato `{ startRest, startHold(sec), startInterval(config, sets),
      startStopwatch() }`; un solo timer activo; reemplazo con confirmación suave (toast). DoD: unit
      de la máquina de estados. *(la máquina de FASES es pura y testeada en lib/workout-interval;
      el provider en sí no se extrajo a hook testeable — DIFERIDO)*
- [x] `HoldTimer`: countdown + `navigator.vibrate` + beep Web Audio al 0 (beep primario — iOS no
      vibra); botón repetir (sets/lados). *(manual dev móvil pendiente del gate)*
- [x] `IntervalTimer`: fases warmup/work/recovery/cooldown desde `interval_config`, indicador
      "intervalo N de M", beep+vibración en cambio de fase, Wake Lock con toggle (gesto usuario,
      re-adquirir en `visibilitychange`, nota de batería). *(secuencia de fases = función pura
      `buildIntervalPhases` con unit tests; work por distancia ⇒ sin timer + aviso)*
- [x] `Stopwatch`: count-up + vueltas (5 últimas). *(manual dev pendiente del gate)*
- [x] Preferencias de sonido/vibración. *(REUSO: los timers nuevos leen el sonido/volumen ya
      persistidos de `rest-timer-preferences.ts` (panel existente); no se agregaron toggles nuevos)*
- [x] Overlays: safe-area (`env(safe-area-inset-top)`), targets 44px móvil, `useReducedMotion`,
      sin `100vh`. *(revisión visual móvil pendiente del gate)*
- [x] Escribir E2E `tests/movida/mobility-timer.spec.ts`. NO correr (gate). DoD: spec compila.

## F7 — Módulo cardio (gated, key `cardio`)

- [ ] M4 `clients_cardio_profile` vía branch MCP. *(migración AUTORADA en
      `20260611090004_clients_cardio_profile.sql` + types regenerados; la corrida remota es del
      orquestador esta noche)*
- [ ] `entitlements.service.ts`: respetar flag plataforma `DISABLED_MODULE_KEYS` (env, CSV de keys)
      dentro de `hasModule` (Director §3). DoD: unit con env mockeado.
      *(DIFERIDO — entitlements.service es archivo compartido entre los 4 agentes de la tanda;
      tocarlo en paralelo arriesga conflicto. Lo cablea el orquestador o próxima tanda)*
- [ ] `coach-nav.ts`: entrada cardio + enforcement de `entitlement` en `getVisibleNavItems`.
      *(ARCHIVO PROHIBIDO en esta tanda — el orquestador lo cablea con el navEntry devuelto:
      key 'cardio', href '/coach/cardio', contexts standalone+team, entitlement 'cardio')*
- [x] `/coach/cardio` (module pattern: `page.tsx` RSC + `loading.tsx` + `_data/cardio.queries.ts` +
      `_components/`): `assertModule` al tope (vía _data, server-side); calculadora de zonas
      (selector de alumno → precarga perfil; Tanaka/clásica/Karvonen) + calculadora
      pace↔tiempo↔distancia↔km/h↔milla + galería de plantillas system. OFF ⇒ pantalla
      "Módulo cardio no habilitado". *(AC8 golden values cubiertos por tests de domain/cardio;
      AC7 manual OFF→ON pendiente del gate)*
- [x] `services/cardio-zones.service.ts`: orquesta perfil (vía
      `infrastructure/db/cardio-profile.repository.ts` NUEVO) → `domain/cardio`; usado por
      `/coach/cardio`, builder (chips) y ejecución del alumno (resolución por contexto del RECURSO:
      alumno de pool ⇒ team). *(unit perfil completo/incompleto cubierto en domain/cardio
      zones.test.ts existente)*
- [x] Captura de perfil: edición del coach en ruta NUEVA `/coach/cardio/[clientId]`
      (birth_date / resting_hr / max_hr_override / ref_5k_time_sec, Zod ambos lados, AC9 — scope
      3-vías + assertModule). *(el onboarding del alumno quedó DIFERIDO; el link desde el perfil
      del alumno lo cablea el orquestador — profileLink `/coach/cardio/[clientId]`)*
- [x] Ejecución alumno: chip de zona personalizada en bloques cardio con `hr_zone` (módulo ON +
      perfil completo ⇒ "Z4 · 150–168 bpm"; si no ⇒ "Z4"). *(golden manual en dev pendiente del gate)*
- [x] Extender E2E de F5 con rama de zonas. NO correr. *(assert de chip Z4/bpm en el spec)*

## F8 — Seed de ejercicios

> NOTA 2026-06-11: F8 completo DIFERIDO en esta tanda (depende de insumos de Ani + corrida en prod
> fuera del alcance del agente). Sin bloqueo: el selector de tipo del catálogo ya permite crear
> ejercicios cardio/movilidad/roller a mano.

- [ ] `data/seed/exercises-movida.csv` versionado CON columna `scope` por fila (decisión #11 del
      PLAN): genéricos curados propios → `system` (visibles para TODA EVA — revisión de curación
      obligatoria: nombre es-neutro, gif, instrucciones); transcripción Villarroel + lista kine de
      Ani → `team` (Movida, privados del pool). Nada con scope coach. BLOQUEANTE parcial: si la lista
      del kine no llega, seed mínimo curado propio ~30 ejercicios cardio/movilidad/roller para no
      frenar demo. DoD: CSV en repo, revisado, sin filas con scope vacío o inválido.
- [ ] `scripts/seed-exercises-movida.mjs` (service-role, patrón scripts existentes): idempotente por
      (nombre normalizado + scope); rechaza scopes distintos de `system`|`team`; resuelve `team_id`
      de Movida vía parámetro explícito `--team <slug>` (jamás hardcodeado); `--dry-run`,
      sanitización CSV (`lib/import/csv-injection` como referencia). DoD: doble corrida en branch sin
      duplicados; smoke de conteo por scope.
- [ ] Opcional: `_POST_DEPLOY_` backfill curado de `exercise_type` para system cardio obvios (lista
      corta revisada a mano). DoD: idempotente, re-ejecutable.
- [ ] Corrida en prod (post-merge, snapshot previo) + smoke de conteo. DoD: conteo esperado en prod.

## GATE final (SOLO con autorización explícita del usuario)

- [ ] 1 corrida `--workers=1` contra build prod: `tests/movida/cardio-builder-execution.spec.ts`,
      `tests/movida/mobility-timer.spec.ts`, `tests/team/exercises-catalog-isolation.sql`, suites de
      separación existentes (anti-regresión pool). DoD: verde o hallazgos triageados.
- [ ] Actualizar bitácora del Director + docs canónicas (FLOWS_AND_COMPONENTS, TEST_STATUS). DoD:
      docs en el mismo cambio.
