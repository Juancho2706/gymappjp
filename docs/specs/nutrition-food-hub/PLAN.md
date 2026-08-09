# PLAN — T2.3 Hub de Alimentos

Cinco fases. Cada una deja el sistema entero y desplegable: si la tanda se corta a mitad, nada queda roto ni a medias. El redirect es la ULTIMA fase a proposito — mover la puerta antes de mudar los muebles deja al coach en una pieza vacia.

## Orden y por que

| Fase | Que | Por que va aca | Riesgo |
|---|---|---|---|
| F1 | Filtro "Editados por mi" en el tab | Es la pieza mas chica y la unica sin dependencias: solo lectura sobre datos que ya existen. Valida el circuito del tab antes de meterle escritura. | Bajo |
| F2 | Crear alimento dentro del tab | La escritura mas simple: un sheet, un action que ya existe. | Medio |
| F3 | Clasificar + porciones, formulario unico | La parte con mas gramatica propia. Depende de F2 solo por convivencia visual. | Medio |
| F4 | Verificacion de importadores + doc de `meal-groups`/`recipes` | Antes de tocar la puerta hay que probar que nadie mas entra por atras. | Bajo |
| F5 | `/coach/foods` → redirect al tab | Solo cuando F2 y F3 estan en verde y con QA. | Medio |

## F1 — Filtro "Editados por mi"

Rescate del huerfano de T2.2 (ver SPEC, H2).

- Fuente de verdad: los overrides del coach ya viven en `coach_food_overrides` y el catalogo los mergea en el choke point `food_catalog_v2_item_json`. **No se crea tabla ni RPC nueva**: el filtro consulta lo que ya existe.
- UI: control de filtro en `FoodCatalogBrowser`, junto a la busqueda. Estado en la URL, coherente con el resto del hub (tabs en URL, decision de O1).
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

## F5 — Redirect de `/coach/foods`

- `page.tsx` pasa a `redirect('/coach/nutrition-v2?tab=foods')` (o el parametro que use el hub).
- La carpeta `_components`/`_actions`/`_data` **no se borra** en esta tanda (decision D2): revertir tiene que costar una linea.
- El link de la guia de onboarding (`nutrition-onboarding-shared.ts:25`) apunta directo al tab, sin pasar por el redirect.
- Los tres `revalidatePath('/coach/foods')` se dejan: son inofensivos sobre una ruta que redirige, y sacarlos es ruido en un archivo de V1.

**Gate F5:** suite completa + QA de las dos entradas (onboarding y URL directa) + `docs:check`.

## Fuera de esta PLAN

- Unificar `FoodBrowser` con `FoodCatalogBrowser` (dos navegadores conviviendo). Es deuda anotada, no bloquea; se hace cuando `/coach/foods` se borre de verdad.
- Paridad RN del tab Alimentos (`apps/mobile/app/coach/nutrition-v2/foods.tsx`).
- Borrado fisico de `/coach/foods`, dos semanas despues del redirect estable.

## Rollback

Cada fase es un commit propio. F5 revierte con un revert de una linea. F1-F3 revierten sin tocar datos: no hay migracion en toda la tarea.
