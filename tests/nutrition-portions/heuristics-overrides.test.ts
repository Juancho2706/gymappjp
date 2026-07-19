import { describe, it, expect } from 'vitest'
import {
  OVERRIDES,
  matchOverride,
  classifyFoodWithOverrides,
  normalizeForOverride,
  type OverrideRule,
} from '../../scripts/nutrition-portions/heuristics-overrides'
import { classifyFood, type FoodRow } from '../../scripts/nutrition-portions/heuristics'

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// matchOverride — normalizacion y first-match
// ---------------------------------------------------------------------------

describe('normalizeForOverride', () => {
  it('minuscula, sin tildes, trim', () => {
    expect(normalizeForOverride('  Piña Fresca  ')).toBe('pina fresca')
    expect(normalizeForOverride('AceÍte de Olíva')).toBe('aceite de oliva')
    expect(normalizeForOverride(null)).toBe('')
  })
})

describe('matchOverride — first match gana (orden global de bloques)', () => {
  const cases: Array<[string, { group: OverrideRule['group']; grams: number | null }]> = [
    // BLOQUE A: bebida vegetal null gana a leche->LAC y a arroz/avena->C
    ['Leche de almendras', { group: null, grams: null }],
    ['Leche de avena', { group: null, grams: null }],
    // BLOQUE B: queso crema null gana a queso->LAC
    ['Queso crema Philadelphia', { group: null, grams: null }],
    // BLOQUE C: barra proteica null gana a whey->SP
    ['Barra de proteina whey', { group: null, grams: null }],
    // conflicto pescado en aceite: P gana a aceite->G
    ['Atun en aceite de oliva', { group: 'P', grams: 30 }],
    ['Atun en agua', { group: 'P', grams: 30 }],
    // pasta de mani: ARL gana a pasta->C y a mantequilla->G
    ['Pasta de mani crunchy', { group: 'ARL', grams: 10 }],
    ['Peanut Butter', { group: 'ARL', grams: 10 }],
    // aceite de palta: G gana a palta->ARL
    ['Aceite de palta', { group: 'G', grams: 5 }],
    ['Palta hass', { group: 'ARL', grams: 30 }],
    // papaya: F gana a papa->C
    ['Papaya en trozos', { group: 'F', grams: 150 }],
    // harina de almendra: null (fruto seco) gana a almendra->ARL y harina->C
    ['Harina de almendra', { group: null, grams: null }],
    // choclo -> C (no V)
    ['Choclo cocido', { group: 'C', grams: 80 }],
    // poroto verde -> V (vaina), no LEG
    ['Poroto verde fresco', { group: 'V', grams: 100 }],
    // galleta de agua -> C (no null por 'agua')
    ['Galletas de agua', { group: 'C', grams: 20 }],
    // avena cruda -> C 20 (corrige el 312 g del heuristico)
    ['Avena en hojuelas', { group: 'C', grams: 20 }],
    // aceite -> G 5 (no ARL)
    ['Aceite Maravilla', { group: 'G', grams: 5 }],
  ]
  for (const [name, expected] of cases) {
    it(`${name} -> ${expected.group ?? 'null'}`, () => {
      const rule = matchOverride(name)
      expect(rule, `sin override para "${name}"`).not.toBeNull()
      expect(rule!.group).toBe(expected.group)
      expect(rule!.portionGrams).toBe(expected.grams)
    })
  }

  it('espinaca NO cae en pina->F (usa \\bpina\\b); no matchea F', () => {
    const rule = matchOverride('Espinaca cruda')
    // espinaca es V; el override de espinaca->V debe ganar, nunca F por "pina".
    expect(rule?.group).toBe('V')
  })

  it('eggplant/veggie no caen en egg->P (usa \\begg\\b)', () => {
    expect(matchOverride('Eggplant grillado')?.group).toBe('V')
    expect(matchOverride('Hamburguesa veggie')?.group).toBeNull()
  })

  it('sin override -> null', () => {
    expect(matchOverride('Xyzzy plutonio')).toBeNull()
    expect(matchOverride('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// classifyFoodWithOverrides — semantica de tier
// ---------------------------------------------------------------------------

describe('classifyFoodWithOverrides — tier segun confianza', () => {
  it('confianza alta -> tier alto con grupo/gramos del override', () => {
    const r = classifyFoodWithOverrides(food({ name: 'Aceite de oliva extra virgen', category: 'grasa', calories: 884, fats_g: 100 }))
    expect(r.group).toBe('G')
    expect(r.tier).toBe('alto')
    expect(r.exchangePortionGrams).toBe(5)
    expect(r.exchangePortionLabel).toBe('5 g')
  })

  it('confianza media -> tier medio (no la suben otras senales)', () => {
    // granola: override C 30 media. Aunque cat+kw+macro pudieran coincidir, se queda medio.
    const r = classifyFoodWithOverrides(food({ name: 'Granola artesanal', category: 'carbohidrato', calories: 400, protein_g: 10, carbs_g: 60, fats_g: 12 }))
    expect(r.group).toBe('C')
    expect(r.tier).toBe('medio')
    expect(r.exchangePortionGrams).toBe(30)
  })

  it('null override SIEMPRE manda -> sin grupo, tier bajo, sin gramos', () => {
    const r = classifyFoodWithOverrides(food({ name: 'Leche de almendras vainilla', category: 'lacteo', calories: 40, protein_g: 1, carbs_g: 6, fats_g: 1.5, is_liquid: true }))
    expect(r.group).toBeNull()
    expect(r.tier).toBe('bajo')
    expect(r.exchangePortionGrams).toBeNull()
  })

  it('null override gana aunque los macros parezcan un grupo claro (bebida azucarada)', () => {
    const r = classifyFoodWithOverrides(food({ name: 'Coca Cola Original', category: 'bebida', calories: 42, carbs_g: 11, is_liquid: true }))
    expect(r.group).toBeNull()
    expect(r.tier).toBe('bajo')
  })

  it('emite las 3 senales base para el reporte, aunque haya override', () => {
    const r = classifyFoodWithOverrides(food({ name: 'Palta', category: 'grasa', calories: 160, protein_g: 2, carbs_g: 9, fats_g: 15 }))
    expect(r.signals).toHaveProperty('category')
    expect(r.signals).toHaveProperty('keyword')
    expect(r.signals).toHaveProperty('macro')
    expect(r.reason).toContain('override')
  })

  it('sin override: cae al clasificador puro (identico a classifyFood)', () => {
    const f = food({ name: 'Xyzzy proteico', category: 'proteina', calories: 165, protein_g: 31, carbs_g: 0, fats_g: 3.6 })
    const withOv = classifyFoodWithOverrides(f)
    const base = classifyFood(f)
    expect(withOv).toEqual(base)
  })
})

// ---------------------------------------------------------------------------
// Correcciones concretas del heuristico (evidencia del dry-run)
// ---------------------------------------------------------------------------

describe('correcciones prioritarias del dry-run', () => {
  it('peanut butter: LEG 107 g (heuristico) -> ARL 10 g', () => {
    const r = classifyFoodWithOverrides(food({ name: 'Waitrose Smooth Peanut Butter', calories: 600, protein_g: 25, carbs_g: 20, fats_g: 50 }))
    expect(r.group).toBe('ARL')
    expect(r.exchangePortionGrams).toBe(10)
  })

  it('avena cocida: 312 g (heuristico) -> C 120 g', () => {
    const r = classifyFoodWithOverrides(food({ name: 'Avena cocida', calories: 71, protein_g: 2.5, carbs_g: 12, fats_g: 1.5 }))
    expect(r.group).toBe('C')
    expect(r.exchangePortionGrams).toBe(120)
  })

  it('zucaritas: F (heuristico) -> C 20 g', () => {
    const r = classifyFoodWithOverrides(food({ name: 'Zucaritas Kelloggs', calories: 380, protein_g: 5, carbs_g: 87, fats_g: 1 }))
    expect(r.group).toBe('C')
    expect(r.exchangePortionGrams).toBe(20)
  })
})

// ---------------------------------------------------------------------------
// Salud de la tabla
// ---------------------------------------------------------------------------

describe('OVERRIDES — invariantes de la tabla', () => {
  it('toda fila con grupo tiene gramos entero en [5, 500]; toda fila null no tiene gramos', () => {
    for (const rule of OVERRIDES) {
      if (rule.group === null) {
        expect(rule.portionGrams, `${rule.pattern} null debe tener grams null`).toBeNull()
      } else {
        expect(rule.portionGrams, `${rule.pattern} sin grams`).not.toBeNull()
        expect(Number.isInteger(rule.portionGrams)).toBe(true)
        expect(rule.portionGrams!).toBeGreaterThanOrEqual(5)
        expect(rule.portionGrams!).toBeLessThanOrEqual(500)
      }
      expect(['alta', 'media']).toContain(rule.confidence)
      expect(rule.source.length).toBeGreaterThan(0)
    }
  })

  it('nunca lanza sobre nombres raros', () => {
    for (const name of ['', '   ', '123', '!!!', 'ñññ', 'a'.repeat(300)]) {
      expect(() => classifyFoodWithOverrides(food({ name }))).not.toThrow()
    }
  })
})
