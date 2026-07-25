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
import type {
  FoodCatalogItem,
  NutritionExchangeFoodRead,
  NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { formatPortionsCl } from './nutrition-v2-portions'

/** Todas las franjas del día como opciones {code,label} (sin franjas hardcodeadas). */
export function mealSlotOptions(
  today: Pick<NutritionTodayReadModel, 'mealSlots'>,
): Array<{ code: string; label: string }> {
  return today.mealSlots.map((slot) => ({ code: slot.code, label: slot.name }))
}

/** Unidades del alimento elegido: porción del catálogo + g/ml/porción/unidad, únicas. */
export function unitOptionsFor(food: Pick<FoodCatalogItem, 'servingUnit'>): string[] {
  return Array.from(new Set([food.servingUnit, 'g', 'ml', 'porción', 'unidad']))
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
