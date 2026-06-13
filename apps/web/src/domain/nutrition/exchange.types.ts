/**
 * Dominio — Nutrición por intercambios (módulo `nutrition_exchanges`).
 * Tipos PUROS: sin imports de Next.js, Supabase ni `lib/` (regla Clean Architecture).
 * Spec: specs/movida-intercambios/SPEC.md
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

/** Formato del PDF de pauta. 'full' = stub v2 (deshabilitado). */
export type ExchangePdfFormat = 'compact' | 'equivalences' | 'full'

/**
 * Marca del TENANT para PDFs. SIEMPRE resuelta server-side
 * (headers del proxy en alumno / workspace activo en coach); el cliente jamás la elige.
 */
export interface PdfBrand {
    brandName: string
    /** Hex (#RRGGBB). */
    primaryColor: string
    logoDataUrl?: string | null
    /** true ⇒ free tier / fallback: paleta y marca EVA exactas (AC1/AC4). */
    poweredByEva: boolean
}

/** Totales de macros derivados (Σ porciones × ref del grupo). */
export interface ExchangeMacroTotals {
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
}
