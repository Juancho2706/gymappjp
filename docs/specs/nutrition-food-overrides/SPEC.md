# SPEC — Overrides de macros por coach (`nutrition-food-overrides`)

Sub-feature de [nutrition-flows-redesign](../nutrition-flows-redesign/SPEC.md) (T2.1 datos / T2.2 UI). Estado: **aprobada por el owner el 2026-08-07, sin cambios al alcance** — en ejecucion segun el [PLAN](./PLAN.md).

## Problema

El coach no puede corregir los macros de un alimento del catalogo (global/OFF/curado) que considera errados, ni fijarle una medida casera propia. Hoy la unica salida es clonar el alimento como `coach_custom` — el repo documenta los 104 duplicados de julio como consecuencia directa. Factibilidad verificada contra codigo + DB LIVE (sesion 06-08): los macros se congelan en `snapshot_*` al publicar y de nuevo en el intake ⇒ un override solo necesita tocar **discovery** (catalogo) y **freeze** (publicacion/rehidratacion); `get_nutrition_today_v2` y el historial del alumno quedan con **CERO cambio**.

## Alcance v1 (orden owner, PLAN maestro :64)

- Override de **macros** (kcal, P, C, G, fibra) + **medida casera** (label + gramos) por `(coach, alimento)`.
- FUERA: nombre/marca/foto/porciones, overrides a nivel org (columna NO se incluye; seria migracion aditiva futura), retirar alimentos del catalogo (lapida `is_excluded`), UI (T2.2 aparte).

## Diseño DB — tabla `public.coach_food_overrides`

Molde: `exchange_group_foods` (migracion `20260804090000` — RLS FORCE, grants por columna, checks). Protocolo AGENTS: **tx-rollback + EXPLAIN en LIVE antes de aplicar, advisors despues; sin archive_gate (tabla coach-keyed); columnas user-editables CON column-level grant**.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid pk `gen_random_uuid()` | |
| `coach_id` | uuid NOT NULL → `coaches` on delete cascade | dueño; **jamas viene del payload** |
| `food_id` | uuid NOT NULL → `foods` on delete cascade | `unique (coach_id, food_id)` + indice `cfo_food_id_idx` (FK sin indice = advisor) |
| `calories, protein_g, carbs_g, fats_g, fiber_g` | numeric NOT NULL | set completo al guardar (el sheet T2.2 prellena los vigentes); merge = reemplazo total de los 5 — sin coalesce por campo. Checks sanity `>= 0 and <= 9999` |
| `macros_basis` | text NOT NULL check in (`'per_100'`,`'per_serving'`) | **GOTCHA CENTRAL — debe viajar siempre** (ver §Merge) |
| `household_label` | text null, check `char_length <= 40` | medida casera opcional |
| `household_grams` | numeric null, check `> 0` | requerido si hay label (check par) |
| `created_by` | uuid → auth.users on delete set null | |
| `created_at` / `updated_at` | timestamptz | trigger `private.nutrition_v2_set_updated_at()` |

- **Grants**: `revoke all from public, anon, authenticated` → `grant select, insert, delete` + `grant update` SOLO columnas de valor (`calories, protein_g, carbs_g, fats_g, fiber_g, macros_basis, household_label, household_grams`). Identidad (coach_id, food_id) inmutable desde la app. `grant all to service_role`.
- **RLS** (enable + FORCE), prefijo `cfo_`:
  - `cfo_select_own` — `coach_id = (select auth.uid())`
  - `cfo_select_client_coach` — alumno lee los de SU coach (espejo `egf_select_client_coach`; los RPC son definer, esta policy cubre lecturas directas/tests)
  - `cfo_insert_own` — with check `coach_id = (select auth.uid())` **y** `private.food_catalog_v2_can_read_food(food_id)` (no `food_visible_to_actor`: esa omite a proposito la rama alumno pero tambien exige coach dueño en customs — la regla correcta aca es "puedo ver el alimento")
  - `cfo_update_own`, `cfo_delete_own` (restaurar original = DELETE; 0 filas afectadas NO es error)
  - `cfo_service_role` catch-all
- Escritura v1 SIEMPRE coach-scoped (patron F2 de exchange-lists: el dueño se deriva del actor server-side).

## Merge en discovery — choke point `private.food_catalog_v2_item_json`

Firma vigente: `(p_food_id uuid)` en `20260805213958:8-44`, `sql stable security definer`. Cambio de firma ⇒ **drop de la firma vieja + create con `(p_food_id uuid, p_coach_id uuid)` en la MISMA tx** (precedente `20260728120000:38-43`; `create or replace` no admite parametros nuevos y un overload deja la resolucion ambigua). El helper esta revocado de authenticated (solo lo llaman RPCs definer) ⇒ cero llamadores externos que migrar.

- Merge: `left join coach_food_overrides o on (o.coach_id, o.food_id) = (p_coach_id, f.id)` — probe por unique, solo sobre la **pagina final** (item_json corre por fila emitida, ≤25), no en el scoring. Riesgo Micro acotado: 1 probe/fila (PLAN maestro :65). EXPLAIN antes/despues.
- JSON resultante:
  - `calories/proteinG/carbsG/fatsG/fiberG` = **mergeados** (override gana) ⇒ todo consumidor que no sabe de overrides hereda gratis.
  - `macrosBasis` = **NUEVO, emitido SIEMPRE** (del override o del food base). Hoy el JSON no lo emite y el cliente lo asume `per_100` via `CATALOG_MACROS_BASIS` (`intake-normalize.ts:86`) — mentira latente para el seed per_serving de intercambios; este cambio cierra tambien ese hueco.
  - `householdLabel`/`householdGrams` = del override si hay.
  - `hasOverride: true` + `original: { calories, proteinG, carbsG, fatsG, fiberG }` solo cuando hay override (para el badge ✎ + tachado de T2.2).
  - Contrato TS `FoodCatalogItemSchema` (`packages/nutrition-v2/catalog.ts`): campos nuevos `.nullable().optional()` — compat con builds RN cacheadas (regla ya usada para coachId/orgId).
- **4 RPC consumidoras** (todas en la misma tx, firmas publicas SIN cambio ⇒ cero cambio de clientes web/RN; el merge en RPC cubre RN y el scanner PostgREST gratis):
  - `search_food_catalog_v2`, `lookup_food_by_gtin_v2`, `get_coach_food_suggestions_v2`, **`get_food_by_id_v2`** (la 4ta — si no mergea, el detalle/scanner mostraria macros sin override).
  - Resolucion del coach **UNA vez por llamada** (leccion B1 `20260804091000:23-25` — definer pasa por encima de RLS, tenant a mano): actor coach → `auth.uid()`; actor alumno → su coach (1 lookup a `clients`); otro → NULL (sin merge). Jamas del payload.

## Merge en freeze (publicar) + rehidratacion

- `plan-persistence.ts:575-583` — **matar el N+1 real**: el loop hace 1 round-trip por alimento; pasa a UN `.in('id', foodIds)` (como ya hace `plan-foods.data.ts:76`) + UN fetch de overrides del coach (`.eq('coach_id', actor).in('food_id', foodIds)`) + merge en memoria con helper puro compartido.
- Helper puro `packages/nutrition-v2/food-overrides.ts`: merge TS espejo del SQL (patron `resolveExchangeListRows`), tipos + zod. Lo usan freeze, rehidratacion y (T2.2) la UI.
- **`macros_basis` al select y al calculo**: hoy ni `plan-persistence.ts:578` ni `plan-foods.data.ts:33` traen la columna, y `computeItemMacros` (`draft-builder.ts:1036-1053`) asume per_100 duro. Un override `per_serving` se congelaria mal ⇒ dentro de esta tarea: ambos selects + `computeItemMacros` respetan basis (espejo de `intakeEntryFactor`). Golden test per_serving obligatorio.
- Rehidratacion: `plan-foods.data.ts` (builder + plantillas) y la 4ta copia `api/mobile/nutrition-v2/plan-templates/route.ts:122` aplican el mismo merge.
- `snapshot_*`: **cero cambio de schema** — el merge entra antes del freeze; day snapshot, intake y `get_nutrition_today_v2` heredan solos.
- Limites v1 (documentar en UI T2.2): planes ya publicados conservan numeros viejos (republicar propaga — aviso con lista de alumnos); historial del alumno inmutable; el snapshot de hoy no cambia.

## Capa web (Clean Architecture)

- `infrastructure/db/coach-food-overrides.repository.ts` — molde `exchange-group-foods.repository`: jamas recibe service-role; upsert manual select→update/insert (no `on_conflict` de PostgREST); delete con 0 filas ≠ error.
- `services/nutrition-v2/coach-food-overrides.service.ts` — dueño derivado del actor; techo de autorizacion en el caller.
- `app/coach/nutrition-v2/_actions/food-overrides.actions.ts` — zod + auth + service.
- **Regen `database.types.ts`** al aplicar la migracion — cierra de paso la deuda del cast `V2ReadClient` (T1.1). Luego `check:nutrition-v2-boundaries` + `check:tokens`.

## Gates de la tanda

`pnpm test` (nuevos: merge puro, repository con cliente falso forma supabase-js — leccion db.rpc/this, freeze golden per_serving) · typecheck web · tsc mobile (contrato compartido) · eslint · boundaries · EXPLAIN en LIVE pre-aplicacion + advisors post · QA manual coach josefit en preview.

## Riesgos

1. **Basis mixto** — mitigado: basis NOT NULL en tabla, emitido siempre en JSON, respetado en freeze; golden test.
2. **Definer sin RLS** — coach resuelto server-side 1 vez, nunca payload; tenant a mano en cada rama (leccion B1).
3. **Firma del helper** — drop+create misma tx; helper revocado ⇒ sin llamadores externos.
4. **Compat RN vieja** — campos nuevos nullable/optional en zod; firmas publicas de RPC intactas.
5. **Costo Micro** — probe por unique solo en pagina final; EXPLAIN evidencia.
