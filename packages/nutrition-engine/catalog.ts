export const SUPPORTED_GTIN_LENGTHS = [8, 12, 13, 14] as const

export type SupportedGtinLength = (typeof SUPPORTED_GTIN_LENGTHS)[number]
export type NutritionIntakeActionId = 'search' | 'barcode' | 'recent' | 'favorite'
export type NutritionMealSlot = 'breakfast' | 'morning_snack' | 'lunch' | 'afternoon_snack' | 'dinner' | 'other'

export type NutritionIntakeAction = {
  id: NutritionIntakeActionId
  label: string
  shortLabel: string
  description: string
}

/**
 * Contrato de acciones compartido por web/PWA/desktop y React Native.
 * Las plataformas pueden usar iconos y primitivas distintas, pero no deben
 * cambiar nombres, orden ni intención sin actualizar ambas implementaciones.
 */
export const NUTRITION_INTAKE_ACTIONS: readonly NutritionIntakeAction[] = [
  {
    id: 'search',
    label: 'Buscar alimento',
    shortLabel: 'Buscar',
    description: 'Encuentra alimentos y productos del catálogo EVA.',
  },
  {
    id: 'barcode',
    label: 'Código de barras',
    shortLabel: 'Código',
    description: 'Escanea en la app o escribe el código del producto.',
  },
  {
    id: 'recent',
    label: 'Usar reciente',
    shortLabel: 'Recientes',
    description: 'Registra de nuevo algo que consumiste hace poco.',
  },
  {
    id: 'favorite',
    label: 'Usar favorito',
    shortLabel: 'Favoritos',
    description: 'Accede rápidamente a tus alimentos guardados.',
  },
] as const

export const NUTRITION_MEAL_SLOTS: readonly { id: NutritionMealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Desayuno' },
  { id: 'morning_snack', label: 'Colación AM' },
  { id: 'lunch', label: 'Almuerzo' },
  { id: 'afternoon_snack', label: 'Colación PM' },
  { id: 'dinner', label: 'Cena' },
  { id: 'other', label: 'Otro momento' },
] as const

/** Conserva únicamente dígitos. No inventa ceros ni transforma UPC↔EAN. */
export function normalizeGtin(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value).replace(/\D/g, '')
}

export function isSupportedGtinLength(value: string): value is string & { length: SupportedGtinLength } {
  return SUPPORTED_GTIN_LENGTHS.includes(value.length as SupportedGtinLength)
}

/**
 * Calcula el dígito verificador GS1 para el cuerpo de un GTIN.
 * Empieza desde la derecha del cuerpo alternando pesos 3 y 1.
 */
export function calculateGtinCheckDigit(body: string): number | null {
  if (!/^\d+$/.test(body) || body.length < 1) return null

  let sum = 0
  let weight = 3
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * weight
    weight = weight === 3 ? 1 : 3
  }
  return (10 - (sum % 10)) % 10
}

/** Valida GTIN-8, UPC-A/GTIN-12, EAN-13 y GTIN-14. */
export function isValidGtin(value: string | number | null | undefined): boolean {
  const normalized = normalizeGtin(value)
  if (!isSupportedGtinLength(normalized)) return false

  const expected = calculateGtinCheckDigit(normalized.slice(0, -1))
  return expected !== null && expected === Number(normalized.at(-1))
}

/** Devuelve el GTIN normalizado o null cuando longitud/checksum no son válidos. */
export function parseGtin(value: string | number | null | undefined): string | null {
  const normalized = normalizeGtin(value)
  return isValidGtin(normalized) ? normalized : null
}

/**
 * Normalización liviana para importadores y búsqueda local.
 * El resultado puede persistirse en `foods.name_search` junto con aliases.
 */
export function normalizeFoodSearchText(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
