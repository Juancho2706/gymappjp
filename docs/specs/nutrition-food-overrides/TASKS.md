# TASKS — Overrides de macros por coach (`nutrition-food-overrides`)

Checklist de la [SPEC](./SPEC.md) segun el [PLAN](./PLAN.md). Convenciones del programa: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con gates verdes (se anota commit) · `[!]` bloqueado (se anota por que).

## Puerta

- [x] **OK del owner a la SPEC** — dado el 2026-08-07 (sin cambios al alcance). Desbloquea F1-F5.

## F1 — Contrato puro (sin DB)

- [x] F1.1 `packages/nutrition-v2/food-overrides.ts`: tipo `CoachFoodOverride`, zod y merge puro (reemplazo TOTAL de los 5 macros, sin coalesce por campo). Molde `resolveExchangeListRows`. **Desvio anotado**: la medida casera SI coalesce, pero como PAR (label+gramos juntos) — un coach que solo corrige macros no debe borrar la medida del catalogo, y mezclar la etiqueta de una fuente con los gramos de la otra daria una conversion falsa
- [x] F1.2 `computeItemMacros` respeta `macrosBasis` en vez de asumir `per_100` — espejo de `intakeEntryFactor`. **En LAS DOS copias** del builder (`draft-builder.ts` web + `apps/mobile/lib/nutrition-v2-builder.ts`): congelan los mismos `snapshot_*` y tocar una sola habria abierto drift web/RN (NUT-039). Sin base declarada el camino queda byte-identico
- [x] F1.3 Golden test `per_serving` del freeze (**obligatorio antes de que exista un solo override real**) + tests del merge puro: `packages/nutrition-v2/food-overrides.test.ts`, `draft-builder.macros-basis.test.ts` (web), `tests/mobile-nutrition-v2-builder-macros-basis.test.ts` (espejo RN, mismos numeros a proposito)
- [x] F1.4 `FoodCatalogItemSchema` (`packages/nutrition-v2/catalog.ts`): `macrosBasis`, `householdLabel`, `householdGrams`, `hasOverride`, `original` — todos `.nullable().optional()` (compat con builds RN cacheadas). Los mappers catalogo→builder (web y RN) ya arrastran la base; inerte hasta que F3 la emita
- [x] Gates F1: `pnpm test` (5391, verde salvo 2 timeouts de 5 s bajo carga —`redeem-coupon-signup` e `i18n-orphans`, ambos pasan aislados y no importan nutricion) · typecheck web ✓ · tsc mobile ✓ · eslint 0 errores · boundaries ✓ · tokens ✓ — commit **c0062c83**

## F2 — Migracion en LIVE

- [x] F2.1 Migracion `supabase/migrations/20260807220000_coach_food_overrides.sql`, molde `20260804090000_*`: pk, cascade, `unique (coach_id, food_id)`, `cfo_food_id_idx`, 5 macros NOT NULL con check `>= 0 and <= 9999`, `macros_basis` NOT NULL, par casero con check, `created_by`, trigger de `updated_at`. Sin `NULLS NOT DISTINCT`: aca no hay filas globales (no existe catalogo de overrides sin dueño), asi que el unique simple alcanza
- [x] F2.2 Grants: revoke total → `select, insert, delete` + `update` en las 8 columnas de valor + `all to service_role`. Verificado en LIVE: `privs_authenticated = DELETE,INSERT,SELECT` y `col_update_grants = 8`
- [x] F2.3 RLS enable + las 6 policies `cfo_*`. **DESVIO ANOTADO vs SPEC: sin `force row level security`** — ninguna tabla del repo la usa y aca romperia la feature: `food_catalog_v2_item_json` es SECURITY DEFINER y corre como dueño de la tabla; con FORCE el dueño queda sujeto a RLS y, siendo todas las policies `to authenticated`, no matchearia ninguna ⇒ el merge de F3 devolveria cero overrides **en silencio**. El aislamiento del merge lo da el `p_coach_id` server-side (leccion B1), no la RLS del definer
- [x] F2.4 **tx-rollback en LIVE** con JWT real (`set local role authenticated` + `request.jwt.claims`), abortado con `raise exception` para garantizar el rollback; `to_regclass` posterior = `null` (cero residuo). Evidencia: `policies=6; col_update_grants=8; insert_own=OK; update_valores=OK; update_identidad=DENEGADO_OK; par_incompleto=RECHAZADO_OK; unique_coach_food=OK; insert_ajeno=DENEGADO_OK; visible_para_otro_coach=0; visible_para_alumno_del_coach=1`. EXPLAIN va en F3.6 (sobre una tabla vacia y sin el join todavia, aca no mide nada)
- [x] F2.5 Aplicada en LIVE (`apply_migration coach_food_overrides`). Post: `rls_enabled=true`, `rls_forced=false`, `policies=6`, `indices=3`, `filas=0`. **Advisors security: CERO menciones de la tabla nueva** (sin RLS-disabled, sin policy-sin-RLS, sin FK-sin-indice)
- [~] F2.6 `database.types.ts`: bloque `coach_food_overrides` agregado y **verificado byte a byte contra el generador** (`generate_typescript_types`), en su lugar alfabetico. El **regen COMPLETO queda pendiente como tanda propia**: probado en esta sesion y deja `pnpm typecheck` en **13 errores sobre 7 archivos V1** (`client-detail.service`, `dashboard.queries`, `heroComplianceBundle`, `recap.queries`, `c/[coach_slug]/nutrition/page`, `workout-execution.queries`, `org.repository`) — anotaciones estrechas del tipo `{ plan_id?: string }` contra columnas que el regen tipa `string | null`. Arreglarlas es tocar superficies V1 ajenas a esta feature ⇒ **el cast `V2ReadClient` de T1.1 sigue vivo**

## F3 — Merge en discovery

- [x] F3.1 `private.food_catalog_v2_item_json`: drop de `(uuid)` + create `(uuid, uuid)` en la misma migracion, con `revoke all ... from public, anon, authenticated` **detras del create** (el DROP se lleva la ACL; verificado post-aplicacion: `{postgres=X/postgres}`, una sola version de la funcion)
- [x] F3.2 Merge por `left join` dentro del choke point ⇒ corre una vez por fila EMITIDA (pagina final ≤25), nunca en el scoring
- [x] F3.3 JSON: los 5 macros por `case ... else o.x end` (reemplazo total explicito, no `coalesce` campo a campo) · `macrosBasis` SIEMPRE · par casero indivisible · `hasOverride` + `original`
- [x] F3.4 **Son 3 RPC, no 4.** `get_food_by_id_v2` **NO EXISTE**: no esta en `pg_proc` (ningun schema) ni en el repo — solo aparecia en la SPEC/PLAN/TASKS de esta feature, heredado de un informe Explore erroneo. Las reales — `search_food_catalog_v2`, `lookup_food_by_gtin_v2`, `get_coach_food_suggestions_v2` — resuelven el coach con `private.food_catalog_v2_actor_coach_id()` (coach propio → alumno via `clients` → NULL), una vez por llamada, nunca del payload
- [x] F3.5 Firmas publicas intactas: las 3 se recrearon con `create or replace` sobre la misma firma (ACL preservada). Cero cambio en clientes web/RN
- [x] F3.6 Medicion antes/despues con JWT real en LIVE: `search_food_catalog_v2('pollo')` 139,3 / 139,6 ms → 153,4 / 135,4 ms; `get_coach_food_suggestions_v2` 40,3 / 44,2 ms → 45,5 ms. Dentro del ruido (25 items ⇒ 25 probes por unique)
- [x] F3 verificado en LIVE con override de prueba (tx abortada, `overrides_residuo = 0`): coach dueño ve `kcal=999 basis=per_serving casera=1 pocillo/90 hasOverride=true original.calories=254`; **otro coach ve 254 y `hasOverride=false`**; **el alumno del coach ve 999** (hereda la correccion de SU coach); sugerencias siguen respondiendo 12 items

## 🔴 BLOQUEO DE DATOS descubierto en F3 (decision del owner antes de F4)

`public.foods.macros_basis` **no es confiable**. El backfill de `20260728120000` marco
`per_serving` toda fila con `exchange_group_id`; hoy son 2.525 filas, de las cuales **60 tienen
`serving_size <> 100`** y ahi el dato esta MIXTO:

| Alimento | serving_size | calories | Que es en realidad |
|---|---|---|---|
| Aceite vegetal | 5 g | 884 (100 g de grasa) | por 100 g — la etiqueta miente |
| Almendras | 10 g | 579 | por 100 g — la etiqueta miente |
| Avena instantanea Quaker | 40 g | 367 | por 100 g — la etiqueta miente |
| Arepa | 1 un | 240 | por porcion — la etiqueta acierta |
| Clara huevo | 50 g | 26 (5 g proteina) | por porcion — la etiqueta acierta |

Consecuencias medidas en LIVE: **306 items prescritos** apuntan a esas 60 filas (de 1.711 items
con alimento, en 6 coaches). Para las mal etiquetadas, la formula por-100 de hoy da el numero
CORRECTO; para las bien etiquetadas ("Arepa": 1 unidad) hoy congela **2,4 kcal en vez de 240**.
No hay una sola regla que arregle las dos: es un problema de DATO, no de codigo.

**RESUELTO el 2026-08-07** (migracion `20260807230000_foods_macros_basis_audit.sql`). Criterio, no
olfato:

1. **Cota fisica dura**: ningun alimento supera 9 kcal/g (grasa pura). Si `calories > 9 * serving_size`
   con unidad g/ml, los macros NO PUEDEN ser de esa porcion ⇒ son por 100 g. Descarta 11 filas sin
   discusion posible ("Aceite vegetal", "Almendras", "Whey Protein"…).
2. **Contraste con el valor real por 100 g** para el resto (leche descremada 34 kcal, avena cocida
   71, atun al agua 116, salmon enlatado 138, yogur griego 97…): coinciden con la fila ⇒ es por 100.
3. Quedan **10 filas** cuyos macros SI describen la porcion: clara de huevo 50 g = 26 kcal, huevo
   duro 1 un = 77, arepa 1 un = 240, vienesa 1 un = 91, queso chanco 25 g = 80, granola vivo 50 g =
   215, posta 30 g = 55, hallulla y marraqueta (1 porcion de intercambio = 70 kcal).

**50 filas volvieron a `per_100`** (2.525 → 2.475 `per_serving` en total). Efecto observable con el
codigo de antes: CERO — todo el mundo ya las trataba como per_100. Con F4 encendido, las unicas que
cambian de numero son las 10 legitimas: **8 items prescritos** en 6 alimentos.

Pendiente de criterio NUTRICIONAL para el owner (no de ingenieria): "Pan hallulla" y "Pan
marraqueta" declaran 70 kcal y 15 g de carbohidrato — una porcion de intercambio de manual — pero
con `serving_size = 50 g`. Cincuenta gramos de marraqueta son ~145 kcal, no 70: el gramaje esta
inflado (deberia rondar 25 g). La base quedo bien etiquetada; los gramos siguen sospechosos.

## F4 — Merge en freeze y rehidratacion

- [x] F4.1 `plan-persistence.ts`: N+1 muerto — el loop de un round-trip POR ALIMENTO pasa a un `.in('id', foodIds)` + una lectura de overrides `eq(coach_id).in(food_id)` + merge en memoria. Un plan de 30 items pagaba 30 viajes solo para congelar
- [x] F4.2 `macros_basis` en los selects de `plan-persistence.ts`, `plan-foods.data.ts` y la copia movil. **Interruptor ENCENDIDO**: los mappers catalogo→builder vuelven a propagar la base (el dato quedo auditado, ver arriba)
- [x] F4.3 Rehidratacion con el MISMO `resolveFoodMacros`: `plan-foods.data.ts` (builder + plantillas) y la 4ta copia `api/mobile/nutrition-v2/plan-templates/route.ts`, que ademas ahora emite `macrosBasis` en el payload RN. Un fallo al leer overrides NO tumba la rehidratacion: degrada al catalogo sin corregir
- [x] F4.4 CERO cambio en `snapshot_*`, day snapshot, intake y `get_nutrition_today_v2`: el merge entra ANTES del freeze y el payload de la RPC conserva las mismas claves (verificado por los tests de `plan-persistence.version-insert`, que afirman el arbol que viaja al RPC)
- [x] Dos tests nuevos de freeze con override: la correccion se congela en vez de los macros del catalogo (224 kcal en vez de 260) y la base del override llega al calculo

## F5 — Capa web

- [x] F5.1 `infrastructure/db/coach-food-overrides.repository.ts`: sin service-role, upsert manual select→update/insert, delete con 0 filas ≠ error, y lectura por LOTE (`findCoachFoodOverridesByFoodIds`, un round-trip, tope 500) para que el freeze de F4 no reproduzca el N+1. 8 tests con cliente falso con forma supabase-js (leccion `db.rpc`/`this`), incluido que el UPDATE no lleva `coach_id` ni `food_id`
- [x] F5.2 `services/nutrition-v2/coach-food-overrides.service.ts` — dueño derivado del actor, techo de autorizacion en el caller
- [x] F5.3 `app/coach/nutrition-v2/_actions/food-overrides.actions.ts` — zod + `authorizeCoach` + service; `clientId` es pista de revalidacion, no autorizacion. Sin gate Pro: corregir un alimento mal cargado es higiene de catalogo
- [x] F5.4 `check:nutrition-v2-boundaries` (307 archivos) + `check:tokens` verdes · typecheck web verde · eslint 0 errores
- Nota: sin UI (T2.2) estas actions no tienen quien las llame todavia — a proposito. El dato queda correcto y observable antes de arrastrar el riesgo de la interfaz

## Cierre de la tanda

- [x] Suite completa (**5401 tests verdes**) + typecheck web + tsc mobile + eslint 0 errores + boundaries + tokens + docs:check
- [ ] QA manual coach josefit en preview: crear override por SQL, verificar que aparece en busqueda, scanner y sugerencias; publicar plan y verificar que congela el numero corregido; alumno ve el plan sin cambios de contrato. **Requiere push a la rama** (decision del owner)
- [ ] Acta con evidencia + actualizar TASKS del programa padre
- [ ] **Deuda declarada**: regen completo de `database.types.ts` (13 errores en 7 archivos V1) y con el, retirar el cast `V2ReadClient` de T1.1

## Fuera de esta tanda

T2.2 (UI: sheet de edicion, badge ✎ con original tachado, filtro "Editados por mi", aviso de republicar con lista de alumnos, restaurar original) · overrides a nivel org · lapida `is_excluded` · override de nombre/marca/foto/porciones.
