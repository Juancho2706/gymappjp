# TASKS — T2.3 Hub de Alimentos

Estado: **Revision de Fable hecha el 2026-08-09: plan APROBADO con correcciones asentadas en SPEC y PLAN.** Orden de fases y corte de alcance validados. Correcciones: `FoodSearch.tsx` sobrevive a F5 (2 importadores V1), el gate de boundaries NO salta con la mudanza (verificado), mecanismo de F1 detallado (segundo data path por offset), y puerta previa a F5 (conteo LIVE + decision de paridad de navegacion). Rama de trabajo confirmada: `rnmobiledenuevo` — en `master` no existe el stack de overrides y el filtro naceria vacio.

## F0 — Puerta

- [x] Auditoria de estado real contra HEAD (2026-08-09)
- [x] SPEC / PLAN / TASKS
- [x] Decisiones del owner: D1 si (filtro entra), D2 redirect **Y borrado en la misma tanda**, D3 no retirar meal-groups/recipes
- [x] Revision de Fable sobre SPEC + PLAN — 2026-08-09, aprobada con correcciones (ver Estado); claims de la SPEC verificados contra codigo por workers: 9 confirmados, 2 refutados (importadores de meal-groups son 2, no 4; `FoodSearch.tsx` tiene importadores externos), 1 parcial (`ExchangeListEntrySheet` se monta via `ExchangePortionsSection`, no directo en `page.tsx`)

## F1 — Filtro "Editados por mi"

- [x] Funcion de repo `findCoachFoodOverridePage` (offset, `PAGE_ROW_COLUMNS` propia, resultado discriminado ok/error para no degradar fallo a "no corregiste nada")
- [x] Action `listCoachEditedFoodsHubAction` con `authorizeHubCoach` (que ahora devuelve `coachId` del actor) + hidratacion batch `.in('id', ids)` + `resolveFoodMacros`; salida validada con Zod
- [x] Modulo puro `_lib/edited-foods.ts` (mapper + predicado `=== true` + `matchesFoodQuery` sin acentos) + 15 tests sin mock de Supabase
- [x] Chip "Editados por mí" en `FoodCatalogBrowser` (`?foods=editados` via `history.replaceState`); toggle aborta y vacia; busqueda local en modo filtro; 2 estados vacios distintos
- [x] `hasOverride` en `FoodCatalogCardModel` + badge ✎ (patron ItemRow); de paso `basisLabel` ya no miente en filas `per_serving`
- [x] Lectura pura verificada: sin `revalidatePath`, no toca planes publicados
- [x] Gate: boundaries verde (312 archivos/8 raices), tsc web verde, vitest 1028 tests verdes (76 archivos), eslint verde. Pendiente: QA visual navegador (desktop/360px) — owner
- [x] Bonus: fix de bug preexistente (`loadingMore` quedaba pegado si una busqueda nueva superaba al "Cargar mas")

## F2 — Crear alimento en el tab

- [x] `AddFoodSheet` montado desde el tab (boton "Nuevo alimento"); el sheet sigue viviendo en `coach/foods/_components` hasta F5, con props nuevas `trigger`/`onOpenChange`/`onCreated`
- [x] `exchangeGroups`: DESVIO del PLAN documentado — carga lazy client-side en la primera apertura del sheet via `loadExchangeGroupsForCoachAction` (el server component no sirve: el tab cambia con `history.replaceState` sin refetch del RSC). Cero queries extra para las otras 3 tabs
- [x] Guard kcal/P/C/G en el sheet (modulo puro `_lib/custom-food-macros.ts` + 18 tests): los 4 ya eran `required`; lo nuevo = bloquear 0/0/0/0 y rangos con mensaje en español sin round-trip. ⚠️ Decision reversible para el owner: 0/0/0/0 bloqueado impide crear "Agua" custom (el catalogo global ya la tiene)
- [x] Listado refleja el alimento nuevo: re-apunta la busqueda al nombre creado + `searchNonce` (cubre "busque pollo, no estaba, lo cree"); verificado en migraciones que el RPC SI ve el alimento recien creado (`unverified`, `country_code` null)
- [x] Bonus: 2 bugs preexistentes del sheet arreglados (2do alimento en la misma sesion no cerraba ni tosteaba; `requestFormReset` de React 19 borraba lo tipeado al rebotar validacion — resuelto en `onSubmit`, pineado con tests)
- [x] Gate: boundaries 314/8 verde, tsc web verde, vitest 599/599 (41 archivos), eslint verde. QA desktop/telefono: pendiente owner

## F3 — Clasificar y porciones: formulario unico

- [x] Formulario unico `ClassifyFoodFlow` en el hub: estado actual → grupo → gramos (sugerencia client-side con `suggestPortionGrams`) → medida casera → preview → guardar. Entrada por la ficha (`FoodDetailSheet` gano prop opcional `footerAction`; el picker del builder no la pasa). Los componentes viejos de `/coach/foods` quedaron intactos
- [x] Hallazgo de fondo: hay DOS caminos de escritura segun propiedad — alimento propio ⇒ `setFoodExchangeEquivalenceAction`; ajeno/global ⇒ `saveExchangeListEntryAction`/`exclude`/`restore` sobre MI fila. Elegir camino es logica de negocio ⇒ vive en `planFoodClassification` (modulo puro `_lib/food-classification.ts`, 29 tests)
- [x] Lectura nueva ADITIVA (unica desviacion, sin RPC ni schema): `loadFoodExchangeClassificationHubAction` + `getFoodExchangeClassification` + `findOwnExchangeListRowsForFood` — ninguna action existente respondia "en que grupo esta ESTE alimento" (todas parten del grupo; 10+ round-trips por apertura)
- [x] Bug legacy destapado y cubierto: alimento ajeno con `foods.exchange_group_id` (rank 3) quedaria en DOS grupos al reclasificar; el plan emite lapida (`exclude`, rank 0) y la UI avisa. Verificado contra `20260804091000_...sql`
- [x] Teclado movil: `max-h-[min(92dvh,760px)]` (los sheets viejos usan `90vh`, que el teclado tapa); la ficha se cierra antes de abrir el flujo
- [x] Gate: boundaries 317/8 verde, tsc web verde, vitest 628/628 (42 archivos), eslint verde. QA de clasificacion completa (propio + global + reclasificar + quitar, dos anchos): pendiente owner — ES PUERTA DE F5

## F4 — Verificacion de importadores

- [x] Grep de importadores de `coach/foods` fuera de la carpeta (2026-08-09, post-F3). Salida completa — 6 imports en 2 categorias, todos con destino conocido:
  - `FoodCatalogCurationQueue.tsx:10` y `recipes/StructuredRecipeDialog.tsx:16` (V1) importan `FoodSearch` → por eso `FoodSearch.tsx` SOBREVIVE a F5.
  - `ClassifyFoodFlow.tsx:36,41` y `FoodCatalogBrowser.tsx:20,21` (V2, creados en F2/F3) importan sheets/actions → se REESCRIBEN en la mudanza de F5.
  - Referencias por string de ruta: `nutrition-coach.actions.ts:649,673,997` (revalidatePath, se dejan) + `nutrition-onboarding-shared.ts:25` (link, se re-apunta en F5).
- [x] `meal-groups/_actions` consumido SOLO por V1: `PlanBuilder/FoodSearchDrawer.tsx:18` (`listCoachMealGroups`) y `PlanBuilder/PlanBuilder.tsx:58` (`saveMealGroup`). `meal-groups/_data`: cero importadores externos (solo el propio actions). NO se retira: V1 viva.
- [x] `recipes` vive entero en V1 (`nutrition-plans/_components/recipes/*` + `api/recipes/search`); grep fuera de V1 = vacio. NO se retira.
- [x] Bullet de T2.3 en `nutrition-flows-redesign/TASKS.md` ya corregido en `cdacf6dd` (tachado + RE-ALCANCE 2026-08-09).
- [x] Gate: `docs:check` verde.

## F5 — Redirect Y borrado (decision D2)

Orden obligatorio: puerta previa → mudar → verificar → borrar. Al reves se rompe.

- [x] **Puerta previa (cerrada 2026-08-09):** conteo LIVE = 0 alimentos invisibles (4.649 foods, 24 de coach); paridad de navegacion decidida ("minimo funcional") e implementada como F4.5; QA movido a DESPUES de F5 por decision del owner (sobre la rama, antes del merge)
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
| 2026-08-09 | F1 | 8290287b | boundaries + tsc web + vitest 1028/1028 + eslint | Filtro "Editados por mí" completo: repo paginado + action + modulo puro con 15 tests + chip con URL state + badge ✎ + fix basisLabel per_serving. Conteo LIVE puerta F5: 0 alimentos invisibles para el RPC. Pendiente owner: QA visual desktop/360px. |
| 2026-08-09 | F2 | 940e3875 | boundaries + tsc web + vitest 599/599 + eslint | Crear alimento desde el tab. exchangeGroups lazy (desvio del PLAN documentado), guard kcal/P/C/G puro con tests, re-apuntado de busqueda tras crear. 2 bugs preexistentes del sheet arreglados. Pendiente owner: QA desktop/360px y decision sobre bloqueo 0/0/0/0. |
| 2026-08-09 | F3 | 34f8e0ec | boundaries + tsc web + vitest 628/628 + eslint | Formulario unico de clasificacion en el tab (ClassifyFoodFlow + planFoodClassification puro con 29 tests). Dos caminos de escritura segun propiedad, lapida anti doble-grupo legacy, lectura nueva aditiva sin RPC. Pendiente owner: QA completa en dos anchos (puerta de F5). |
| 2026-08-09 | F4 | 462869b1 | docs:check | Verificacion de importadores con evidencia pegada arriba: 6 imports externos, todos con destino conocido (2 V1→FoodSearch sobrevive, 4 V2→se reescriben en F5). meal-groups y recipes confirmados solo-V1, no se retiran. |
| 2026-08-09 | F4.5 | (este commit) | boundaries 319/8 + tsc web + vitest 1099/1099 + eslint | Paridad minima decidida por el owner: browse sin buscar (offset, misma visibilidad que el RPC, pais con regex anti-inyeccion), chip "Solo míos" (pagina 50, busqueda local), badge "Propio", maquina pura de modos con 14 tests. Mapper de F1 generalizado. |
