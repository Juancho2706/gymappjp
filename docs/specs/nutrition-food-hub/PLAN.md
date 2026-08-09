# PLAN — T2.3 Hub de Alimentos

Cinco fases. Cada una deja el sistema entero y desplegable: si la tanda se corta a mitad, nada queda roto ni a medias. El redirect es la ULTIMA fase a proposito — mover la puerta antes de mudar los muebles deja al coach en una pieza vacia.

## Orden y por que

| Fase | Que | Por que va aca | Riesgo |
|---|---|---|---|
| F1 | Filtro "Editados por mi" en el tab | Es la pieza mas chica y la unica sin dependencias: solo lectura sobre datos que ya existen. Valida el circuito del tab antes de meterle escritura. | Bajo |
| F2 | Crear alimento dentro del tab | La escritura mas simple: un sheet, un action que ya existe. | Medio |
| F3 | Clasificar + porciones, formulario unico | La parte con mas gramatica propia. Depende de F2 solo por convivencia visual. | Medio |
| F4 | Verificacion de importadores + doc de `meal-groups`/`recipes` | Antes de tocar la puerta hay que probar que nadie mas entra por atras. | Bajo |
| F5 | `/coach/foods` → redirect **+ borrado** | Solo cuando F2 y F3 estan en verde y con QA. Decision D2 = corte directo, asi que es la fase MAS pesada: hay actions que se mudan y un gate de boundaries que puede saltar. | Alto |

## F1 — Filtro "Editados por mi"

Rescate del huerfano de T2.2 (ver SPEC, H2).

- Fuente de verdad: los overrides del coach ya viven en `coach_food_overrides` y el catalogo los mergea en el choke point `food_catalog_v2_item_json`. **No se crea tabla ni RPC nueva**: el filtro consulta lo que ya existe.
- **Mecanismo verificado (revision 2026-08-09).** El RPC de busqueda ya emite `hasOverride`/`original` por item y el contrato de esta rama ya los declara (`packages/nutrition-v2/catalog.ts:108`). Pero filtrar client-side la pagina del RPC NO cumple el criterio 3: el tab exige query de 2+ chars y la pagina de 20 se filtra local (paginas casi vacias con "Cargar mas" lleno). El modo filtro es un **segundo data path**: action de lectura nueva en `_actions/food-catalog.actions.ts` (mismo guard `authorizeHubCoach`) que pagina `coach_food_overrides` por **offset** (RLS `cfo_select_own` ya permite leer; funcion de repo nueva `findCoachFoodOverridePage` en `infrastructure/db/coach-food-overrides.repository.ts`, constante de columnas propia — no mutar `ROW_COLUMNS`, la usan freeze y rehidratacion) e hidrata identidad con UN `.from('foods').in('id', ids)` + `resolveFoodMacros` (`packages/nutrition-v2/food-overrides.ts`). Patron de paginacion: `CurationQueue`/`curation.actions.ts`. Miniatura: se acepta `media: null` (icono de categoria); `food_media` seria un tercer round-trip. Cero cambio de DB.
- Gotchas obligatorios: togglear el filtro **resetea items/cursor/hasMore y aborta el request en vuelo** (los dos paths tienen cursores incompatibles: keyset vs offset); predicado `hasOverride === true` (el campo es nullable — `undefined` significa "sin merge aplicado", no "sin override"); el badge ✎ en la card reutiliza el patron de `[clientId]/builder/_components/ItemRow.tsx:151` y exige agregar `hasOverride` a `FoodCatalogCardModel` (`_lib/food-catalog-card.ts` hoy lo descarta).
- UI: control de filtro en `FoodCatalogBrowser`, junto a la busqueda. Estado en la URL, coherente con el resto del hub (tabs en URL, decision de O1) — **con el mismo mecanismo del `?tab=`: `history.replaceState` leyendo `window.location.search`, NO `router.replace`** (refetchearia roster + picker en cada toggle). El param se omite en su default.
- Dentro del modo filtro, la busqueda por nombre se hace en cliente sobre el universo ya cargado (decenas de filas por coach) — no intersectar con `search_food_catalog_v2`.
- El filtro es de lectura pura. No propaga, no republica, no toca planes publicados.
- Prueba: unitaria sobre la logica de filtrado (entra un catalogo mezclado, salen solo los que tienen override del coach activo). Sin mock de Supabase en la logica pura.

**Gate F1:** `pnpm typecheck`, test nuevo verde, `check:nutrition-v2-boundaries`.

## F2 — Crear alimento en el tab

- `AddFoodSheet` se monta desde el tab Alimentos. El contrato server no cambia: mismo action, mismos guards.
- `exchangeGroups` se carga en el server component del hub **solo para el tab Alimentos**; no puede convertirse en un cuarto query que corre siempre (el hub ya sufrio flood de queries en O1).
- Regla owner 2026-08-05: el formulario no deja guardar un alimento individual sin kcal/P/C/G. Si el sheet actual lo permite, se cierra aca.
- Tras crear, el listado del tab refleja el alimento nuevo sin recarga dura.

**Gate F2:** typecheck + lint + suite; QA manual: crear alimento desde el tab en desktop y en ancho de telefono.

## F3 — Clasificar y porciones: formulario unico

- `ClassifyFoodSheet` + lo que hoy vive suelto en `ExchangeListEntrySheet` y `ExchangePortionsSection` se presentan como **una sola gramatica de grupo**: elegir grupo y definir porciones en el mismo flujo, no en dos sheets encadenados.
- Si al unificar aparece logica de negocio duplicada entre esos componentes, se extrae a modulo puro con test, no se copia.
- Sin cambios de schema ni de actions: es reorganizacion de UI sobre contratos existentes.

**Gate F3:** typecheck + lint + suite; QA manual de clasificacion completa (grupo + porciones) en los dos anchos.

## F4 — Verificacion de importadores

Antes de tocar `/coach/foods`:

1. `grep -rn "app/coach/foods" apps/web/src` — cero importadores fuera de la propia carpeta (hoy: 3 `revalidatePath` + 1 link de onboarding, todos por RUTA, no por import).
2. Confirmar que `meal-groups/_actions` y `_data` siguen consumidos SOLO por V1 (`nutrition-plans`), y dejarlo escrito.
3. Confirmar que `recipes` vive entero en V1 + `api/recipes/search`.
4. Actualizar el bullet de T2.3 en el TASKS del programa: de "retirar" a "verificado, no se retira porque es V1 viva".

**Gate F4:** el grep como evidencia en el acta; `docs:check`.

## F5 — Redirect Y borrado de `/coach/foods`

Decision D2 del owner: corte directo, sin dejar la carpeta dos semanas. Eso convierte a F5 en la fase mas pesada, no la mas liviana.

**Puerta previa a F5 (agregada en la revision 2026-08-09) — sin esto F5 no arranca:**

- QA sobre F2 y F3 — **decision owner 2026-08-09: F5 se ejecuta primero y el QA (owner + Claude en navegador) va despues, sobre la rama, antes del merge a master.**
- Conteo en LIVE de alimentos invisibles para el RPC — **HECHO 2026-08-09: 0 filas** (4.649 foods, 24 de coach, 0 rejected, 0 pais≠CL).
- Paridad de navegacion — **DECIDIDA 2026-08-09: "minimo funcional", e IMPLEMENTADA como F4.5**: navegar sin buscar (browse por offset con la misma semantica de visibilidad que el RPC) + chip "Solo míos" (universo propio, busqueda local) + badge "Propio" por fila. Se degrada asumido: filtro por categoria, orden Nombre/Kcal/Prot, contador de total, tabla densa desktop y hint de unidad casera. Los tres modos (`todos`/`mios`/`editados`) son un solo valor excluyente (`_lib/food-catalog-mode.ts`).

Orden interno obligatorio:

1. **Mudar antes de borrar.** `_actions/food-equivalence.actions.ts` y `_actions/exchange-lists.actions.ts` pasan al hub. `ClassifyFoodSheet.tsx:23` depende del primero; si la carpeta muere antes, el sheet mudado queda sin action.
2. **Correr `pnpm check:nutrition-v2-boundaries` tras mover los sheets, como verificacion.** Revision 2026-08-09: verificado import por import que la mudanza NO viola el gate (lista negra de shells V1, no de dominio; precedente verde `client-food-prefs.data.ts:6`), asi que no hay "media fase extra" esperable. `FoodEquivalenceFields.tsx` viaja con los sheets; el import relativo de `ClassifyFoodSheet` a las actions se reescribe.
3. **Comparar `FoodBrowser` contra `FoodCatalogBrowser` funcion por funcion.** El primero muere con la carpeta. Si lista, filtra o pagina algo que el tab no hace, se pierde funcion y el invariante 5 lo prohibe.
4. `page.tsx` → `redirect` al tab Alimentos del hub.
5. El link de onboarding (`nutrition-onboarding-shared.ts:25`) apunta directo al tab, sin pasar por el redirect.
6. Borrar `_components/`, lo que quede de `_actions/` y `_data/`. **`FoodSearch.tsx` (raiz de la carpeta) NO se borra**: lo importan `FoodCatalogCurationQueue.tsx:10` y `recipes/StructuredRecipeDialog.tsx:16` (V1). Sobreviven `page.tsx` (redirect) y `FoodSearch.tsx`.
6b. Actualizar el comentario de `api/mobile/nutrition/exchanges/group-foods/route.ts:21`, que quedaria apuntando a la ruta muerta de las actions mudadas. `FoodListCompact` (`components/coach/`) queda sin consumidores — anotar como candidato a borrar, no borrarlo en esta tanda.
7. Los tres `revalidatePath('/coach/foods')` de V1 se dejan: son no-op sobre una ruta inexistente y sacarlos obliga a tocar V1. Deuda menor anotada.

**Gate F5:** suite completa + `check:nutrition-v2-boundaries` + typecheck + lint + QA de las dos entradas (onboarding y URL directa) + `docs:check`.

**Rollback F5:** revert del commit entero (ya no es una linea — costo asumido en D2). Por eso F5 va en un commit propio y separado de F1-F4.

## Fuera de esta PLAN

- Paridad RN del tab Alimentos (`apps/mobile/app/coach/nutrition-v2/foods.tsx`).
- Sacar los tres `revalidatePath('/coach/foods')` de V1 (no-op inofensivo; sacarlos obliga a tocar V1).

Nota: la deuda "unificar los dos navegadores" **deja de ser deuda y entra en F5** por la decision D2 — al borrar la carpeta, `FoodBrowser` muere y el tab tiene que cubrir todo lo suyo.

## Rollback

Cada fase es un commit propio. F1-F4 revierten sin tocar datos: no hay migracion en toda la tarea. F5 revierte con un revert del commit entero (costo asumido en D2).
