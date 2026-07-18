/**
 * Tipos PUROS del modo intercambios (módulo `nutrition_exchanges`).
 * Sin imports de Next.js, Supabase, React ni RN — apto para web y mobile.
 *
 * Fuente de verdad única: se movieron desde `apps/web/src/domain/nutrition/exchange.types.ts`
 * (que ahora los re-exporta) para que web y mobile compartan estructura y el motor
 * `exchange-calc` no se duplique. Los tipos PDF-específicos (PdfBrand, ExchangePdfFormat)
 * siguen viviendo en web (dependen de branding del tenant).
 */

/** Grupo de intercambio (catálogo system / coach / team). */
export interface ExchangeGroup {
    id: string
    slug: string
    /** Código corto del chip: 'C','P','F','V','LAC','ARL','SP','G','LEG'. Término de dominio, NO se traduce. */
    code: string
    name: string
    coachId: string | null
    teamId: string | null
    isSystem: boolean
    /** Macros de referencia POR PORCIÓN. Provisorios hasta `macrosConfirmed`. */
    refCalories: number
    refProteinG: number
    refCarbsG: number
    refFatsG: number
    /** Hex del badge; null = paleta derivada por sortOrder. */
    color: string | null
    sortOrder: number
    /** Grupo compuesto (ej. Legumbres = 1P + 1C). null = grupo simple. */
    composedOf: ComposedGroupPart[] | null
    /** false ⇒ la UI/PDF muestran badge "macros referenciales" (AC3). */
    macrosConfirmed: boolean
}

export interface ComposedGroupPart {
    /** Código del grupo base referenciado ('P', 'C', ...). */
    code: string
    portions: number
}

/** Porciones prescritas de un grupo en una comida. */
export interface MealExchangeTarget {
    id?: string
    mealId: string
    exchangeGroupId: string
    /** > 0, hasta 99; numeric en DB (permite 0.5 — pendiente Fran). */
    portions: number
    notes?: string | null
}

/** Variante de día de la pauta ('Descanso' | 'Entreno AM' | ...). */
export interface DayVariant {
    id: string
    planId: string
    name: string
    sortOrder: number
}

/** Equivalencia alimento→porción dentro de un grupo (medida casera + gramos). */
export interface ExchangeFoodEquivalence {
    foodId: string
    name: string
    exchangeGroupId: string
    portionGrams: number | null
    /** Medida casera: '3/4 taza', '1 unidad chica'. */
    portionLabel: string | null
}

/** Modo de plan nutricional. 'grams' = flujo existente (default, intacto). */
export type NutritionPlanMode = 'grams' | 'exchanges'

/** Totales de macros derivados (Σ porciones × ref del grupo). */
export interface ExchangeMacroTotals {
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
}
