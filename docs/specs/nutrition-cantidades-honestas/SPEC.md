---
status: active
owner: product-engineering
last_verified: "2026-09-06"
canonical: false
---

# SPEC — Cantidades honestas (Nutrición V2: unidad «un», medida casera, republicación y ojos del coach)

> **Activa.** Origen: alumno de prueba de Jean (coach `jotap-coach`) con **5.637 kcal** en un día (06-09) por
> «Huevo revuelto 30 un» (= 30 porciones de 100 g = 4.470 kcal) más 5 registros huérfanos de una versión anterior
> del plan que sumaban sin verse. Impacto real en planes activos de Alberto Piedrahita (pan pita «60 un» = 9.576
> kcal) y del propio Jean. Plan aprobado por el owner el 06-09 (artifact `5091b8db`, copia local
> `D:\tmp\plan-cantidades-honestas.html`); decisiones **D1 a · D2 a · D3 a · D4 a · D5 a · D6 c · D7 a**.
> **W0 (datos) ya se ejecutó en LIVE el 06-09** con auditoría `w0-cantidades-honestas-*`: no se repite.
> Plan de ejecución en [PLAN](PLAN.md); tareas y gates en [TASKS](TASKS.md).

## 1. Problema (verificado contra `HEAD 8b9b3805` y LIVE, 06-09)

### Causa 1 · «1 un» es «una porción de `serving_size`» y nadie lo dice

- 4.573 de 4.659 alimentos tienen `serving_size = 100`. En el motor, `un` escala por
  `quantity × serving_size / 100` (`packages/nutrition-engine/macros.ts:118`, espejo SQL
  `private.nutrition_v2_entry_factor`). «3 un» de huevo revuelto son 300 g.
- El editor del coach **no convierte** la cantidad al cambiar de unidad: `SET_ITEM_UNIT` solo pisa `unit`
  (`packages/nutrition-v2/editor-state.ts:1535`, reductor compartido web + RN). El wizard RN hace `patch({ unit })`
  (`apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx:2636`) y el wizard web tiene su propio reductor
  (`[clientId]/builder/_lib/draft-builder.ts:896`). El alumno sí convierte
  (`convertIntakeQuantity`, `packages/nutrition-v2/intake-units.ts:146`, usado en `TodayExperience.tsx:1902`).
- La medida casera del catálogo (`foods.household_grams/label`, 275 alimentos) es decorativa: se descarta en
  `apps/web/src/app/coach/nutrition-v2/_lib/food-catalog-mapping.ts:13`, en su espejo RN
  `apps/mobile/lib/nutrition-v2-builder.ts:1669` y en el `FREEZE_FOOD_SELECT` de
  `apps/web/src/app/coach/nutrition-v2/_actions/plan-persistence.ts:213`. Decisión previa A1 (`bf90571c`):
  «display puro, no toca macros». **D2 a la reemplaza.**
- Sin tope ni aviso por ítem: los únicos límites son metas del día (12.000 kcal) y reemplazos
  (`SUBSTITUTION_MAX_*`, `packages/nutrition-v2/substitution-intake.ts:41`). 0 tests de `SET_ITEM_UNIT`.

### Causa 2 · republicar el mismo día crea ids nuevos y esconde lo registrado

- Cada publicación genera `crypto.randomUUID()` por ítem (`plan-persistence.ts:489`) y
  `persist_and_publish_nutrition_plan_v2` (migración `20260728140000`, `:394`) lo inserta tal cual. La RPC no toca
  `nutrition_intake_entries`; los registros quedan con un `prescription_item_id` que ya no está en el snapshot.
- `get_nutrition_today_v2` (última definición `20260720120000:109`) arma los ítems desde el snapshot congelado
  del día y cuelga los intakes por `slot_code` (`:374-420`); `prescriptionItemId` viaja verbatim
  (`private.nutrition_v2_intake_item_json`, `:41`). La web del alumno muestra esos registros como libres
  (`slotFreeEntries`, `nutrition-today.logic.ts:505`); **RN los oculta** («Fuera del plan» filtra
  `prescriptionItemId === null`, `apps/mobile/app/alumno/(tabs)/nutrition-v2/index.tsx:1681`) pero
  `consumed` los suma. La idempotency key del «Comí» incluye el id del ítem
  (`presc-<día>-<itemId>-a1`, `apps/mobile/lib/nutrition-v2-intake.ts:141`) ⇒ doble marca.
- En 30 días: 66 publicaciones, 17 el mismo día de la vigente, 5 con registros previos (2 alumnos).

### Causa 3 · el coach no ve ni corrige

- La ficha del alumno muestra solo agregados (`[clientId]/SelectedDayPanel.tsx:169`); el backend ya autoriza
  al coach a `void_nutrition_intake_v2` / `correct_nutrition_intake_v2` (`private.nutrition_v2_can_read_client`).
- Las alertas del coach son todas V1 (`apps/web/src/lib/nutrition-coach-alerts.ts:40`, espejo RN
  `apps/mobile/lib/nutrition-coach-alerts.ts`).
- El catálogo trae densidades absurdas de Open Food Facts («Mix de Vegetales» 500 kcal/100 g es un snack Be
  Snacks: **no se toca**); el único guard SQL cubre `un + per_100 + serving_size < 5`
  (`20260830192945_foods_un_per100_serving_en_gramos_guard.sql`).

## 2. Regla dura del tren

**Jean usa «un» = porción de 100 g a propósito** (233 de los 241 ítems «un» sobre alimentos de 100 g son suyos,
16 planes; sus días cuadran). Ningún cambio reinterpreta ítems publicados ni mueve kcal de planes vigentes.
Los totales prescritos están congelados en `snapshot_calories` (calculados en Next por `computeItemMacros`,
`plan-draft-rows.ts:80`; la RPC confía en el número). Cero `UPDATE` sobre `nutrition_intake_entries`
(regla del repo: no reescribir eventos V2).

## 3. Decisiones del owner (06-09) y su lectura técnica

| Id | Decisión | Qué implica |
|---|---|---|
| D1 a | Tren completo W1–W4 | Cuatro olas, commits propios, un deploy + una OTA por ola. |
| D2 a | Medida casera explícita; «un» solo en alimentos nativos por unidad (`serving_unit = 'un'`, 30); alimentos de 100 g sin medida ofrecen solo g/ml; lo existente no se reinterpreta | §5 (arquitectura «gramos como verdad, medida casera como interfaz»). |
| D3 a | Badge «Revisar unidad» + aviso único a los 4 coaches, sin reescribir planes | §5.5. Los avisos los manda el owner (texto en TASKS). |
| D4 a | Linaje `source_item_id` + resolución en lectura, nunca `UPDATE` de `prescription_item_id` | §6. |
| D5 a | Diálogo al publicar con vigencia hoy, «Aplicar hoy» por defecto | §6.2. |
| D6 c | W0 por script en LIVE | Hecho el 06-09; fuera de este SDD. |
| D7 a | Umbrales: ítem > 600 g resultantes o > 700 kcal; día prescrito > 1,5× meta; alerta coach día consumido > 2× meta. Avisan, no bloquean | §4.3, §7.2. Base: p99 de ítems activos 395 kcal; mayor legítimo «Comida libre» 600 kcal. |

## 4. W1 · Redes de seguridad sin cambiar el modelo (ARREGLA)

### 4.1 Convertir al cambiar de unidad (W1.1)

- `quickEditReducer` `SET_ITEM_UNIT` (`editor-state.ts:1535`): con `item.food`, la cantidad se convierte con
  `convertIntakeQuantity({ quantity, from, to, servingSize: item.food.servingSize })`; el resultado vuelve a
  texto con la misma convención de `stepQuantityText`. Si la conversión no es representable (`null`: unidad
  heredada `porción`, sin `servingSize`) **se conserva el número** y el aviso de plausibilidad (§4.3) cubre el
  resto. Sin `item.food` el reductor sigue sin cambiar la unidad (comportamiento actual).
- Helper compartido nuevo `convertQuantityTextOnUnitChange` en `packages/nutrition-v2/unit-change.ts` (puro),
  usado por el reductor, por el wizard web (`draft-builder.ts`, acción que patchea `unit`) y por el wizard RN
  (`builder/[clientId].tsx:2636`).
- Tests: `editor-state.unit-change.test.ts` (g→un con porción 60 ⇒ 1,7; un→g ⇒ 60; g↔ml mismo número;
  sin food ⇒ sin cambio; `porción`→g conserva) + casos del wizard web (`draft-builder.test.ts`) y del RN
  (`tests/mobile-nutrition-v2-builder.test.ts`).

### 4.2 Rótulo honesto de «un» (W1.2)

Junto al selector de unidad, cuando `item.unit === 'un'` y hay `item.food`: leyenda «1 un = {servingSize}
{servingUnit}» («1 un = 100 g», «1 un = 58 g» en un huevo nativo). Web `_quick-edit/EditableItemRow.tsx:479`
(bajo el `<select>` de 44×64) y RN `quick-edit/EditableItemRow.tsx:58` (`UnitToggle`). Texto `text-xs text-muted`,
sin color nuevo. W2 lo vuelve casi innecesario (el selector deja de ofrecer «un» donde no tiene sentido).

### 4.3 Aviso de plausibilidad por ítem y por día (W1.3)

Módulo puro nuevo `packages/nutrition-v2/plausibility.ts` (única casa de los números mágicos, como
`substitution-intake.ts`):

```text
IMPLAUSIBLE_ITEM_MAX_GRAMS = 600      IMPLAUSIBLE_ITEM_MAX_KCAL = 700
IMPLAUSIBLE_DAY_TARGET_RATIO = 1.5    COACH_ALERT_CONSUMED_RATIO = 2
itemResultingGrams({ quantity, unit, servingSize, householdGrams }) → number | null
   g|ml ⇒ quantity · un ⇒ quantity × servingSize · casera ⇒ quantity × householdGrams · porción ⇒ null
assessItemPlausibility({ quantity, unit, servingSize, householdGrams, calories })
   → { implausible, reasons: ('grams' | 'kcal')[], grams, calories }
assessDayPlausibility({ prescribedCalories, targetCalories }) → { implausible, ratio }
implausibleItemCopy(...) → «¿Seguro? 30 un = 3 kg de huevo revuelto (1 un = 100 g)»
implausibleDayCopy(...)  → «El día suma 4.906 kcal, 3,2× la meta de 1.556»
```

- Editor único (web + RN): `qeItemPlausibility(item)` junto a `qeItemMacros` (`editor-state.ts:1958`), fila ámbar
  bajo el ítem con dos acciones «keep the number» (M1): **«Cambiar a {n} g»** (misma cifra, unidad g/ml: el caso
  «quise decir gramos») y **«Usar {label}»** (misma cifra, unidad casera; solo cuando el alimento la tiene, W2).
  Ninguna de las dos convierte: la premisa es que el número estaba bien y la unidad no. El cambio de unidad
  desde el selector sí convierte (§4.1).
- Día: aviso en `PublishBar.tsx:223` (web) y en la `PublishBar`/`PublishConfirmSheet` RN cuando el día prescrito
  supera 1,5× su meta o hay ítems implausibles («2 ítems con cantidades poco plausibles»). En el wizard, en
  `builder/_components/DayTotalsBar.tsx:126` (web) y su par RN. Publicar sigue siendo un tap: **avisa, no
  bloquea** (misma regla que Atwater).
- Estilo: tokens `warning` existentes (`border-warning-500/30 bg-warning-500/10 text-warning-700`), tipografía
  del EVA DS, sin colores nuevos. Componentes `ImplausibleNotice` (web) y `ImplausibleNotice` (RN) en
  `_quick-edit/` y `components/nutrition-v2/quick-edit/`.
- `computeItemMacros` vive en `packages/nutrition-v2/editor-food.ts:96` y su copia RN en
  `apps/mobile/lib/nutrition-v2-builder.ts:1097`: la copia RN pasa a re-exportar la del paquete (W2.2 la toca una
  sola vez).

### 4.4 RN muestra los huérfanos como la web (W1.4)

- Extraer a `packages/nutrition-v2/today-entries.ts` (puro) `isPortionMarkEntry`, `consumedEntryForItem`,
  `slotFreeEntries`, `slotPortionMarksTotal`, `outOfPlanEntries` (hoy en `nutrition-today.logic.ts:505`); la web
  los re-exporta desde su ruta histórica. Nuevo `isPriorVersionEntry(entry, slot)` (= `prescriptionItemId`
  no nulo y ausente de `slot.prescriptionItems`) y `priorVersionCalories(today)`.
- RN `index.tsx:1681`: los registros libres de cada franja se pintan **bajo su card** (paridad con la web) con chip
  ámbar «De una versión anterior del plan» cuando aplica, botón retirar por fila (ya existe `onVoidEntry`, `:772`)
  y «Retirar los N» (voids secuenciales con el mismo runner). «Fuera del plan» queda para lo sin franja o de
  franjas no renderizadas (`outOfPlanEntries`). Bajo la barra de energía: «{kcal} kcal vienen de registros de una
  versión anterior del plan» cuando `priorVersionCalories > 0` (M2).
- `consumedPrescriptionItemIds` (`bulk-mark.ts:43`) solo cuenta ids presentes en `slot.prescriptionItems`
  (los huérfanos dejan de bloquear «Comí toda esta comida»).
- Tests: `today-entries.test.ts` (huérfano, libre, marca de porción, prior-version kcal), `bulk-mark.test.ts`
  caso huérfano; la web conserva `nutrition-today.logic.test.ts:501`.

### 4.5 Confirmación en «Lo comí» sobre umbral (W1.5)

RN `onAtePrescribed` (`index.tsx:714`) y el handler web equivalente en `TodayExperience.tsx`: si
`assessItemPlausibility` del ítem prescrito (kcal de `item.macros`; gramos solo con unidad g/ml, el read model no
trae `servingSize`) es implausible, hoja/diálogo de confirmación «Este ítem suma 4.470 kcal. ¿Registrarlo igual?»
[Registrar] [Cancelar]. Misma constante que §4.3. No cambia el payload ni la idempotency key.

### 4.6 Medición (W1.6, MIDE)

Evento PostHog `nutrition_item_implausible` al mostrar el aviso, una vez por ítem y sesión:
`{ platform: 'web' | 'rn', surface: 'editor' | 'wizard' | 'publish' | 'today', unit, reason: 'grams' | 'kcal' | 'day',
kcal_bucket: '700-1000' | '1000-2000' | '2000-5000' | '5000+' }`. **Sin kcal exactas ni nombre del alimento**
(Ley 21.719, regla de `apps/mobile/lib/analytics.ts`): desviación deliberada del brief («con kcal y unidad»); el
bucket alcanza para decidir W2. Web: `apps/web/src/lib/posthog/events.ts`; RN: `captureAppEvent`.

## 5. W2 · Medida casera de verdad: «2 huevos (122 g)» (ARREGLA el modelo)

### 5.1 Arquitectura: gramos como verdad, medida casera como interfaz (decisión del jefe)

Patrón Nutrium/Cronometer (artifact §3 «qué copiar»). **La cantidad persistida de un ítem prescrito sigue siendo
g o ml**; la medida casera es (a) una opción del selector del coach y del alumno, (b) dos columnas congeladas en
el ítem para poder mostrarla sin buscar el alimento, y (c) un rótulo en todas las superficies.

- Unidad **`casera`** existe solo en el editor y en el borrador (`HOUSEHOLD_UNIT = 'casera'`,
  `packages/nutrition-v2/intake-units.ts`); **jamás se persiste en `unit`** (guard SQL §5.4). Al persistir:
  `quantity = count × household_grams`, `unit = 'g'` (`'ml'` si el alimento es líquido), `household_label` y
  `household_grams` congelados desde el alimento en ese momento (`plan-draft-rows.ts`, `buildItemInsertRow`).
- Rehidratación del editor: ítem con `household_grams > 0` y `household_label` ⇒ `QeItem` en modo `casera` con
  `quantity = row.quantity / row.household_grams` (redondeo 0,5). Sin esas columnas ⇒ igual que hoy.
- Por qué así y no «`un` con household»: (1) ninguna fórmula SQL cambia (`nutrition_v2_entry_factor`, `intake_item_json`,
  `build_prescription_snapshot` siguen leyendo g/ml); (2) el camino «Lo comí» ya viaja normalizado por unidad
  (`prescribedSnapshotMacros`, `intake-normalize.ts:60`, `servingSize = 1`) y no distingue unidades; (3) los 233 ítems
  «un» de Jean no se tocan; (4) los sinónimos de `normalizeIntakeUnit` («unidad», «pieza» ⇒ `un`) no chocan con
  etiquetas caseras como «unidad» porque el código es `casera` y la etiqueta es solo display; (5) el drift del
  catálogo no mueve planes: la medida queda congelada en el ítem, como los macros.

### 5.2 Unidades por alimento (W2.1)

- `foodUnitOptions(food)` reemplaza a `catalogUnitOptions` (`intake-units.ts:114`) en web y RN (editor, wizard,
  buscador y scanner del alumno): `g` o `ml` según `servingUnit`; `un` **solo** si `normalizeIntakeUnit(servingUnit)
  === 'un'`; `casera` si `householdGrams ∈ [1, 1000]` y `householdLabel`. Devuelve `{ code, label, grams }`
  («huevo · 61 g»). `defaultCatalogUnit` prefiere `casera` cuando existe y el alimento es de 100 g; `un` en nativos.
- `BuilderFood` (`editor-food.ts:17`, y su copia RN `nutrition-v2-builder.ts:52`, que pasa a re-exportar el tipo del
  paquete) gana `householdGrams: number | null` y `householdLabel: string | null`, cargados en
  `food-catalog-mapping.ts:13`, `nutrition-v2-builder.ts:1669` y `FREEZE_FOOD_SELECT`/`toBuilderFood`
  (`plan-persistence.ts:213`). El RPC `search_food_catalog_v2` ya los emite y `FoodCatalogItemSchema`
  (`packages/nutrition-v2/catalog.ts:97`) los tipa; el comentario desactualizado de `food-catalog-card.ts:137` se
  corrige.
- Ítems existentes con `un` conservan su unidad: el selector muestra la unidad vigente aunque no esté en el set
  (`UnitToggle` ya lo hace; el `<select>` web agrega la opción vigente si falta).
- El selector de unidad web/RN muestra las opciones con su label («g», «huevo · 61 g»); pill en RN (M1).

### 5.3 Cálculo y persistencia (W2.2)

- `computeItemMacros(food, quantity, unit)`: con `unit === 'casera'` y `food.householdGrams > 0` ⇒ recursión con
  `(quantity × householdGrams, 'g' | 'ml')`. Sin household ⇒ macros cero y error de validación del borrador
  («Este alimento no tiene medida casera»). El camino `per_100`/`per_serving` para g/ml/un queda **byte-idéntico**
  (`draft-builder.macros-basis.test.ts:63` se extiende, no se rompe).
- Conversión del selector (§4.1) entiende `casera`: g→casera `qty / householdGrams`; casera→g `qty × householdGrams`;
  un→casera `qty × servingSize / householdGrams`.
- Contrato `NutritionPlanDraft` (`contracts.ts:82/102`): ítem gana `householdLabel`/`householdGrams` opcionales;
  `unit` puede ser `casera` **solo en el borrador**. `buildItemInsertRow` traduce a g/ml + columnas congeladas.
- Alumno, registro libre (buscador/scanner web y RN): al elegir `casera` la UI convierte a gramos antes de armar
  el payload (`unit: 'g' | 'ml'`, `quantity` en gramos); el contrato de intake (`NutritionIntakeUnitSchema`) no cambia.
  La fila queda «122 g» (limitación conocida: el registro libre no congela la medida).
- Read models (SQL aditivo, misma migración de §5.4): `build_prescription_snapshot` (`20260718140000:559`) y
  `get_nutrition_plan_read_v2` (`20260902220850:141`) emiten `householdLabel`/`householdGrams` del ítem;
  `private.nutrition_v2_intake_item_json` los emite para registros con `prescription_item_id` (join al ítem,
  null-safe). `NutritionPrescriptionItemReadSchema` y `NutritionIntakeReadItemSchema` los declaran
  `.nullable().optional()` (compat RN vieja, misma regla que `macrosBasis`).

### 5.4 Migración W2 (aditiva, idempotente, validada con ROLLBACK)

`supabase/migrations/2026090XHHMMSS_nutrition_v2_household_units.sql`:

1. `alter table public.nutrition_prescription_items_v2 add column if not exists household_label text,
   add column if not exists household_grams numeric` + CHECK `household_grams is null or household_grams between 1 and 1000`
   y CHECK `(household_label is null) = (household_grams is null)` (viajan como par).
2. CHECK en la misma tabla `unit <> 'casera'` (`not valid` + `validate`; pre-check 0 filas).
3. `alter table public.foods add constraint foods_household_grams_range check (household_grams is null or
   household_grams between 1 and 1000) not valid` + `validate` (pre-check en LIVE de solo lectura).
4. `create or replace` de `persist_and_publish_nutrition_plan_v2` (lee `household_label`/`household_grams` del
   JSON del ítem; cuerpo idéntico salvo las dos columnas) y de los tres read models de §5.3.
5. `GRANT`: ninguno nuevo (escribe la RPC). Regenerar `apps/web/src/lib/database.types.ts`.

Test SQL `supabase/tests/nutrition_v2_household_units_rollback.sql`: publicar un ítem casera (122 g, huevo, 61) ⇒
fila en g con columnas congeladas; `get_nutrition_today_v2` y `get_nutrition_plan_read_v2` emiten el par; un
ítem con `unit = 'casera'` es rechazado; `household_grams = 5000` es rechazado; termina en ROLLBACK.

### 5.5 Rótulo en todas las superficies (W2.3, Sonnet) y badge «Revisar unidad» (W2.5)

- Helper `formatItemQuantity({ quantity, unit, householdLabel, householdGrams })` en
  `packages/nutrition-v2/quantity-format.ts`: con par casero y unidad g/ml ⇒ «2 huevos (122 g)» (plural y
  fracciones de `formatHouseholdCount`, que se exporta desde `packages/nutrition-engine/micros.ts:95`); si no ⇒
  «{qty} {label}» («3 un» se muestra «3 un», «200 g», «1 porción»). Sustitución mecánica en las 16 superficies que
  hoy concatenan cantidad y unidad (lista en TASKS W2.3; inventario `rg "quantityLabel|formatQuantity"` +
  `rg '\$\{[^}]*quantity[^}]*\}\s*\$\{[^}]*unit'`).
- Badge (D3 a): en el editor web/RN, ítem con `unit === 'un'`, alimento de 100 g (`servingUnit ≠ 'un'`) y medida
  casera cuyo gramaje difiere > 30 % de `servingSize` ⇒ pill «Revisar unidad» junto al nombre (tone `warning`,
  `ItemBadge` existente) con tooltip «Acá 1 un = 100 g; 1 huevo del catálogo = 61 g» y acción «Usar huevos» (§4.3).
  Ningún plan se reescribe. Query de los 64 ítems (4 coaches) en `docs/audits/cantidades-honestas-revisar-unidad-2026-09.md`
  y texto de aviso por coach en TASKS (lo manda el owner).

### 5.6 Catálogo (W2.4, Sonnet, sin aplicar en LIVE)

- `scripts/nutrition-household/backfill-usda-household.mjs`: para `foods.source = 'usda'` sin medida (145), lee
  USDA FoodData Central `/v1/food/{fdcId}` (`source_ref`; clave `USDA_FDC_API_KEY`, `DEMO_KEY` de respaldo,
  1.000 req/h) y toma `foodPortions[].gramWeight` con `modifier` (SR Legacy) o `portionDescription`
  (Foundation, puede venir vacío) mapeado a etiqueta es-CL (cup→taza, tbsp→cucharada, tsp→cucharadita,
  slice→rebanada, piece/egg/medium/large→unidad del alimento). Descarta gramajes fuera de [1, 1000]. Salida:
  `supabase/data/household-backfill-usda-<fecha>.sql` (UPDATE idempotente `where household_grams is null`) +
  CSV de revisión. **No se aplica sin OK del owner.**
- `scripts/nutrition-household/suggest-eva-household.mjs`: para los 158 EVA sin medida, propuestas por
  diccionario de palabras clave (huevo, pan, rebanada, taza…) a CSV para curación manual. Open Food Facts queda
  solo en gramos (no trae medidas caseras).

### 5.7 Decisiones del jefe tras la auditoría W2.0 (06-09, [informe](AUDIT-W2.0-unit-paths.md))

La auditoría confirma «cero cambio de fórmula» (SQL prescrito passthrough; «Lo comí» normalizado con
`servingSize = 1`; el reemplazo ignora la unidad) y que el CHECK `unit <> 'casera'` es el cierre real, no un
cinturón. Resoluciones que mandan sobre §5.1–§5.6:

- **R1 (alta) — `macroBase` en modo casera.** `QeItem` gana `householdGrams`/`householdLabel` **propios** (los ítems
  hidratados tienen `food: null`); `hydrateItem` y `draftItemToQe` rehidratan `quantity` como cuenta (`round0.5(g / hg)`)
  **y `macroBase.quantity` en la misma unidad**; `qeItemMacros` en casera convierte a gramos antes de escalar. Test
  «huevo 122 g / hg 61 ⇒ 2 huevos, macros intactos».
- **R2 (alta) — builds RN sin la OTA que republican** pierden el par (`projectItem` viejo no lo emite): la fila queda
  en gramos honestos («122 g») sin rótulo. **Aceptado y documentado** en QA; la OTA sale con la misma ola. Sin herencia
  server-side por `id` (el builder genera ids nuevos siempre).
- **R3 (alta) — no existe `get_nutrition_history_detail_v2`** (el historial V2 solo trae agregados). **W4.1 queda
  restringido a «hoy»** (`today` del `client_detail`); los días pasados siguen mostrando agregados. Sin read model nuevo
  en este tren.
- **R4/R5 — precedencia y rango.** Gana el **override del coach** sobre el catálogo (`resolveFoodMacros` ya lo hace);
  `FREEZE_FOOD_SELECT`/`toBuilderFood` propagan el par. `foodUnitOptions` ofrece `casera` solo con `hg ∈ [1, 1000]`,
  `buildItemInsertRow` lo valida, y la migración agrega `cfo_household_grams_range` (`not valid` + `validate`) a
  `coach_food_overrides` además del CHECK de `foods`.
- **R6/R7 — `per_serving`.** La recursión casera entra por la rama `per_serving` con gramos (`qty × hg / servingSize`).
  Alimentos `per_serving` + `serving_unit = 'un'` con medida: el default es `casera` y ambas opciones se rotulan con sus
  gramos («huevo · 61 g» vs «un · 58 g»).
- **R9/R13 — cierres.** `estimateCatalogIntakeTotals` convierte `casera` a gramos antes de estimar; `mapWriteError`
  traduce el `23514` del CHECK a un mensaje claro. `NutritionIntakeUnitSchema` **no cambia**.
- **R10 — memoria de cantidad del coach** (`coach_food_last_qty`, CHECK `unit in ('g','ml','un')`): las acciones
  web/RN convierten `casera` a gramos antes de recordar; el dominio del CHECK no se amplía.
- **R11/R12 — informativos para QA.** Los snapshots de días pasados no ganan el rótulo (correcto: verdad congelada);
  un registro casera→gramos sí aporta cobertura de porciones donde `un` no lo hacía (no es regresión).
- `food-catalog-card.ts:137` deja de hardcodear `householdGrams: null` (el catálogo ya emite el par).

## 6. W3 · Republicar sin fantasmas (ARREGLA la raíz)

### 6.1 Linaje de ítems (W3.1)

- Migración `2026090XHHMMSS_nutrition_v2_item_lineage.sql`: `alter table public.nutrition_prescription_items_v2
  add column if not exists source_item_id uuid references public.nutrition_prescription_items_v2(id) on delete
  set null` + índice parcial `(source_item_id) where source_item_id is not null` + comentario.
- Borrador: `QeItem` (`editor-state.ts:138`) gana `sourceItemId: string | null`; la hidratación lo carga con el
  `id` del ítem de la versión vigente; **cualquier cambio de contenido lo anula** (`SET_ITEM_QUANTITY`,
  `STEP_ITEM_QUANTITY`, `SET_ITEM_UNIT`, `SWAP_ITEM_FOOD`, `SET_ITEM_NAME`, mover de franja); notas, opcional,
  mínimo/máximo y reemplazos lo conservan (regla: misma franja, mismo alimento/nombre, misma cantidad y unidad).
  Contrato `NutritionPlanDraft` ítem: `sourceItemId` opcional; `buildItemInsertRow` ⇒ `source_item_id`. El
  wizard (creación) no lo emite.
- `persist_and_publish_nutrition_plan_v2`: acepta `v_item ->> 'source_item_id'` solo si existe y pertenece a una
  versión **del mismo plan** (`v_plan_id`); en otro caso `null` (nunca error: el linaje es una ayuda, no un
  requisito).
- Lectura: función `private.nutrition_v2_item_alias_map(p_version_id uuid) returns table (ancestor_id uuid,
  current_id uuid)` (CTE recursiva sobre `source_item_id`, profundidad ≤ 20, sin ciclos por construcción).
  `get_nutrition_today_v2` la aplica al `entries` CTE: `prescriptionItemId` = id vigente cuando el registro apunta
  a un ancestro; `originalPrescriptionItemId` = id original solo cuando difiere. Misma resolución en
  `get_nutrition_history_detail_v2` si emite `intakeItems` por ítem. `NutritionIntakeReadItemSchema` declara
  `originalPrescriptionItemId` `.nullable().optional()`.
- Efecto: «Registrado» se conserva tras republicar sin cambiar el ítem, `consumedPrescriptionItemIds` lo cuenta,
  no hay doble marca (la idempotency key con el id nuevo nunca se genera porque la UI ya lo ve consumido).
  Un ítem modificado (30 un → 3 un) sigue huérfano a propósito: es otra comida, y W1.4 lo deja visible y retirable.
- Test SQL `supabase/tests/nutrition_v2_item_lineage_rollback.sql` (plantilla
  `nutrition_v2_persist_and_publish_rollback.sql`): v1 con ítem A; registro sobre A; v2 con A' (`source_item_id = A`)
  y B' modificado; `get_nutrition_today_v2` ⇒ registro con `prescriptionItemId = A'` y `originalPrescriptionItemId = A`;
  registro sobre B queda huérfano; `source_item_id` de otro plan ⇒ `null`. ROLLBACK.
- Caso en `bulk-mark.test.ts`: entrada resuelta cuenta como consumida.

### 6.2 Diálogo al publicar con vigencia hoy (W3.2)

- Solo cuando el alumno ya tiene registros hoy (conteo de `today.mealSlots[].intakeItems` + `unassignedIntake` del
  `get_nutrition_client_detail_v2` que la ficha ya carga; se pasa como `todayEntryCount` al editor).
- Copy (M3): «Tu alumno ya registró N comidas hoy. Lo que ya registró se conserva. Los ítems que no cambiaste
  siguen marcados como registrados.» Botones **«Aplicar hoy»** (primario, default D5 a) y «Aplicar desde
  mañana» (ghost). Web: diálogo antes de `publish` en la barra (`PublishBar.tsx`); RN: paso dentro de
  `PublishConfirmSheet` (`QuickEditSheets.tsx`).
- Contrato: `publishQuickEdit` (web, `_actions/quick-edit.actions.ts:249`) y la op `quick-edit` de
  `/api/mobile/nutrition-v2/coach/mutate` (`route.ts:79-100`) aceptan `effectiveFromChoice: 'today' | 'tomorrow'`
  (default `'today'`); el servidor calcula `effectiveFrom = choice === 'tomorrow' ? hoy + 1 : max(hoy, base.effective_from)`
  en la zona del alumno. «Desde mañana» deja la versión vigente intacta hoy: cero fantasmas por construcción.

### 6.3 Chip «Tu plan cambió hoy» (W3.3, AGREGA, extra al final)

En el Hoy del alumno (web + RN), chip discreto cuando `plan.effectiveFrom === hoy` y `plan.versionNumber > 1`.
Sin push. Se hace solo si el resto de W3 cierra con gates verdes.

## 7. W4 · El coach ve y corrige (AGREGA chico)

### 7.1 Registros del día en la ficha (W4.1)

- Web `SelectedDayPanel.tsx:169`: lista de registros del día (nombre, `formatItemQuantity`, franja, hora, chip
  «plan anterior» si `originalPrescriptionItemId`), kcal, **Retirar** y **Editar cantidad** (M4). Datos: `today`
  del detail. **Solo hoy** (decisión R3 de §5.7: el historial V2 no emite ítems; los días pasados siguen con
  agregados).
- Acciones server (`_actions/coach-intake.actions.ts`): `voidIntakeAsCoach` y `correctIntakeQuantityAsCoach`
  llaman a `void_nutrition_intake_v2` / `correct_nutrition_intake_v2` (ya autorizan al coach y auditan);
  idempotency `coach-<op>-<entryId>-<uuid>`; `revalidatePath` de la ficha. RN: ops `void-intake` y
  `correct-intake` en `/api/mobile/nutrition-v2/coach/mutate` + hoja en `apps/mobile/app/coach/nutrition-v2/[clientId].tsx`.
- Chip «N× la meta» en el encabezado del día cuando consumido / meta ≥ 2 (tone `warning`).

### 7.2 Alerta V2 (W4.2, MIDE)

`deriveNutritionV2Alerts({ todayConsumedCalories, todayTargetCalories, priorVersionEntryCount })` en
`packages/nutrition-v2/coach-alerts.ts` (puro) ⇒ `overconsumption` (danger, «Hoy registró 5.637 kcal, más de 2×
su meta de 1.556») y `prior_version_entries` (warning, «N registros de hoy son de una versión anterior del plan»).
Consumido por `deriveNutritionCoachAlerts` web (`nutrition-coach-alerts.ts:40`) y RN (`NutricionTab.tsx`).

### 7.3 Guard de catálogo por densidad (W4.3)

Migración `2026090XHHMMSS_foods_density_review.sql`: columna `foods.review_reason text null` + trigger
`private.foods_flag_density_review` (before insert / update of `calories`, `category`, `macros_basis`): categoría
`verdura` o `fruta`, base `per_100` (o nula) y `calories > 150` ⇒ `review_reason = 'density_veg_fruit_gt_150'`;
si deja de cumplirse y la razón era esa, se limpia. **No bloquea** ni toca filas existentes (el «Mix de
Vegetales» queda como está; consulta de candidatos en RUNBOOK). Test SQL rollback con tres casos.

## 8. No negociables

- Cero `UPDATE` de `nutrition_intake_entries`; cero reinterpretación de ítems publicados; cero cambio de
  resultado en `computeItemMacros`/`intakeEntryFactor` para g/ml/un/porción (tests byte-idénticos).
- Migraciones aditivas, idempotentes, `not valid` + `validate` para CHECKs; validadas en LIVE **solo** con
  `BEGIN … ROLLBACK`; aplicadas después del deploy web y antes de la OTA, con OK explícito del owner por ola.
- No borrar V1; no tocar `service_role`; contratos compatibles con builds RN viejas (claves nuevas opcionales).
- UI con el EVA DS existente (tokens semánticos, `warning`, Archivo/Hanken, 44 pt en RN, dark + white-label);
  mockups M1–M4 del artifact aprobados antes de la UI; copy en español latam neutro.
- Gates reales por ola (TASKS); E2E `qa:prod:suave` solo al cierre del tren.
