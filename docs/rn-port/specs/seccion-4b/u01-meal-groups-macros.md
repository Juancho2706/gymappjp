# 4B-01 — Macros de grupos de comidas: motor compartido (P0)

Archivos RN: `apps/mobile/app/coach/meal-groups.tsx`, `apps/mobile/lib/meal-groups.ts`,
test nuevo. Disjunto de las demás unidades de la wave.
Referencia web: `MealGroupLibraryClient.tsx:30-48` y `MealGroupModal.tsx:56-71`, ambos sobre
`calculateFoodItemMacros` de `@eva/nutrition-engine` (`packages/nutrition-engine/macros.ts:120-135`).

## Hallazgo (P0 — datos visibles divergentes)

RN reimplementa los macros a mano en `meal-groups.tsx:41-52` (`itemMacros`) y
`lib/meal-groups.ts:163-184` (`mealGroupTotals`): para unidad `un` usa `factor = quantity`,
ignorando `serving_size`; el motor web usa `factor = quantity × serving_size / 100`.
Caso concreto: huevo `serving_size=60`, `protein_g=13/100g`, ítem `2 un` → web 15.6 g de
proteína; RN 26 g. Las tarjetas de grupo (`meal-groups.tsx:304,310-312`) y el "Total estimado"
del editor (`:167,266-268`) muestran números inflados. El comentario de `lib/meal-groups.ts:162`
("misma fórmula que la web") es falso. RN ya importa `@eva/nutrition-engine` en 10+ archivos.

## Cierre

1. Eliminar las dos copias locales; consumir `calculateFoodItemMacros` (y agregador del motor si
   existe) desde `@eva/nutrition-engine` en lista y editor.
2. Adoptar el redondeo del motor/web (1 decimal), retirando el `Math.round` a entero local.
3. Test de regresión con el caso huevo (2 `un`, serving 60 → 15.6 g P) + caso `g` sin cambio.

## Comprobación objetiva

Grupo con ítem en `un` y `serving_size ≠ 100`: la tarjeta y el total del editor RN muestran los
mismos números que la web (motor compartido, 1 decimal).

## Cierre (2026-07-21)

Aplicado:

1. Eliminadas las dos copias locales de la fórmula: `itemMacros` en
   `apps/mobile/app/coach/meal-groups.tsx` y el cuerpo manual de `mealGroupTotals` en
   `apps/mobile/lib/meal-groups.ts`. Ambas superficies consumen ahora el motor compartido
   `calculateFoodItemMacros` de `@eva/nutrition-engine` a través de un único helper nuevo
   `mealGroupItemMacros(item)` en `lib/meal-groups.ts`, que mapea el shape RN
   (`MealGroupItem.food: FoodRow | null`) al `FoodItemForMacros` del motor — mismo consumo que
   la web `MealGroupLibraryClient`/`MealGroupModal`. `mealGroupTotals` es ahora un `reduce` sobre
   ese helper (1:1 con la web `calculateTotals`).
2. Retirado el `Math.round` a entero que vivía dentro del cálculo por ítem. El helper devuelve el
   valor del motor (1 decimal); el `Math.round` que queda en RN es solo de PRESENTACIÓN en la
   tarjeta del ítem (`meal-groups.tsx`), espejo del `Math.round` de display de la web
   (`MealGroupModal.tsx:241`). Los totales suman los macros por ítem del motor (1 decimal) antes
   de redondear al mostrar, igual que la web.
3. Test de regresión `tests/mobile-meal-groups-macros.test.ts`: caso huevo (`2 un`, serving 60 →
   15.6 g P, no 26), caso `g` sin cambio (100 g → 13 g P), normalización legacy `u → un`,
   igualdad con el consumo directo del motor y guardas de `food` nulo / grupo vacío.

Hallazgos:

- El comentario "misma fórmula que la web" de `lib/meal-groups.ts` era falso (usaba
  `factor = quantity` para `un`); reemplazado por documentación correcta.
- Normalización `'u' → 'un'` replicada desde la web por filas legacy; el motor ya trata toda
  unidad no-`g/ml` como count, así que es defensivo, no funcional.
- Sin cambios de escritura: `saveMealGroup` sigue guardando `unit` tal cual; solo cambia el
  cálculo/visualización de macros. `groupToDraftItems` intacto.
