# TASKS — T2.3 Hub de Alimentos

Estado: **SPEC escrita, esperando OK del owner sobre D1/D2/D3** (ver SPEC). Nada de codigo arranca antes de eso.

## F0 — Puerta

- [x] Auditoria de estado real contra HEAD (2026-08-09)
- [x] SPEC / PLAN / TASKS
- [ ] OK del owner a D1 (recoger el filtro huerfano de T2.2), D2 (redirect sin borrar) y D3 (no retirar meal-groups/recipes)

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

## F5 — Redirect

- [ ] `/coach/foods/page.tsx` → redirect al tab Alimentos del hub
- [ ] `nutrition-onboarding-shared.ts:25` apunta directo al tab
- [ ] NO borrar `_components`/`_actions`/`_data` de `/coach/foods` (decision D2)
- [ ] Gate: suite completa + QA de las dos entradas + `docs:check`

## Cierre

- [ ] Actualizar `nutrition-flows-redesign/TASKS.md` (T2.3 cerrada) y su registro de cierres
- [ ] Anotar deuda: unificar `FoodBrowser` con `FoodCatalogBrowser`; paridad RN; borrado fisico de `/coach/foods` a las dos semanas

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|-------|------|--------|-------|-------|
| 2026-08-09 | F0 | (este commit) | docs:check | SPEC/PLAN/TASKS. Dos hallazgos que cambian el alcance escrito: las rutas a retirar ya no existen (H1) y T2.2 dejo huerfano el filtro "Editados por mi" (H2). |
