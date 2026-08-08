# PLAN — Overrides de macros por coach (`nutrition-food-overrides`)

Plan de ejecucion de la [SPEC](./SPEC.md). Sub-feature de [nutrition-flows-redesign](../nutrition-flows-redesign/PLAN.md) (T2.1 datos / T2.2 UI).

**Estado: borrador. Cero codigo hasta el OK del owner a la SPEC.**

## Principio de orden

El riesgo real no esta repartido parejo: la migracion y el cambio de firma del choke point son irreversibles-en-caliente, el resto es codigo revertible. Por eso el plan va **de adentro hacia afuera** — helper puro primero (sin DB), luego DB en LIVE con evidencia, luego los consumidores — y cada fase deja el sistema entero y verde. Ninguna fase depende de que la siguiente exista.

Una regla domina todo el plan: **el override sin `macros_basis` es un bug silencioso**. Hoy el catalogo y el freeze asumen `per_100` sin declararlo; un override `per_serving` se congelaria con numeros equivocados y nadie lo veria hasta que un alumno mire su plan. Por eso el basis viaja en la tabla, en el JSON y en el calculo, y hay golden test antes de que exista la UI.

## Fases

### F1 — Contrato puro (sin DB, sin red)

Helper `packages/nutrition-v2/food-overrides.ts` con el merge en TS, espejo exacto del SQL que vendra en F2, mas los tipos y el zod. Molde: `resolveExchangeListRows`.

Junto con el, la deuda que la SPEC obliga a saldar aca: `computeItemMacros` (`draft-builder.ts`) deja de asumir `per_100` y respeta el basis, espejo de `intakeEntryFactor`. Golden test `per_serving` **obligatorio en esta fase** — es la red que sostiene todo lo demas.

Sale verde con `pnpm test` sin tocar nada mas. Si el owner frena el resto, esto queda como mejora aislada y correcta.

### F2 — Migracion en LIVE

Tabla `coach_food_overrides` con el molde `exchange_group_foods` (`20260804090000`): RLS FORCE, policies `cfo_*`, grants por columna, checks de sanity, indice por `food_id`, trigger de `updated_at`.

Protocolo AGENTS, sin atajos: **tx-rollback + EXPLAIN en LIVE antes de aplicar**, advisors despues. Sin `archive_gate` (tabla coach-keyed). Regen de `database.types.ts` en la misma tanda — de paso muere el cast `V2ReadClient` que T1.1 dejo como deuda.

### F3 — Merge en discovery

`private.food_catalog_v2_item_json` pasa de `(p_food_id)` a `(p_food_id, p_coach_id)`. **Drop de la firma vieja + create en la MISMA tx** (precedente `20260728120000`): `create or replace` no admite parametros nuevos y un overload deja la resolucion ambigua. El helper esta revocado de `authenticated`, asi que no hay llamadores externos que migrar.

Las **4 RPC consumidoras** (`search_food_catalog_v2`, `lookup_food_by_gtin_v2`, `get_coach_food_suggestions_v2`, `get_food_by_id_v2`) resuelven el coach **una sola vez por llamada** y se lo pasan. Sus firmas publicas no cambian ⇒ cero cambio en clientes web/RN, y el scanner por PostgREST hereda el merge gratis.

`macrosBasis` empieza a emitirse SIEMPRE (del override o del food base), lo que cierra la mentira latente de `CATALOG_MACROS_BASIS`. Los campos nuevos del contrato TS van `.nullable().optional()` para no romper builds RN cacheadas.

### F4 — Merge en freeze y rehidratacion

`plan-persistence.ts` deja de hacer N+1 (un round-trip por alimento) y pasa a un `.in('id', foodIds)` mas un fetch de overrides del coach, con el merge del helper de F1. `plan-foods.data.ts`, el builder, las plantillas y la 4ta copia en `api/mobile/nutrition-v2/plan-templates/route.ts` aplican el mismo merge.

`snapshot_*` no cambia de schema: el merge entra **antes** del freeze, asi que day snapshot, intake y `get_nutrition_today_v2` heredan solos. Esa es la razon por la que esta feature es barata.

### F5 — Capa web

Repository → service → action, en ese orden y sin saltarse capas (`check:nutrition-v2-boundaries` lo verifica). El repository jamas recibe service-role; upsert manual select→update/insert (no `on_conflict` de PostgREST); delete con 0 filas no es error — restaurar el original ES un delete.

## Fuera de esta tanda

La UI (sheet de edicion, badge ✎ con original tachado, filtro "Editados por mi", aviso de republicar con lista de alumnos, restaurar original) es **T2.2**, tanda aparte. F1–F5 dejan el dato correcto y observable; sin UI, un override solo puede nacer por SQL — que es exactamente lo que queremos para poder QA-ear el merge sin arrastrar el riesgo de la UI.

Tampoco entran: overrides a nivel org (la columna NO se agrega ahora; seria migracion aditiva futura), retirar alimentos del catalogo (lapida `is_excluded`), y override de nombre/marca/foto/porciones.

## Limites que la UI de T2.2 debera decir en voz alta

Los planes ya publicados conservan los numeros viejos: propagarlos exige republicar. El historial del alumno es inmutable por diseño, y el snapshot de hoy no cambia. No son bugs — son la consecuencia directa de que el sistema congele macros al publicar, que es lo que hace que el historial sea confiable.

## Gates

`pnpm test` (merge puro, repository con cliente falso con forma supabase-js — leccion `db.rpc`/`this`, freeze golden `per_serving`) · typecheck web · tsc mobile · eslint · `check:nutrition-v2-boundaries` · EXPLAIN en LIVE pre-aplicacion + advisors post · QA manual con el coach josefit en preview.
