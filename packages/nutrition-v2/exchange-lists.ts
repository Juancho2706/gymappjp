import { intakeEntryFactor, type NutritionMacrosBasis } from './intake-normalize'

/**
 * Listas de equivalencia por grupo de porciones (F2 — specs/nutrition-exchange-lists).
 *
 * Todo lo de este archivo es PURO: lo consumen web, RN y la API movil sin tocar Supabase.
 * La matematica de "cuantos gramos de este alimento son 1 porcion de este grupo" vive aca y
 * en ningun otro lado — si la sugerencia difiere entre superficies, el coach deja de confiar
 * en ella y vuelve a inventar numeros a mano, que es el estado del que venimos.
 */

/** Precedencia de una fila de lista: quien manda cuando hay mas de una para el mismo alimento. */
export const EXCHANGE_LIST_OWNER_RANK = {
  coach: 0,
  org: 1,
  global: 2,
  /** Columnas `foods.exchange_*` — rama de transicion, se retira en F5. */
  legacy: 3,
} as const
export type ExchangeListOwnerRank = (typeof EXCHANGE_LIST_OWNER_RANK)[keyof typeof EXCHANGE_LIST_OWNER_RANK]

/** Tope defensivo, espejo de `egf_portion_grams_range` y de EXCHANGE_PORTION_GRAMS_MAX. */
export const EXCHANGE_PORTION_GRAMS_LIMIT = 5000

export type ExchangeGroupRefMacros = {
  refProteinG: number
  refCarbsG: number
  refFatsG: number
  refCalories: number
}

export type ExchangeFoodMacros = {
  proteinG: number | null | undefined
  carbsG: number | null | undefined
  fatsG: number | null | undefined
  calories: number | null | undefined
  servingSize: number | null | undefined
  macrosBasis: NutritionMacrosBasis | null | undefined
}

export type ExchangeMacroKey = 'protein' | 'carbs' | 'fats'

const KCAL_PER_G: Record<ExchangeMacroKey, number> = { protein: 4, carbs: 4, fats: 9 }

function macroGrams(group: ExchangeGroupRefMacros, key: ExchangeMacroKey): number {
  const raw = key === 'protein' ? group.refProteinG : key === 'carbs' ? group.refCarbsG : group.refFatsG
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

/**
 * Macro que DEFINE el grupo: el que mas kcal aporta a 1 porcion de referencia. Es la unica
 * eleccion que reproduce la practica real — el grupo "Cereales" se define por sus 15 g de
 * carbohidrato, no por sus 2 g de proteina. Empate ⇒ orden estable proteina > carbos > grasas
 * (mismo criterio que usa el seed para nombrar los grupos).
 */
export function dominantExchangeMacro(group: ExchangeGroupRefMacros): ExchangeMacroKey | null {
  const keys: ExchangeMacroKey[] = ['protein', 'carbs', 'fats']
  let best: ExchangeMacroKey | null = null
  let bestKcal = 0
  for (const key of keys) {
    const kcal = macroGrams(group, key) * KCAL_PER_G[key]
    if (kcal > bestKcal) {
      bestKcal = kcal
      best = key
    }
  }
  return best
}

/**
 * Macros del alimento POR GRAMO. Reusa `intakeEntryFactor` (espejo byte a byte de
 * `private.nutrition_v2_entry_factor`) en vez de re-derivar la division: el catalogo tiene dos
 * convenciones vivas (`per_100` y `per_serving`) y una tercera legada sin base declarada.
 */
function perGramMacros(food: ExchangeFoodMacros): Record<ExchangeMacroKey | 'calories', number> {
  const factor = intakeEntryFactor({
    quantity: 1,
    unit: 'g',
    servingSize: food.servingSize,
    basis: food.macrosBasis ?? null,
  })
  const scale = (value: number | null | undefined): number => {
    const n = Number(value ?? 0)
    const out = Number.isFinite(n) && n > 0 ? n * factor : 0
    return Number.isFinite(out) ? out : 0
  }
  return {
    protein: scale(food.proteinG),
    carbs: scale(food.carbsG),
    fats: scale(food.fatsG),
    calories: scale(food.calories),
  }
}

/**
 * Redondeo con el que un coach escribe de verdad: entero bajo 100 g, multiplo de 5 sobre 100 g.
 * Nadie prescribe "137 g de arroz"; prescribe 135.
 */
export function roundPortionGrams(grams: number): number {
  if (!Number.isFinite(grams) || grams <= 0) return 0
  const rounded = grams >= 100 ? Math.round(grams / 5) * 5 : Math.round(grams)
  return Math.min(Math.max(rounded, 1), EXCHANGE_PORTION_GRAMS_LIMIT)
}

/**
 * Cuantos gramos de `food` entregan 1 porcion de `group`. Punto de partida EDITABLE, no un
 * valor impuesto: el coach lo corrige y su numero manda.
 *
 * Primero por el macro dominante del grupo (si el alimento lo tiene); si el alimento no aporta
 * ese macro, por calorias; si tampoco hay calorias utiles, `null` — preferimos no sugerir a
 * sugerir cualquier cosa. Un resultado fuera del rango util tambien devuelve `null` (un
 * alimento con 0,1 g de CHO por 100 g pediria kilos de producto).
 */
export function suggestPortionGrams(group: ExchangeGroupRefMacros, food: ExchangeFoodMacros): number | null {
  const perGram = perGramMacros(food)
  const dominant = dominantExchangeMacro(group)

  let grams: number | null = null
  if (dominant && perGram[dominant] > 0) {
    grams = macroGrams(group, dominant) / perGram[dominant]
  } else if (group.refCalories > 0 && perGram.calories > 0) {
    grams = group.refCalories / perGram.calories
  }

  if (grams == null || !Number.isFinite(grams) || grams <= 0) return null
  if (grams > EXCHANGE_PORTION_GRAMS_LIMIT) return null
  const rounded = roundPortionGrams(grams)
  return rounded > 0 ? rounded : null
}

/**
 * Regla de tres para "Duplicar y ajustar": el coach copia un grupo del sistema y le cambia los
 * macros de referencia; la lista entera se reescala para seguir siendo coherente.
 *
 * Se escala por el macro dominante del grupo ORIGEN cuando el destino tambien lo tiene; si el
 * coach cambio la naturaleza del grupo (por ejemplo de carbos a proteina), se cae a la razon de
 * calorias. Sin ninguna de las dos referencias la lista se copia tal cual (factor 1): mejor una
 * lista literal que una inventada.
 */
export function rescalePortionGrams(
  grams: number,
  from: ExchangeGroupRefMacros,
  to: ExchangeGroupRefMacros
): number {
  if (!Number.isFinite(grams) || grams <= 0) return 0
  const dominant = dominantExchangeMacro(from)
  const fromMacro = dominant ? macroGrams(from, dominant) : 0
  const toMacro = dominant ? macroGrams(to, dominant) : 0

  let factor = 1
  if (fromMacro > 0 && toMacro > 0) {
    factor = toMacro / fromMacro
  } else if (from.refCalories > 0 && to.refCalories > 0) {
    factor = to.refCalories / from.refCalories
  }
  if (!Number.isFinite(factor) || factor <= 0) factor = 1
  return roundPortionGrams(grams * factor)
}

/**
 * La frase EXACTA que va a leer el alumno en el sheet "¿Que cuenta como 1 porcion?". El coach
 * la ve antes de guardar: la mitad de los errores de porciones son de redaccion, no de gramos.
 */
export function formatPortionSentence(input: {
  foodName: string
  portionGrams: number | null | undefined
  portionLabel?: string | null
}): string {
  const name = (input.foodName ?? '').trim() || 'Alimento'
  const grams = Number(input.portionGrams ?? 0)
  const label = (input.portionLabel ?? '').trim()
  if (!Number.isFinite(grams) || grams <= 0) {
    return `1 porción = ${name}`
  }
  const amount = Number.isInteger(grams) ? String(grams) : String(Number(grams.toFixed(1)))
  return label.length > 0
    ? `1 porción = ${amount} g de ${name} (≈ ${label})`
    : `1 porción = ${amount} g de ${name}`
}

/**
 * Resuelve la lista visible a partir de filas de varias procedencias: una fila por alimento,
 * gana el dueno mas cercano, y una lapida (`isExcluded`) retira el alimento.
 *
 * Es el ESPEJO en TypeScript del `distinct on` del read-model
 * (`20260804091000_nutrition_v2_exchange_foods_from_lists.sql`). Existe porque la gestion del
 * coach lee por PostgREST (sin `distinct on`) y debe mostrar exactamente lo que vera el alumno.
 */
export function resolveExchangeListRows<T extends { foodId: string; ownerRank: number; isExcluded: boolean }>(
  rows: readonly T[]
): T[] {
  const winners = new Map<string, T>()
  for (const row of rows) {
    const current = winners.get(row.foodId)
    if (current == null || row.ownerRank < current.ownerRank) winners.set(row.foodId, row)
  }
  return [...winners.values()].filter((row) => !row.isExcluded)
}
