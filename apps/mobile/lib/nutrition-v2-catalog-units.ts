/**
 * nutrition-v2-catalog-units — unidades del registro LIBRE del alumno en RN (buscador y scanner):
 * qué unidades se ofrecen para un alimento, con qué cantidad arranca y cómo se traduce la medida
 * casera a lo que realmente se persiste. Espejo 1:1 de los helpers web homónimos de
 * `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic.ts` (W2.1, tren
 * «Cantidades honestas», SPEC §5.2/§5.3).
 *
 * Vive en su propio módulo HOJA — sin React/RN, sin red, sin AsyncStorage — a propósito: el
 * scanner y el buscador lo necesitan los dos, y colgarlo de `nutrition-v2-add-food.logic` metía
 * `@react-native-async-storage/async-storage` (vía `nutrition-v2-portions`) en la cadena de
 * imports del scanner, que no resuelve desde la raíz del monorepo con `shamefully-hoist=false`
 * (gotcha ya documentado en `tests/mobile-nutrition-v2-add-food-logic.test.ts`).
 */
import {
  defaultFoodUnit,
  foodMagnitudeUnit,
  foodUnitOptionsWithCurrent,
  isHouseholdUnit,
  type FoodCatalogItem,
  type UnitSelectOption,
} from '@eva/nutrition-v2'

/** Lo mínimo del alimento para decidir sus unidades (medida casera incluida, W2.1). */
export type CatalogUnitFood = Pick<FoodCatalogItem, 'servingUnit' | 'servingSize'> & {
  householdGrams?: number | null
  householdLabel?: string | null
}

/**
 * Unidades ofrecidas para el alimento elegido (W2.1, SPEC §5.2): su magnitud (`g`|`ml`), la
 * medida casera rotulada con sus gramos («huevo · 61 g») y `un` **solo** si el alimento es
 * realmente contable — antes se ofrecía `un` a todo el catálogo y «1 un» era una porción de
 * 100 g que nadie decía. Se agrega la unidad VIGENTE si quedó fuera del set, para no dejar al
 * alumno atrapado fuera de su propia unidad.
 */
export function catalogUnitSelectOptions(
  food: CatalogUnitFood,
  currentUnit?: string | null,
): readonly UnitSelectOption[] {
  return foodUnitOptionsWithCurrent(food, currentUnit)
}

/**
 * Cantidad y unidad iniciales al elegir un alimento. La unidad la manda `defaultFoodUnit`
 * (casera > contable > magnitud) y la cantidad tiene que ser COHERENTE con ella: precargar
 * `servingSize` con `casera` o `un` escribiría «100 huevos» de entrada. Solo en g/ml la porción
 * del catálogo es una cantidad honesta.
 */
export function catalogIntakeDefaults(food: CatalogUnitFood): { quantity: number; unit: string } {
  const unit = defaultFoodUnit(food)
  return { quantity: unit === 'g' || unit === 'ml' ? food.servingSize : 1, unit }
}

/**
 * Traduce la cantidad/unidad ELEGIDA en la pantalla a la que se PERSISTE (SPEC §5.3, AUDIT W2.0
 * c3/c4). `casera` vive solo en la UI: al enviar, «2 huevos» son `2 × householdGrams` gramos con
 * la magnitud real del alimento, porque `NutritionIntakeUnitSchema` no la acepta (c6, y no
 * cambia). `null` = el alimento no tiene gramaje casero usable: nada honesto que persistir.
 */
export function catalogIntakeSubmission(input: {
  food: CatalogUnitFood
  quantity: number
  unit: string
}): { quantity: number; unit: string } | null {
  if (!isHouseholdUnit(input.unit)) return { quantity: input.quantity, unit: input.unit }
  const householdGrams = input.food.householdGrams
  if (typeof householdGrams !== 'number' || !Number.isFinite(householdGrams) || householdGrams <= 0) {
    return null
  }
  return {
    quantity: Math.round(input.quantity * householdGrams * 10) / 10,
    unit: foodMagnitudeUnit(input.food.servingUnit),
  }
}
