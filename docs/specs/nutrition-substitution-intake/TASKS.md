# TASKS — T2.4 Sustituciones FULL

Convenciones: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con gates verdes (se anota commit) · `[!]` bloqueado (se anota por que).

## Fase 0 — Especificacion

- [x] Auditoria de estado real contra HEAD **y LIVE** (2026-08-09): 21 filas de sustitucion / 9 versiones / 5 alumnos; 21/21 con `quantity` NULL; 0 entries `substitution`; `substitution_group_id` con 0 filas; `authenticated` con EXECUTE directo sobre `record_nutrition_intake_v2`; `get_nutrition_today_v2` expone `source` desde `intake_source_v2`
- [x] Decisiones del owner D1-D4 (equivalencia calorica server-side · `canSubstitute` no gatea · correccion automatica · grupo va a T2.5)
- [x] SPEC / PLAN / TASKS escritos
- [x] **Revision adversarial del plan ANTES de codigo** (2026-08-09): veredicto **rechazado**, 5 bloqueantes + 13 reparos
- [x] Correcciones B1-B5 y reparos incorporados a SPEC/PLAN (tabla de correcciones al pie de la SPEC). Los tres bloqueantes de mayor peso re-verificados a mano contra LIVE:
  - B1: **3 de 6** versiones publicadas con reemplazos tienen `canAdjustPrescribedQuantity = false`; la unica con `canRegisterFreely = false` esta entre ellas ⇒ `correct_` habria devuelto 42501 en toda sustitucion-correccion
  - B3: existe la policy `cfo_select_client_coach` en `coach_food_overrides` ⇒ el alumno **si** puede leer los overrides de su coach (la premisa original era falsa)
  - B4: `nutrition_v2_ensure_day_snapshot` devuelve el snapshot existente sin recalcular y `nutrition_day_snapshots_v2` guarda `version_id` ⇒ la version del dia hay que leerla del snapshot, no del selector puro
- [x] Commit de la fase 0 (docs) con `pnpm docs:check` verde — `f1da66fa`

## F0 — Contrato puro + equivalencia

- [x] `packages/nutrition-v2/substitution-intake.ts` (modulo hoja: solo `zod` + `intake-normalize` + `intake-units`) y export en el barrel
- [x] `substitutionAttemptFromToday` (entries de hoy del item en cualquier estado)
- [x] `substitutionIntakeIdempotencyKey` **sin `deviceId`** (excepcion declarada al helper canonico)
- [x] `SubstitutionIntakeRequestSchema`: el cliente no puede mandar `foodId`, macros ni snapshot (test que lo pinea)
- [x] Golden tests **22/22**: 3 pares reales de LIVE · espinaca ⇒ `needs-confirmation` · kcal 0 ⇒ `unavailable` prellenado con la porcion del sustituto · `quantity` explicita con `unit` NULL · `per_100` vs `per_serving` · redondeo y piso · `attempt` con 0/activa/retirada/corregidas · clave estable y distinta por intento
- [x] **Correccion de diseno encontrada al implementar:** el tope de plausibilidad NO puede ser un factor sobre la porcion del sustituto. "Posta de vacuno cocida" declara `serving_size = 30 g`, asi que 3× habria marcado como absurdos los 130 g que son la equivalencia correcta de "Lomo liso 120 g". Pasa a topes absolutos: 600 g/ml y 6 unidades contadas. SPEC y PLAN actualizados
- [x] Gates: `pnpm test` del archivo 22/22 ✓ · `pnpm typecheck` (web) ✓ · `pnpm --filter @eva/mobile exec tsc --noEmit` ✓ · `eslint` de los dos archivos sin hallazgos ✓ · `pnpm check:nutrition-v2-boundaries` 326 archivos ✓ · `pnpm docs:check` ✓ · suite completa ✓

## F1 — RPC de lectura de opciones (DB en LIVE)

- [x] Migracion aditiva `get_nutrition_substitution_options_v2(p_client_id, p_local_date)` — aplicada en LIVE 2026-08-09, version **`20260809222811`**
- [x] Version del dia = `nutrition_day_snapshots_v2.version_id` primero, selector determinista solo como fallback
- [x] **La divergencia NO era teorica**: medida en LIVE antes de aplicar, **27 de 439** dias recientes tienen la version del snapshot distinta de la que elegiria el selector puro
- [x] `EXPLAIN (analyze, buffers)` del cuerpo con datos reales: **0,35 ms**, 17 buffers, plan por indice sobre items y franjas (la tabla de reemplazos tiene 21 filas y se resuelve por seq scan trivial)
- [x] Objeto previo: **no existia** (verificado en `pg_proc` antes de tocar nada) ⇒ el "snapshot previo" del protocolo es esa constatacion; el rollback es un `drop function`
- [x] **tx-rollback con JWT reales ANTES de aplicar** (`set_config('request.jwt.claims')` + `set role`), abortada a proposito con `raise` para que la funcion de prueba no quedara creada — verificado despues en `pg_proc` que no quedo nada:

  | # | Actor | Resultado |
  |---|---|---|
  | 1 | alumno propio | OK · `items=1` · `versionId = d4cafe53…` (la del snapshot del dia) |
  | 2 | alumno pidiendo el dia de otro alumno | **42501** `nutrition_v2_substitutions_scope_denied` |
  | 3 | coach del pool | OK · `items=1` |
  | 4 | coach ajeno | **42501** `nutrition_v2_substitutions_scope_denied` |
  | 5 | anon | **42501** `permission denied for function` (el revoke funciona) |
  | 6 | alumno, dia sin plan vigente | OK · `items=0` · `versionId null` (degrada, no rompe) |

- [x] Grants verificados post-apply: `security_definer = true`, `search_path = ''` pineado, `authenticated` con EXECUTE, **`anon` sin EXECUTE**
- [x] `get_advisors` security despues: **un** hallazgo nuevo, `authenticated_security_definer_function_executable` (lint 0029) — la misma clase intencional que ya tienen las otras 62 RPC `SECURITY DEFINER` de V2; `anon_security_definer_function_executable` NO la lista. Cero clases nuevas de hallazgo

## F2 — Guard de autorizacion + fix del tope de cantidad (riesgo ALTO, commit propio)

- [ ] `private.nutrition_v2_assert_substitution_authorized` (nueva, `stable security definer`, `revoke all`)
- [ ] `create or replace record_nutrition_intake_v2` (17 args, base verbatim, unico delta el guard)
- [ ] `create or replace correct_nutrition_intake_v2` (18 args, base verbatim, unico delta `p_check_quantity`)
- [ ] Guard corre tambien en la delegacion desde `correct_` (fuera del `if not v_delegated`) y **sin excepcion por rol** (aplica al coach)
- [ ] `source = 'substitution'` sin `prescription_item_id` ⇒ 42501
- [ ] tx-rollback de los **7** casos del PLAN antes de aplicar (incluye: correccion-sustitucion con `canAdjust=false` **pasa**, correccion normal con `canAdjust=false` **sigue fallando**)
- [ ] Advisors despues
- [ ] `pg_get_functiondef('get_nutrition_today_v2')` identico antes/despues (criterio 9)
- [ ] Rollback documentado en la migracion (re-aplicar `20260728130000`)

## F3 — Boundary compartido

- [ ] Servicio server-side unico (resuelve fila autorizada → equivalencia → re-chequea record/correct → arma payload + clave determinista)
- [ ] `recordSubstitutionIntakeAction` (web) sobre `authorizeStudentWrite` + rate limit existentes
- [ ] `action: 'substitute'` en `api/mobile/nutrition-v2/intake/route.ts`, espejo exacto de la action
- [ ] Tope de cantidad del cliente medido contra la **equivalencia**, no contra la prescrita
- [ ] Tests: `substitutionId` inexistente · item de otro alumno · doble llamada con la misma clave · rama correccion · correccion con `canAdjust=false` · `quantity` fuera del tope · `attempt` desactualizado
- [ ] Gates: `pnpm typecheck` · `pnpm check:nutrition-v2-boundaries` · `pnpm lint` de los tocados

## F4 — UI alumno web

- [ ] Pill con cantidad equivalente + kcal (muere el "17 kcal")
- [ ] Tap registra, con pendiente por pill y **deshacer**
- [ ] Chip semantico "Sustituido" + prescrito tachado en la fila consumida
- [ ] Muere el explicativo de `canRegisterFreely` en este camino
- [ ] `needs-confirmation` y `unavailable` ⇒ stepper prellenado + motivo en una linea
- [ ] PostHog `student_nutrition_intake` con `method: 'substitution'`
- [ ] Gates: `pnpm lint` tocados · `pnpm typecheck` · tests de `nutrition-today.logic` · `pnpm check:tokens`

## F5 — Paridad RN Android

- [ ] Mismo comportamiento en el Today de RN (pill, undo, chip, stepper de los dos casos degradados)
- [ ] Cola offline con la MISMA clave determinista (reintento devuelve el mismo id)
- [ ] Mismo evento PostHog que web
- [ ] Cero dependencias nativas nuevas
- [ ] Gates: `pnpm --filter @eva/mobile exec tsc --noEmit` · tests mobile tocados

## F6 — QA y cierre

- [ ] Preview web con alumna de QA (`canRegisterFreely = false` **y** `canAdjustPrescribedQuantity = false`): registrar · doble tap · sustituir sobre registrado · **deshacer y re-registrar** · **ciclo A→B→A** · `needs-confirmation` — cada caso verificado en DB
- [ ] Device fisico Android: mismo guion + modo avion (cola offline)
- [ ] Datos de QA borrados de LIVE
- [ ] Acta con evidencia en este archivo
- [ ] `docs/specs/nutrition-flows-redesign/TASKS.md`: T2.4 cerrada con commits y gates
- [ ] `docs/status/MOBILE_PARITY.md` si cambia la paridad declarada

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|---|---|---|---|---|
| 2026-08-09 | Fase 0 (SPEC/PLAN/TASKS + revision adversarial) | (este commit) | `pnpm docs:check` ✓ | Auditoria LIVE incluida; D1-D4 del owner; revision rechazo la v1 y las 5 correcciones estan aplicadas |
