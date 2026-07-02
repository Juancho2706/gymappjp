import type {
  DayVariant,
  ExchangeFoodEquivalence,
  ExchangeGroup,
  NutritionPlanMode,
  PdfBrand,
} from '@/domain/nutrition/exchange.types'

/** Target de porciones de UNA comida en el editor (módulo nutrition_exchanges). */
export interface ExchangeTargetDraft {
  exchangeGroupId: string
  portions: number
  notes?: string | null
}

/**
 * Datos del modo intercambios para el builder. SOLO presente cuando el módulo
 * `nutrition_exchanges` está ON para el workspace activo (gating server-side espejo).
 * `brand` viene resuelta SERVER-SIDE (el cliente jamás la elige — AC4).
 */
export interface ExchangeBuilderData {
  planId: string | null
  planMode: NutritionPlanMode
  groups: ExchangeGroup[]
  targetsByMealId: Record<string, ExchangeTargetDraft[]>
  variants: DayVariant[]
  variantByMealId: Record<string, string | null>
  equivalences: ExchangeFoodEquivalence[]
  brand: PdfBrand
  /** Logo del PDF ya resuelto a dataURL SERVER-side (fetch server, sin CORS); null ⇒ fallback texto. */
  logoDataUrl: string | null
  clientName?: string | null
}

export interface FoodItemDraft {
  food_id: string
  food: {
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    serving_size: number
    serving_unit: string
    is_liquid?: boolean | null
    brand?: string | null
  }
  quantity: number
  unit: string
  swapOptions?: Array<{
    food_id: string
    quantity: number
    unit: 'g' | 'un' | 'ml'
    food: {
      name: string
      calories: number
      protein_g: number
      carbs_g: number
      fats_g: number
      serving_size: number
      serving_unit: string
      is_liquid?: boolean | null
      brand?: string | null
    }
  }>
}

export interface MealDraft {
  id: string
  name: string
  notes?: string | null
  /** 1=Lun … 7=Dom; undefined/null = todos los días */
  day_of_week?: number | null
  foodItems: FoodItemDraft[]
}

export interface PlanBuilderInitialData {
  id?: string
  name: string
  daily_calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  instructions?: string
  meals: MealDraft[]
}
