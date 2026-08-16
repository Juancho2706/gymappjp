import { describe, it, expect } from 'vitest'
import {
  PORTION_QUANTITY_MAX,
  PORTION_QUANTITY_MIN,
  canStepCountedQuantity,
  formatCountedQuantity,
  isCountedUnit,
  parseQuantityText,
  stepCountedQuantity,
} from '@/app/coach/nutrition-v2/_lib/quantity-format'

describe('isCountedUnit — que unidad se cuenta y cual se mide', () => {
  it('porciones y unidades se CUENTAN (steppers)', () => {
    for (const unit of ['un', 'UN', 'unidad', 'unidades', 'unit', 'porcion', 'porción', 'porciones']) {
      expect(isCountedUnit(unit)).toBe(true)
    }
  })

  it('gramos y mililitros se MIDEN (input libre)', () => {
    for (const unit of ['g', 'G', 'ml', 'ML', ' g ']) {
      expect(isCountedUnit(unit)).toBe(false)
    }
  })

  it('unidad desconocida o ausente cae a "se mide" (mismo default que el catalogo)', () => {
    expect(isCountedUnit('')).toBe(false)
    expect(isCountedUnit(null)).toBe(false)
    expect(isCountedUnit(undefined)).toBe(false)
    expect(isCountedUnit('taza')).toBe(false)
  })
})

describe('formatCountedQuantity — fracciones legibles', () => {
  it('rinde los medios como fraccion', () => {
    expect(formatCountedQuantity('0.5')).toBe('½')
    expect(formatCountedQuantity('1')).toBe('1')
    expect(formatCountedQuantity('1.5')).toBe('1½')
    expect(formatCountedQuantity('2')).toBe('2')
    expect(formatCountedQuantity('2.5')).toBe('2½')
    expect(formatCountedQuantity('10')).toBe('10')
  })

  it('acepta coma decimal es-CL y numeros crudos', () => {
    expect(formatCountedQuantity('1,5')).toBe('1½')
    expect(formatCountedQuantity(0.5)).toBe('½')
    expect(formatCountedQuantity(3)).toBe('3')
  })

  it('un valor que NO cae en medios se muestra tal cual (no se redondea ni se miente)', () => {
    expect(formatCountedQuantity('1.25')).toBe('1,25')
    expect(formatCountedQuantity('0.3')).toBe('0,3')
  })

  it('vacio o ilegible cae al fallback', () => {
    expect(formatCountedQuantity('')).toBe('—')
    expect(formatCountedQuantity('   ')).toBe('—')
    expect(formatCountedQuantity('abc')).toBe('—')
    expect(formatCountedQuantity(null)).toBe('—')
    expect(formatCountedQuantity('', 'Cantidad')).toBe('Cantidad')
  })

  it('cero es cero (no "½"): el redondeo jamas sube el valor', () => {
    expect(formatCountedQuantity('0')).toBe('0')
  })
})

describe('stepCountedQuantity / canStepCountedQuantity — pasos de media porcion', () => {
  it('sube y baja de a 0,5', () => {
    expect(stepCountedQuantity('1', 1)).toBe('1.5')
    expect(stepCountedQuantity('1.5', 1)).toBe('2')
    expect(stepCountedQuantity('2', -1)).toBe('1.5')
    expect(stepCountedQuantity('1', -1)).toBe('0.5')
  })

  it('hace snap a medios desde un valor suelto (misma regla que el stepper de porciones)', () => {
    // Se SUMA el paso y despues se redondea a medios, igual que `stepPortionsText` del
    // quick-edit: 1,2 + 0,5 = 1,7 -> 1,5; 1,2 - 0,5 = 0,7 -> 0,5. Cantidades fuera de medios
    // solo aparecen tipeadas a mano o heredadas, y en dos toques vuelven a la grilla.
    expect(stepCountedQuantity('1.2', 1)).toBe('1.5')
    expect(stepCountedQuantity('1.2', -1)).toBe('0.5')
    expect(stepCountedQuantity('1.8', -1)).toBe('1.5')
  })

  it('nunca baja del minimo (media porcion): bajar de ahi es quitar el alimento', () => {
    expect(stepCountedQuantity('0.5', -1)).toBe(String(PORTION_QUANTITY_MIN))
    expect(canStepCountedQuantity('0.5', -1)).toBe(false)
    expect(canStepCountedQuantity('1', -1)).toBe(true)
  })

  it('el + siembra media porcion sobre una cantidad vacia o ilegible', () => {
    expect(stepCountedQuantity('', 1)).toBe('0.5')
    expect(stepCountedQuantity('abc', 1)).toBe('0.5')
    expect(canStepCountedQuantity('', 1)).toBe(true)
    expect(canStepCountedQuantity('', -1)).toBe(false)
  })

  it('respeta el tope defensivo', () => {
    expect(stepCountedQuantity(String(PORTION_QUANTITY_MAX), 1)).toBe(String(PORTION_QUANTITY_MAX))
    expect(canStepCountedQuantity(String(PORTION_QUANTITY_MAX), 1)).toBe(false)
  })

  it('parseQuantityText acepta coma y rechaza basura', () => {
    expect(parseQuantityText('1,5')).toBe(1.5)
    expect(parseQuantityText(2)).toBe(2)
    expect(parseQuantityText('')).toBeNull()
    expect(parseQuantityText('x')).toBeNull()
  })
})
