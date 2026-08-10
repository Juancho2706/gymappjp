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

- [x] Aplicada en LIVE 2026-08-09, version **`20260809230833`**
- [x] `private.nutrition_v2_assert_substitution_authorized` (nueva, `stable security definer`, `revoke all`; verificado post-apply: `authenticated` **sin** EXECUTE)
- [x] `create or replace record_nutrition_intake_v2` (17 args, base verbatim de `20260728130000:274-509`, unico delta el guard)
- [x] `create or replace correct_nutrition_intake_v2` (18 args, base verbatim de `20260728130000:528-674`, unico delta `p_check_quantity`)
- [x] Guard corre tambien en la delegacion desde `correct_` (fuera del `if not v_delegated`) y **sin excepcion por rol** (aplica al coach) — casos 7 y 8
- [x] `source = 'substitution'` sin `prescription_item_id` ⇒ 42501 — caso 4
- [x] **Snapshot previo** registrado antes de tocar nada: `md5(record_) = 2ef5dc2be2de20c0dd77dc116ae30f4b` (6.963 chars), `md5(correct_) = e84fadb6632ac5cd11d79ef99c8f85af` (3.749 chars), `md5(get_nutrition_today_v2) = 732f641a7a137b34b395343e82ecff55`. Confirmado que las definiciones vivas eran las de `20260728130000` (llevan la marca de delegacion y el guard NUT-009) ⇒ base verbatim correcta
- [x] **tx-rollback de 9 casos ANTES de aplicar** (JWT reales; alumna `cea1b430` con `canRegisterFreely = false` **y** `canAdjustPrescribedQuantity = false`, que es la combinacion real en LIVE):

  | # | Caso | Resultado |
  |---|---|---|
  | 1 | sustitucion autorizada (con `canRegisterFreely = false`) | **OK** — el objetivo de T2.4 |
  | 2 | mismo item, alimento NO autorizado | 42501 `nutrition_v2_substitution_not_authorized` |
  | 3 | item de otro alumno | 42501 (lo ataja el guard de franja, antes que el nuevo) |
  | 4 | `substitution` sin `prescription_item_id` | 42501 `…_not_authorized:missing_item` |
  | 5 | correccion-sustitucion con `canAdjust = false` | **OK** — el bloqueo de B1, resuelto |
  | 6 | correccion NORMAL con `canAdjust = false` | 42501 `quantity_adjustment` — no se aflojo de mas |
  | 7 | delegacion desde `correct_` con alimento no autorizado | 42501 `…_not_authorized` |
  | 8 | coach del pool con sustitucion no autorizada | 42501 `…_not_authorized` |
  | 9 | intake prescrito normal | **OK** — sin regresion |

- [x] Verificado tras el rollback: el helper **no existia** y los md5 de `record_`/`correct_` seguian intactos; **0** filas `f2test-%` en `nutrition_intake_entries`
- [x] Matriz **repetida contra las funciones ya aplicadas** (A-E, tambien en transaccion con rollback): sustitucion autorizada OK · alimento no autorizado 42501 · correccion-sustitucion con `canAdjust=false` OK · intake prescrito normal OK · **registro libre con `canRegisterFreely=false` sigue devolviendo 42501 `free_registration`**
- [x] `pg_get_functiondef('get_nutrition_today_v2')` **byte-identica** antes y despues (criterio 9): `732f641a7a137b34b395343e82ecff55` en ambos lados
- [x] Advisors de seguridad: **87 hallazgos antes, 87 despues, cero nuevos y cero desaparecidos** (diff por `cache_key`). El helper privado no aparece: esta revocado
- [x] Rollback documentado en la migracion (re-aplicar `20260728130000` + `drop function` del helper)
- [x] Una sola version de cada firma en `pg_proc` (sin duplicacion por sobrecarga)

## F3 — Boundary compartido

- [x] `apps/web/src/services/nutrition-v2/substitution-intake.service.ts` — servicio server-side unico: lee las opciones (F1) → calcula la equivalencia (F0) → re-chequea contra el servidor si hay entry activa → arma el payload completo + la clave determinista
- [x] `recordSubstitutionIntakeAction` (web) sobre `authorizeStudentWrite` + rate limit existentes
- [x] `action: 'substitute'` en `api/mobile/nutrition-v2/intake/route.ts`, llamando al **mismo** servicio (la asimetria entre superficies fue lo que dejo NUT-009 sin efecto)
- [x] Contrato del cliente: `{ prescriptionItemId, substitutionId, attempt, quantity? }`. Un `foodId` o un `snapshot` colados se ignoran (test que lo pinea)
- [x] Tope de cantidad del cliente medido contra la **equivalencia**, no contra la prescrita; si no se puede honrar, se usa la calculada y se devuelve `quantityOverridden` para que la UI lo diga
- [x] La rama record-vs-correct se decide releyendo el dia del servidor, no con lo que el cliente tenia en pantalla
- [x] Tests **12/12** (`intake.actions.substitution.test.ts`): registro con `canRegisterFreely=false` · clave determinista y su cambio por intento · `foodId` colado ignorado · `substitutionId` no autorizado sin escritura · item sin reemplazos sin escritura · correccion sobre item ya registrado · entry **retirada** no cuenta como vigente · cantidad descartada con `canAdjust=false` · cantidad honrada/rechazada por tope · cantidad explicita del coach gana · sin sesion · `clientId` ajeno
- [x] Gates: `pnpm typecheck` ✓ · `pnpm check:nutrition-v2-boundaries` 327 archivos ✓ · `eslint` de los 4 archivos tocados ✓ · suite completa ✓

## F4 — UI alumno web

- [x] La pagina del alumno deja de leer `nutrition_item_substitutions_v2` directo y pasa a la RPC de F1 ⇒ la pill muestra **cantidad equivalente + kcal reales** (muere el "17 kcal")
- [x] Tap registra en un gesto, con pendiente por pill y **deshacer** en el toast (retiro append-only, no borra)
- [x] Chip "⇄ Sustituido" + linea "sustituyó a {prescrito}" tachada en la fila consumida. El estado sale de `source === 'substitution'` del read-model, cero heuristica por nombre
- [x] Muere el explicativo de `canRegisterFreely` en este camino
- [x] `needs-confirmation` y `unavailable` ⇒ `SubstitutionConfirmDialog` con stepper prellenado + el motivo en una linea
- [x] Los reemplazos se ocultan cuando el item ya esta registrado (cambiar entonces es corregir)
- [x] PostHog `student_nutrition_intake` con `method: 'substitution'` (valor nuevo en la union)
- [x] Copy alineado con el catalogo de pantallas del rediseño ("sustituyó a X", "⇄") para que T2.5 no reescriba el vocabulario al reemplazar las pills por el swipe + sheet
- [x] Gates: `pnpm typecheck` ✓ · `pnpm check:tokens` 86/86 ✓ · `eslint` de los tocados ✓ · `pnpm check:nutrition-v2-boundaries` 327 ✓

## F5 — Paridad RN Android

- [x] El Today de RN tambien lee por la RPC (mismo dato, misma version del snapshot) y calcula la equivalencia con el MISMO modulo puro que la web
- [x] Tap registra vía `action: 'substitute'` del gateway movil, que llama al mismo servicio server-side
- [x] Fila sustituida: muestra el REEMPLAZO, chip "⇄ Sustituido" y "sustituyó a {prescrito}"
- [x] Cola offline con la MISMA clave determinista: `action: 'substitute'` nueva en la cola, `enqueue` deriva la key con el helper compartido, y el drenaje la despacha
- [x] La sustitucion encolada NO se pinta como fila optimista (su payload es la intencion, sin nombre ni macros: inventarlos seria mentir)
- [x] Cero dependencias nativas nuevas
- [x] Gates: `pnpm --filter @eva/mobile exec tsc --noEmit` ✓
- [ ] **Deuda declarada:** los dos casos degradados en RN confirman con `Alert` (dos botones), no con stepper. El stepper llega con el sheet de T2.5; en web ya esta

## F6 — QA y cierre

Codigo listo y commiteado (F0-F5). Lo de abajo es lo que falta, en el orden en que hay que hacerlo.

### Bloqueantes antes de tocar el telefono

- [x] **Push de la rama** — `1aeefdc0` en `origin/rnmobiledenuevo`; deploy `dpl_JCQRP6J3…` **READY** en `gymappjp-git-rnmobiledenuevo-juancho2706s-projects.vercel.app`
- [x] **Escenario de Catalina montado** (2026-08-09, desde el coach `josefit` en el builder, no por SQL): plan nuevo `e432ade7`, version 1, vigente desde hoy, con **`canRegisterFreely = false` y `canAdjustPrescribedQuantity = false`** (el caso insignia, la combinacion real de 3 de los 6 alumnos con reemplazos). El plan anterior quedo archivado — fue la unica forma de que el nuevo rigiera HOY.

  Dia **Domingo** (= hoy), franja **POLLO**, los tres caminos en una pantalla:

  | Item prescrito | Reemplazo | Equivalencia | Camino que prueba |
  |---|---|---|---|
  | Pechuga de Pollo cocida · 100 g · 165 kcal | **Posta negra (Vacuno magro)** · 130 kcal/100 g | ~125 g | **un tap** |
  | Pechuga de Pollo cocida · 100 g · 165 kcal | **Espinaca** · 23 kcal/100 g | ~715 g | **needs-confirmation** (supera el tope de 600) |
  | Avena · 100 ml · 395 kcal | **Agua (vaso)** · 0 kcal | imposible | **unavailable** (prellena con la porcion del sustituto: 200 ml, NO con los 100 ml del item) |

  Verificado ademas: **no hay snapshot del dia** para Catalina, asi que el primer "Hoy" congela el plan nuevo y las tres opciones aparecen.
- [ ] **Sesion de alumna**: el QA del lado alumno necesita que el owner inicie sesion como `qa-cat-rojas@josefit-designqa.cl` (no se tipean contraseñas desde el agente). El tab del preview quedo abierto en `/c/josefit/login`.
- [ ] **Apuntar la app al preview**: `EXPO_PUBLIC_API_URL` en `apps/mobile/.env` (hoy no esta seteada ⇒ usa el default de produccion, donde la accion `substitute` **no existe** ⇒ `INVALID_ACTION`). Volver a dejarla como estaba al terminar.

### Guion (cada caso verificado en DB, no por pantalla)

- [ ] La pill dice **cantidad + kcal reales**, no la kcal congelada
- [ ] Un tap registra · el item queda consumido · la franja avanza su contador
- [ ] La fila muestra el reemplazo, chip **⇄ Sustituido** y "sustituyó a {prescrito}"
- [ ] **Doble tap** ⇒ UNA sola entry (el segundo devuelve el mismo id)
- [ ] Sustituir sobre un item **ya registrado** ⇒ una activa + la original en `corrected`
- [ ] **Deshacer y volver a registrar** ⇒ entry NUEVA (no revive la retirada)
- [ ] **Ciclo A→B→A** ⇒ una sola activa y cadena de correcciones sin ciclos
- [ ] `needs-confirmation` (Espinaca) y `unavailable` (Nescafé) **no** registran de un tap
- [ ] Con `canRegisterFreely = false`: la sustitucion **funciona** y el registro libre **sigue bloqueado**
- [ ] Android en **modo avion**: encola, y al volver la señal drena sin duplicar

Query de verificacion (read-only), corriendo cada caso:

```sql
select id, intake_source_v2, entry_status, food_id, quantity, unit,
       prescription_item_id, corrects_entry_id, idempotency_key, created_at
from public.nutrition_intake_entries
where client_id = 'ba265b0b-7ee2-4de1-a1c8-2a22418061e9'  -- Catalina Rojas (QA)
  and log_date = current_date
order by created_at;
```

### Cierre

- [ ] Datos de QA borrados de LIVE + `EXPO_PUBLIC_API_URL` revertida
- [ ] Acta con evidencia en este archivo
- [ ] `docs/specs/nutrition-flows-redesign/TASKS.md`: T2.4 cerrada con commits y gates
- [ ] `docs/status/MOBILE_PARITY.md` si cambia la paridad declarada

### Gotchas del QA por cable (ya conocidos)

El dev client apunta a PROD si no se cambia la variable · leer el repo con Metro corriendo recarga la app · el toast de LogBox tapa los tabs · Metro puede fallar el primer arranque en Node 24 (segundo intento pasa) · verificar que la app este en foreground antes de tapear.

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|---|---|---|---|---|
| 2026-08-09 | Fase 0 (SPEC/PLAN/TASKS + revision adversarial) | (este commit) | `pnpm docs:check` ✓ | Auditoria LIVE incluida; D1-D4 del owner; revision rechazo la v1 y las 5 correcciones estan aplicadas |
