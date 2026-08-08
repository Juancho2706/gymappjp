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

- [ ] F2.1 Redactar migracion `coach_food_overrides` clonando `20260804090000_*` (exchange_group_foods): pk, `coach_id`/`food_id` con cascade, `unique (coach_id, food_id)`, indice `cfo_food_id_idx`, 5 macros NOT NULL con check `>= 0 and <= 9999`, `macros_basis` NOT NULL check in (`per_100`,`per_serving`), `household_label` (≤40) + `household_grams` (> 0) con check par, `created_by`, timestamps + trigger `private.nutrition_v2_set_updated_at()`
- [ ] F2.2 Grants: `revoke all from public, anon, authenticated` → `select, insert, delete` + `update` SOLO en columnas de valor (identidad inmutable desde la app) + `all to service_role`
- [ ] F2.3 RLS enable + FORCE con policies `cfo_select_own`, `cfo_select_client_coach`, `cfo_insert_own` (with check dueño **y** `private.food_catalog_v2_can_read_food`), `cfo_update_own`, `cfo_delete_own`, `cfo_service_role`
- [ ] F2.4 **tx-rollback + EXPLAIN en LIVE ANTES de aplicar** (protocolo AGENTS; sin `archive_gate` por ser tabla coach-keyed)
- [ ] F2.5 Aplicar + advisors despues + evidencia en el acta
- [ ] F2.6 Regen `database.types.ts` → retirar el cast `V2ReadClient` que T1.1 dejo como deuda

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
