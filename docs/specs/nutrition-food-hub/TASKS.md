# TASKS — T2.3 Hub de Alimentos

Estado: **SPEC/PLAN/TASKS escritas. D1/D2/D3 decididas por el owner el 2026-08-09.** Pendiente: revision de Fable sobre el plan antes de escribir codigo (pedido del owner).

## F0 — Puerta

- [x] Auditoria de estado real contra HEAD (2026-08-09)
- [x] SPEC / PLAN / TASKS
- [x] Decisiones del owner: D1 si (filtro entra), D2 redirect **Y borrado en la misma tanda**, D3 no retirar meal-groups/recipes
- [ ] Revision de Fable sobre SPEC + PLAN

## F1 — Filtro "Editados por mi"

- [ ] Logica pura de filtrado + test unitario (catalogo mezclado → solo overrides del coach activo)
- [ ] Control de filtro en `FoodCatalogBrowser`, estado en URL
- [ ] Verificar que NO dispara republicacion ni toca planes publicados
- [ ] Gate: typecheck + test + `check:nutrition-v2-boundaries`

## F2 — Crear alimento en el tab

- [ ] Montar `AddFoodSheet` desde el tab Alimentos
- [ ] Cargar `exchangeGroups` en el server component del hub SOLO para este tab (sin sumar queries a las otras 3)
- [ ] Bloquear guardado de alimento individual sin kcal/P/C/G (regla owner 2026-08-05)
- [ ] El listado del tab refleja el alimento nuevo sin recarga dura
- [ ] Gate: typecheck + lint + suite; QA desktop y ancho de telefono

## F3 — Clasificar y porciones: formulario unico

- [ ] Unificar `ClassifyFoodSheet` + `ExchangeListEntrySheet` + `ExchangePortionsSection` en una sola gramatica de grupo
- [ ] Extraer a modulo puro con test la logica duplicada que aparezca (no copiar)
- [ ] Gate: typecheck + lint + suite; QA de clasificacion completa en los dos anchos

## F4 — Verificacion de importadores

- [ ] `grep -rn "app/coach/foods" apps/web/src` → cero importadores fuera de la carpeta; pegar salida en el acta
- [ ] Confirmar por escrito que `meal-groups/_actions` y `_data` los consume SOLO V1 (`nutrition-plans`)
- [ ] Confirmar que `recipes` vive entero en V1 + `api/recipes/search`
- [ ] Corregir el bullet de T2.3 en `nutrition-flows-redesign/TASKS.md`: de "retirar" a "verificado, no se retira (V1 viva)"
- [ ] Gate: `docs:check`

## F5 — Redirect Y borrado (decision D2)

Orden obligatorio: mudar → verificar → borrar. Al reves se rompe.

- [ ] Correr `pnpm check:nutrition-v2-boundaries` **antes** de mover los sheets: `AddFoodSheet.tsx:12` y `ClassifyFoodSheet.tsx:21` importan actions de V1 y dentro del arbol V2 eso puede violar el gate
- [ ] Mudar `_actions/food-equivalence.actions.ts` y `_actions/exchange-lists.actions.ts` al hub (`ClassifyFoodSheet.tsx:23` depende del primero)
- [ ] Comparar `FoodBrowser` contra `FoodCatalogBrowser` funcion por funcion; cubrir en el tab lo que falte ANTES de borrar
- [ ] `/coach/foods/page.tsx` → redirect al tab Alimentos del hub
- [ ] `nutrition-onboarding-shared.ts:25` apunta directo al tab
- [ ] Borrar `_components/`, el resto de `_actions/` y `_data/`
- [ ] Dejar los tres `revalidatePath('/coach/foods')` de V1 (no-op; sacarlos obliga a tocar V1)
- [ ] Commit propio, separado de F1-F4: el rollback de esta fase es revert entero
- [ ] Gate: suite completa + boundaries + typecheck + lint + QA de las dos entradas + `docs:check`

## Cierre

- [ ] Actualizar `nutrition-flows-redesign/TASKS.md` (T2.3 cerrada) y su registro de cierres
- [ ] Anotar deuda: paridad RN del tab Alimentos; los tres `revalidatePath` muertos en V1

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|-------|------|--------|-------|-------|
| 2026-08-09 | F0 | (este commit) | docs:check | SPEC/PLAN/TASKS. Dos hallazgos que cambian el alcance escrito: las rutas a retirar ya no existen (H1) y T2.2 dejo huerfano el filtro "Editados por mi" (H2). |
