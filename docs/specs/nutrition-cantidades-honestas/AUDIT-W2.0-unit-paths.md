---
status: active
owner: product-engineering
last_verified: "2026-09-06"
canonical: false
---

# AUDIT W2.0 — Rutas que interpretan `unit`/`quantity` (Nutrición V2)

> Auditoría de solo lectura contra el worktree `nutrition-cantidades-honestas` (base `19d1ffb0`, con W1
> en vuelo: `packages/nutrition-v2/{plausibility,unit-change}.ts` y los `ImplausibleNotice`/`PublishToday*`
> sin commitear). Objetivo: confirmar o refutar «cero cambio de fórmula» con la arquitectura de
> [SPEC §5.1](SPEC.md) (gramos como verdad, medida casera como interfaz) y listar exactamente qué tocar en W2.
>
> Convención de la tabla: **«hoy»** = ítem con `unit ∈ {g, ml, un, porción}`. **«+ par»** = el mismo ítem con
> `household_label`/`household_grams` congelados. **«si `casera` se filtra»** = qué pasaría si `unit = 'casera'`
> llegara a esa ruta.

## 1. Tabla de rutas

### 1.a · Ítem prescrito (SQL)

| # | Ruta · archivo:línea | Qué hace con `unit`/`quantity` | Con g/ml + par | Si `casera` se filtra |
|---|---|---|---|---|
| A1 | `private.nutrition_v2_build_prescription_snapshot` · `supabase/migrations/20260718140000_nutrition_portions_v2.sql:559-560` | Passthrough `pi.quantity`, `pi.unit`; macros = `pi.snapshot_*` congelados (no recalcula nada) | **Idéntico**. Solo hay que **agregar** las dos claves al JSON | Emite `"unit":"casera"` al snapshot del día → contamina Today (ver A3) |
| A2 | `public.get_nutrition_plan_read_v2` · `20260902220850_nutrition_v2_plan_read_substitutions.sql:140-141` | Passthrough `pi.quantity`/`pi.unit`; macros de `snapshot_*` | **Idéntico**; agregar las dos claves | Passthrough del literal; el cliente lo pinta «2 casera» |
| A3 | `public.get_nutrition_today_v2` · `20260720120000_nutrition_v2_item_media_read_models.sql:402-412` | Copia **verbatim** cada ítem del snapshot congelado (`v_snapshot.prescription_snapshot`) y le adjunta `media`/`category` | **Idéntico** (el par viaja gratis si A1 lo emite) | Hereda A1; además el «Lo comí» del alumno explota en Zod (ver D2) |
| A4 | `public.persist_and_publish_nutrition_plan_v2` · `20260728140000_nutrition_v2_persist_and_publish_transactional.sql:425-426` | Inserta `quantity`/`unit` **verbatim** del JSON del ítem; **no** recalcula macros (confía en `snapshot_calories` del cliente) | **Idéntico**; agregar `household_label`/`household_grams` a la lista de columnas | **Persiste `casera` sin error** — hoy nada lo impide |
| A5 | Tabla `public.nutrition_prescription_items_v2` · `20260714190000_nutrition_v2_domain.sql:124` | `unit text not null check (char_length(btrim(unit)) between 1 and 32)` | Sin cambio | **Acepta `'casera'`** ⇒ **por eso el CHECK `unit <> 'casera'` de SPEC §5.4** |

### 1.b · Ítem prescrito (TS)

| # | Ruta · archivo:línea | Qué hace | Con g/ml + par | Si `casera` se filtra |
|---|---|---|---|---|
| B1 | `computeItemMacros` · `packages/nutrition-v2/editor-food.ts:96-128` | `per_serving` ⇒ `intakeEntryFactor`; resto ⇒ `calculateFoodItemMacros` + fibra aparte | **Byte-idéntico** (`quantity/100`) | **MAL**: cae en la rama contable ⇒ `qty × servingSize / 100`. Con 2 «casera» y `servingSize = 100` ⇒ 2× el alimento entero |
| B2 | Copia RN · `apps/mobile/lib/nutrition-v2-builder.ts:1097-1128` | Espejo 1:1 de B1 | Idéntico | Idéntico a B1 |
| B3 | `calculateFoodItemMacros` · `packages/nutrition-engine/macros.ts:120-135` | `isDirectProportion = g|ml` ⇒ `qty/100`; **else** ⇒ `qty × serving_size / 100` | Byte-idéntico | **MAL** (la rama `else` es el atajo contable; es la línea que la SPEC cita en §1) |
| B4 | `intakeEntryFactor` · `packages/nutrition-v2/intake-normalize.ts:112-135` | Espejo byte a byte del factor SQL, tres regímenes | Byte-idéntico | **MAL**: `casera` no es `g/ml` ni `porción` ⇒ rama contable en `per_100`, y `= quantity` en `per_serving` |
| B5 | `buildItemInsertRow` · `apps/web/src/app/coach/nutrition-v2/_lib/plan-draft-rows.ts:69-104` | Congela macros con B1 y escribe `quantity`/`unit` del draft **tal cual** | Idéntico | Escribe `casera` en la fila (bloqueado solo por A5 tras W2) |
| B6 | `NutritionPrescriptionItemSchema` · `packages/nutrition-v2/contracts.ts:94-102` | `unit: z.string().trim().min(1).max(32)` — **permisivo** | Idéntico | **Acepta `casera`** (a propósito: es el borrador) |
| B7 | `qeItemMacros` · `packages/nutrition-v2/editor-state.ts:1981-1988` | Con `item.food` ⇒ B1; sin él ⇒ `scaleMacros(macroBase, qty / macroBase.quantity)` | Idéntico | Con `food` ⇒ MAL vía B1. **Sin `food` (ítem hidratado) ⇒ ver §2, trampa `macroBase`** |
| B8 | `projectItem` · `editor-state.ts:2651-2683` | Proyecta `unit: item.unit` verbatim al draft | Idéntico | Manda `casera` al contrato y al servidor |
| B9 | `hydrateItem` · `editor-state.ts:376-...` | `quantity: String(item.quantity)`, `unit: item.unit`, `food: null`, `macroBase = { quantity: item.quantity, macros }` | Idéntico | n/a (viene de la DB) |
| B10 | `quantityStep` · `editor-state.ts:982-984` | `unit === 'un' ? 0.5 : 5` | Idéntico | **Paso 5** en modo casera (debería ser 0,5) |
| B11 | `normalizeBuilderUnit` · `editor-state.ts:1526-1530` + `createCatalogItem:1083-1106` | Unidad inicial del ítem nuevo = `servingUnit` normalizado; cantidad = `servingSize` | Idéntico | n/a (nunca devuelve `casera` hoy) |
| B12 | `BUILDER_UNITS` · `editor-food.ts:134` + copia RN `nutrition-v2-builder.ts:49` | `['g','ml','un']` — dominio del selector del coach | Idéntico | n/a |
| B13 | Wizard web `draft-builder.ts:668-676` / RN `builder/[clientId].tsx:2640-2650` | W1.1 ya convierte con `convertQuantityTextOnUnitChange` | Idéntico | `convertIntakeQuantity` devuelve `null` para `casera` ⇒ **conserva el número** (comportamiento seguro, pero incorrecto para el caso casera) |
| B14 | `swapOptionAllowedUnits` / `coerceSwapOptionUnit` · `packages/nutrition-engine/macros.ts:64-77` | **Solo V1** (`food_items.swap_options`). Coerce a `g`/`ml` lo desconocido | No aplica (V1) | Degrada a `g` con el número crudo (no lo alcanza el tren) |

### 1.c · Registro de consumo (SQL + TS)

| # | Ruta · archivo:línea | Qué hace | Con g/ml + par | Si `casera` se filtra |
|---|---|---|---|---|
| C1 | `private.nutrition_v2_entry_factor` (4 args) · `20260728120000_nutrition_v2_macros_basis.sql:110-147` | `per_100`: g/ml ⇒ `qty/100`, porción ⇒ `qty`, **else ⇒ `qty×serving/100`**; `per_serving`: g/ml ⇒ `qty/serving`, else ⇒ `qty`; `null` ⇒ histórica | **Idéntico** (W2 nunca persiste `casera` en `nutrition_intake_entries`) | **MAL**: rama contable |
| C2 | `private.nutrition_v2_intake_item_json` · `20260728120000:159-219` (`quantity`/`unit` en `:171-172`, factor en `:200-204`) | Emite `quantity`/`unit` crudos + `totals` = `snapshot_* × entry_factor(...)` | **Idéntico**. Es el punto donde W2 debe **joinear al ítem prescrito** para emitir el par | Hereda C1 |
| C3 | `private.nutrition_v2_intake_totals` · `20260728120000:221-244` | Σ `snapshot_* × entry_factor(...)` del día | Idéntico | Hereda C1 |
| C4 | `public.record_nutrition_intake_v2` · `20260809230833_nutrition_v2_substitution_write_guard.sql:103-...` (validación `:153-154`, insert `:301-302`) | `char_length(btrim(p_unit)) between 1 and 32`; persiste `btrim(p_unit)` | Idéntico | **Aceptaría `casera`** en la BD — pero el contrato Zod lo bloquea antes (D2) |
| C5 | `public.correct_nutrition_intake_v2` · `20260809230833:363-...` (guard `:441-451`) | `p_check_quantity = source ≠ 'substitution' and p_quantity is distinct from v_original.quantity`; delega en C4 con 16 args (el basis viaja en el snapshot) | Idéntico | Idem C4 |
| C6 | `private.nutrition_v2_assert_intake_permission` · `20260728130000_nutrition_v2_student_permissions_guard.sql:221-235` | `abs(p_quantity − pi.quantity) / pi.quantity > quantityAdjustmentPercent` — **ciego a la unidad** | **MEJORA**: prescrito y registrado quedan ambos en gramos ⇒ el % por fin compara peras con peras | Compararía 2 (casera) contra 122 (g) ⇒ falso positivo |
| C7 | `public.void_nutrition_intake_v2` · `20260728130500_nutrition_v2_void_intake.sql` | No lee `unit` ni `quantity` (marca `voided`) | Idéntico | Sin efecto |
| C8 | Cobertura de porciones **derivadas** · `20260720120000:263-286` y `:304-320` | `Σ e.quantity / f.exchange_portion_grams` **solo si `lower(e.unit) in ('g','ml')`** | **Cambia a favor**: un registro casera→gramos ahora sí aporta cobertura (antes, en `un`, no aportaba). No hay regresión: `casera` es una opción nueva | No aportaría (no es g/ml) |
| C9 | `computePortionCoverage` · `packages/nutrition-v2/read-models.ts:756-800` | Espejo TS de C8 vía `quantityGrams` | Idéntico | Idem |
| C10 | `prescribedSnapshotMacros` · `intake-normalize.ts:60-72` | macros **por unidad prescrita** + `servingSize = 1` ⇒ el factor vale `quantity` en los tres regímenes | **Byte-idéntico**: con 2 `un` ⇒ (m/2)×2; con 122 `g` ⇒ (m/122)×122. **Este es el pilar de «cero cambio»** | n/a (el `unit` sale del ítem persistido) |
| C11 | `scaleSnapshotMacros` · `intake-normalize.ts:168-197` | `snapshot × intakeEntryFactor` | Idéntico | Hereda B4 |
| C12 | `share.ts:113` (`packages/nutrition-v2`) | `• {name} — {qty} {unit}` de los **registros** | Muestra «122 g» (sin par: el registro libre no lo congela) | — |

### 1.d · Reemplazo autorizado

| # | Ruta · archivo:línea | Qué hace | Con g/ml + par | Si `casera` se filtra |
|---|---|---|---|---|
| E1 | `public.get_nutrition_substitution_options_v2` · `20260809222811_nutrition_v2_substitution_options.sql:108,124-125,135-136` | Passthrough de `pi.quantity`/`pi.unit` (ítem) y `s.quantity`/`s.unit` (reemplazo) | Idéntico | Passthrough |
| E2 | `private.nutrition_v2_assert_substitution_authorized` · `20260809230833:58-93` | Solo `food_id` / `custom_name`. **No lee `unit` ni `quantity`** | Idéntico | Sin efecto |
| E3 | `computeSubstitutionEquivalence` · `packages/nutrition-v2/substitution-intake.ts:242-308` | La unidad de salida es **siempre** `substituteNaturalUnit(substitute)` = `normalizeIntakeUnit(servingUnit) ?? 'g'`. **`item.unit` nunca entra al cálculo** (solo `item.calories`) | **Idéntico**: `snapshot_calories` del ítem no cambia con W2 | Inmune (`casera` jamás sale de acá) |
| E4 | `substituteNaturalUnit` / `roundSubstitutionQuantity` / `SUBSTITUTION_MAX_*` · `substitution-intake.ts:141-170, 41-42` | Escalón y tope por unidad (`600` masa / `6` contable) | Idéntico | n/a |
| E5 | `substitution-intake.service.ts:216-223` + RN `index.tsx:1256` | Arman el registro con `equivalence.quantity`/`equivalence.unit` | Idéntico | Inmune |
| E6 | `buildItemSubstitutionInsertRow` · `plan-draft-rows.ts:131-140` | `refUnit = sub.unit ?? food.servingUnit` | Idéntico | Solo si el coach escribiera `casera` en un reemplazo — **W2 no debe ofrecerlo ahí** |

### 1.e · Registro libre del alumno

| # | Ruta · archivo:línea | Qué hace | Con g/ml + par | Si `casera` se filtra |
|---|---|---|---|---|
| D1 | `catalogUnitOptions` / `defaultCatalogUnit` · `packages/nutrition-v2/intake-units.ts:125-139` | `['g'|'ml', 'un']` según `servingUnit` | Idéntico | n/a |
| D2 | `NutritionIntakeUnitSchema` · `contracts.ts:40-47` (`normalizeIntakeUnit`, `intake-units.ts:101-106`) | Whitelist dura: `g/ml/un/porción` + sinónimos. **`normalizeIntakeUnit('casera') === null`** | Idéntico | **RECHAZA**. Es la barrera que obliga a convertir en cliente (SPEC §5.3) |
| D3 | `buildRecordIntakeMutation` · `apps/mobile/lib/nutrition-v2-intake.ts:196-222` | `NutritionIntakeMutationSchema.parse(...)` | Idéntico | Lanza (D2) |
| D4 | `buildCatalogIntakePayload` · `apps/web/.../nutrition-today.logic.ts:288-...` | Idem, con `macrosBasis: 'per_100'` | Idéntico | Lanza (D2) |
| D5 | `estimateCatalogIntakeTotals` · `nutrition-today.logic.ts:269-281` | `scaleSnapshotMacros(food, { unit: normalizeIntakeUnit(unit) ?? unit, basis: 'per_100' })` | Idéntico | **MAL en el preview**: `?? unit` deja pasar `'casera'` a B4 ⇒ rama contable. El total mostrado mentiría antes de que D2 rechace |
| D6 | Buscador web · `TodayExperience.tsx:1888,1892,1908,1924` | `defaultCatalogUnit` + `catalogUnitOptions` + `convertIntakeQuantity` + preview D5 | Idéntico | Ver D5 |
| D7 | Scanner web · `FoodScannerClient.tsx:457,464,472,488` | Idem | Idéntico | Ver D5 |
| D8 | Buscador RN · `add-food-v2.tsx:283,361,407` + `nutrition-v2-add-food.logic.ts:45` | Idem | Idéntico | Ver D5 |
| D9 | Scanner RN · `scanner.tsx:647,661` + `nutrition-v2-scanner.logic.ts:98,119` | Idem | Idéntico | Ver D5 |
| D10 | «Lo comí» prescrito · `nutrition-today.logic.ts:235-260` y `nutrition-v2-intake.ts:286-310` | `unit: item.unit` del read model + `prescribedSnapshotMacros` | **Byte-idéntico** (C10) | El alumno **no podría registrar** (D2 lanza) |

### 1.f · Colaterales que leen `unit` y no son ninguna de las 4 categorías

| # | Ruta · archivo:línea | Riesgo con `casera` |
|---|---|---|
| F1 | `public.coach_food_last_qty` · `20260813034721_coach_food_last_qty.sql:57` — `check (unit in ('g','ml','un'))`; RPC `coach_food_last_qty_remember` · `20260813040921:39` — `if p_unit not in ('g','ml','un') then return; end if` | **Degrada en silencio**: con `casera` la memoria de «última cantidad» deja de guardarse (el RPC hace `return`, el action web traga el error). No rompe, pero el coach pierde la comodidad justo en el modo nuevo |
| F2 | `qeCoachFoodBlock` · `editor-state.ts:2175-2176` — exige `unit ∈ {g, ml}` para «Guardar en mi catálogo» | Bajo: solo aplica a ítems `isCustom`, que nunca tienen medida casera |
| F3 | `nutrition_recipe_ingredients_unit_check` · `20260714080500:88` — `unit in ('g','ml','un')` | Sin efecto: W2 no toca recetas |
| F4 | `nutrition-day-export.ts:300`, `shopping.*`, `MealIngredientRow.tsx:40`, `nutrition-coach-alerts.ts` | **V1**: `food_items`/`nutrition_meals`. Fuera del alcance del par casero |

---

## 2. Veredicto

**Se sostiene.** Ninguna fórmula existente cambia de resultado con la arquitectura de SPEC §5.1, y hay
archivo:línea para las tres razones:

1. **SQL prescrito = passthrough puro.** `build_prescription_snapshot` (`20260718140000:559-560`),
   `get_nutrition_plan_read_v2` (`20260902220850:140-141`) y `persist_and_publish` (`20260728140000:425-426`)
   copian `quantity`/`unit` sin interpretarlos, y `get_nutrition_today_v2` (`20260720120000:402-412`) copia el
   ítem del snapshot congelado. Los macros son `snapshot_*` precalculados en Next (`plan-draft-rows.ts:80`);
   la RPC **no** recalcula. Persistir `122 g` en vez de `2 un` no atraviesa ninguna rama distinta.
2. **El intake no distingue unidades en el camino prescrito.** `prescribedSnapshotMacros`
   (`intake-normalize.ts:60-72`) manda macros **por unidad** con `servingSize = 1`, y con eso
   `nutrition_v2_entry_factor` vale exactamente `quantity` en sus tres regímenes
   (`20260728120000:121-146`, espejo `intake-normalize.ts:123-134`). `(m/2)×2 === (m/122)×122`.
3. **El reemplazo ignora la unidad del ítem.** `computeSubstitutionEquivalence`
   (`substitution-intake.ts:242-308`) solo usa `item.calories` y devuelve siempre la unidad natural del
   sustituto (`:141-144`). Y `nutrition_v2_assert_substitution_authorized` (`20260809230833:58-93`) valida por
   `food_id`, no por unidad.

**Y `casera` sí rompería si se filtrara.** `nutrition_prescription_items_v2.unit` solo tiene
`char_length between 1 and 32` (`20260714190000:124`) y `persist_and_publish` inserta el literal sin whitelist
(`20260728140000:426`). Con `casera` en la fila: `computeItemMacros` (`editor-food.ts:96-128`),
`calculateFoodItemMacros` (`macros.ts:120-135`) e `intakeEntryFactor` (`intake-normalize.ts:112-135`) caen en la
**rama contable** `qty × servingSize / 100`, y encima el alumno **no podría registrar** ese ítem porque
`NutritionIntakeUnitSchema` (`contracts.ts:40-47`) rechaza `casera` en «Lo comí» (`nutrition-v2-intake.ts:309`).
**El CHECK `unit <> 'casera'` de SPEC §5.4 no es cinturón: es el único cierre real.**

### Dónde el par `household_*` NO llega (la UI no puede rotular «2 huevos (122 g)»)

| Superficie | Por qué | Severidad |
|---|---|---|
| **Registro libre del alumno** (`nutrition_v2_intake_item_json`, `20260728120000:159-219`) | La entry no tiene `prescription_item_id` ⇒ el join de SPEC §5.3 no resuelve. **Limitación declarada en la SPEC**; el registro libre solo puede rotular «122 g» | Aceptada |
| **Snapshots de día ya materializados** (`nutrition_v2_rederive_day_snapshot`, `20260716230000:84-103`) | Solo se recalcula el día **corriente** tras una publicación; los días pasados son inmutables. Un plan publicado antes de W2 no gana el par hasta la próxima publicación | Media (cosmética) |
| **Historial V2** (`NutritionHistoryDaySchema`, `read-models.ts:368-392`) | **No emite `intakeItems` en absoluto**: solo agregados (`consumed`, `activeEntryCount`, `legacy*`). Ni par ni cantidad por ítem | **Alta para W4.1**: la edición de días pasados de SPEC §7.1 **no tiene datos**; queda solo «hoy» |
| **`get_nutrition_legacy_history_detail_v2`** (`20260801023414:340-440`) | Adaptador **V1** (`food_items`, `nutrition_meal_food_swaps`). Nunca tendrá par | No aplica |
| **Share del día V2** (`packages/nutrition-v2/share.ts:113`) | Lista **registros**, no ítems prescritos ⇒ mismo límite que el registro libre | Baja |
| **Exportar día / lista de compras** (`apps/mobile/lib/nutrition-day-export.ts:300`, `shopping.queries.ts`, `ShoppingListView.tsx:62`) | **V1** (`food_items`/`nutrition_meals`) | No aplica |
| **Hub del coach** (`NutritionCoachHubItemSchema`, `read-models.ts:488-517`) | Solo agregados | No aplica |
| **Ficha del alumno, `foodCatalogItemToDetail`** (`food-catalog-card.ts:137,157-158`) | Hardcodea `householdGrams: null` con un comentario **desactualizado** («no viajan en el read model»); el catálogo **sí** los emite (`catalog.ts:101-102`, SQL `20260807223000:81-88`) | Baja (fix de una línea) |

---

## 3. Lista exacta de cambios para W2

### (a) SQL aditivo — una sola migración `2026090XHHMMSS_nutrition_v2_household_units.sql`

| # | Archivo:línea de referencia | Qué agregar |
|---|---|---|
| a1 | tabla `nutrition_prescription_items_v2` (`20260714190000:124`) | `add column if not exists household_label text`, `household_grams numeric` + CHECK `household_grams is null or household_grams between 1 and 1000` + CHECK `(household_label is null) = (household_grams is null)` |
| a2 | misma tabla | CHECK `unit <> 'casera'` (`not valid` + `validate`; pre-check §5 Q2 = 0 filas) |
| a3 | `public.foods` (`20260618180000:13-14`) | `add constraint foods_household_grams_range check (household_grams is null or household_grams between 1 and 1000) not valid` + `validate` (pre-check §5 Q1) |
| a4 | `persist_and_publish_nutrition_plan_v2` · `20260728140000:396-441` | `create or replace`: agregar `household_label`, `household_grams` a la lista de columnas y `v_item ->> 'household_label'`, `nullif(v_item ->> 'household_grams','')::numeric` a los `values`. **Cuerpo idéntico en todo lo demás** |
| a5 | `nutrition_v2_build_prescription_snapshot` · `20260718140000:553-573` | `create or replace`: agregar `'householdLabel', pi.household_label, 'householdGrams', pi.household_grams` al `jsonb_build_object` del ítem |
| a6 | `get_nutrition_plan_read_v2` · `20260902220850:134-157` | `create or replace`: mismas dos claves en `prescriptionItems` |
| a7 | `private.nutrition_v2_intake_item_json` · `20260728120000:159-219` | `create or replace`: agregar (null-safe, `left join` por `p_entry.prescription_item_id`) `householdLabel`/`householdGrams`. **Sin tocar el bloque `totals`** (`:199-205`) ni las claves condicionales de porciones (`:212-219`) |
| a8 | — | Regenerar `apps/web/src/lib/database.types.ts`. **Sin GRANT nuevo** (escribe la RPC; `foods`/items tienen grants a nivel de tabla) |
| a9 | — | Test `supabase/tests/nutrition_v2_household_units_rollback.sql` con los 4 casos de SPEC §5.4, terminando en `ROLLBACK` |
| a10 | **decisión pendiente** · `coach_food_last_qty` (`20260813034721:57`) + RPC (`20260813040921:39`) | O se amplía el dominio a `'casera'` (⇒ además hay que guardar los gramos, o la memoria es ambigua), o se documenta que en modo casera no hay memoria de cantidad. **Recomendación: no ampliar** — la memoria vive en gramos; al recordar en casera, convertir a `g` antes de llamar al RPC |

### (b) TS de modelo

| # | Archivo:línea | Qué agregar |
|---|---|---|
| b1 | `packages/nutrition-v2/editor-food.ts:17-44` (`BuilderFood`) | `householdGrams: number \| null`, `householdLabel: string \| null` |
| b2 | `apps/mobile/lib/nutrition-v2-builder.ts:52-76` | Re-exportar el tipo del paquete (dejar de duplicar `BuilderFood`) |
| b3 | `packages/nutrition-v2/editor-food.ts:96-128` (`computeItemMacros`) | Rama al inicio: `unit === HOUSEHOLD_UNIT` ⇒ recursión con `(quantity × food.householdGrams, isLiquid ? 'ml' : 'g')`. Sin household ⇒ `ZERO_MACROS` + error de validación del borrador. **Definir explícitamente el caso `macrosBasis === 'per_serving'`**: la recursión debe entrar por la rama `per_serving` con gramos (`qty×hg / servingSize`), nunca por `= quantity` |
| b4 | `apps/mobile/lib/nutrition-v2-builder.ts:1097-1128` | Re-exportar `computeItemMacros` del paquete (SPEC §4.3 lo pide una sola vez) |
| b5 | `packages/nutrition-v2/editor-food.ts:134` + `apps/mobile/lib/nutrition-v2-builder.ts:49` | `BUILDER_UNITS`: dejarla como está (dominio persistible) y **agregar** `foodUnitOptions(food)` en `intake-units.ts` (junto a `catalogUnitOptions:125`), que devuelve `{ code, label, grams }` incluyendo `casera` cuando `householdGrams ∈ [1,1000]` **y** `householdLabel` |
| b6 | `packages/nutrition-v2/intake-units.ts:125-139` | `catalogUnitOptions`/`defaultCatalogUnit` → reemplazados por `foodUnitOptions`/`defaultFoodUnit(food)`; `un` **solo** si `normalizeIntakeUnit(servingUnit) === 'un'` |
| b7 | `packages/nutrition-v2/intake-units.ts:157-179` (`convertIntakeQuantity`) | Aceptar `casera`: g↔casera `qty/hg` y `qty×hg`; un→casera `qty×servingSize/hg`; `porción`↔casera ⇒ `null` |
| b8 | `packages/nutrition-v2/unit-change.ts:26-40` | `householdGrams` ya está declarado en la firma pero **no se lee** (`:66`): cablearlo |
| b9 | `packages/nutrition-v2/editor-state.ts:143-201` (`QeItem`) | `householdGrams: number \| null` + `householdLabel: string \| null` **en el propio ítem**, no solo en `item.food` — los ítems hidratados tienen `food: null` (`:376`) |
| b10 | `editor-state.ts:376-...` (`hydrateItem`) | Rehidratación casera: con `read.householdGrams > 0 && read.householdLabel` ⇒ `unit = 'casera'`, `quantity = round0.5(read.quantity / hg)` **y `macroBase.quantity` en la MISMA unidad** (⚠️ **trampa**: hoy `macroBase.quantity = read.quantity` en gramos; con `quantity = 2` y `macroBase.quantity = 122`, `qeItemMacros` (`:1985-1987`) devolvería 1/61 de los macros) |
| b11 | `editor-state.ts:630-670` (`draftItemToQe`) | Idem para la rehidratación desde borrador/localStorage |
| b12 | `editor-state.ts:982-984` (`quantityStep`) | `casera` ⇒ `0.5` (hoy caería en `5`) |
| b13 | `editor-state.ts:1083-1106` (`createCatalogItem`) + `:1526-1530` (`normalizeBuilderUnit`) | Unidad inicial `casera` cuando el alimento la tiene y es de 100 g; cantidad inicial `1` |
| b14 | `editor-state.ts:1544-1562` (`SET_ITEM_UNIT`) | Ya convierte (W1.1); pasar `householdGrams` a `convertQuantityTextOnUnitChange` |
| b15 | `editor-state.ts:1999-2007` (`qeItemPlausibility`) | Reemplazar el `householdGrams: null` hardcodeado por `item.householdGrams ?? item.food?.householdGrams ?? null` |
| b16 | `editor-state.ts:2651-2683` (`projectItem`) | Emitir `householdLabel`/`householdGrams` al draft (o mantener `unit: 'casera'` + par y traducir en b18) |
| b17 | `packages/nutrition-v2/contracts.ts:94-102` (`NutritionPrescriptionItemSchema`) | `householdLabel: z.string().trim().max(40).nullable().default(null)`, `householdGrams: z.number().positive().max(1000).nullable().default(null)` + `superRefine` de par indivisible. `unit` sigue permisiva (`casera` solo válida **en el borrador**) |
| b18 | `apps/web/src/app/coach/nutrition-v2/_lib/plan-draft-rows.ts:69-104` (`buildItemInsertRow`) | **La traducción**: `unit === 'casera'` ⇒ `quantity = item.quantity × householdGrams`, `unit = isLiquid ? 'ml' : 'g'`, `household_label`/`household_grams` congelados. Los macros se congelan con `computeItemMacros` **antes** de traducir (mismo resultado por b3) |
| b19 | `apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts:200-214` | `FoodRow` + `FREEZE_FOOD_SELECT`: agregar `household_label, household_grams` |
| b20 | `plan-persistence.ts:228-254` (`toBuilderFood`) | Propagar `householdLabel`/`householdGrams` del merge (`resolveFoodMacros` **ya** los resuelve, `food-overrides.ts:163-183`, con precedencia override > catálogo — hoy se descartan) |
| b21 | `apps/web/src/app/coach/nutrition-v2/_lib/food-catalog-mapping.ts:13-40` y `apps/mobile/lib/nutrition-v2-builder.ts:1669-1688` | Cargar `householdLabel`/`householdGrams` del `FoodCatalogItem` (ya tipados en `catalog.ts:101-102`) |
| b22 | `apps/web/src/app/coach/nutrition-v2/_lib/food-catalog-card.ts:137,157-158` | Borrar el comentario desactualizado y pasar `item.householdGrams`/`item.householdLabel` |
| b23 | `packages/nutrition-engine/micros.ts:126` | **Exportar `formatHouseholdCount`** (hoy es privada del módulo; SPEC §5.5 la cita en `:95`, que es `gramsToHousehold`) |
| b24 | **nuevo** `packages/nutrition-v2/quantity-format.ts` | `formatItemQuantity({ quantity, unit, householdLabel, householdGrams })` ⇒ «2 huevos (122 g)» / «3 un» / «200 g» |
| b25 | UI del selector: `apps/web/.../_quick-edit/EditableItemRow.tsx:490`, `apps/web/.../builder/_components/ItemRow.tsx:86`, `apps/mobile/components/nutrition-v2/quick-edit/EditableItemRow.tsx:70-72`, `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx:2487-2488` | Pasar de `BUILDER_UNITS` a `foodUnitOptions(food)`; conservar la unidad vigente si no está en el set (el `UnitToggle` RN ya lo hace; el `<select>` web hay que arreglarlo) |
| b26 | `apps/web/src/app/coach/nutrition-v2/_actions/last-quantity.actions.ts:63` y `apps/mobile/lib/nutrition-v2-last-quantity.ts:91` | Convertir a gramos antes de llamar al RPC (ver a10) |

### (c) Superficies del alumno que deben convertir a gramos al enviar

| # | Archivo:línea | Qué hacer |
|---|---|---|
| c1 | `apps/web/.../nutrition-v2/_components/TodayExperience.tsx:1888,1892,1908,1924` (buscador web) | `foodUnitOptions` en el selector; al armar el payload y al calcular el preview, si `unit === 'casera'` ⇒ `quantity × householdGrams`, `unit = 'g'\|'ml'` |
| c2 | `apps/web/src/components/nutrition-v2/FoodScannerClient.tsx:457,464,472,488` (scanner web) | Idem |
| c3 | `apps/mobile/app/alumno/(tabs)/nutrition-v2/add-food-v2.tsx:283,361,407` + `apps/mobile/lib/nutrition-v2-add-food.logic.ts:45` (buscador RN) | Idem |
| c4 | `apps/mobile/app/alumno/(tabs)/nutrition-v2/scanner.tsx:647,661` + `apps/mobile/lib/nutrition-v2-scanner.logic.ts:98,119` (scanner RN) | Idem |
| c5 | `apps/web/.../nutrition-today.logic.ts:269-281` (`estimateCatalogIntakeTotals`) | **Blindar**: hoy `normalizeIntakeUnit(unit) ?? unit` deja pasar `'casera'` a `intakeEntryFactor` ⇒ preview con la rama contable. Convertir antes, o rechazar explícitamente |
| c6 | **No tocar** `NutritionIntakeUnitSchema` (`contracts.ts:40-47`) | Es la barrera que garantiza que `casera` nunca llegue a `nutrition_intake_entries` |

### (d) Schemas de read models con `.nullable().optional()`

| # | Archivo:línea | Qué agregar |
|---|---|---|
| d1 | `packages/nutrition-v2/read-models.ts:144-173` (`NutritionPrescriptionItemReadSchema`) | `householdLabel: z.string().nullable().optional()`, `householdGrams: z.number().positive().nullable().optional()` (misma regla que `media`/`substitutions`) |
| d2 | `read-models.ts:44-70` (`NutritionIntakeReadItemSchema`) | Las mismas dos claves, `.nullable().optional()` |
| d3 | `read-models.ts:85-95` (`NutritionItemSubstitutionReadSchema`) | **No tocar**: el reemplazo se resuelve por `substituteNaturalUnit` (`substitution-intake.ts:141-144`) y nunca es casera |
| d4 | `packages/nutrition-v2/editor-state.ts` `ReadItem` (tipo de `hydrateItem`) | Propagar las dos claves nuevas del read model al `QeItem` (b9/b10) |

---

## 4. Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | **`macroBase` en modo casera.** `hydrateItem` (`editor-state.ts:376`) deja `food: null` y `macroBase.quantity = read.quantity` (gramos). Si la rehidratación muestra `quantity = 2` (casera) sin recalibrar `macroBase`, `qeItemMacros` (`:1985-1987`) escala por `2/122` y el editor muestra **1/61 de las kcal reales**, que es lo que se congela al republicar (`plan-draft-rows.ts:80`) | **ALTA** | Rehidratar `macroBase.quantity` en la misma unidad que `quantity` (b10) + test `editor-state` con «huevo 122 g / hg 61 ⇒ 2 huevos, macros intactos» |
| R2 | **Builds RN viejas pierden el par al republicar.** Una app vieja hidrata «122 g» (ignora `householdLabel`), el coach toca otra cosa y republica: `projectItem` no emite el par ⇒ `buildItemInsertRow` escribe `household_* = NULL` y el rótulo desaparece del plan | **ALTA** | En `persist_and_publish` (a4), si el JSON del ítem trae `id` y **no** trae par, heredar el par de la fila con ese `id` en la versión base del mismo plan (misma mecánica que el `source_item_id` de W3). Alternativa barata: documentar la pérdida y forzar OTA antes de anunciar la feature |
| R3 | **`get_nutrition_history_detail_v2` no existe.** El historial V2 (`NutritionHistoryDaySchema`, `read-models.ts:368-392`) solo trae agregados: no hay `intakeItems`. W4.1 «editar cantidad en días pasados» **no tiene fuente de datos** | **ALTA** (para W4, se descubre en W2.0) | Decidir ya: o W4.1 queda restringido a «hoy» (`today` del `client_detail`), o entra un read model nuevo. No inventar el alcance en W4 |
| R4 | **Overrides del coach con `household_grams` fuera de rango.** `cfo_household_grams_positive` (`20260807220000:82`) solo exige `> 0`; el CHECK nuevo del ítem exige `[1, 1000]`. Un override con `hg = 5000` congelaría una fila que **el CHECK rechaza** ⇒ publicación rota | **MEDIA** | Clamp en `foodUnitOptions` (b5: `casera` solo si `hg ∈ [1,1000]`), que ya está en la SPEC, **y** validar en `buildItemInsertRow` (b18) antes de emitir. Opcional: `add constraint cfo_household_grams_range … not valid` en la misma migración |
| R5 | **¿Quién gana al congelar?** `food_catalog_v2_item_json` (`20260807223000:81-88`) da precedencia al **override del coach** sobre `foods`, y `resolveFoodMacros` (`food-overrides.ts:163-183`) hace lo mismo en TS. Pero `FREEZE_FOOD_SELECT` (`plan-persistence.ts:213`) lee `public.foods` **directo** y `toBuilderFood` (`:228`) descarta el par | **MEDIA** | b19+b20: leer `household_*` de `foods` **y** pasarlas por `resolveFoodMacros` con el override ya cargado (`FREEZE_OVERRIDE_SELECT:218` ya los trae). Regla explícita: **gana el override del coach**, igual que los macros |
| R6 | **`macros_basis = 'per_serving'` + casera.** `computeItemMacros` (`editor-food.ts:98-112`) con `per_serving` y unidad no-masa devuelve `factor = quantity`: con `casera` daría «2 × macros de la porción», no «122 g» | **MEDIA** | b3: la recursión debe convertir a gramos **y** entrar por la rama `per_serving` (`qty×hg / servingSize`). Test explícito con un alimento del seed de intercambios |
| R7 | **Ítems `per_serving` con `serving_unit = 'un'`.** El guard `foods_un_per100_serving_en_gramos` (`20260830192945:19`) solo cubre `per_100`. Un alimento `per_serving` + `un` + `serving_size` chico no está cubierto, y si además tiene medida casera, `foodUnitOptions` ofrecería `un` **y** `casera` con semánticas distintas | **MEDIA** | Preferir `casera` en el default (`defaultFoodUnit`) para esos alimentos y rotular ambas opciones con sus gramos («huevo · 61 g» vs «un · 58 g»), que es justo lo que pide SPEC §5.2 |
| R8 | **Sinónimos de `normalizeIntakeUnit`.** `unidad`, `pieza`, `u`, `ud` mapean a `'un'` (`intake-units.ts:64-75`). Una etiqueta casera literal «unidad» (`household_label = 'unidad'`) es **solo display** y no colisiona porque el código es `casera` (`:46`) | **BAJA** | Ya resuelto por diseño. Guardarraíl: no derivar nunca la unidad de `householdLabel` (comparar siempre contra `HOUSEHOLD_UNIT`, como hace `plausibility.ts:96`) |
| R9 | **Preview mentiroso en el registro libre.** `estimateCatalogIntakeTotals` (`nutrition-today.logic.ts:280`) hace `normalizeIntakeUnit(unit) ?? unit`: con `'casera'` el preview usa la rama contable antes de que Zod rechace | **BAJA** | c5 |
| R10 | **Memoria de cantidad del coach.** `coach_food_last_qty_remember` (`20260813040921:39`) hace `return` silencioso con `casera`; el action web traga el error (`last-quantity.actions.ts:70`) | **BAJA** | a10 + b26: convertir a gramos antes de recordar |
| R11 | **El rótulo tarda en aparecer.** `nutrition_v2_rederive_day_snapshot` (`20260716230000:84-103`) solo recalcula el día corriente tras publicar; días ya materializados no ganan el par | **BAJA** | Esperado y correcto (el snapshot es la verdad congelada). Documentarlo en el QA |
| R12 | **Cobertura de porciones se mueve.** `20260720120000:281,316` solo cuenta `unit in ('g','ml')`: un registro casera→gramos **sí** aporta cobertura donde un `un` no aportaba | **BAJA** | No es regresión (nadie tenía `casera` antes) y va en el sentido correcto. Anotarlo en TASKS para que el QA no lo lea como bug |
| R13 | **`persist_and_publish` no valida `unit`.** El CHECK de a2 hace fallar la publicación entera con un `23514` genérico si algún cliente manda `casera` | **BAJA** | Traducir en `buildItemInsertRow` (b18) **y** mapear el error en `mapWriteError` a un mensaje claro. No relajar el CHECK |

---

## 5. Consultas de pre-check para LIVE (solo SELECT — las corre el jefe)

```sql
-- Q1 · foods con household_grams fuera de [1, 1000]  (bloquea a3)
select id, name, brand, catalog_source, serving_unit, serving_size,
       household_label, household_grams
from public.foods
where household_grams is not null
  and (household_grams < 1 or household_grams > 1000)
order by household_grams desc;

-- Q1b · lo mismo en los overrides de coach (cfo solo exige > 0) — riesgo R4
select coach_id, food_id, household_label, household_grams
from public.coach_food_overrides
where household_grams is not null
  and (household_grams < 1 or household_grams > 1000)
order by household_grams desc;

-- Q2 · ítems prescritos con unit = 'casera'  (debe dar 0 filas antes del CHECK de a2)
select count(*) as items_casera
from public.nutrition_prescription_items_v2
where lower(btrim(unit)) = 'casera';

-- Q2b · el mismo cierre del lado del intake (no debería existir nunca)
select count(*) as entries_casera
from public.nutrition_intake_entries
where lower(btrim(unit)) = 'casera';

-- Q3 · par casero completo vs. incompleto en el catálogo
select
  count(*) filter (where household_label is not null and household_grams is not null) as par_completo,
  count(*) filter (where household_label is not null and household_grams is null)     as label_sin_gramos,
  count(*) filter (where household_label is null     and household_grams is not null) as gramos_sin_label,
  count(*) filter (where household_label is null     and household_grams is null)     as sin_medida,
  count(*) as total
from public.foods;

-- Q3b · el mismo desglose, pero solo sobre los alimentos que un coach REALMENTE usa hoy
select
  count(distinct f.id) filter (where f.household_label is not null and f.household_grams is not null) as usados_con_par,
  count(distinct f.id) as usados_total
from public.nutrition_prescription_items_v2 pi
join public.foods f on f.id = pi.food_id
join public.nutrition_plan_versions_v2 v on v.id = pi.version_id
where v.status = 'published';

-- Q4 · los alimentos nativos por unidad (serving_unit = 'un'): los únicos que W2 deja ofrecer 'un'
select id, name, brand, catalog_source, macros_basis, serving_size,
       household_label, household_grams,
       case
         when household_grams is null then 'sin medida casera'
         when abs(household_grams - serving_size) / nullif(serving_size, 0) > 0.30
           then 'DIVERGE >30% de serving_size'
         else 'coherente'
       end as coherencia
from public.foods
where serving_unit = 'un'
order by coherencia, name;

-- Q5 · candidatos al badge «Revisar unidad» (D3 a): ítem en 'un', alimento de 100 g,
--      con medida casera cuyo gramaje difiere > 30 % de serving_size
select c.coach_id, count(*) as items, count(distinct pi.version_id) as versiones
from public.nutrition_prescription_items_v2 pi
join public.nutrition_plan_versions_v2 v on v.id = pi.version_id
join public.nutrition_plans_v2 p on p.id = v.plan_id
join public.clients c on c.id = p.client_id
join public.foods f on f.id = pi.food_id
where lower(btrim(pi.unit)) = 'un'
  and v.status = 'published'
  and coalesce(f.serving_unit, 'g') <> 'un'
  and f.household_grams is not null
  and f.serving_size > 0
  and abs(f.household_grams - f.serving_size) / f.serving_size > 0.30
group by c.coach_id
order by items desc;
```
