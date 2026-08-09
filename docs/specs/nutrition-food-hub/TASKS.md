# TASKS — T2.3 Hub de Alimentos

Estado: **Revision de Fable hecha el 2026-08-09: plan APROBADO con correcciones asentadas en SPEC y PLAN.** Orden de fases y corte de alcance validados. Correcciones: `FoodSearch.tsx` sobrevive a F5 (2 importadores V1), el gate de boundaries NO salta con la mudanza (verificado), mecanismo de F1 detallado (segundo data path por offset), y puerta previa a F5 (conteo LIVE + decision de paridad de navegacion). Rama de trabajo confirmada: `rnmobiledenuevo` — en `master` no existe el stack de overrides y el filtro naceria vacio.

## F0 — Puerta

- [x] Auditoria de estado real contra HEAD (2026-08-09)
- [x] SPEC / PLAN / TASKS
- [x] Decisiones del owner: D1 si (filtro entra), D2 redirect **Y borrado en la misma tanda**, D3 no retirar meal-groups/recipes
- [x] Revision de Fable sobre SPEC + PLAN — 2026-08-09, aprobada con correcciones (ver Estado); claims de la SPEC verificados contra codigo por workers: 9 confirmados, 2 refutados (importadores de meal-groups son 2, no 4; `FoodSearch.tsx` tiene importadores externos), 1 parcial (`ExchangeListEntrySheet` se monta via `ExchangePortionsSection`, no directo en `page.tsx`)

## F1 — Filtro "Editados por mi"

- [ ] Funcion de repo `findCoachFoodOverridePage` (offset, constante de columnas propia — no mutar `ROW_COLUMNS`)
- [ ] Action de lectura nueva en `_actions/food-catalog.actions.ts` con `authorizeHubCoach` + hidratacion batch `.from('foods').in('id', ids)` + `resolveFoodMacros`
- [ ] Logica pura de filtrado/mapeo + test unitario (catalogo mezclado → solo overrides del coach activo; sin mock de Supabase)
- [ ] Control de filtro en `FoodCatalogBrowser`, estado en URL via `history.replaceState` (mecanismo del `?tab=`); toggle resetea items/cursor/hasMore y aborta requests en vuelo
- [ ] `hasOverride` agregado a `FoodCatalogCardModel` + badge ✎ (patron `ItemRow.tsx:151`); predicado estricto `=== true`
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

Orden obligatorio: puerta previa → mudar → verificar → borrar. Al reves se rompe.

- [ ] **Puerta previa (revision 2026-08-09):** QA owner de F2/F3 + conteo LIVE de foods invisibles para el RPC (`rejected` o pais no CL/null) + decision owner de paridad de navegacion (ver PLAN)
- [ ] Mudar `_actions/food-equivalence.actions.ts` y `_actions/exchange-lists.actions.ts` al hub (`ClassifyFoodSheet.tsx:23` depende del primero); `FoodEquivalenceFields.tsx` viaja con los sheets
- [ ] Correr `pnpm check:nutrition-v2-boundaries` tras la mudanza (verificado 2026-08-09 que no salta; correr igual)
- [ ] La comparacion `FoodBrowser` vs `FoodCatalogBrowser` YA ESTA HECHA (revision 2026-08-09, ver PLAN puerta previa); cubrir en el tab lo que el owner decida ANTES de borrar
- [ ] `/coach/foods/page.tsx` → redirect al tab Alimentos del hub
- [ ] `nutrition-onboarding-shared.ts:25` apunta directo al tab
- [ ] Borrar `_components/`, el resto de `_actions/` y `_data/` — **`FoodSearch.tsx` NO se borra** (importado por `FoodCatalogCurationQueue.tsx:10` y `StructuredRecipeDialog.tsx:16`, ambos V1)
- [ ] Actualizar comentario de `api/mobile/nutrition/exchanges/group-foods/route.ts:21` (apunta a la ruta vieja de las actions); anotar `FoodListCompact` como huerfano (no borrar en esta tanda)
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
| 2026-08-09 | F0 revision | (este commit) | docs:check | Revision de Fable: plan aprobado con correcciones. `FoodSearch.tsx` sobrevive a F5; boundaries no salta con la mudanza (verificado); mecanismo F1 = segundo data path offset sobre `coach_food_overrides`; puerta previa a F5 (conteo LIVE + paridad navegacion). Rama confirmada `rnmobiledenuevo` (specs cherry-picked desde master). |
