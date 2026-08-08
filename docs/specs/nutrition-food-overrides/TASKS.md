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

- [ ] F3.1 `private.food_catalog_v2_item_json`: **drop firma vieja + create `(p_food_id, p_coach_id)` en la MISMA tx** (precedente `20260728120000`; `create or replace` no admite parametros nuevos y el overload deja resolucion ambigua)
- [ ] F3.2 Merge por `left join` sobre la pagina final (probe por unique, ≤25 filas — NUNCA en el scoring)
- [ ] F3.3 JSON: macros mergeados (override gana) · `macrosBasis` emitido SIEMPRE · `householdLabel`/`householdGrams` · `hasOverride` + `original` solo cuando hay override
- [ ] F3.4 Las 4 RPC consumidoras pasan el coach resuelto **1 vez por llamada** (coach → `auth.uid()`; alumno → su coach via `clients`; otro → NULL): `search_food_catalog_v2`, `lookup_food_by_gtin_v2`, `get_coach_food_suggestions_v2`, `get_food_by_id_v2`. Jamas del payload (leccion B1: definer pasa por encima de RLS)
- [ ] F3.5 Verificar que las firmas publicas de las 4 RPC NO cambian (cero cambio de clientes web/RN; scanner PostgREST hereda gratis)
- [ ] F3.6 EXPLAIN antes/despues con evidencia (riesgo Micro)

## F4 — Merge en freeze y rehidratacion

- [ ] F4.1 `plan-persistence.ts`: matar el N+1 (loop 1 round-trip por alimento) → un `.in('id', foodIds)` + un fetch de overrides del coach + merge con el helper de F1
- [ ] F4.2 `macros_basis` al select en `plan-persistence.ts` y `plan-foods.data.ts` (hoy ninguno lo trae)
- [ ] F4.3 Rehidratacion con el mismo merge: `plan-foods.data.ts` (builder + plantillas) y la 4ta copia `api/mobile/nutrition-v2/plan-templates/route.ts`
- [ ] F4.4 Verificar CERO cambio en `snapshot_*`, day snapshot, intake y `get_nutrition_today_v2` (el merge entra antes del freeze)

## F5 — Capa web

- [ ] F5.1 `infrastructure/db/coach-food-overrides.repository.ts` (molde `exchange-group-foods.repository`): sin service-role, upsert manual select→update/insert, delete con 0 filas ≠ error
- [ ] F5.2 `services/nutrition-v2/coach-food-overrides.service.ts` — dueño derivado del actor, techo de autorizacion en el caller
- [ ] F5.3 `app/coach/nutrition-v2/_actions/food-overrides.actions.ts` — zod + auth + service
- [ ] F5.4 `check:nutrition-v2-boundaries` + `check:tokens` verdes

## Cierre de la tanda

- [ ] Suite completa + typecheck web + tsc mobile + eslint + boundaries
- [ ] QA manual coach josefit en preview: crear override por SQL, verificar que aparece en busqueda, scanner, sugerencias y detalle; publicar plan y verificar que congela el numero corregido; alumno ve el plan sin cambios de contrato
- [ ] Acta con evidencia (EXPLAIN, advisors, capturas) + actualizar TASKS del programa padre

## Fuera de esta tanda

T2.2 (UI: sheet de edicion, badge ✎ con original tachado, filtro "Editados por mi", aviso de republicar con lista de alumnos, restaurar original) · overrides a nivel org · lapida `is_excluded` · override de nombre/marca/foto/porciones.
