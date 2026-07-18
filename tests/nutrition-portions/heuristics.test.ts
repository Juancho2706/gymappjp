import { describe, it, expect } from 'vitest'
import {
  classifyFood,
  categorySignal,
  keywordSignal,
  macroSignal,
  macroSignalFromPer100,
  normalizePer100,
  deriveExchangePortion,
  GROUP_REFS,
  PORTION_GRAMS_MIN,
  PORTION_GRAMS_MAX,
  type FoodRow,
  type ExchangeGroupCode,
  type ClassificationTier,
} from '../../scripts/nutrition-portions/heuristics'

// ---------------------------------------------------------------------------
// Fixture: 36 foods REALES representativos (macros per-100 g salvo cuando el
// caso borde lo requiera). Cubre los 9 grupos system + casos borde.
// ---------------------------------------------------------------------------

function food(partial: Partial<FoodRow> & Pick<FoodRow, 'name'>): FoodRow {
  return {
    serving_size: 100,
    serving_unit: 'g',
    is_liquid: false,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fats_g: 0,
    category: null,
    ...partial,
  }
}

interface Case {
  food: FoodRow
  group: ExchangeGroupCode | null
  tier: ClassificationTier
  /** gramos esperados (aprox) si se quiere aseverar; omitir si no interesa. */
  grams?: number | null
}

const CASES: Case[] = [
  // ---- C — cereales/carbohidratos (alto) ----
  { food: food({ name: 'Arroz blanco cocido', category: 'carbohidrato', calories: 130, protein_g: 2.7, carbs_g: 28, fats_g: 0.3 }), group: 'C', tier: 'alto', grams: 54 },
  { food: food({ name: 'Pan marraqueta', category: 'carbohidrato', calories: 280, protein_g: 9, carbs_g: 53, fats_g: 2 }), group: 'C', tier: 'alto', grams: 28 },
  { food: food({ name: 'Avena tradicional', category: 'carbohidrato', calories: 380, protein_g: 13, carbs_g: 67, fats_g: 7 }), group: 'C', tier: 'alto', grams: 22 },
  { food: food({ name: 'Papa cocida', category: 'carbohidrato', calories: 87, protein_g: 2, carbs_g: 20, fats_g: 0.1 }), group: 'C', tier: 'alto', grams: 75 },
  // category vacía → se deriva del nombre (foodCategoryFromName): 'arroz' → carbohidrato → C
  { food: food({ name: 'Arroz integral cocido', category: '', calories: 112, protein_g: 2.6, carbs_g: 23, fats_g: 0.9 }), group: 'C', tier: 'alto', grams: 65 },
  { food: food({ name: 'Fideos cocidos', category: 'carbohidrato', calories: 158, protein_g: 5, carbs_g: 25, fats_g: 1.1 }), group: 'C', tier: 'alto', grams: 60 },

  // ---- P — proteínas bajo grasa (alto; todas apoyadas en la guarda de densidad SP) ----
  { food: food({ name: 'Pechuga de pollo cocida', category: 'proteina', calories: 165, protein_g: 31, carbs_g: 0, fats_g: 3.6 }), group: 'P', tier: 'alto', grams: 23 },
  { food: food({ name: 'Atun al agua', category: 'proteina', calories: 116, protein_g: 26, carbs_g: 0, fats_g: 1 }), group: 'P', tier: 'alto', grams: 27 },
  { food: food({ name: 'Merluza cocida', category: 'proteina', calories: 90, protein_g: 18, carbs_g: 0, fats_g: 1 }), group: 'P', tier: 'alto', grams: 39 },
  { food: food({ name: 'Huevo entero', category: 'proteina', calories: 155, protein_g: 13, carbs_g: 1.1, fats_g: 11 }), group: 'P', tier: 'alto', grams: 54 },

  // ---- F — frutas (alto) ----
  { food: food({ name: 'Manzana', category: 'fruta', calories: 52, protein_g: 0.3, carbs_g: 14, fats_g: 0.2 }), group: 'F', tier: 'alto', grams: 107 },
  { food: food({ name: 'Platano', category: 'fruta', calories: 89, protein_g: 1.1, carbs_g: 23, fats_g: 0.3 }), group: 'F', tier: 'alto', grams: 65 },
  { food: food({ name: 'Naranja', category: 'fruta', calories: 47, protein_g: 0.5, carbs_g: 12, fats_g: 0.1 }), group: 'F', tier: 'alto', grams: 125 },
  { food: food({ name: 'Pera', category: 'fruta', calories: 57, protein_g: 0.4, carbs_g: 15, fats_g: 0.1 }), group: 'F', tier: 'alto', grams: 100 },

  // ---- V — verduras ----
  { food: food({ name: 'Lechuga', category: 'verdura', calories: 15, protein_g: 1.4, carbs_g: 2.9, fats_g: 0.2 }), group: 'V', tier: 'alto', grams: 138 },
  { food: food({ name: 'Brocoli cocido', category: 'verdura', calories: 34, protein_g: 2.8, carbs_g: 7, fats_g: 0.4 }), group: 'V', tier: 'alto', grams: 57 },
  // tomate: ratio carb-alto lo aleja del perfil V (macro dice C) → 2 señales (cat+kw) = medio
  { food: food({ name: 'Tomate', category: 'verdura', calories: 18, protein_g: 0.9, carbs_g: 3.9, fats_g: 0.2 }), group: 'V', tier: 'medio' },
  // espinaca: alta fracción proteica → macro dice LAC → 2 señales (cat+kw) = medio
  { food: food({ name: 'Espinaca cruda', category: 'verdura', calories: 23, protein_g: 2.9, carbs_g: 3.6, fats_g: 0.4 }), group: 'V', tier: 'medio' },

  // ---- LAC — lácteos ----
  { food: food({ name: 'Leche descremada', category: 'lacteo', calories: 37, protein_g: 3.5, carbs_g: 5, fats_g: 0.2, is_liquid: true }), group: 'LAC', tier: 'alto', grams: 257 },
  { food: food({ name: 'Yogur descremado', category: 'lacteo', calories: 43, protein_g: 4, carbs_g: 6, fats_g: 0.2 }), group: 'LAC', tier: 'alto', grams: 225 },
  // queso alto en grasa: macro dice P → 2 señales (cat+kw) = medio
  { food: food({ name: 'Queso gauda', category: 'lacteo', calories: 356, protein_g: 25, carbs_g: 2, fats_g: 28 }), group: 'LAC', tier: 'medio', grams: 36 },

  // ---- ARL — ricos en lípidos (frutos secos/palta); comparten categoría 'grasa' con G → tope medio ----
  { food: food({ name: 'Palta hass', category: 'grasa', calories: 160, protein_g: 2, carbs_g: 9, fats_g: 15 }), group: 'ARL', tier: 'medio', grams: 33 },
  { food: food({ name: 'Aceitunas', category: 'grasa', calories: 115, protein_g: 0.8, carbs_g: 6, fats_g: 11 }), group: 'ARL', tier: 'medio', grams: 45 },
  // Frutos secos enteros: perfil de macros ambiguo (P+C+G) — el macro cae en LEG,
  // categoría 'grasa'→G y keyword→ARL: las 3 difieren (conflicto) → bajo. Caso
  // honesto: los frutos secos necesitan revisión humana (keyword da el grupo, ARL).
  { food: food({ name: 'Almendras', category: 'grasa', calories: 579, protein_g: 21, carbs_g: 22, fats_g: 49 }), group: 'ARL', tier: 'bajo', grams: 10 },

  // ---- SP — scoop proteína (suplemento); comparte categoría 'proteina' con P → tope medio ----
  { food: food({ name: 'Proteina whey en polvo', category: 'proteina', calories: 400, protein_g: 80, carbs_g: 8, fats_g: 6 }), group: 'SP', tier: 'medio', grams: 30 },

  // ---- G — grasa de cocina (aceites); macro dice ARL (perfil idéntico) → tope medio ----
  { food: food({ name: 'Aceite de oliva', category: 'grasa', calories: 884, protein_g: 0, carbs_g: 0, fats_g: 100, is_liquid: true }), group: 'G', tier: 'medio', grams: 5 },
  { food: food({ name: 'Mantequilla', category: 'grasa', calories: 717, protein_g: 0.9, carbs_g: 0.1, fats_g: 81 }), group: 'G', tier: 'medio', grams: 6 },

  // ---- LEG — legumbres (alto; la guarda de densidad energética las separa de V) ----
  { food: food({ name: 'Lentejas cocidas', category: 'legumbre', calories: 116, protein_g: 9, carbs_g: 20, fats_g: 0.4 }), group: 'LEG', tier: 'alto', grams: 75 },
  { food: food({ name: 'Porotos cocidos', category: 'legumbre', calories: 127, protein_g: 9, carbs_g: 21, fats_g: 0.5 }), group: 'LEG', tier: 'alto', grams: 71 },
  { food: food({ name: 'Garbanzos cocidos', category: 'legumbre', calories: 164, protein_g: 9, carbs_g: 27, fats_g: 2.6 }), group: 'LEG', tier: 'alto', grams: 56 },

  // ---- Casos borde ----
  // Agua: sin macros → ninguna señal opina → sin grupo, bajo.
  { food: food({ name: 'Agua mineral', category: 'bebida', calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0, is_liquid: true }), group: null, tier: 'bajo', grams: null },
  // Bebida azucarada: solo el macro opina (carb puro → F) → 1 señal = bajo.
  { food: food({ name: 'Bebida cola', category: 'bebida', calories: 45, protein_g: 0, carbs_g: 11, fats_g: 0, is_liquid: true }), group: 'F', tier: 'bajo' },
  // Ultra-procesado snack: categoría snack sin grupo, keyword 'papa' → C, macro → LEG (conflicto) → bajo.
  { food: food({ name: 'Papas fritas', category: 'snack', calories: 530, protein_g: 6, carbs_g: 53, fats_g: 34 }), group: 'C', tier: 'bajo' },
  // Macros contradictorios: nombre+categoría dicen P pero los macros son puro carbo →
  // 2 señales P pero el macro clave (proteína) = 0 → porción no derivable → bajo.
  { food: food({ name: 'Pechuga de pollo (dato erroneo)', category: 'proteina', calories: 360, protein_g: 0, carbs_g: 90, fats_g: 0 }), group: 'P', tier: 'bajo', grams: null },
  // Unidad no másica: no se puede derivar gramos → bajo aunque cat+kw digan P.
  { food: food({ name: 'Huevo (por unidad)', category: 'proteina', serving_size: 1, serving_unit: 'unidad', calories: 72, protein_g: 6, carbs_g: 0.6, fats_g: 5 }), group: 'P', tier: 'bajo', grams: null },
  // Guarda de rango: caldo muy diluido → porción derivada > 500 g → bajo.
  { food: food({ name: 'Caldo de verduras', category: 'verdura', calories: 5, protein_g: 0.5, carbs_g: 0.5, fats_g: 0.1, is_liquid: true }), group: 'V', tier: 'bajo' },
]

describe('classifyFood — fixture de 36 foods reales (9 grupos + bordes)', () => {
  for (const c of CASES) {
    it(`${c.food.name} → ${c.group ?? 'sin grupo'} / ${c.tier}`, () => {
      const result = classifyFood(c.food)
      expect(result.group, result.reason).toBe(c.group)
      expect(result.tier, result.reason).toBe(c.tier)
      if (c.grams !== undefined) {
        expect(result.exchangePortionGrams, result.reason).toBe(c.grams)
      }
    })
  }

  it('el fixture cumple la meta F1: ≥80% de foods en tier alto+medio', () => {
    const clasificados = CASES.filter((c) => c.tier === 'alto' || c.tier === 'medio').length
    expect(clasificados / CASES.length).toBeGreaterThanOrEqual(0.8)
  })

  it('nunca lanza y siempre emite las 3 señales', () => {
    for (const c of CASES) {
      const r = classifyFood(c.food)
      expect(r.signals).toHaveProperty('category')
      expect(r.signals).toHaveProperty('keyword')
      expect(r.signals).toHaveProperty('macro')
      expect(typeof r.reason).toBe('string')
    }
  })

  it('toda porción emitida cae dentro del rango de sanidad', () => {
    for (const c of CASES) {
      const r = classifyFood(c.food)
      if (r.exchangePortionGrams !== null && r.tier !== 'bajo') {
        expect(r.exchangePortionGrams).toBeGreaterThanOrEqual(PORTION_GRAMS_MIN)
        expect(r.exchangePortionGrams).toBeLessThanOrEqual(PORTION_GRAMS_MAX)
      }
    }
  })
})

describe('GROUP_REFS — fixture constante de los 9 grupos system (origen seed V1)', () => {
  it('tiene exactamente los 9 grupos system', () => {
    const codes = GROUP_REFS.map((g) => g.code).sort()
    expect(codes).toEqual(['ARL', 'C', 'F', 'G', 'LAC', 'LEG', 'P', 'SP', 'V'])
  })

  it('los ref_* coinciden con el seed V1', () => {
    const c = GROUP_REFS.find((g) => g.code === 'C')!
    expect([c.refCalories, c.refProteinG, c.refCarbsG, c.refFatsG]).toEqual([70, 2, 15, 0])
    const p = GROUP_REFS.find((g) => g.code === 'P')!
    expect([p.refCalories, p.refProteinG, p.refCarbsG, p.refFatsG]).toEqual([55, 7, 0, 3])
    const sp = GROUP_REFS.find((g) => g.code === 'SP')!
    expect([sp.refCalories, sp.refProteinG, sp.refCarbsG, sp.refFatsG]).toEqual([120, 24, 2, 1])
    const leg = GROUP_REFS.find((g) => g.code === 'LEG')!
    // LEG compuesto: ref efectivo 1P+1C usado para el perfil de macros.
    expect(leg.profile).toEqual({ protein: 9, carbs: 15, fats: 3 })
  })
})

describe('normalizePer100 — normalización por serving_size/unit', () => {
  it('serving 100 g deja los macros tal cual', () => {
    const p = normalizePer100(food({ name: 'x', protein_g: 10, carbs_g: 20, fats_g: 5, calories: 165 }))
    expect(p).toEqual({ calories: 165, protein: 10, carbs: 20, fats: 5 })
  })

  it('serving 50 g escala x2 a per-100 g', () => {
    const p = normalizePer100(food({ name: 'x', serving_size: 50, protein_g: 5, carbs_g: 10, fats_g: 2.5, calories: 82 }))
    expect(p).toEqual({ calories: 164, protein: 10, carbs: 20, fats: 5 })
  })

  it('unidad no másica → null', () => {
    expect(normalizePer100(food({ name: 'x', serving_size: 1, serving_unit: 'unidad', protein_g: 6 }))).toBeNull()
  })

  it('serving_size inválido → null', () => {
    expect(normalizePer100(food({ name: 'x', serving_size: 0 }))).toBeNull()
  })
})

describe('señales individuales', () => {
  it('categorySignal mapea las 10 categorías', () => {
    expect(categorySignal(food({ name: 'x', category: 'carbohidrato' }))).toBe('C')
    expect(categorySignal(food({ name: 'x', category: 'proteina' }))).toBe('P')
    expect(categorySignal(food({ name: 'x', category: 'grasa' }))).toBe('G')
    expect(categorySignal(food({ name: 'x', category: 'legumbre' }))).toBe('LEG')
    expect(categorySignal(food({ name: 'x', category: 'bebida' }))).toBeNull()
    expect(categorySignal(food({ name: 'x', category: 'snack' }))).toBeNull()
  })

  it('categorySignal deriva del nombre cuando la categoría falta', () => {
    expect(categorySignal(food({ name: 'Arroz integral', category: null }))).toBe('C')
    expect(categorySignal(food({ name: 'Pechuga de pollo', category: '' }))).toBe('P')
  })

  it('keywordSignal: SP antes que P; LAC antes que ARL; ARL antes que G', () => {
    expect(keywordSignal(food({ name: 'Proteina whey en polvo' }))).toBe('SP')
    expect(keywordSignal(food({ name: 'Leche de almendras' }))).toBe('LAC')
    expect(keywordSignal(food({ name: 'Mantequilla de mani' }))).toBe('ARL')
    expect(keywordSignal(food({ name: 'Aceite de oliva' }))).toBe('G')
    expect(keywordSignal(food({ name: 'Lentejas' }))).toBe('LEG')
    expect(keywordSignal(food({ name: 'xyzabc' }))).toBeNull()
  })

  it('macroSignal: guarda de densidad SP (pechuga → P, whey → SP)', () => {
    // pechuga: perfil casi puro-proteína pero densidad 31 < 50 → P
    expect(macroSignal(food({ name: 'x', calories: 165, protein_g: 31, carbs_g: 0, fats_g: 3.6 }))).toBe('P')
    // whey: densidad 80 ≥ 50 → SP
    expect(macroSignal(food({ name: 'x', calories: 400, protein_g: 80, carbs_g: 8, fats_g: 6 }))).toBe('SP')
  })

  it('macroSignal: guarda de densidad energética V (lentejas densas → LEG, no V)', () => {
    expect(macroSignal(food({ name: 'x', calories: 116, protein_g: 9, carbs_g: 20, fats_g: 0.4 }))).toBe('LEG')
  })

  it('macroSignal: empate puro-grasa se resuelve a ARL', () => {
    expect(macroSignalFromPer100({ calories: 884, protein: 0, carbs: 0, fats: 100 })).toBe('ARL')
  })

  it('macroSignal: sin macros → null', () => {
    expect(macroSignal(food({ name: 'x', calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 }))).toBeNull()
  })
})

describe('deriveExchangePortion', () => {
  it('C: 15 g carbs desde arroz (28 g/100 g) → ~54 g', () => {
    const d = deriveExchangePortion(food({ name: 'x', carbs_g: 28, serving_size: 100 }), 'C')
    expect(d.grams).toBe(54)
    expect(d.label).toBe('54 g')
  })

  it('ARL: 5 g grasa desde palta (15 g/100 g) → ~33 g', () => {
    expect(deriveExchangePortion(food({ name: 'x', fats_g: 15 }), 'ARL').grams).toBe(33)
  })

  it('macro clave = 0 → no derivable (null + note)', () => {
    const d = deriveExchangePortion(food({ name: 'x', protein_g: 0 }), 'P')
    expect(d.grams).toBeNull()
    expect(d.note).toContain('macro clave')
  })

  it('unidad no másica → no derivable', () => {
    const d = deriveExchangePortion(food({ name: 'x', serving_unit: 'unidad', serving_size: 1, carbs_g: 20 }), 'C')
    expect(d.grams).toBeNull()
  })
})
