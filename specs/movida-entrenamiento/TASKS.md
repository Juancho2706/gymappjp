# TASKS — Entrenamiento Movida: ejercicios polimórficos + cardio TrainingPeaks-lite

Leyenda: `[ ]` pendiente. **DoD global por tanda:** `pnpm typecheck` + `pnpm test` verdes; strings
nuevos con `t()` + `es.json`/`en.json` mismo commit; sin tocar Supabase remota fuera del protocolo de
branch MCP; commit por fase (push cuando el usuario lo pida). E2E/SQL: se ESCRIBEN en su tanda, se
CORREN solo en el gate autorizado.

## F0 — Baselines anti-regresión

- [ ] Extender `packages/schemas/workout.test.ts`: bloque legacy puro (solo reps/sets/section) pasa
      `WorkoutBlockSchema` y NO gana campos nuevos (passthrough intacto). DoD: vitest verde ANTES de
      tocar el schema.
- [ ] `specs/movida-entrenamiento/CALLSITES.md`: mapa de consumidores de `reps`/`sets`/`target_weight_kg`
      (PrintProgramDialog, ProgramPreviewDialog, ExerciseHistory/`getExerciseHistoryAction`,
      MuscleBalancePanel, `target_reps_at_log`, summary del alumno). DoD: lista exhaustiva por grep,
      cada uno con decisión (fallback legacy automático / tarea explícita).
- [ ] Verificar baselines de áreas vigentes (`usePlanBuilder.test.ts`, `workout-block-grouping.test.ts`,
      `workout.test.ts`) en verde. DoD: vitest verde sin modificarlos.

## F1 — DB expand: M1 catálogo + M2 bloques + M3 logs (branch MCP, requiere ventana Pro)

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

- [ ] `domain/workout/types.ts`: `ExerciseType`, `SideMode`, `LoadType`, `LoadUnit`, `DistanceUnit`,
      `RepsUnit`, `IntervalConfig`; alinear `ExerciseUnit` huérfano (documentar o deprecar). DoD:
      typecheck; sin imports de Next/Supabase.
- [ ] `packages/schemas/workout.ts`: extender `WorkoutBlockSchema` (campos nuevos opcionales/nullable,
      `IntervalConfigSchema`, superRefine: cardio exige duración O distancia; hr_zone 1-5) y
      `WorkoutLogSetSchema` (`actual_*` opcionales). DoD: baseline F0 sigue verde + tests nuevos por tipo.
- [ ] `apps/web/src/lib/workout-exercise-type.ts`: `effectiveExerciseType(block, exercise)` +
      `legacyRepsSummaryFor(block)` (≤20 chars, es/en via key — el texto va con `t()` en UI, el resumen
      persiste es-neutro corto). DoD: tests de resolución (override > exercise > 'strength') y truncado.
- [ ] Crear `packages/calc/` (`@eva/calc`): `package.json` + `index.ts` + `cardio.ts` +
      `cardio-templates.ts` (5 plantillas system del PLAN) + `cardio.test.ts` (golden fixtures AC8 +
      bordes). Registrar en workspace pnpm. DoD: vitest verde; cero imports server-only/Supabase.

## F3 — Catálogo de ejercicios (3er caso team + tipo)

- [ ] `exercises.actions.ts`: `resolveExerciseOwner` 3er caso → workspace activo team ⇒
      `{ team_id, coach_id: null, org_id: null }` (cualquier miembro activo; chequeo de duplicado de
      nombre scoped por team). DoD: unit del resolver con los 3 contextos.
- [ ] `ExerciseFormModal`: selector de `exercise_type` (4 opciones, default strength, i18n). DoD:
      crear/editar persiste tipo.
- [ ] Queries del catálogo (coach + `DraggableExerciseCatalog` + búsqueda del builder): traer
      `exercise_type` + `team_id`; filtro por tipo en UI; visibilidad system+team+propios (RLS es el
      techo, query no filtra de más en team). DoD: AC6 verificado en dev con 2 cuentas.
- [ ] Anti-fantasma del pool (AC11, decisión #7 del PLAN): en workspace team el catálogo ASIGNABLE
      del builder = system+team; los propios se listan en sección aparte NO asignable con acción
      "Copiar al team" — server action idempotente por (nombre normalizado + team): crea o reutiliza
      la fila team (`team_id` set, `coach_id`/`org_id` NULL vía `resolveExerciseOwner`) y el bloque
      referencia esa copia. DoD: unit del resolver de asignabilidad + del copy-on-use; AC11 manual en
      dev (alumno del pool ve nombre/gif/instrucciones; otro coach del pool ve el mismo ejercicio).
- [ ] `getExerciseHistoryAction` y catálogo: sin regresión standalone/enterprise (scoping 3-vías).
      DoD: vitest + smoke manual.

## F4 — Builder coach (núcleo — review adversarial al cierre)

- [ ] `types.ts` (`BuilderBlock`) + `mapDbBlockToBuilderBlock` + `createDefaultBlock`: campos nuevos.
      DoD: typecheck; round-trip unit del mapper.
- [ ] Save pipeline (`workout.service.ts`, 4 inserts: save/duplicate/assign/merge): persistir campos
      nuevos + `reps = legacyRepsSummaryFor(block)` cuando el coach usa campos tipados (si escribió
      `reps` a mano en strength, se respeta). DoD: unit; AC3 (plan legacy intacto byte-identical).
- [ ] `BlockEditSheet`: render condicional por `effectiveExerciseType` — 4 forms (mapa de campos del
      PLAN), selector de override de tipo, `load_unit` kg/lb (persistir tal cual, conversión solo
      display), `side_mode`, distancia, `instructions`; form cardio con editor de `interval_config` +
      "Aplicar plantilla" (galería `@eva/calc`, visible solo si módulo cardio ON — pasar flag desde RSC).
      Migrar `<img>` (línea 128) a `next/image`. DoD: AC1/AC2 round-trip manual; i18n completo.
- [ ] `ExerciseBlock`: resumen por tipo ("4×400m @ Z4", "30s ×3 por lado", "10 pasadas"); fallback
      `reps` texto si campos tipados NULL. DoD: unit del formateador de resumen.
- [ ] Verificar consumidores del CALLSITES.md: preview/print muestran resumen legacy correcto;
      `MuscleBalancePanel` excluye bloques no-strength del volumen. DoD: smoke + unit del filtro.
- [ ] Review adversarial F4 (núcleo) + correcciones. DoD: hallazgos cerrados o documentados.

## F5 — Alumno: logging polimórfico (review adversarial al cierre)

- [ ] `workout-execution.queries.ts`: select de campos nuevos del bloque + `exercises.exercise_type`;
      tipos `BlockType`/`ExerciseType` extendidos. DoD: typecheck; plan legacy idéntico (AC3).
- [ ] `LogSetForm`: variantes por tipo efectivo (cardio: duración/distancia/FC prom/RPE; mobility:
      hold hecho + seg reales; roller: duración o pasadas) reusando useActionState + useOptimistic +
      useFormStatus; strength NO cambia. DoD: AC4 en dev; regresión strength visual intacta.
- [ ] `logSetAction`: parsear/persistir `actual_*` + `metadata` (upsert por día Santiago igual que hoy).
      DoD: unit de parseo; RLS de logs sin cambios.
- [ ] `lib/workout-offline-queue.ts`: campos opcionales nuevos en `WorkoutOfflineLog` (colas viejas
      siguen parseando) + flush envía campos nuevos. DoD: unit de round-trip de cola con item legacy
      y nuevo.
- [ ] Historial "última vez" por tipo (cardio "4×400m @ 1:35/km"; ocultar métricas que no aplican —
      sin "NaN reps"). DoD: unit del formateador.
- [ ] Escribir E2E `tests/movida/cardio-builder-execution.spec.ts` (coach prescribe cardio → alumno
      registra → coach ve log; incluir rama AC11: "Copiar al team" de un ejercicio propio y render
      con nombre/gif para el alumno del pool). NO correr (gate). DoD: spec compila.
- [ ] Review adversarial F5 + correcciones.

## F6 — Timers

- [ ] `WorkoutTimerProvider`: contrato `{ startRest, startHold(sec), startInterval(config, sets),
      startStopwatch() }`; un solo timer activo; reemplazo con confirmación suave. DoD: unit de la
      máquina de estados (provider extraído a hook testeable).
- [ ] `HoldTimer`: countdown + `navigator.vibrate` + beep Web Audio al 0 (beep primario — iOS no
      vibra); botón repetir (sets/lados). DoD: manual dev móvil; reduced-motion respetado.
- [ ] `IntervalTimer`: fases warmup/work/recovery/cooldown desde `interval_config`, indicador
      "intervalo N de M", beep+vibración en cambio de fase, Wake Lock con toggle (gesto usuario,
      re-adquirir en `visibilitychange`, nota de batería). DoD: manual dev; unit de la secuencia de
      fases (función pura en `@eva/calc` o lib).
- [ ] `Stopwatch`: count-up + vueltas. DoD: manual dev.
- [ ] Preferencias de sonido/vibración en `rest-timer-preferences.ts` + `WorkoutTimerSettingsPanel`.
      DoD: persisten en localStorage.
- [ ] Overlays: `pb-safe`/`pt-safe`, `h-dvh`, sin `100vh`. DoD: revisión visual móvil.
- [ ] Escribir E2E `tests/movida/mobility-timer.spec.ts`. NO correr (gate). DoD: spec compila.

## F7 — Módulo cardio (gated, key `cardio`)

- [ ] M4 `clients_cardio_profile` vía branch MCP (protocolo F1 completo: branch → apply → seed/RLS
      asserts (alumno solo SU perfil; pool por scope existente) → advisors → merge → pull → regen →
      delete mismo día). DoD: typecheck post-regen.
- [ ] `entitlements.service.ts`: respetar flag plataforma `DISABLED_MODULE_KEYS` (env, CSV de keys)
      dentro de `hasModule` (Director §3). DoD: unit con env mockeado.
- [ ] `coach-nav.ts`: entrada `{ key: 'cardio', href: '/coach/cardio', entitlement: 'cardio',
      contexts: ['coach_standalone','coach_team'] }` + `getVisibleNavItems` filtra por
      `enabledModules` en `VisibleNavContext` (enforcement del gancho declarado); shell del coach
      resuelve `enabledModules` server-side por workspace activo (team ⇒ team; si no ⇒ coach). DoD:
      `coach-nav.test.ts` extendido (OFF oculta, ON muestra, team manda).
- [ ] `/coach/cardio` (module pattern: `page.tsx` RSC + `loading.tsx` + `_data/cardio.queries.ts` +
      `_components/`): `assertModule` al tope; calculadora de zonas (selector de alumno opcional →
      precarga perfil; Tanaka/clásica/Karvonen) + calculadora pace↔tiempo↔distancia↔km/h + galería de
      plantillas system. DoD: AC7/AC8 en dev; OFF ⇒ notFound/redirect con mensaje.
- [ ] `services/cardio-zones.service.ts`: orquesta perfil (vía `infrastructure/db` repository) →
      `@eva/calc`; usado por `/coach/cardio`, builder (chips) y ejecución del alumno (resolución por
      contexto del RECURSO: alumno de pool ⇒ team). DoD: unit con perfil completo/incompleto.
- [ ] Captura de perfil: campos opcionales `birth_date`/`resting_hr` en onboarding del alumno
      (`app/c/[coach_slug]/onboarding/`) SOLO si módulo ON para su contexto + edición en perfil del
      cliente del coach (`ClientProfileDashboard`/overview) + `max_hr_override`/`ref_5k_time_sec` solo
      coach. DoD: persisten; Zod ambos lados; AC9.
- [ ] Ejecución alumno: chip de zona personalizada en bloques cardio con `hr_zone` (módulo ON +
      perfil completo ⇒ "Z4 · 150–168 bpm"; si no ⇒ "Z4"). DoD: golden values en dev (Tanaka 30 ⇒ Z4
      150–168).
- [ ] Extender E2E de F5 con rama de zonas (módulo ON/OFF). NO correr.

## F8 — Seed de ejercicios

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
