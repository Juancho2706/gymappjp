# Delta del mapa de deprecacion V1 — verificado contra `master` el 2026-08-03

Fecha: 2026-08-03 · HEAD verificado: `d1ffbf27` + build F2 de esta sesion
Documento base: [`v1-deprecation-map-2026-07-18.md`](../archive/v1-deprecation-map-2026-07-18.md) (retirado a archive el 2026-08-19)

> **AD-4 del plan maestro F2-F5**: el mapa del 18-jul debe repasarse contra `master` ANTES de
> borrar nada. Esta es esa pasada. **No borra nada**: corrige el mapa.
>
> Conclusion corta: **ejecutar la tanda 3 del mapa tal cual borraria codigo V2 en produccion.**

---

## 1. `apps/web/src/app/coach/foods/` YA NO es V1 borrable

El mapa (§1.3) lo lista como "Catalogo/librerias coach V1 (6 archivos, ~632 LOC)". Desde
entonces esa carpeta recibio dos builds de **V2 vivo**:

| Archivo | Origen | Que pasa si se borra |
|---|---|---|
| `_components/AddFoodSheet.tsx` | F1 porciones (28-jul) | El coach pierde el alta de alimento con equivalencia |
| `_components/ClassifyFoodSheet.tsx` | F1 porciones (28-jul) | El coach pierde "Clasificar en porciones" |
| `_components/FoodEquivalenceFields.tsx` | F1 porciones (28-jul) | Rompe el alta web y el alta RN (schema compartido) |
| `_actions/food-equivalence.actions.ts` | F1 porciones (28-jul) | Rompe la clasificacion de alimentos propios |
| `_components/ExchangePortionsSection.tsx` | **F2 (hoy)** | Desaparece la gestion de listas de equivalencia |
| `_components/ExchangeListEntrySheet.tsx` | **F2 (hoy)** | Idem |
| `_actions/exchange-lists.actions.ts` | **F2 (hoy)** | Rompe la seccion Porciones y el API movil que comparte servicio |

**Correccion al mapa**: de los 6 archivos originales solo `FoodSearch.tsx`, `FoodBrowser.tsx`,
`_data/foods.queries.ts`, `page.tsx` y `loading.tsx` siguen en discusion, y `page.tsx` ya monta
componentes V2 — no se puede borrar, hay que adelgazarlo.

---

## 2. Los "2 exports bloqueantes" del servicio V1 ya son 7

El mapa (§2) decia que solo `hasExchangesModuleForClientContext` y `getExchangeGroupsForCoach`
bloqueaban el retiro de `services/nutrition-exchanges/nutrition-exchanges.service.ts`.
Verificado hoy con grep sobre `master`, el codigo **vivo no-V1** consume:

| Export | Consumidores vivos |
|---|---|
| `getExchangeGroupsForCoach` | builder V2, `/coach/foods` (F2), API movil de grupos y de listas |
| `isExchangeGroupVisibleToActor` | `coach-food.ts` (alta web + API movil), `food-equivalence.actions.ts` |
| `createCoachExchangeGroup` / `updateCoachExchangeGroup` / `deleteCoachExchangeGroup` | actions V2 + API movil |
| `getStudentExchangeBundle` | API movil `exchanges/student-bundle` |
| `hasExchangesModuleForClientContext` | `feature-prefs.service.ts` (CORE) |

Ademas hay **dos modulos nuevos** que viven junto al servicio V1 pero son V2 puro y no deben
moverse con el: `services/nutrition-exchanges/exchange-lists.service.ts` (F2) y
`infrastructure/db/exchange-group-foods.repository.ts` (F2).

**Correccion al mapa**: la extraccion a un "modulo slim" ya no son 2 funciones sino todo el
bloque de grupos + visibilidad + bundle del alumno. En la practica el servicio se **parte en
dos**: lo que usa V2 (se queda) y lo que solo usa V1 (se va con V1).

---

## 3. Los "6 pinchazos" del shell V1 del alumno ya son 9 archivos

Codigo vivo que importa desde `apps/web/src/app/c/[coach_slug]/nutrition/_*`:

1. `api/mobile/nutrition/micros/route.ts` (+ su test)
2. `api/mobile/nutrition/recap/route.ts` (+ su test)
3. `c/[coach_slug]/_components/OfflineNutritionQueueSync.tsx`
4. `c/[coach_slug]/dashboard/_components/habits/HabitsCard.tsx`
5. `c/[coach_slug]/dashboard/_components/nutrition/MealCompletionRow.tsx`
6. `coach/nutrition-plans/client/[clientId]/page.tsx` (V1, se va con V1)
7. `coach/nutrition-v2/_components/ConvertedPlanBanner.tsx` (**V2**)

Los dos endpoints moviles son los que el mapa no contaba: **la app RN publicada lee micros y
recap desde `_data` del shell V1**. Borrar el shell sin desacoplarlos rompe la app en las
tiendas, no solo la web.

---

## 4. Deuda nueva que F2 le agrega a F5 (deliberada y acotada)

El read-model `get_nutrition_today_v2` ahora lee `exchange_group_foods` **union** las columnas
`foods.exchange_*` (rama legacy). Esa rama existe para que ninguna clasificacion escrita por un
camino no migrado se pierda en silencio. **Su retiro es parte de F5** y es barato: quitar la
segunda rama del `union all` con la misma tecnica de empalme por anclas
(`20260804091000_nutrition_v2_exchange_foods_from_lists.sql`), una vez confirmado que no queda
ningun escritor de esas columnas.

Precondicion para retirarla: `select count(*) from public.foods f where f.exchange_group_id is
not null and not exists (select 1 from public.exchange_group_foods egf where egf.food_id = f.id)`
debe dar 0 de forma sostenida.

---

## 5. Orden corregido para F5

1. **Repasar este delta** antes de cada tanda (el mapa base ya tiene 2 correcciones grandes).
2. Migrar Enterprise a V2 (AD-5) — sigue siendo el unico consumidor vivo de V1 tras el swap.
3. Desacoplar los 9 pinchazos, **empezando por los dos endpoints moviles** (bloquean build RN).
4. Partir `nutrition-exchanges.service.ts` en modulo V2 (se queda) y modulo V1 (se va).
5. Adelgazar `/coach/foods` en vez de borrarlo.
6. Recien ahi las tandas de borrado del mapa, y **desde la tanda 5 se renuncia al rollback por
   flag**: exige GO explicito del CEO y build nativa publicada.
