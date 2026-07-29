import { describe, expect, it } from 'vitest'
import {
  NUTRITION_INTAKE_UNITS,
  catalogUnitOptions,
  convertIntakeQuantity,
  defaultCatalogUnit,
  intakeUnitLabel,
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

describe('catalogUnitOptions / defaultCatalogUnit', () => {
  it('ofrece la magnitud del alimento + la unidad contable, nunca porción', () => {
    expect(catalogUnitOptions('g')).toEqual(['g', 'un'])
    expect(catalogUnitOptions('ml')).toEqual(['ml', 'un'])
    // Un `servingUnit` contable o desconocido cae al lado solido (mismo criterio del motor V1).
    expect(catalogUnitOptions('un')).toEqual(['g', 'un'])
    expect(catalogUnitOptions('taza')).toEqual(['g', 'un'])
    expect(catalogUnitOptions(null)).toEqual(['g', 'un'])
  })

  it('la unidad inicial es la del alimento cuando es ofrecible', () => {
    expect(defaultCatalogUnit('g')).toBe('g')
    expect(defaultCatalogUnit('ml')).toBe('ml')
    expect(defaultCatalogUnit('unidad')).toBe('un')
    expect(defaultCatalogUnit('taza')).toBe('g')
  })

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
