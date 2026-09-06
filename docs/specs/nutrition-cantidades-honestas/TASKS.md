---
status: active
owner: product-engineering
last_verified: "2026-09-06"
canonical: false
---

# TASKS — Cantidades honestas (Nutrición V2)

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). Convención: `[ ]` pendiente · `[x]` hecha. Nada se marca verde sin ejecución
real; cada ola cierra con su sección «Gates» y la salida pegada. Modelo por tarea entre corchetes.

## W0 · Datos (HECHO en LIVE el 06-09, fuera de este tren)

- [x] W0 D6 c: 12 registros anulados, 6 corregidos por cadena, 4 ítems de planes corregidos, snapshot de Alan
      rederivado; auditoría `nutrition_v2_audit_log` con `idempotency_key like 'w0-cantidades-honestas-%'`.
- [ ] W0.2 (owner) mensajes a Alberto Piedrahita y a Jean (texto entregado el 06-09).

## SDD y mockups

- [x] S1 [Fable] SPEC + PLAN + TASKS con arquitectura «gramos como verdad, medida casera como interfaz» (§5.1).
- [x] S2 [owner] M1–M4 del artifact APROBADOS tal cual el 06-09 (con la caption de W1.2 y los huérfanos bajo su franja en RN).

## W1 · Redes de seguridad (web + RN, 1 OTA)

- [x] W1.1 [Opus] `packages/nutrition-v2/unit-change.ts` (`convertQuantityTextOnUnitChange`) · `SET_ITEM_UNIT`
      convierte (`editor-state.ts:1535`) · wizard web `draft-builder.ts` (acción que patchea `unit`) · wizard RN
      `builder/[clientId].tsx:2636` · tests `editor-state.unit-change.test.ts`, `draft-builder.test.ts`,
      `tests/mobile-nutrition-v2-builder.test.ts` (hoy 0 tests de `SET_ITEM_UNIT`).
- [x] W1.2 [Opus] caption «1 un = {servingSize} {servingUnit}» bajo el selector web
      (`_quick-edit/EditableItemRow.tsx:479`) y RN (`quick-edit/EditableItemRow.tsx:58`).
- [x] W1.3a [Opus] `packages/nutrition-v2/plausibility.ts` (D7: 600 g / 700 kcal / 1,5×; `itemResultingGrams`,
      `assessItemPlausibility`, `assessDayPlausibility`, copys) + `qeItemPlausibility` en `editor-state.ts` +
      test de tabla (`plausibility.test.ts`: 30 un huevo ⇒ grams+kcal; 6 claras 200 g ⇒ ok; «Comida libre» 600 kcal ⇒ ok;
      700,1 kcal ⇒ kcal; porción ⇒ solo kcal; día 1,49× ok / 1,51× aviso).
- [x] W1.3b [Fable] componentes `ImplausibleNotice` web (`_quick-edit/ImplausibleNotice.tsx`) y RN
      (`components/nutrition-v2/quick-edit/ImplausibleNotice.tsx`) con acciones «Cambiar a {n} g» / «Usar {label}».
- [x] W1.3c [Opus] cablear: fila del ítem (web `EditableItemRow` junto al `MacroSparkPopover`, RN ídem), aviso de día
      en `PublishBar.tsx:223` + RN `PublishBar`/`PublishConfirmSheet`, wizard `DayTotalsBar.tsx:126` + par RN.
      Avisa, no bloquea.
- [x] W1.4 [Opus] `packages/nutrition-v2/today-entries.ts` (extraer de `nutrition-today.logic.ts:505`, web re-exporta;
      `isPriorVersionEntry`, `priorVersionCalories`) · `consumedPrescriptionItemIds` solo ids vigentes (`bulk-mark.ts:43`)
      · RN `index.tsx:1681`: registros libres bajo su franja + chip «De una versión anterior del plan» + retirar por fila
      (`onVoidEntry`) + «Retirar los N» + nota bajo energía (M2) · tests `today-entries.test.ts`, caso huérfano en
      `bulk-mark.test.ts`.
- [x] W1.5 [Opus] confirmación «Lo comí» sobre umbral: RN `index.tsx:714` (`onAtePrescribed`) y web `TodayExperience.tsx`
      (handler del ítem prescrito); kcal de `item.macros`, gramos solo en g/ml.
- [x] W1.6 [Opus] PostHog `nutrition_item_implausible` (web `lib/posthog/events.ts`, RN `captureAppEvent`) con
      `platform/surface/unit/reason/kcal_bucket`, una vez por ítem y sesión; sin kcal exactas ni nombre.
- [x] W1.7 [Fable] juicio de W1 (diffs contra archivo:línea; correcciones BLOQUEA/MEJORA al mismo worker).
- [x] W1.8 Gates W1 (06-09, jefe, salida real en [TEST_STATUS](../../testing/TEST_STATUS.md)): vitest 122 archivos /
      1.841 tests · `pnpm typecheck` verde · tsc mobile verde · eslint 27 archivos web/paquete + 12 mobile sin hallazgos ·
      boundaries 430 OK · docs:check OK. Juicio del jefe: A sin BLOQUEA (3 MEJORA aplicadas: unidad de masa real en el copy,
      formateadores es-CL del paquete, copy casero con label); B sin BLOQUEA (1 MEJORA: huérfanos DENTRO de la card con chip
      en el encabezado, un solo refetch en «Retirar los N»); `ImplausibleNotice` web movido a `components/nutrition-v2/` para
      que el wizard no importe desde `_quick-edit`. Docs: CURRENT #13, MOBILE_PARITY (bloque 06-09), TEST_STATUS.
- [ ] W1.9 [owner] OK para push + deploy + OTA 1.1.2 (android + ios) de W1.

## W2 · Medida casera de verdad («2 huevos (122 g)»)

- [x] W2.0 [Opus] auditoría de solo lectura de las rutas SQL y TS que interpretan `unit`: [informe](AUDIT-W2.0-unit-paths.md).
      Veredicto: «cero cambio de fórmula» se sostiene; el CHECK `unit <> 'casera'` es el cierre real. Resoluciones del
      jefe en SPEC §5.7 (R1 `macroBase`, R3 W4.1 solo hoy, R4/R5 override gana + rango en `coach_food_overrides`, R10
      memoria de cantidad en gramos). **Pre-checks en LIVE 06-09 (solo SELECT, jefe):** Q1/Q1b 0 filas fuera de
      [1, 1000] en `foods` y `coach_food_overrides` · Q2/Q2b 0 ítems y 0 registros con `casera` · Q3 275 alimentos con
      par completo, 0 pares rotos, 4.384 sin medida; 45 de los 179 alimentos usados en planes vigentes tienen par ·
      Q4 solo 4 de los 30 alimentos `serving_unit = 'un'` tienen medida (pan pita/pita integral EVA: `per_100`,
      porción 60 g, sin medida ⇒ «60 un» = 3,6 kg) · Q5 candidatos al badge (publicados, > 30 %): coach `7b2914a1`
      26 ítems / 13 versiones / 11 alumnos y coach `baa4f2a1` 4 ítems / 1 alumno.
- [ ] W2.1 [Opus C] `HOUSEHOLD_UNIT`, `foodUnitOptions(food)` con labels («huevo · 61 g»), `defaultCatalogUnit` nuevo;
      `BuilderFood` += `householdGrams/householdLabel` (paquete; RN re-exporta el tipo) en `food-catalog-mapping.ts:13`,
      `nutrition-v2-builder.ts:1669`, `plan-persistence.ts:213` (`FREEZE_FOOD_SELECT`/`toBuilderFood`); selector web
      (`<select>` con opción vigente si falta) y RN (`UnitToggle` con label) en editor y wizards; buscador/scanner del alumno
      web + RN (convertir a gramos al enviar); comentario de `food-catalog-card.ts:137`. Tests `intake-units.test.ts`.
- [ ] W2.2 [Opus C] `computeItemMacros` rama `casera` (paquete; RN `nutrition-v2-builder.ts:1097` re-exporta), conversión
      con `casera` en `unit-change.ts`, contrato `contracts.ts:82/102` (+ `householdLabel/householdGrams`), `QeItem` modo
      casera + rehidratación, `buildItemInsertRow` (`plan-draft-rows.ts`) ⇒ g/ml + columnas; error de borrador si falta
      medida. Extender `draft-builder.macros-basis.test.ts:63` (byte-idéntico se mantiene) + `editor-food.test.ts`.
- [ ] W2.2b [Opus D] migración `nutrition_v2_household_units` (SPEC §5.4): columnas + CHECKs (`not valid`/`validate`,
      pre-check de solo lectura en LIVE) + `persist_and_publish` + `build_prescription_snapshot` + `get_nutrition_plan_read_v2`
      + `nutrition_v2_intake_item_json` emitiendo el par; schemas de read models `.nullable().optional()`; test
      `supabase/tests/nutrition_v2_household_units_rollback.sql`; `database.types.ts` (tras aplicar).
- [ ] W2.3 [Sonnet E] `quantity-format.ts` (`formatItemQuantity`, `formatHouseholdCount` exportado desde
      `nutrition-engine/micros.ts:95`) + reemplazo en las 16 superficies: `packages/nutrition-v2/design.ts` ·
      web `components/nutrition-v2/NutritionV2Kit.tsx`, `coach/nutrition-v2/_data/last-quantity.data.ts`,
      `c/[coach_slug]/nutrition/_components/ShoppingListView.tsx`, `c/[coach_slug]/nutrition-v2/_components/{nutrition-today.logic,TodayExperience,PlanVariantCard,NutritionFoodRow}.tsx` ·
      RN `lib/{nutrition-v2-last-quantity,nutrition-v2-intake,nutrition-shopping.api,coach-nutrition-detail-logic}.ts`,
      `components/nutrition-v2/NutritionV2Kit.tsx`, `components/alumno/nutrition/ShoppingList.tsx`,
      `app/coach/nutrition-v2/[clientId].tsx`, `app/alumno/(tabs)/nutrition-v2/index.tsx`. Test `quantity-format.test.ts`.
- [ ] W2.4 [Sonnet F] `scripts/nutrition-household/backfill-usda-household.mjs` (SQL idempotente + CSV, sin aplicar) y
      `suggest-eva-household.mjs` (CSV); README corto en `scripts/nutrition-household/`; nota en
      `docs/operations/FOOD_CATALOG_CL_IMPORT.md`.
- [ ] W2.5 [Opus C + Fable] badge «Revisar unidad» (web/RN `EditableItemRow`, `ItemBadge` tone warning) con tooltip y
      «Usar {label}»; query de los 64 ítems en `docs/audits/cantidades-honestas-revisar-unidad-2026-09.md`; texto del
      aviso por coach (abajo, lo manda el owner).
- [ ] W2.6 [Fable] juicio de W2.
- [ ] W2.7 Gates W2 (PLAN) + ROLLBACK en LIVE del test SQL + `EXPLAIN` de las lecturas tocadas. Commit. Docs.
- [ ] W2.8 [owner] OK para aplicar migración + push + deploy + OTA. Aplicar en LIVE **después** del deploy y **antes** de la OTA.

Texto del aviso único a los coaches con ítems «un» sobre alimentos de 100 g (W2.5, lo manda el owner):
«Hola {nombre}. En EVA, «1 un» de un alimento del catálogo vale una porción de 100 g, salvo que el alimento sea por
unidad (huevo, pan pita…). Desde hoy el editor te ofrece la medida casera real («huevo · 61 g») y te marca con
«Revisar unidad» los ítems donde «un» puede no ser lo que querías. Nada cambia solo: revisá los marcados y, si
corresponde, tocá «Usar huevos». Cualquier duda, escribime.»

## W3 · Republicar sin fantasmas

- [ ] W3.1a [Opus G] migración `nutrition_v2_item_lineage` (columna + FK + índice) · `private.nutrition_v2_item_alias_map`
      · `persist_and_publish` acepta `source_item_id` del mismo plan · `get_nutrition_today_v2` (+ `history_detail` si
      emite `intakeItems`) resuelve `prescriptionItemId` y emite `originalPrescriptionItemId` · test
      `supabase/tests/nutrition_v2_item_lineage_rollback.sql` · schema `NutritionIntakeReadItemSchema`.
- [ ] W3.1b [Opus H] `QeItem.sourceItemId` (hidratación; se anula en `SET_ITEM_QUANTITY`, `STEP_ITEM_QUANTITY`,
      `SET_ITEM_UNIT`, `SWAP_ITEM_FOOD`, `SET_ITEM_NAME`, mover de franja) · contrato del borrador · `buildItemInsertRow`
      ⇒ `source_item_id` · `plan-persistence.ts:489` conserva `randomUUID` para el id nuevo · tests `editor-state.lineage.test.ts`
      + caso resuelto en `bulk-mark.test.ts`.
- [ ] W3.2a [Opus H] `effectiveFromChoice` en `quick-edit.actions.ts:249` y en la op `quick-edit` de
      `api/mobile/nutrition-v2/coach/mutate/route.ts` (zod, default `today`; servidor calcula `hoy + 1` en la tz del alumno);
      `publishQuickEditRN` lo pasa; `todayEntryCount` desde el detail a `QuickEditMode` web/RN; tests de la action y de la ruta.
- [ ] W3.2b [Fable] diálogo M3 web (`_quick-edit/PublishTodayDialog.tsx`) y paso en `PublishConfirmSheet` RN.
- [ ] W3.2c [Opus H] cablear diálogo ⇒ `effectiveFromChoice`.
- [ ] W3.3 [Opus H, extra] chip «Tu plan cambió hoy» en Hoy web/RN (`plan.effectiveFrom === hoy && versionNumber > 1`).
- [ ] W3.4 [Fable] juicio de W3.
- [ ] W3.5 Gates W3 + ROLLBACK en LIVE + `EXPLAIN` de `get_nutrition_today_v2` con alias (loops=1 en la CTE). Commit. Docs.
- [ ] W3.6 [owner] OK para aplicar migración + push + deploy + OTA.

## W4 · El coach ve y corrige

- [ ] W4.1a [Opus I] acciones server `_actions/coach-intake.actions.ts` (`voidIntakeAsCoach`, `correctIntakeQuantityAsCoach`
      sobre `void_nutrition_intake_v2` / `correct_nutrition_intake_v2`, verificar firma y autorización del coach en LIVE
      de solo lectura) · ops `void-intake` / `correct-intake` en la API móvil · verificación de que `history-detail`
      emite `intakeItems` (si no, solo hoy) · tests de action y ruta.
- [ ] W4.1b [Fable] panel M4 web (`SelectedDayPanel.tsx:169`: filas + Retirar + Editar cantidad + chip «N× la meta») y
      lista + hoja RN (`app/coach/nutrition-v2/[clientId].tsx`).
- [ ] W4.1c [Opus I] cablear panel ⇒ acciones; `revalidatePath`; RN refetch.
- [ ] W4.2 [Opus I] `packages/nutrition-v2/coach-alerts.ts` (`deriveNutritionV2Alerts`) consumido por
      `apps/web/src/lib/nutrition-coach-alerts.ts:40` (+ `client-detail.service.ts`) y RN `nutrition-coach-alerts.ts` /
      `NutricionTab.tsx`; tests en `nutrition-coach-alerts.test.ts` y `coach-alerts.test.ts`.
- [ ] W4.3 [Opus I] migración `foods_density_review` (columna + trigger, no bloquea, no toca filas existentes) + test
      `supabase/tests/foods_density_review_rollback.sql` + consulta de candidatos en RUNBOOK.
- [ ] W4.4 [Fable] juicio de W4.
- [ ] W4.5 Gates W4 + ROLLBACK en LIVE. Commit. Docs.
- [ ] W4.6 [owner] OK para aplicar migración + push + deploy + OTA.

## Cierre del tren

- [ ] C1 Docs finales: CURRENT (4 líneas), MOBILE_PARITY (bloque «Cantidades honestas»), TEST_STATUS (tests y SQL),
      RUNBOOK (migraciones, consulta de densidad, backfill de catálogo), `docs/README.md` si suma la spec.
- [ ] C2 E2E `pnpm qa:prod:suave` (solo al cierre, con OK del owner).
- [ ] C3 Resumen al owner: qué arregla cada ola, gates reales, migraciones listas (sin aplicar), checklist de QA en device.
- [ ] C4 Memoria del proyecto actualizada (`project_nutricion_cantidades_honestas_20260906.md`).

## Checklist de QA en device (se completa al cierre)

1. Editor RN/web: 30 g → un convierte a 0,3; un → g convierte; caption «1 un = 100 g».
2. Editor: «Huevo revuelto 30 un» muestra el aviso ámbar; «Cambiar a 30 g» y «Usar huevos» hacen lo dicho; publicar sigue en un tap.
3. Hoy del alumno RN: registros de una versión anterior visibles bajo su franja con chip y retirar; «Comí toda esta comida» vuelve a aparecer.
4. «Lo comí» sobre un ítem > 700 kcal pide confirmación.
5. Selector: alimento de 100 g con medida ⇒ «g · huevo · 61 g»; nativo por unidad ⇒ «g · un»; sin medida ⇒ solo g/ml.
6. «2 huevos (122 g)» en Hoy, Plan, ficha del coach, lista de compras, reemplazos.
7. Republicar sin cambiar un ítem conserva «Registrado»; diálogo «Aplicar hoy / desde mañana» solo si hay registros hoy.
8. Ficha del coach: registros del día con Retirar/Editar; alerta «más de 2× su meta».
