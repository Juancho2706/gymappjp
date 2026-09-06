import { describe, expect, it } from 'vitest'
import {
  HOUSEHOLD_UNIT,
  NUTRITION_INTAKE_UNITS,
  convertIntakeQuantity,
  convertQuantityBetweenUnits,
  defaultFoodUnit,
  foodUnitOptions,
  foodUnitOptionsWithCurrent,
  intakeUnitLabel,
  isHouseholdUnit,
  normalizeIntakeUnit,
} from './intake-units'
import { intakeEntryFactor, nutritionEntryFactor } from './intake-normalize'

describe('normalizeIntakeUnit', () => {
  it('mapea los sinonimos de la UI historica al codigo canonico', () => {
    expect(normalizeIntakeUnit('unidad')).toBe('un')
    expect(normalizeIntakeUnit('Unidades')).toBe('un')
    expect(normalizeIntakeUnit('un')).toBe('un')
    expect(normalizeIntakeUnit('gr')).toBe('g')
    expect(normalizeIntakeUnit(' G ')).toBe('g')
    expect(normalizeIntakeUnit('cc')).toBe('ml')
    expect(normalizeIntakeUnit('porción')).toBe('porción')
    expect(normalizeIntakeUnit('porcion')).toBe('porción')
    expect(normalizeIntakeUnit('PORCIONES')).toBe('porción')
  })

  it('rechaza texto libre que no es una unidad soportada', () => {
    expect(normalizeIntakeUnit('taza')).toBeNull()
    expect(normalizeIntakeUnit('')).toBeNull()
    expect(normalizeIntakeUnit(null)).toBeNull()
    expect(normalizeIntakeUnit(undefined)).toBeNull()
  })

  it('todo codigo canonico se normaliza a si mismo (sin drift del vocabulario)', () => {
    for (const unit of NUTRITION_INTAKE_UNITS) {
      expect(normalizeIntakeUnit(unit)).toBe(unit)
    }
  })
})

describe('intakeUnitLabel', () => {
  it('la etiqueta de UI de `un` es "unidad" (el codigo enviado sigue siendo `un`)', () => {
    expect(intakeUnitLabel('un')).toBe('unidad')
    expect(intakeUnitLabel('g')).toBe('g')
    expect(intakeUnitLabel('porción')).toBe('porción')
  })
})

/**
 * NUT-017: cambiar la unidad conservaba la cantidad. Con 155 kcal/100 g y porcion 60 g, dejar
 * "100" y pasar a `unidad` persistia 100 x macros (15.500 kcal en un registro).
 */
describe('convertIntakeQuantity', () => {
  it('g → un divide por la porcion (100 g con porcion 60 ⇒ 1,7 un)', () => {
    expect(convertIntakeQuantity({ quantity: 100, from: 'g', to: 'un', servingSize: 60 })).toBe(1.7)
  })

  it('un → g multiplica por la porcion (1 un con porcion 60 ⇒ 60 g)', () => {
    expect(convertIntakeQuantity({ quantity: 1, from: 'un', to: 'g', servingSize: 60 })).toBe(60)
    expect(convertIntakeQuantity({ quantity: 2.5, from: 'un', to: 'ml', servingSize: 200 })).toBe(500)
  })

  it('g ↔ ml conserva el numero (misma base per-100)', () => {
    expect(convertIntakeQuantity({ quantity: 250, from: 'g', to: 'ml', servingSize: 60 })).toBe(250)
  })

  it('devuelve null cuando la conversion no es representable (la UI limpia el campo)', () => {
    expect(convertIntakeQuantity({ quantity: 100, from: 'g', to: 'un', servingSize: null })).toBeNull()
    expect(convertIntakeQuantity({ quantity: 100, from: 'g', to: 'un', servingSize: 0 })).toBeNull()
    expect(convertIntakeQuantity({ quantity: 1, from: 'porción', to: 'g', servingSize: 60 })).toBeNull()
    expect(convertIntakeQuantity({ quantity: 1, from: 'g', to: 'porción', servingSize: 60 })).toBeNull()
    expect(convertIntakeQuantity({ quantity: 0, from: 'g', to: 'un', servingSize: 60 })).toBeNull()
    expect(convertIntakeQuantity({ quantity: Number.NaN, from: 'g', to: 'un', servingSize: 60 })).toBeNull()
  })

  it('la misma unidad devuelve la cantidad intacta', () => {
    expect(convertIntakeQuantity({ quantity: 125, from: 'g', to: 'g', servingSize: 60 })).toBe(125)
  })
})

/**
 * El factor DEBE seguir byte a byte a `private.nutrition_v2_entry_factor` (migracion
 * 20260728120000). Si esta matriz y el SQL divergen, el alumno ve un numero y persiste otro.
 */
describe('intakeEntryFactor — paridad con el SQL', () => {
  it('per_100: g/ml ⇒ qty/100 · contable ⇒ qty*serving/100 · porción ⇒ qty', () => {
    expect(intakeEntryFactor({ quantity: 100, unit: 'g', servingSize: 60, basis: 'per_100' })).toBe(1)
    expect(intakeEntryFactor({ quantity: 250, unit: 'ml', servingSize: 60, basis: 'per_100' })).toBe(2.5)
    expect(intakeEntryFactor({ quantity: 1, unit: 'un', servingSize: 60, basis: 'per_100' })).toBeCloseTo(0.6, 10)
    expect(intakeEntryFactor({ quantity: 2, unit: 'porción', servingSize: null, basis: 'per_100' })).toBe(2)
    // Sin serving_size la rama contable cae al default 100 (igual que el coalesce del SQL).
    expect(intakeEntryFactor({ quantity: 3, unit: 'un', servingSize: null, basis: 'per_100' })).toBe(3)
  })

  it('per_serving: g/ml ⇒ qty/serving (default 1) · resto ⇒ qty', () => {
    expect(intakeEntryFactor({ quantity: 200, unit: 'g', servingSize: 1, basis: 'per_serving' })).toBe(200)
    expect(intakeEntryFactor({ quantity: 200, unit: 'g', servingSize: null, basis: 'per_serving' })).toBe(200)
    expect(intakeEntryFactor({ quantity: 200, unit: 'g', servingSize: 50, basis: 'per_serving' })).toBe(4)
    expect(intakeEntryFactor({ quantity: 2, unit: 'un', servingSize: 60, basis: 'per_serving' })).toBe(2)
  })

  it('sin basis conserva la formula LEGADA (historial intacto)', () => {
    // Este es el numero equivocado del informe (258,3 kcal); se conserva SOLO para filas viejas.
    expect(intakeEntryFactor({ quantity: 100, unit: 'g', servingSize: 60 })).toBeCloseTo(1.6667, 4)
    expect(intakeEntryFactor({ quantity: 1, unit: 'un', servingSize: 60 })).toBe(1)
    expect(nutritionEntryFactor(100, 'g', 60)).toBeCloseTo(1.6667, 4)
  })

  it('la rama de porciones queda INTACTA en el regimen legado (factor = quantity)', () => {
    // Sintetico de intercambios: p_unit 'porción' + servingSize null ⇒ ref x porciones exacto.
    expect(intakeEntryFactor({ quantity: 0.5, unit: 'porción', servingSize: null })).toBe(0.5)
    expect(intakeEntryFactor({ quantity: 1, unit: 'porción', servingSize: null })).toBe(1)
  })

  it('clampea cantidades negativas o no finitas a 0 (greatest(...,0) del SQL)', () => {
    expect(intakeEntryFactor({ quantity: -5, unit: 'g', servingSize: 100, basis: 'per_100' })).toBe(0)
    expect(intakeEntryFactor({ quantity: Number.NaN, unit: 'un', servingSize: 60, basis: 'per_100' })).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// W2.1 «Cantidades honestas» — unidades POR ALIMENTO con medida casera
// ---------------------------------------------------------------------------

/** Huevo del catalogo: 100 g de base, medida casera «huevo» = 61 g (el caso del tren). */
const HUEVO = { servingUnit: 'g', servingSize: 100, householdGrams: 61, householdLabel: 'huevo' }

describe('foodUnitOptions', () => {
  it('siempre ofrece la magnitud del alimento, rotulada igual que su codigo', () => {
    expect(foodUnitOptions({ servingUnit: 'g', servingSize: 100 })).toEqual([
      { code: 'g', label: 'g', grams: null },
    ])
    expect(foodUnitOptions({ servingUnit: 'ml', servingSize: 250 })).toEqual([
      { code: 'ml', label: 'ml', grams: null },
    ])
  })

  it('NO ofrece `un` a un alimento que no es contable (la causa 1 del tren)', () => {
    // 96 % del catalogo: `serving_unit = 'g'` y «1 un» eran 100 g sin que nadie lo dijera.
    expect(foodUnitOptions({ servingUnit: 'g', servingSize: 100 }).map((o) => o.code)).not.toContain('un')
    expect(foodUnitOptions({ servingUnit: 'taza', servingSize: 240 }).map((o) => o.code)).not.toContain('un')
  })

  it('ofrece `un` con sus gramos cuando el alimento SI es contable', () => {
    expect(foodUnitOptions({ servingUnit: 'un', servingSize: 58 })).toEqual([
      { code: 'g', label: 'g', grams: null },
      { code: 'un', label: 'un · 58 g', grams: 58 },
    ])
    // Sin porcion utilizable no hay equivalencia que rotular.
    expect(foodUnitOptions({ servingUnit: 'un', servingSize: null })).toEqual([
      { code: 'g', label: 'g', grams: null },
      { code: 'un', label: 'un', grams: null },
    ])
  })

  it('ofrece `casera` con su etiqueta y gramaje, en el orden magnitud → casera → un', () => {
    expect(foodUnitOptions(HUEVO)).toEqual([
      { code: 'g', label: 'g', grams: null },
      { code: HOUSEHOLD_UNIT, label: 'huevo · 61 g', grams: 61 },
    ])
    // R7: un alimento contable CON medida ofrece las dos, cada una con sus gramos.
    expect(
      foodUnitOptions({
        servingUnit: 'un',
        servingSize: 58,
        householdGrams: 61,
        householdLabel: 'huevo',
      }).map((o) => o.label),
    ).toEqual(['g', 'huevo · 61 g', 'un · 58 g'])
  })

  it('rotula la medida casera en ml cuando el alimento es liquido', () => {
    const taza = { servingUnit: 'ml', servingSize: 100, householdGrams: 240, householdLabel: 'taza' }
    expect(foodUnitOptions(taza)[1]).toEqual({ code: HOUSEHOLD_UNIT, label: 'taza · 240 ml', grams: 240 })
  })

  it('descarta la medida casera fuera del rango del CHECK [1, 1000] y el par incompleto (R4)', () => {
    const codes = (food: Parameters<typeof foodUnitOptions>[0]) => foodUnitOptions(food).map((o) => o.code)
    expect(codes({ ...HUEVO, householdGrams: 5000 })).toEqual(['g'])
    expect(codes({ ...HUEVO, householdGrams: 0.5 })).toEqual(['g'])
    expect(codes({ ...HUEVO, householdGrams: null })).toEqual(['g'])
    expect(codes({ ...HUEVO, householdLabel: '   ' })).toEqual(['g'])
    // El borde SI entra: el CHECK es inclusivo.
    expect(codes({ ...HUEVO, householdGrams: 1000 })).toEqual(['g', HOUSEHOLD_UNIT])
  })
})

describe('defaultFoodUnit', () => {
  it('prefiere la medida casera cuando existe, incluso en un alimento contable (R7)', () => {
    expect(defaultFoodUnit(HUEVO)).toBe(HOUSEHOLD_UNIT)
    expect(
      defaultFoodUnit({ servingUnit: 'un', servingSize: 58, householdGrams: 61, householdLabel: 'huevo' }),
    ).toBe(HOUSEHOLD_UNIT)
  })

  it('sin medida casera se comporta igual que antes: `un` si es nativo, si no la magnitud', () => {
    expect(defaultFoodUnit({ servingUnit: 'un', servingSize: 58 })).toBe('un')
    expect(defaultFoodUnit({ servingUnit: 'unidad', servingSize: 58 })).toBe('un')
    expect(defaultFoodUnit({ servingUnit: 'g', servingSize: 100 })).toBe('g')
    expect(defaultFoodUnit({ servingUnit: 'ml', servingSize: 250 })).toBe('ml')
    expect(defaultFoodUnit({ servingUnit: 'taza', servingSize: 240 })).toBe('g')
    expect(defaultFoodUnit({ servingUnit: null })).toBe('g')
  })
})

describe('foodUnitOptionsWithCurrent', () => {
  it('conserva la unidad VIGENTE aunque el alimento ya no la ofrezca', () => {
    // `porción` heredada de la conversion V1→V2: el coach tiene que poder volver a ella.
    expect(foodUnitOptionsWithCurrent({ servingUnit: 'g', servingSize: 100 }, 'porción')).toEqual([
      { code: 'g', label: 'g', grams: null },
      { code: 'porción', label: 'porción', grams: null },
    ])
    // Un item viejo en `un` sobre un alimento no contable: la opcion sigue ahi.
    expect(foodUnitOptionsWithCurrent(HUEVO, 'un').map((o) => o.code)).toEqual(['g', HOUSEHOLD_UNIT, 'un'])
  })

  it('no duplica la unidad vigente cuando ya esta en el set', () => {
    expect(foodUnitOptionsWithCurrent(HUEVO, HOUSEHOLD_UNIT)).toEqual(foodUnitOptions(HUEVO))
    expect(foodUnitOptionsWithCurrent(HUEVO, '')).toEqual(foodUnitOptions(HUEVO))
  })
})

describe('convertQuantityBetweenUnits (casera)', () => {
  const base = { servingSize: 100, householdGrams: 61 }

  it('casera ↔ g por el gramaje de la medida', () => {
    expect(convertQuantityBetweenUnits({ ...base, quantity: 2, from: HOUSEHOLD_UNIT, to: 'g' })).toBe(122)
    expect(convertQuantityBetweenUnits({ ...base, quantity: 122, from: 'g', to: HOUSEHOLD_UNIT })).toBe(2)
  })

  it('casera ↔ un pasa por gramos (`servingSize`), nunca 1:1', () => {
    // 2 huevos = 122 g = 1,2 «un» de 100 g.
    expect(convertQuantityBetweenUnits({ ...base, quantity: 2, from: HOUSEHOLD_UNIT, to: 'un' })).toBe(1.2)
    // 1 «un» = 100 g = 1,6 huevos.
    expect(convertQuantityBetweenUnits({ ...base, quantity: 1, from: 'un', to: HOUSEHOLD_UNIT })).toBe(1.6)
  })

  it('sin gramaje casero no hay conversion representable', () => {
    expect(
      convertQuantityBetweenUnits({
        quantity: 2,
        from: HOUSEHOLD_UNIT,
        to: 'g',
        servingSize: 100,
        householdGrams: null,
      }),
    ).toBeNull()
    expect(convertQuantityBetweenUnits({ quantity: 100, from: 'g', to: HOUSEHOLD_UNIT, servingSize: 100 })).toBeNull()
  })

  it('`porción` de por medio siempre es null (sus macros son las del grupo)', () => {
    expect(convertQuantityBetweenUnits({ ...base, quantity: 1, from: 'porción', to: HOUSEHOLD_UNIT })).toBeNull()
    expect(convertQuantityBetweenUnits({ ...base, quantity: 1, from: HOUSEHOLD_UNIT, to: 'porción' })).toBeNull()
  })

  it('delega en `convertIntakeQuantity` para el vocabulario persistible (cero drift)', () => {
    const pares = [
      ['g', 'un'],
      ['un', 'g'],
      ['g', 'ml'],
      ['un', 'porción'],
    ] as const
    for (const [from, to] of pares) {
      expect(convertQuantityBetweenUnits({ quantity: 100, from, to, servingSize: 60 })).toBe(
        convertIntakeQuantity({ quantity: 100, from, to, servingSize: 60 }),
      )
    }
  })

  it('la misma unidad devuelve la cantidad intacta; una unidad desconocida es null', () => {
    expect(convertQuantityBetweenUnits({ quantity: 3, from: HOUSEHOLD_UNIT, to: 'casera', servingSize: 100 })).toBe(3)
    expect(convertQuantityBetweenUnits({ quantity: 3, from: 'taza', to: 'g', servingSize: 100 })).toBeNull()
  })
})

describe('isHouseholdUnit', () => {
  it('compara LITERAL contra el codigo, nunca contra la etiqueta (R8)', () => {
    expect(isHouseholdUnit('casera')).toBe(true)
    expect(isHouseholdUnit('  Casera ')).toBe(true)
    // «unidad» es una etiqueta casera legitima y NO puede leerse como el codigo.
    expect(isHouseholdUnit('unidad')).toBe(false)
    expect(isHouseholdUnit(null)).toBe(false)
  })
})
