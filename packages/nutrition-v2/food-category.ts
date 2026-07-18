/**
 * Heurística PURA nombre -> categoría canónica de alimento (framework-neutral).
 *
 * Fuente ÚNICA compartida web + RN. Los read models del alumno (prescripción e
 * intake) solo traen el `name` del alimento (sin la columna `category` del
 * catálogo), así que para elegir un placeholder visual — el ícono estático por
 * categoría en web (`/food-icons/<cat>.webp`) o el emoji por categoría en RN —
 * derivamos la categoría del nombre con esta heurística.
 *
 * Las 10 categorías son espejo de `VALID_FOOD_CATEGORIES` (@eva/schemas) y de
 * `FOOD_ICON_CATEGORIES` (web `@/lib/food-image`) / `FOOD_CATEGORY_EMOJI` (RN).
 * Sin match -> `'otro'`. Nunca lanza.
 *
 * NOTA: existe una copia legacy de esta lógica en el builder del coach
 * (`app/coach/nutrition-v2/[clientId]/builder/_components/food-card-presentation.ts`)
 * con su propio test; esta es la versión canónica cross-plataforma. Deduplicar la
 * copia del coach es limpieza futura (no bloqueante).
 */

export const NUTRITION_FOOD_CATEGORIES = [
  'proteina',
  'carbohidrato',
  'grasa',
  'lacteo',
  'fruta',
  'verdura',
  'legumbre',
  'bebida',
  'snack',
  'otro',
] as const

export type NutritionFoodCategory = (typeof NUTRITION_FOOD_CATEGORIES)[number]

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Orden: lo más específico primero (ej. "leche de almendras" cae en lacteo por
// "leche" antes que en grasa por "almendra").
const NAME_CATEGORY_KEYWORDS: ReadonlyArray<readonly [NutritionFoodCategory, readonly string[]]> = [
  ['lacteo', ['lacte', 'leche', 'milk', 'yogur', 'yoghur', 'queso', 'cheese', 'crema', 'mantequilla', 'butter']],
  ['grasa', ['aceite', 'oil', 'grasa', 'palta', 'aguacate', 'avocado', 'margarina', 'manteca', 'fruto seco', 'frutos secos', 'almendra', 'nuez', 'mani', 'peanut', 'semilla', 'pistacho', 'nut']],
  ['proteina', ['carne', 'meat', 'beef', 'vacuno', 'res', 'pollo', 'chicken', 'pavo', 'cerdo', 'pork', 'pescado', 'fish', 'atun', 'salmon', 'marisc', 'seafood', 'huevo', 'egg', 'protein', 'whey', 'suplemento', 'creatin']],
  ['legumbre', ['legumbre', 'legume', 'poroto', 'frijol', 'bean', 'lenteja', 'lentil', 'garbanzo', 'chickpea', 'soja', 'soya', 'tofu']],
  ['carbohidrato', ['cereal', 'grano', 'grain', 'arroz', 'rice', 'pan', 'bread', 'pasta', 'fideo', 'avena', 'oat', 'trigo', 'wheat', 'harina', 'flour', 'tortilla', 'quinoa', 'maiz', 'corn', 'papa', 'patata']],
  ['fruta', ['fruta', 'fruit', 'manzana', 'apple', 'platano', 'banana', 'berry', 'baya', 'citr', 'naranja', 'frutilla', 'uva']],
  ['verdura', ['verdura', 'vegetal', 'vegetable', 'hortaliza', 'ensalada', 'salad', 'tomate', 'lechuga', 'espinaca', 'zanahoria', 'brocoli']],
  ['bebida', ['bebida', 'beverage', 'jugo', 'juice', 'drink', 'agua', 'water', 'gaseosa', 'soda', 'refresco', 'cafe', 'coffee', 'infusion', 'tea']],
  ['snack', ['snack', 'galleta', 'cookie', 'dulce', 'candy', 'chocolate', 'postre', 'dessert', 'chips', 'golosina', 'helado']],
]

/**
 * Mapea el nombre de un alimento (texto libre, es/en, con o sin tildes) a una de
 * las 10 categorías canónicas. Sin match -> `'otro'`. Nunca lanza.
 */
export function foodCategoryFromName(name: string | null | undefined): NutritionFoodCategory {
  if (!name) return 'otro'
  const normalized = stripAccents(name).toLowerCase().trim()
  if (normalized === '') return 'otro'
  for (const [category, keywords] of NAME_CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => normalized.includes(kw))) return category
  }
  return 'otro'
}
