/**
 * Heurísticas PURAS de clasificación del catálogo de `foods` por grupo de
 * intercambio (SPEC R8 pasos 1-2). Cero IO, cero Supabase, cero red: apto para
 * unit-test determinista y para que el driver `classify-foods` (T4.2) lo consuma
 * fila por fila.
 *
 * Cada food recibe:
 *   - `group`                 → uno de los 9 grupos SYSTEM (o null si no clasifica)
 *   - `tier`                  → 'alto' | 'medio' | 'bajo' (confianza)
 *   - `exchangePortionGrams`  → gramos de 1 porción de intercambio (o null)
 *   - `exchangePortionLabel`  → medida legible ('{n} g') (o null)
 *
 * TRES señales combinadas (SPEC R8 paso 1):
 *   (a) categoría existente del food (`foods.category`, una de 10; si falta se
 *       deriva del nombre con `foodCategoryFromName`, la heurística canónica ya
 *       compartida web+RN en `packages/nutrition-v2/food-category.ts`).
 *   (b) keywords es-CL del nombre (arroz→C, pollo→P, palta→ARL, aceite→G, ...).
 *   (c) perfil de macros dominante del food (ratios P/C/G) vs los `ref_*` de los
 *       9 grupos system.
 *
 * Regla de tier (documentada — SPEC R8 "3 coinciden = alto; 2 = medio; 1 o
 * conflicto = bajo"):
 *   - 3 señales no-nulas apuntan al MISMO grupo            → alto
 *   - exactamente 2 señales coinciden en un grupo          → medio
 *   - solo 1 señal opina, o las 3 difieren (conflicto)     → bajo
 *   - ninguna señal opina                                  → group=null, bajo
 *   Guarda de sanidad: si la porción derivada cae fuera de [5, 500] g, o no es
 *   derivable (macro clave = 0 / unidad no másica), el tier BAJA a 'bajo' aunque
 *   las señales coincidan — sin una porción usable la fila no sirve al pipeline.
 *
 * ORIGEN de los `ref_*` (hardcodeados como fixture CONSTANTE): seed V1
 * `supabase/migrations/_POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql`
 * (valores provisorios SMAE/UDD, `macros_confirmed=false`). El driver de T4.2 los
 * RE-VERIFICA contra `exchange_groups` en runtime antes de escribir; acá viven
 * congelados solo para que las heurísticas sean puras y testeables.
 *
 * NOTA de discrepancia SP: la SPEC R3 describe `SP` como "sin porción/libres",
 * pero el seed V1 REAL define `SP` = "Scoop proteina" (120 kcal / 24 P / 2 C / 1 G,
 * suplemento proteico). El seed manda (es lo que el driver re-verifica contra DB),
 * así que `SP` acá = suplemento proteico en polvo. Las bebidas "libres" (agua, té,
 * café sin azúcar) NO tienen grupo en el catálogo real: quedan sin clasificar
 * (group=null, tier bajo) — no se fuerzan a SP porque su perfil de macros (≈0) no
 * coincide.
 */

import { foodCategoryFromName, type NutritionFoodCategory } from '../../packages/nutrition-v2/food-category.ts'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ExchangeGroupCode = 'C' | 'P' | 'F' | 'V' | 'LAC' | 'ARL' | 'SP' | 'G' | 'LEG'

export type ClassificationTier = 'alto' | 'medio' | 'bajo'

/** Subconjunto de columnas de `public.foods` que consumen las heurísticas. */
export interface FoodRow {
  name?: string | null
  /** Una de las 10 categorías del CHECK `foods_category_check`, o null. */
  category?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fats_g?: number | null
  /** Cantidad de la porción en la unidad `serving_unit` (>0). */
  serving_size?: number | null
  serving_unit?: string | null
  is_liquid?: boolean | null
}

export interface FoodClassification {
  group: ExchangeGroupCode | null
  tier: ClassificationTier
  exchangePortionGrams: number | null
  exchangePortionLabel: string | null
  /** Voto de cada señal por separado (para el reporte y la revisión CEO). */
  signals: {
    category: ExchangeGroupCode | null
    keyword: ExchangeGroupCode | null
    macro: ExchangeGroupCode | null
  }
  /** Traza legible del porqué (reporte MD). */
  reason: string
}

// ---------------------------------------------------------------------------
// Fixture CONSTANTE de los 9 grupos SYSTEM (origen: seed V1 — ver header)
// ---------------------------------------------------------------------------

type MacroKey = 'protein' | 'carbs' | 'fats'

interface GroupRef {
  code: ExchangeGroupCode
  slug: string
  name: string
  refCalories: number
  refProteinG: number
  refCarbsG: number
  refFatsG: number
  /** Macro clave del grupo y su referencia (gramos por porción) para derivar la porción. */
  keyMacro: MacroKey
  keyRefG: number
  /** Perfil efectivo de macros-gramos para el NN de la señal (c). LEG usa 1P+1C. */
  profile: { protein: number; carbs: number; fats: number }
}

/**
 * Los 9 grupos system, ref_* EXACTOS del seed V1 (provisorios SMAE/UDD).
 * `keyMacro`/`keyRefG`: el macro que DEFINE la porción del grupo (la porción son
 * los gramos del food que aportan ~esa cantidad del macro clave). LEG (compuesto
 * 1P+1C) usa su suma efectiva 9P/15C/3G y macro clave carbs=15.
 */
export const GROUP_REFS: readonly GroupRef[] = [
  { code: 'C', slug: 'cereales', name: 'Carbohidratos/Cereales', refCalories: 70, refProteinG: 2, refCarbsG: 15, refFatsG: 0, keyMacro: 'carbs', keyRefG: 15, profile: { protein: 2, carbs: 15, fats: 0 } },
  { code: 'P', slug: 'proteinas-bajo-grasa', name: 'Proteinas (bajo grasa)', refCalories: 55, refProteinG: 7, refCarbsG: 0, refFatsG: 3, keyMacro: 'protein', keyRefG: 7, profile: { protein: 7, carbs: 0, fats: 3 } },
  { code: 'F', slug: 'frutas', name: 'Frutas', refCalories: 60, refProteinG: 0, refCarbsG: 15, refFatsG: 0, keyMacro: 'carbs', keyRefG: 15, profile: { protein: 0, carbs: 15, fats: 0 } },
  { code: 'V', slug: 'verduras', name: 'Verduras', refCalories: 25, refProteinG: 2, refCarbsG: 4, refFatsG: 0, keyMacro: 'carbs', keyRefG: 4, profile: { protein: 2, carbs: 4, fats: 0 } },
  { code: 'LAC', slug: 'lacteos', name: 'Lacteo', refCalories: 95, refProteinG: 9, refCarbsG: 12, refFatsG: 2, keyMacro: 'protein', keyRefG: 9, profile: { protein: 9, carbs: 12, fats: 2 } },
  { code: 'ARL', slug: 'ricos-en-lipidos', name: 'Alimento rico en lipidos', refCalories: 45, refProteinG: 0, refCarbsG: 0, refFatsG: 5, keyMacro: 'fats', keyRefG: 5, profile: { protein: 0, carbs: 0, fats: 5 } },
  { code: 'SP', slug: 'scoop-proteina', name: 'Scoop proteina', refCalories: 120, refProteinG: 24, refCarbsG: 2, refFatsG: 1, keyMacro: 'protein', keyRefG: 24, profile: { protein: 24, carbs: 2, fats: 1 } },
  { code: 'G', slug: 'grasa-cocina', name: 'Grasa de cocina', refCalories: 45, refProteinG: 0, refCarbsG: 0, refFatsG: 5, keyMacro: 'fats', keyRefG: 5, profile: { protein: 0, carbs: 0, fats: 5 } },
  { code: 'LEG', slug: 'legumbres', name: 'Legumbres', refCalories: 125, refProteinG: 9, refCarbsG: 15, refFatsG: 3, keyMacro: 'carbs', keyRefG: 15, profile: { protein: 9, carbs: 15, fats: 3 } },
]

const GROUP_BY_CODE: ReadonlyMap<ExchangeGroupCode, GroupRef> = new Map(
  GROUP_REFS.map((g) => [g.code, g]),
)

/** Rango de sanidad para la porción derivada (gramos). Fuera de esto → tier bajo. */
export const PORTION_GRAMS_MIN = 5
export const PORTION_GRAMS_MAX = 500

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return stripAccents(name).toLowerCase().trim()
}

// ---------------------------------------------------------------------------
// Señal (a): categoría existente → grupo
// ---------------------------------------------------------------------------

const CATEGORY_TO_GROUP: Record<NutritionFoodCategory, ExchangeGroupCode | null> = {
  carbohidrato: 'C',
  proteina: 'P',
  fruta: 'F',
  verdura: 'V',
  lacteo: 'LAC',
  legumbre: 'LEG',
  // 'grasa' es ambigua (ARL frutos secos/palta vs G aceites): default G, el keyword
  // y el perfil de macros la refinan a ARL cuando corresponde.
  grasa: 'G',
  // Sin grupo en el catálogo real: quedan al arbitrio de keyword/macro (normalmente
  // sin clasificar).
  bebida: null,
  snack: null,
  otro: null,
}

const VALID_CATEGORIES = new Set<NutritionFoodCategory>([
  'proteina', 'carbohidrato', 'grasa', 'lacteo', 'fruta', 'verdura', 'legumbre', 'bebida', 'snack', 'otro',
])

/** Resuelve la categoría del food: columna si es válida, si no la deriva del nombre. */
export function resolveCategory(food: FoodRow): NutritionFoodCategory {
  const raw = (food.category ?? '').trim() as NutritionFoodCategory
  if (VALID_CATEGORIES.has(raw)) return raw
  return foodCategoryFromName(food.name)
}

export function categorySignal(food: FoodRow): ExchangeGroupCode | null {
  return CATEGORY_TO_GROUP[resolveCategory(food)]
}

// ---------------------------------------------------------------------------
// Señal (b): keywords del nombre → grupo (es-CL, específico primero)
// ---------------------------------------------------------------------------

// Orden CRÍTICO (lo más específico primero):
//  - SP antes que P: "proteina en polvo/whey" es suplemento, no carne.
//  - LAC antes que ARL: "leche de almendras" es lácteo por "leche".
//  - LEG antes que P/C: legumbres no las capturan otros tokens.
//  - ARL antes que G: "mantequilla de mani" es fruto seco (ARL), no grasa de cocina.
const KEYWORD_GROUPS: ReadonlyArray<readonly [ExchangeGroupCode, readonly string[]]> = [
  ['SP', ['proteina en polvo', 'proteina whey', 'whey', 'scoop', 'caseina', 'isolate', 'aislado de suero', 'concentrado de suero', 'suplemento proteico', 'protein powder', 'mass gainer', 'ganador de masa']],
  ['LAC', ['leche', 'milk', 'yogur', 'yoghur', 'queso', 'quesillo', 'kefir', 'kumis']],
  ['LEG', ['lenteja', 'lentil', 'poroto', 'frijol', 'bean', 'garbanzo', 'chickpea', 'soja', 'soya', 'tofu', 'arveja', 'pea', 'haba', 'legumbre', 'legume']],
  ['ARL', ['palta', 'aguacate', 'avocado', 'aceituna', 'olive', 'almendra', 'almond', 'nuez', 'nueces', 'walnut', 'mani', 'peanut', 'pistacho', 'avellana', 'castana', 'cashew', 'nuez de castilla', 'semilla', 'seed', 'chia', 'linaza', 'maravilla', 'girasol', 'sesamo', 'fruto seco', 'frutos secos', 'crema de mani']],
  ['G', ['aceite', 'oil', 'mantequilla', 'butter', 'margarina', 'manteca', 'mayonesa', 'mayo']],
  ['P', ['pollo', 'chicken', 'pavo', 'turkey', 'vacuno', 'posta', 'carne', 'beef', 'res', 'cerdo', 'pork', 'cordero', 'pescado', 'fish', 'merluza', 'atun', 'salmon', 'reineta', 'jurel', 'sardina', 'marisco', 'seafood', 'camaron', 'shrimp', 'huevo', 'egg', 'clara', 'jamon', 'ham', 'pechuga', 'lomo', 'molida', 'filete', 'higado', 'pulpa', 'costilla', 'churrasco']],
  ['C', ['arroz', 'rice', 'pan', 'marraqueta', 'hallulla', 'fideo', 'pasta', 'tallarin', 'spaghetti', 'avena', 'oat', 'quinoa', 'papa', 'patata', 'potato', 'choclo', 'maiz', 'corn', 'tortilla', 'cereal', 'harina', 'flour', 'couscous', 'cuscus', 'polenta', 'noqui', 'ñoqui', 'galleta de arroz', 'galleta de agua', 'galleta de soda', 'pita', 'sopaipilla', 'trigo', 'wheat', 'granola', 'muesli']],
  // V ANTES que F: evita que 'pina' (piña) haga falso-positivo con "esPINAca" y
  // asegura que las verduras se resuelvan por su token propio antes de las frutas.
  ['V', ['lechuga', 'lettuce', 'tomate', 'tomato', 'espinaca', 'spinach', 'zanahoria', 'carrot', 'brocoli', 'broccoli', 'coliflor', 'cauliflower', 'pepino', 'zapallo italiano', 'zucchini', 'acelga', 'apio', 'celery', 'pimenton', 'pepper', 'betarraga', 'beet', 'rabano', 'repollo', 'cabbage', 'champinon', 'champignon', 'callampa', 'berenjena', 'eggplant', 'poroto verde', 'ejote', 'verdura', 'vegetal', 'vegetable', 'ensalada', 'salad']],
  ['F', ['manzana', 'apple', 'platano', 'banana', 'naranja', 'orange', 'pera', 'uva', 'grape', 'frutilla', 'strawberry', 'durazno', 'damasco', 'ciruela', 'kiwi', 'mango', 'pina', 'melon', 'sandia', 'mandarina', 'arandano', 'blueberry', 'berry', 'berries', 'frambuesa', 'mora', 'cereza', 'higo', 'papaya', 'chirimoya', 'fruta', 'fruit']],
]

export function keywordSignal(food: FoodRow): ExchangeGroupCode | null {
  const normalized = normalizeName(food.name)
  if (normalized === '') return null
  for (const [group, keywords] of KEYWORD_GROUPS) {
    if (keywords.some((kw) => normalized.includes(kw))) return group
  }
  return null
}

// ---------------------------------------------------------------------------
// Normalización a per-100 g y señal (c): perfil de macros dominante
// ---------------------------------------------------------------------------

const MASS_UNITS = new Set(['g', 'gr', 'grs', 'gramo', 'gramos', 'ml', 'cc', 'g.', ''])

export interface Per100 {
  calories: number
  protein: number
  carbs: number
  fats: number
}

/**
 * Normaliza los macros del food a per-100 g usando `serving_size`/`serving_unit`
 * (los macros de `foods` están declarados PARA `serving_size` unidades — ver el
 * import del catálogo). Devuelve null si la unidad no es másica (p. ej. 'unidad'):
 * sin gramos confiables no se puede derivar porción ni comparar densidad.
 */
export function normalizePer100(food: FoodRow): Per100 | null {
  const ss = num(food.serving_size)
  const unit = normalizeName(food.serving_unit)
  const isMass = MASS_UNITS.has(unit)
  if (!isMass) return null
  if (ss === null || ss <= 0) return null
  const factor = 100 / ss
  return {
    calories: nn(food.calories) * factor,
    protein: nn(food.protein_g) * factor,
    carbs: nn(food.carbs_g) * factor,
    fats: nn(food.fats_g) * factor,
  }
}

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nn(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Energía estimada (kcal) desde macros-gramos (4/4/9). */
function macroEnergy(p: number, c: number, f: number): number {
  return 4 * p + 4 * c + 9 * f
}

/**
 * Señal (c): grupo cuyo perfil de macros-gramos (ratios P/C/G) es el más cercano
 * al del food (per-100 g). Nearest-neighbor en el símplex de fracciones, con dos
 * guardas documentadas:
 *   - SP solo si la densidad proteica es extrema (≥50 g/100 g): así una pechuga
 *     (perfil casi puro-proteína, pero densidad ~31) cae en P, no en SP.
 *   - V solo si el alimento es de baja energía (≤60 kcal/100 g): las legumbres
 *     comparten ratio ~1/3 P · 2/3 C con las verduras pero son densas → se les
 *     excluye V y quedan en LEG.
 * ARL y G tienen perfil idéntico (0/0/5): el empate se resuelve a ARL (aparece
 * antes en `GROUP_REFS`); keyword/categoría refinan a G cuando toca.
 */
export function macroSignal(food: FoodRow): ExchangeGroupCode | null {
  const per100 = normalizePer100(food)
  if (!per100) return null
  return macroSignalFromPer100(per100)
}

export function macroSignalFromPer100(per100: Per100): ExchangeGroupCode | null {
  const { protein, carbs, fats } = per100
  const total = protein + carbs + fats
  // Sin macros relevantes (agua, café sin azúcar): no hay macro dominante.
  if (total < 1) return null
  const frac = { protein: protein / total, carbs: carbs / total, fats: fats / total }
  const energy = macroEnergy(protein, carbs, fats)

  const nearest = (exclude?: ExchangeGroupCode): ExchangeGroupCode => {
    let best: ExchangeGroupCode = GROUP_REFS[0].code
    let bestDist = Number.POSITIVE_INFINITY
    for (const g of GROUP_REFS) {
      if (g.code === exclude) continue
      const gt = g.profile.protein + g.profile.carbs + g.profile.fats
      if (gt <= 0) continue
      const gf = { protein: g.profile.protein / gt, carbs: g.profile.carbs / gt, fats: g.profile.fats / gt }
      const d = (frac.protein - gf.protein) ** 2 + (frac.carbs - gf.carbs) ** 2 + (frac.fats - gf.fats) ** 2
      if (d < bestDist) {
        bestDist = d
        best = g.code
      }
    }
    return best
  }

  let candidate = nearest()
  // Guarda SP: densidad proteica.
  if (candidate === 'SP' && protein < 50) candidate = 'P'
  // Guarda V: densidad energética (legumbres densas no son verduras).
  if (candidate === 'V' && energy > 60) candidate = nearest('V')
  return candidate
}

// ---------------------------------------------------------------------------
// Derivación de la porción de intercambio (SPEC R8 paso 2)
// ---------------------------------------------------------------------------

export interface DerivedPortion {
  grams: number | null
  label: string | null
  /** Motivo si no se pudo derivar (para el reporte). */
  note?: string
}

/**
 * Gramos de 1 porción del grupo = los gramos del food que aportan ~`keyRefG` del
 * macro clave del grupo. Con macros per-100 g: grams = keyRefG · 100 / macroPer100.
 * Redondeo a ENTERO. Label = '{n} g' (las medidas caseras curadas — "1/2 taza" —
 * salen de revisión humana en F2, no del catálogo automático).
 */
export function deriveExchangePortion(food: FoodRow, group: ExchangeGroupCode): DerivedPortion {
  const ref = GROUP_BY_CODE.get(group)
  if (!ref) return { grams: null, label: null, note: 'grupo desconocido' }
  const per100 = normalizePer100(food)
  if (!per100) return { grams: null, label: null, note: 'unidad no másica (no derivable)' }
  const macroPer100 = per100[ref.keyMacro]
  if (!(macroPer100 > 0)) {
    return { grams: null, label: null, note: `macro clave (${ref.keyMacro}) = 0` }
  }
  const grams = Math.round((ref.keyRefG * 100) / macroPer100)
  return { grams, label: `${grams} g` }
}

// ---------------------------------------------------------------------------
// Clasificador combinado
// ---------------------------------------------------------------------------

function pickWithVotes(
  votes: Array<ExchangeGroupCode | null>,
): { group: ExchangeGroupCode | null; agreeing: number } {
  const counts = new Map<ExchangeGroupCode, number>()
  for (const v of votes) {
    if (v === null) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let group: ExchangeGroupCode | null = null
  let agreeing = 0
  for (const [code, n] of counts) {
    if (n > agreeing) {
      agreeing = n
      group = code
    }
  }
  return { group, agreeing }
}

/**
 * Clasifica un food: combina las 3 señales, elige grupo por mayoría, asigna tier y
 * deriva la porción. Puro y determinista. Nunca lanza.
 */
export function classifyFood(food: FoodRow): FoodClassification {
  const category = categorySignal(food)
  const keyword = keywordSignal(food)
  const macro = macroSignal(food)
  const signals = { category, keyword, macro }

  const { group: majorityGroup, agreeing } = pickWithVotes([category, keyword, macro])

  // Desempate cuando las 3 señales difieren (agreeing === 1): priorizar keyword >
  // categoría > macro (keyword es la más específica en es-CL).
  let group = majorityGroup
  if (agreeing <= 1) {
    group = keyword ?? category ?? macro
  }

  let tier: ClassificationTier
  if (group === null) {
    tier = 'bajo'
  } else if (agreeing >= 3) {
    tier = 'alto'
  } else if (agreeing === 2) {
    tier = 'medio'
  } else {
    tier = 'bajo'
  }

  // Porción derivada (solo tiene sentido con grupo).
  let grams: number | null = null
  let label: string | null = null
  let portionNote: string | undefined
  if (group !== null) {
    const derived = deriveExchangePortion(food, group)
    grams = derived.grams
    label = derived.label
    portionNote = derived.note
  }

  // Guarda de sanidad: sin porción usable, o fuera de rango → tier bajo.
  if (group !== null) {
    if (grams === null) {
      tier = 'bajo'
    } else if (grams < PORTION_GRAMS_MIN || grams > PORTION_GRAMS_MAX) {
      tier = 'bajo'
      portionNote = `porción ${grams} g fuera de [${PORTION_GRAMS_MIN}, ${PORTION_GRAMS_MAX}]`
    }
  }

  const reason = buildReason(signals, group, tier, agreeing, portionNote)

  return { group, tier, exchangePortionGrams: grams, exchangePortionLabel: label, signals, reason }
}

function buildReason(
  signals: FoodClassification['signals'],
  group: ExchangeGroupCode | null,
  tier: ClassificationTier,
  agreeing: number,
  portionNote: string | undefined,
): string {
  const parts = [
    `cat=${signals.category ?? '—'}`,
    `kw=${signals.keyword ?? '—'}`,
    `macro=${signals.macro ?? '—'}`,
    `⇒ ${group ?? 'sin grupo'} (${agreeing} de 3, ${tier})`,
  ]
  if (portionNote) parts.push(portionNote)
  return parts.join(' · ')
}
