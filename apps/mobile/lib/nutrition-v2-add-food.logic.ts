/**
 * Lógica PURA (sin React/RN/IO) del registro libre del alumno V2 (`add-food-v2`).
 * Espejo 1:1 de los helpers web del `RegisterFoodDialog` — unidad 4A-10:
 *
 *  - `mealSlotOptions`     ← apps/web .../nutrition-v2/_components/nutrition-today.logic.ts:50-52
 *  - `unitOptionsFor`      ← apps/web .../nutrition-v2/_components/TodayExperience.tsx:758-761
 *  - `foodGroupCodeMap`    ← apps/web .../nutrition-v2/_components/portion-marks.logic.ts:381-387
 *  - `portionsCountLabelEs`← apps/web .../nutrition-v2/_components/portion-marks.logic.ts:33-35
 *  - `dupPortionInfo`      ← apps/web .../nutrition-v2/_components/portion-marks.logic.ts:440-457
 *
 * Adaptación RN escrita (dup-warning): la web suma al `marcadas` del read-model el
 * delta optimista de marcas en sesión (`pending`, portion-marks.logic.ts:453-454)
 * porque el diálogo vive DENTRO del Hoy. En RN el registro es una pantalla pusheada
 * que llega DESPUÉS del refetch del Hoy (las marcas confirmadas ya vienen en
 * `target.marcadas` del server) y no comparte el estado optimista del tab; las
 * marcas aún encoladas offline no se cuentan — con la conexión caída este fetch
 * tampoco resuelve, así que el aviso opera igual que web en el caso online.
 */
import {
  catalogUnitOptions,
  type FoodCatalogItem,
  type NutritionCatalogUnit,
  type NutritionExchangeFoodRead,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { formatPortionsCl } from './nutrition-v2-portions'

/** Todas las franjas del día como opciones {code,label} (sin franjas hardcodeadas). */
export function mealSlotOptions(
  today: Pick<NutritionTodayReadModel, 'mealSlots'>,
): Array<{ code: string; label: string }> {
  return today.mealSlots.map((slot) => ({ code: slot.code, label: slot.name }))
}

/**
 * Unidades ofrecidas para el alimento elegido: códigos CANÓNICOS (`g`|`ml` según la magnitud del
 * alimento + `un`), no el texto libre del catálogo. Antes eran
 * `[servingUnit, 'g', 'ml', 'porción', 'unidad']`: `'unidad'` caía a la rama contable del factor
 * y dejar 100 en el campo persistía `100 x macros` (NUT-017). Espejo exacto de la web
 * (`catalogUnitOptions`, paquete compartido — la lista ya NO se duplica aquí).
 */
export function unitOptionsFor(
  food: Pick<FoodCatalogItem, 'servingUnit'>,
): readonly NutritionCatalogUnit[] {
  return catalogUnitOptions(food.servingUnit)
}

/**
 * Estado del buscador del catálogo como decisión PURA (NUT-020). Antes el `.catch` del
 * live-search hacía `setResults([])` y el render solo distinguía "buscando" / "vacío" / "lista":
 * un fetch caído se presentaba como **"Sin resultados en el catálogo local."** y el alumno
 * concluía que EVA no tiene arroz. `'error'` es una rama propia, con reintento.
 *
 * Orden de precedencia: hint (término corto) → buscando → error → vacío → resultados. El error
 * NO gana sobre "buscando" para que un reintento en vuelo no siga mostrando el fallo anterior.
 */
export function resolveCatalogSearchState(input: {
  termLength: number
  searching: boolean
  error: boolean
  resultCount: number
}): 'hint' | 'searching' | 'error' | 'empty' | 'results' {
  if (input.termLength < 2) return 'hint'
  if (input.searching) return 'searching'
  if (input.error) return 'error'
  if (input.resultCount === 0) return 'empty'
  return 'results'
}

/** Mapa foodId → groupCode del catálogo clasificado que viaja en el read-model. */
export function foodGroupCodeMap(
  foods: ReadonlyArray<NutritionExchangeFoodRead> | undefined,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const food of foods ?? []) map.set(food.foodId, food.groupCode)
  return map
}

/** "{n} porción" / "{n} porciones" pre-formateado para `PORTIONS_COPY.student.dupWarning`. */
export function portionsCountLabelEs(portions: number): string {
  return `${formatPortionsCl(portions)} ${portions === 1 ? 'porción' : 'porciones'}`
}

/**
 * Aviso anti-duplicado (SPEC porciones R5.b, no bloqueante): el alimento elegido
 * pertenece a un grupo con porciones YA marcadas en la franja seleccionada.
 * Devuelve las porciones marcadas efectivas y el nombre del grupo para el copy
 * `student.dupWarning`, o null si no aplica.
 */
export function dupPortionInfo(input: {
  foodId: string
  mealSlotCode: string | null
  today: Pick<NutritionTodayReadModel, 'mealSlots' | 'exchangeFoods'>
}): { groupCode: string; groupName: string; marcadas: number } | null {
  const { foodId, mealSlotCode, today } = input
  if (!mealSlotCode) return null
  const groupCode = foodGroupCodeMap(today.exchangeFoods).get(foodId)
  if (!groupCode) return null
  const slot = today.mealSlots.find((s) => s.code === mealSlotCode)
  if (!slot) return null
  const target = (slot.exchangeTargets ?? []).find((t) => t.groupCode === groupCode)
  const marcadas = target?.marcadas ?? 0
  if (marcadas <= 0) return null
  return { groupCode, groupName: target?.groupName ?? groupCode, marcadas }
}
